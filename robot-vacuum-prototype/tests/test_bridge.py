import json
import sys
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server

STATES = [
    {'entity_id': 'vacuum.s6_maxv', 'state': 'docked', 'attributes': {'friendly_name': 'Robot', 'entity_picture': 'signed-url'}},
    {'entity_id': 'sensor.s6_maxv_battery', 'state': '100', 'attributes': {}},
    {'entity_id': 'image.s6_maxv_map_0', 'state': 'now', 'attributes': {'access_token': 'media-token'}},
    {'entity_id': 'sensor.private_room', 'state': 'secret', 'attributes': {}},
    {'entity_id': 'sensor.roborock_obstacles', 'state': '1', 'attributes': {}},
]
ORIGIN = 'http://127.0.0.1:%d' % server.PORT
HOST = '127.0.0.1:%d' % server.PORT


class BridgeTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        for name, file in (('CONFIG', 'config.json'), ('MAP_IMAGE', 'map.png'), ('MAP_GEOMETRY', 'map.json')):
            patcher = patch.object(server, name, Path(directory.name) / file)
            patcher.start()
            self.addCleanup(patcher.stop)

    def request(self, path, body=None, origin=ORIGIN, host=HOST, client='127.0.0.1', cookie=None):
        handler = object.__new__(server.Handler)
        handler.client_address = (client, 50000)
        raw = json.dumps(body).encode() if body is not None else b''
        handler.path = path
        handler.headers = {'Host': host, 'Origin': origin, 'Content-Type': 'application/json', 'Content-Length': str(len(raw))}
        if cookie:
            handler.headers['Cookie'] = cookie
        sent = {}
        handler.send_response = lambda code: sent.update(code=code)
        handler.send_header = lambda k, v: sent.setdefault('headers', {}).update({k: v})
        handler.end_headers = lambda: None
        handler.rfile = BytesIO(raw)
        results = []
        handler.send = lambda *args: results.append(args)
        (handler.do_POST if body is not None else handler.do_GET)()
        return results[0] if results else (sent['code'], sent.get('headers', {}))

    def test_other_devices_are_refused_unless_lan_mode_and_pin(self):
        lan_ip, lan_host = '192.168.1.20', '192.168.1.5:%d' % server.PORT
        with patch.object(server, 'LAN', False):
            self.assertEqual(self.request('/', client=lan_ip, host=lan_host)[0], 403)
        with patch.object(server, 'LAN', True), patch.object(server, 'APP_PIN', '482915'):
            server.PIN_FAILS.clear()
            status, page, mime = self.request('/', client=lan_ip, host=lan_host)
            self.assertEqual((status, mime), (200, 'text/html; charset=utf-8'))
            self.assertIn(b'Enter the PIN', page)
            self.assertNotIn(b'Robot app</title><style>', b'')  # the app itself is not served yet
            self.assertEqual(self.request('/api/state', client=lan_ip, host=lan_host)[0], 401)
            self.assertIn(b'not right', self.request('/?pin=000000', client=lan_ip, host=lan_host)[1])
            code, headers = self.request('/?pin=482915', client=lan_ip, host=lan_host)
            self.assertEqual((code, headers['Location']), (302, '/'))
            cookie = headers['Set-Cookie'].split(';')[0]
            self.assertIn('HttpOnly', headers['Set-Cookie'])
            self.assertEqual(self.request('/ha-live.js', client=lan_ip, host=lan_host, cookie=cookie)[0], 200)
            with patch.object(server, 'ha', side_effect=[STATES, []]):
                self.assertEqual(self.request('/api/command', {'action': 'pause'}, client=lan_ip, host=lan_host, cookie=cookie,
                                              origin='http://' + lan_host)[0], 200)
            self.assertEqual(self.request('/api/command', {'action': 'pause'}, client=lan_ip, host=lan_host, cookie=cookie,
                                          origin='http://evil.test')[0], 403)

    def test_wrong_pins_are_rate_limited(self):
        with patch.object(server, 'LAN', True), patch.object(server, 'APP_PIN', '482915'):
            server.PIN_FAILS.clear()
            for _ in range(10):
                self.request('/?pin=111111', client='192.168.1.20', host='x:%d' % server.PORT)
            self.assertEqual(self.request('/?pin=482915', client='192.168.1.20', host='x:%d' % server.PORT)[0], 429)

    def test_snapshot_returns_only_this_robot_without_credentials(self):
        server.POSITION.update(at=0, value=None)
        replies = [{'service_response': {'maps': [{'map_id': 0}]}}, {'service_response': {'vacuum.s6_maxv': {'x': 25769, 'y': 25605}}}]
        with patch.object(server, 'ha', side_effect=replies) as ha:
            result = server.snapshot(STATES, include_geometry=True)
            ha.assert_any_call('services/roborock_obstacles/read?return_response', {})
            ha.assert_called_with('services/roborock/get_vacuum_current_position?return_response', {'entity_id': 'vacuum.s6_maxv'})
        self.assertEqual((result['position']['x'], result['position']['y']), (25769, 25605))
        text = json.dumps(result)
        self.assertEqual(result['vacuum']['entity_id'], 'vacuum.s6_maxv')
        self.assertTrue(result['reader'])
        self.assertEqual(result['geometry']['maps'][0]['map_id'], 0)
        for secret in ('secret', 'signed-url', 'media-token'):
            self.assertNotIn(secret, text)

    def test_live_position_is_rate_limited_and_survives_errors(self):
        server.POSITION.update(at=0, value={'x': 1, 'y': 2, 'at': 0})
        docked = STATES[0]
        with patch.object(server, 'ha', side_effect=server.BridgeError('map')) as ha:
            self.assertEqual(server.live_position(docked)['x'], 1)
            self.assertEqual(server.live_position(docked)['x'], 1)
            self.assertEqual(ha.call_count, 1)

    def test_geometry_failure_keeps_state(self):
        with patch.object(server, 'ha', side_effect=server.BridgeError('down')):
            result = server.snapshot(STATES, include_geometry=True)
        self.assertIsNone(result['geometry'])
        self.assertEqual(len(result['entities']), 2)

    def test_multiple_robots_require_selection(self):
        self.assertIsNone(server.snapshot(STATES + [{'entity_id': 'vacuum.other', 'state': 'idle'}])['vacuum'])

    def test_cross_origin_write_and_foreign_host_rejected(self):
        with patch.object(server, 'ha') as ha:
            self.assertEqual(self.request('/api/command', {'action': 'start'}, origin='http://evil.test')[0], 403)
            self.assertEqual(self.request('/api/state', host='evil.test')[0], 403)
            ha.assert_not_called()

    def test_simple_actions_target_the_selected_robot(self):
        with patch.object(server, 'ha', side_effect=[STATES, []]) as ha:
            self.assertEqual(self.request('/api/command', {'action': 'pause'}), (200, {'accepted': True}))
            ha.assert_called_with('services/vacuum/pause', {'entity_id': 'vacuum.s6_maxv'})
        with patch.object(server, 'ha') as ha:
            self.assertEqual(self.request('/api/command', {'action': 'send_command'})[0], 400)
            ha.assert_not_called()

    def test_spot_retry_is_bounded_and_uses_zoned_cleaning(self):
        with patch.object(server, 'ha', side_effect=[STATES, []]) as ha:
            status, _ = self.request('/api/command', {'action': 'zone', 'box': [30196, 30668, 31196.4, 31668]})
            self.assertEqual(status, 200)
            ha.assert_called_with('services/roborock/set_vacuum_zoned_cleaning',
                                  {'entity_id': 'vacuum.s6_maxv', 'x1': 30196, 'y1': 30668, 'x2': 31196, 'y2': 31668, 'repeats': 1})
        for box in ([0, 0, 9000, 1000], [5, 5, 1, 1], [1, 2, 3], ['1', 2, 3, 4], None):
            with patch.object(server, 'ha') as ha:
                self.assertEqual(self.request('/api/command', {'action': 'zone', 'box': box})[0], 400)
                ha.assert_not_called()

    def test_rooms_clean_as_up_to_five_zones_in_one_run(self):
        zones = [[25000, 26000, 30000, 31000], [30000, 26000, 32000.4, 28000]]
        with patch.object(server, 'ha', side_effect=[STATES, []]) as ha:
            self.assertEqual(self.request('/api/command', {'action': 'zones', 'zones': zones})[0], 200)
            ha.assert_called_with('services/vacuum/send_command', {'entity_id': 'vacuum.s6_maxv', 'command': 'app_zoned_clean',
                                                                  'params': [[25000, 26000, 30000, 31000, 1], [30000, 26000, 32000, 28000, 1]]})
        for bad in ([], [[0, 0, 1, 1]] * 6, [[0, 0, 20000, 1000]], [[5, 5, 1, 1]], [[1, 2, 3]]):
            with patch.object(server, 'ha') as ha:
                self.assertEqual(self.request('/api/command', {'action': 'zones', 'zones': bad})[0], 400)
                ha.assert_not_called()

    def test_cleaning_mode_is_limited_to_the_robot_options(self):
        with patch.object(server, 'ha', side_effect=[STATES, []]) as ha:
            self.assertEqual(self.request('/api/command', {'action': 'mode', 'mode': 'vacuum'})[0], 200)
            ha.assert_called_with('services/select/select_option', {'entity_id': 'select.s6_maxv_cleaning_mode', 'option': 'vacuum'})
        with patch.object(server, 'ha') as ha:
            self.assertEqual(self.request('/api/command', {'action': 'mode', 'mode': 'turbo'})[0], 400)
            ha.assert_not_called()

    def test_nogo_sends_every_zone_in_one_save_map(self):
        zones = [[30268, 24226, 34152, 24226, 34152, 23162, 30268, 23162], [30000, 30500, 31000, 30500, 31000, 31500, 30000, 31500]]
        with patch.object(server, 'ha', side_effect=[STATES, []]) as ha:
            self.assertEqual(self.request('/api/command', {'action': 'nogo', 'zones': zones})[0], 200)
            ha.assert_called_with('services/vacuum/send_command', {'entity_id': 'vacuum.s6_maxv', 'command': 'save_map',
                                                                  'params': [[0] + z for z in zones]})
        for bad in ([[1, 2, 3]], [[-1] * 8], [[0] * 8] * 11, 'x'):
            with patch.object(server, 'ha') as ha:
                self.assertEqual(self.request('/api/command', {'action': 'nogo', 'zones': bad})[0], 400)
                ha.assert_not_called()

    def test_notify_reaches_home_assistant_and_paired_phones(self):
        services = [{'domain': 'notify', 'services': {'mobile_app_phone': {}, 'send_message': {}}}]
        with patch.object(server, 'ha', side_effect=[{}, services, {}]) as ha:
            status, result = self.request('/api/notify', {'title': 'Robot', 'message': 'Done'})
        self.assertEqual((status, result), (200, {'sent': ['home_assistant', 'mobile_app_phone']}))
        ha.assert_called_with('services/notify/mobile_app_phone', {'title': 'Robot', 'message': 'Done'})
        with patch.object(server, 'ha') as ha:
            self.assertEqual(self.request('/api/notify', {'title': '', 'message': 'x'})[0], 400)
            ha.assert_not_called()

    def test_schedule_is_saved_as_an_automation_that_starts_the_robot(self):
        loaded = [{'entity_id': 'automation.robot_app', 'state': 'on', 'attributes': {'id': 'robot_app_ab12'}}]
        with patch.object(server, 'ha', side_effect=[STATES, {}, loaded, {}]) as ha:
            status, result = self.request('/api/schedules', {'id': 'robot_app_ab12', 'time': '09:30', 'days': ['Mon', 'Wed'], 'on': False})
        self.assertEqual((status, result), (200, {'id': 'robot_app_ab12'}))
        path, conf = ha.call_args_list[1][0]
        self.assertEqual(path, 'config/automation/config/robot_app_ab12')
        self.assertEqual(conf['triggers'], [{'trigger': 'time', 'at': '09:30:00'}])
        self.assertEqual(conf['conditions'][0]['weekday'], ['mon', 'wed'])
        self.assertEqual(conf['actions'][0]['target'], {'entity_id': 'vacuum.s6_maxv'})
        ha.assert_called_with('services/automation/turn_off', {'entity_id': 'automation.robot_app'})
        for bad in ({'time': '25:00', 'days': ['Mon']}, {'time': '09:30', 'days': []}, {'id': 'other_auto', 'time': '09:30', 'days': ['Mon']}):
            with patch.object(server, 'ha', return_value=STATES) as ha:
                self.assertEqual(self.request('/api/schedules', bad)[0], 400)

    def test_schedule_list_and_delete_touch_only_app_automations(self):
        states = [{'entity_id': 'automation.robot_app', 'state': 'off', 'attributes': {'id': 'robot_app_ab12'}},
                  {'entity_id': 'automation.lights', 'state': 'on', 'attributes': {'id': 'lights'}}]
        conf = {'triggers': [{'trigger': 'time', 'at': '09:30:00'}], 'conditions': [{'condition': 'time', 'weekday': ['mon', 'fri']}]}
        with patch.object(server, 'ha', side_effect=[states, conf]):
            self.assertEqual(self.request('/api/schedules'), (200, {'schedules': [
                {'id': 'robot_app_ab12', 'time': '09:30', 'days': ['Mon', 'Fri'], 'scope': 'Entire home', 'on': False, 'entity_id': 'automation.robot_app'}]}))
        with patch.object(server, 'ha') as ha:
            self.assertEqual(self.request('/api/schedules/delete', {'id': 'lights'})[0], 400)
            ha.assert_not_called()
        with patch.object(server, 'ha', return_value={}) as ha:
            self.assertEqual(self.request('/api/schedules/delete', {'id': 'robot_app_ab12'})[0], 200)
            ha.assert_called_with('config/automation/config/robot_app_ab12', method='DELETE')

    def test_offline_robot_cannot_receive_commands(self):
        offline = [dict(STATES[0], state='unavailable')]
        with patch.object(server, 'ha', return_value=offline) as ha:
            self.assertEqual(self.request('/api/command', {'action': 'start'})[0], 503)
            self.assertEqual(ha.call_count, 1)

    def test_token_saved_privately_and_never_served(self):
        status, result = self.request('/api/config', {'token': 'fake-test-token'})
        self.assertEqual(status, 200)
        self.assertNotIn('fake-test-token', json.dumps(result))
        self.assertEqual(server.CONFIG.stat().st_mode & 0o777, 0o600)
        self.assertNotIn('fake-test-token', json.dumps(self.request('/api/config')))
        for path in ('/.ha-local.json', '/server.py', '/tests/test_bridge.py'):
            self.assertEqual(self.request(path)[0], 404)
        self.assertEqual(self.request('/ha-live.js')[0], 200)

    def test_empty_map_falls_back_to_the_last_good_one(self):
        good = b'\x89PNG\r\n\x1a\n' + b'\x00\x00\x00\rIHDR' + (1428).to_bytes(4, 'big') + (1380).to_bytes(4, 'big') + b'x' * 3000
        blank = b'\x89PNG\r\n\x1a\n' + b'\x00\x00\x00\rIHDR' + (300).to_bytes(4, 'big') + (200).to_bytes(4, 'big') + b'x' * 700
        with patch.object(server, 'ha', side_effect=[STATES, (good, 'image/png'), STATES, (blank, 'image/png')]):
            self.assertEqual(self.request('/api/map')[1], good)
            self.assertEqual(self.request('/api/map')[1], good)
        cal = [{'vacuum': {'x': 1, 'y': 1}, 'map': {'x': 2, 'y': 2}}] * 3
        server.keep_good_maps({'maps': [{'map_id': 0, 'calibration': cal, 'no_go_areas': [], 'path': [[1]], 'obstacles': [1]}]})
        empty = server.keep_good_maps({'maps': [{'map_id': 0, 'calibration': None, 'path': [], 'obstacles': []}]})['maps'][0]
        self.assertTrue(empty['stale'])
        self.assertEqual(empty['calibration'], cal)
        self.assertEqual(empty['obstacles'], [])

    def test_map_uses_authenticated_proxy(self):
        with patch.object(server, 'ha', side_effect=[STATES, (b'png', 'image/png')]) as ha:
            self.assertEqual(self.request('/api/map'), (200, b'png', 'image/png'))
            ha.assert_called_with('image_proxy/image.s6_maxv_map_0')


