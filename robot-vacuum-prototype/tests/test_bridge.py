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
        patcher = patch.object(server, 'CONFIG', Path(directory.name) / 'config.json')
        patcher.start()
        self.addCleanup(patcher.stop)

    def request(self, path, body=None, origin=ORIGIN, host=HOST):
        handler = object.__new__(server.Handler)
        raw = json.dumps(body).encode() if body is not None else b''
        handler.path = path
        handler.headers = {'Host': host, 'Origin': origin, 'Content-Type': 'application/json', 'Content-Length': str(len(raw))}
        handler.rfile = BytesIO(raw)
        results = []
        handler.send = lambda *args: results.append(args)
        (handler.do_POST if body is not None else handler.do_GET)()
        return results[0]

    def test_snapshot_returns_only_this_robot_without_credentials(self):
        with patch.object(server, 'ha', return_value={'service_response': {'maps': [{'map_id': 0}]}}) as ha:
            result = server.snapshot(STATES, include_geometry=True)
            ha.assert_called_once_with('services/roborock_obstacles/read?return_response', {})
        text = json.dumps(result)
        self.assertEqual(result['vacuum']['entity_id'], 'vacuum.s6_maxv')
        self.assertTrue(result['reader'])
        self.assertEqual(result['geometry']['maps'][0]['map_id'], 0)
        for secret in ('secret', 'signed-url', 'media-token'):
            self.assertNotIn(secret, text)

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

    def test_map_uses_authenticated_proxy(self):
        with patch.object(server, 'ha', side_effect=[STATES, (b'png', 'image/png')]) as ha:
            self.assertEqual(self.request('/api/map'), (200, b'png', 'image/png'))
            ha.assert_called_with('image_proxy/image.s6_maxv_map_0')


if __name__ == '__main__':
    unittest.main()