if __name__ == '__main__':
    unittest.main()


class PhotoTests(unittest.TestCase):
    def test_photo_names_are_checked_before_asking(self):
        with patch.object(server, 'ha') as ha:
            for bad in ('', '../map', 'a/b', 'x' * 81):
                with self.assertRaises(server.BridgeError):
                    server.obstacle_photo(bad)
            ha.assert_not_called()

    def test_photo_comes_back_as_image_bytes(self):
        import base64
        png = b'\x89PNG\r\n\x1a\nfake'
        reply = {'service_response': {'photo_name': 'p1', 'content_type': 'image/png', 'data': base64.b64encode(png).decode()}}
        with patch.object(server, 'ha', return_value=reply) as ha:
            self.assertEqual(server.obstacle_photo('p1'), (png, 'image/png'))
            self.assertEqual(ha.call_args[0][1], {'photo_name': 'p1'})

    def test_no_photo_is_an_error(self):
        with patch.object(server, 'ha', return_value={'service_response': {'error': 'unknown photo name'}}):
            with self.assertRaises(server.BridgeError):
                server.obstacle_photo('p2')


class ExplainTests(unittest.TestCase):
    def setUp(self):
        server.AI_CACHE.clear()
        server.AI_LAST['at'] = 0

    def fake_sdk(self, reply_text, stop='end_turn'):
        import types
        calls = []
        block = types.SimpleNamespace(type='text', text=reply_text)
        response = types.SimpleNamespace(stop_reason=stop, content=[block])
        class Messages:
            def create(self, **kw):
                calls.append(kw)
                return response
        class Client:
            def __init__(self, **kw):
                calls.append(kw)
                self.beta = types.SimpleNamespace(messages=Messages())
        sdk = types.ModuleType('anthropic')
        sdk.Anthropic = Client
        for name in ('AuthenticationError', 'RateLimitError', 'APIStatusError', 'APIConnectionError'):
            setattr(sdk, name, type(name, (Exception,), {}))
        return sdk, calls

    def test_photos_go_to_claude_and_a_short_reason_comes_back(self):
        answer = json.dumps({'seen': 'a cable', 'cause': 'A cable is under the robot.', 'advice': 'Move the cable.', 'sure': True})
        sdk, calls = self.fake_sdk(answer)
        with patch.dict(sys.modules, {'anthropic': sdk}), patch.dict(server.os.environ, {'ANTHROPIC_API_KEY': 'test-key'}), \
                patch.object(server, 'obstacle_photo', return_value=(b'jpg', 'image/jpeg')) as photo:
            got = server.explain({'situation': 'stuck', 'photos': ['p1', 'p2'], 'labels': ['cable', None], 'room': 'Kitchen'})
            self.assertEqual(got['cause'], 'A cable is under the robot.')
            self.assertTrue(got['sure'])
            self.assertEqual([c[0][0] for c in photo.call_args_list], ['p1', 'p2'])
            request = calls[1]
            self.assertEqual(request['model'], 'claude-opus-5-5')
            self.assertEqual(request['fallbacks'], 'default')
            images = [b for b in request['messages'][0]['content'] if b['type'] == 'image']
            self.assertEqual(len(images), 2)
            self.assertEqual(images[0]['source']['media_type'], 'image/jpeg')
            self.assertIn('Kitchen', request['messages'][0]['content'][-1]['text'])
            # the same question again is answered from memory, without another call
            self.assertEqual(server.explain({'situation': 'stuck', 'photos': ['p1', 'p2'], 'room': 'Kitchen'})['cause'], got['cause'])
            self.assertEqual(len(calls), 2)

    def test_no_key_bad_input_and_refusal(self):
        with patch.dict(server.os.environ, {'ANTHROPIC_API_KEY': ''}), patch.object(server, 'AI_KEY_FILE', Path('/nonexistent/key')):
            with self.assertRaises(server.BridgeError):
                server.explain({'situation': 'stuck', 'photos': ['p1']})
        for bad in ({'situation': 'bored', 'photos': ['p1']}, {'situation': 'stuck', 'photos': []}, {'situation': 'stuck', 'photos': ['a', 'b', 'c', 'd']}):
            with self.assertRaises(ValueError):
                server.explain(bad)
        sdk, _ = self.fake_sdk('', stop='refusal')
        with patch.dict(sys.modules, {'anthropic': sdk}), patch.dict(server.os.environ, {'ANTHROPIC_API_KEY': 'k'}), \
                patch.object(server, 'obstacle_photo', return_value=(b'jpg', 'image/jpeg')):
            with self.assertRaises(server.BridgeError):
                server.explain({'situation': 'dwell', 'photos': ['p1']})
