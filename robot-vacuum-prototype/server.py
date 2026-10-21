"""Local-only bridge between the prototype and Home Assistant. Run: python3 server.py

The browser never sees the Home Assistant token. The bridge only returns the
selected robot's entities and only forwards an allowlist of robot commands.
"""
import base64
import hmac
import json
import os
import socket
import re
import secrets
import time
from pathlib import Path
from urllib.parse import parse_qs
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / '.ha-local.json'
MAP_IMAGE = ROOT / '.map-cache.png'   # last real map image, served while HA reports an empty map
MAP_GEOMETRY = ROOT / '.map-cache.json'
HA_URL = os.environ.get('HA_URL', 'http://127.0.0.1:8124').rstrip('/')
PORT = int(os.environ.get('PORT', '8787'))
HOSTS = ('127.0.0.1:%d' % PORT, 'localhost:%d' % PORT)
ORIGINS = tuple('http://' + h for h in HOSTS)
# Phones on the same Wi-Fi: start with LAN=1 and APP_PIN (6+ characters). Off by default.
LAN = os.environ.get('LAN') == '1'
APP_PIN = os.environ.get('APP_PIN', '')
AUTH_KEY = secrets.token_bytes(32)  # new each start, so phones enter the PIN again after a restart
PIN_FAILS = []
PIN_PAGE = '''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Robot app</title><style>body{font:16px system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#eef1f8;color:#10131f}
form{background:#fff;padding:24px;border-radius:20px;box-shadow:0 8px 30px rgba(20,30,80,.12);width:min(320px,86vw)}h1{font-size:20px;margin:0 0 6px}
p{color:#5b6274;font-size:14px;margin:0 0 14px}input,button{width:100%;box-sizing:border-box;font:inherit;padding:12px;border-radius:12px}
input{border:1px solid #cfd5e3;margin-bottom:10px}button{border:0;background:#3246f0;color:#fff;font-weight:700}.e{color:#c0392b}</style>
<form method="get" action="/"><h1>Robot app</h1><p>Enter the PIN shown where the bridge was started.</p>{msg}
<input name="pin" type="password" inputmode="numeric" autocomplete="off" autofocus aria-label="PIN"><button>Open</button></form>'''
FILES = {'/': 'index.html', '/index.html': 'index.html', '/ha-model.js': 'ha-model.js', '/ha-live.js': 'ha-live.js', '/study-log.js': 'study-log.js'}
IMAGES = {'/img/level-%s.jpg' % k: 'img/level-%s.jpg' % k for k in ('manual', 'assist', 'autoNotify', 'fullAuto')}
SIMPLE = {'start', 'pause', 'return_to_base'}
ZONE_LIMIT = 4000  # mm; a spot retry never covers more than 4 x 4 m
ROOM_LIMIT = 15000  # mm; a room or saved zone part is at most 15 x 15 m
MAX_ZONES = 5       # Roborock cleans at most five zones in one run
MODES = {'vacuum', 'vac_and_mop'}
MAX_NOGO = 10
DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
SCHEDULE_PREFIX = 'robot_app_'
ACTIVE = {'cleaning', 'paused', 'returning', 'error'}
POSITION = {'at': 0, 'value': None}  # live position, read at most every 3 s (60 s while docked)


class BridgeError(Exception):
    pass


def config():
    try:
        return json.loads(CONFIG.read_text())
    except (FileNotFoundError, ValueError):
        return {}


def ha(path, data=None, method=None):
    token = os.environ.get('HA_TOKEN') or config().get('token')
    if not token:
        raise BridgeError('Add a Home Assistant access token in the connection settings.')
    req = Request(HA_URL + '/api/' + path,
                  data=None if data is None else json.dumps(data).encode(),
                  headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}, method=method)
    try:
        with urlopen(req, timeout=12) as response:
            body = response.read()
            if path.startswith('image_proxy/'):
                return body, response.headers.get('Content-Type', 'image/png')
            return json.loads(body) if body else {}
    except HTTPError as exc:
        if exc.code in (401, 403):
            raise BridgeError('Home Assistant rejected the token.')
        raise BridgeError('Home Assistant request failed (%s).' % exc.code)
    except (URLError, TimeoutError, OSError):
        raise BridgeError('Can’t reach Home Assistant at %s.' % HA_URL)


PHOTO_NAME = re.compile(r'^[A-Za-z0-9_.-]{1,80}$')


def obstacle_photo(name):
    """An obstacle photo from the robot, through the reader's photo action. Only names from the cached map work."""
    if not PHOTO_NAME.match(name or ''):
        raise BridgeError('Not a photo name.')
    result = ha('services/roborock_obstacles/photo?return_response', {'photo_name': name}).get('service_response') or {}
    if result.get('error') or not result.get('data'):
        raise BridgeError('No photo: %s.' % (result.get('error') or 'empty reply'))
    mime = result.get('content_type') if result.get('content_type') in ('image/jpeg', 'image/png') else 'image/jpeg'
    return base64.b64decode(result['data']), mime


def clean(state):
    # Media entities carry signed URLs; they must not reach the page.
    return dict(state, attributes={k: v for k, v in state.get('attributes', {}).items()
                                   if k not in ('access_token', 'entity_picture')})


def snapshot(states, include_geometry=False):
    """Only this robot's entities leave the bridge; the rest of the home stays in HA."""
    vacuums = [s for s in states if s['entity_id'].startswith('vacuum.')]
    selected = config().get('vacuum')
    vacuum = next((s for s in vacuums if s['entity_id'] == selected), None)
    if vacuum is None and len(vacuums) == 1:
        vacuum = vacuums[0]
    prefix = vacuum['entity_id'].split('.', 1)[1] + '_' if vacuum else None
    related = [clean(s) for s in states if prefix and s['entity_id'].split('.', 1)[1].startswith(prefix)]
    reader = next((s for s in states if s['entity_id'] == 'sensor.roborock_obstacles'), None)
    geometry = None
    if include_geometry and reader is not None and vacuum is not None:
        try:
            geometry = keep_good_maps(ha('services/roborock_obstacles/read?return_response', {}).get('service_response'))
        except BridgeError:
            geometry = None  # State is still useful without the map reader.
    position = live_position(vacuum) if include_geometry and vacuum is not None else None
    return {'received_at': time.time(), 'vacuum': clean(vacuum) if vacuum else None, 'position': position,
            'vacuums': [{'entity_id': s['entity_id'], 'name': s.get('attributes', {}).get('friendly_name', s['entity_id'])}
                        for s in vacuums],
            'entities': related, 'reader': reader is not None, 'geometry': geometry}


def placeholder(body):
    # HA serves a tiny blank PNG when the robot has no map
    return len(body) < 2000 or (body[:8] == b'\x89PNG\r\n\x1a\n' and int.from_bytes(body[16:20], 'big') <= 300)


def keep_good_maps(geometry):
    """Remember each map's calibration; fill an empty map from the last good copy, marked stale."""
    if not geometry:
        return geometry
    try:
        cache = json.loads(MAP_GEOMETRY.read_text())
    except (FileNotFoundError, ValueError):
        cache = {}
    changed = False
    for m in geometry.get('maps', []):
        key = str(m.get('map_id'))
        if m.get('calibration'):
            cache[key] = {k: m.get(k) for k in ('map_id', 'calibration', 'no_go_areas', 'image_size', 'charger', 'source_updated_at')}
            changed = True
        elif key in cache:
            m.update(cache[key], stale=True, path=[], obstacles=[], robot=None)
    if changed:
        MAP_GEOMETRY.write_text(json.dumps(cache))
    return geometry


def live_position(vacuum):
    # Home Assistant asks the robot for a fresh map to read its position, so it is rate-limited.
    wait = 3 if vacuum.get('state') in ACTIVE else 60
    if time.time() - POSITION['at'] < wait:
        return POSITION['value']
    POSITION['at'] = time.time()
    try:
        response = ha('services/roborock/get_vacuum_current_position?return_response', {'entity_id': vacuum['entity_id']})
        point = response.get('service_response', {}).get(vacuum['entity_id']) or {}
        if isinstance(point.get('x'), (int, float)) and isinstance(point.get('y'), (int, float)):
            POSITION['value'] = {'x': point['x'], 'y': point['y'], 'at': time.time()}
    except BridgeError:
        pass  # keep the last position; the page shows how old it is
    return POSITION['value']


def zone_box(data):
    box = data.get('box')
    if not isinstance(box, list) or len(box) != 4 or not all(isinstance(v, (int, float)) for v in box):
        raise ValueError('box')
    x1, y1, x2, y2 = (int(round(v)) for v in box)
    if not (0 <= x1 < x2 <= 100000 and 0 <= y1 < y2 <= 100000):
        raise ValueError('box')
    if x2 - x1 > ZONE_LIMIT or y2 - y1 > ZONE_LIMIT:
        raise ValueError('box')
    return x1, y1, x2, y2


def clean_zones(data):
    zones = data.get('zones')
    if not isinstance(zones, list) or not 0 < len(zones) <= MAX_ZONES:
        raise ValueError('zones')
    out = []
    for zone in zones:
        if not isinstance(zone, list) or len(zone) != 4 or not all(isinstance(v, (int, float)) for v in zone):
            raise ValueError('zones')
        x1, y1, x2, y2 = (int(round(v)) for v in zone)
        if not (0 <= x1 < x2 <= 100000 and 0 <= y1 < y2 <= 100000) or x2 - x1 > ROOM_LIMIT or y2 - y1 > ROOM_LIMIT:
            raise ValueError('zones')
        out.append([x1, y1, x2, y2, 1])  # one pass each
    return out


def nogo_zones(data):
    zones = data.get('zones')
    if not isinstance(zones, list) or len(zones) > MAX_NOGO:
        raise ValueError('zones')
    out = []
    for zone in zones:
        if not isinstance(zone, list) or len(zone) != 8 or not all(isinstance(v, (int, float)) for v in zone):
            raise ValueError('zones')
        zone = [int(round(v)) for v in zone]
        if not all(0 <= v <= 100000 for v in zone):
            raise ValueError('zones')
        out.append([0] + zone)  # 0 = no-go zone in Roborock's save_map
    return out


def text(data, key, limit):
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(key)
    return value.strip()[:limit]


def command(action, data, vacuum, states=None):
    entity = {'entity_id': vacuum['entity_id']}
    prefix = vacuum['entity_id'].split('.', 1)[1]
    if action in SIMPLE:
        return ha('services/vacuum/' + action, entity)
    if action == 'zone':
        x1, y1, x2, y2 = zone_box(data)
        return ha('services/roborock/set_vacuum_zoned_cleaning',
                  dict(entity, x1=x1, y1=y1, x2=x2, y2=y2, repeats=1))
    if action == 'zones':
        return ha('services/vacuum/send_command', dict(entity, command='app_zoned_clean', params=clean_zones(data)))
    if action == 'mode':
        if data.get('mode') not in MODES:
            raise ValueError('mode')
        return ha('services/select/select_option', {'entity_id': 'select.%s_cleaning_mode' % prefix, 'option': data['mode']})
    if action == 'nogo':
        # save_map replaces every no-go zone on the robot, so the page always sends the full list.
        return ha('services/vacuum/send_command', dict(entity, command='save_map', params=nogo_zones(data)))
    raise ValueError('action')


def notify(data):
    title, message = text(data, 'title', 80), text(data, 'message', 300)
    ha('services/persistent_notification/create', {'title': title, 'message': message, 'notification_id': 'robot_app'})
    sent = ['home_assistant']
    for domain in ha('services'):
        if domain.get('domain') != 'notify':
            continue
        for name in domain.get('services', {}):
            if name.startswith('mobile_app_'):
                ha('services/notify/' + name, {'title': title, 'message': message})
                sent.append(name)
    return sent


def schedule_list():
    out = []
    for state in ha('states'):
        sid = state.get('attributes', {}).get('id', '')
        if not state['entity_id'].startswith('automation.') or not str(sid).startswith(SCHEDULE_PREFIX):
            continue
        conf = ha('config/automation/config/' + sid)
        trigger = (conf.get('triggers') or conf.get('trigger') or [{}])[0]
        cond = (conf.get('conditions') or conf.get('condition') or [{}])[0]
        days = [d.capitalize() for d in DAYS if d in cond.get('weekday', DAYS)]
        out.append({'id': sid, 'time': str(trigger.get('at', ''))[:5], 'days': days,
                    'scope': 'Entire home', 'on': state['state'] == 'on', 'entity_id': state['entity_id']})
    return sorted(out, key=lambda s: s['time'])


def schedule_save(data, vacuum):
    sid = data.get('id') or SCHEDULE_PREFIX + secrets.token_hex(4)
    if not re.fullmatch(SCHEDULE_PREFIX + r'[a-z0-9]{1,24}', str(sid)):
        raise ValueError('id')
    at = str(data.get('time', ''))
    if not re.fullmatch(r'([01]\d|2[0-3]):[0-5]\d', at):
        raise ValueError('time')
    days = [d for d in DAYS if d in [str(x).lower() for x in data.get('days') or []]]
    if not days:
        raise ValueError('days')
    names = ', '.join(d.capitalize() for d in days)
    ha('config/automation/config/' + sid, {
        'id': sid, 'alias': 'Robot app: clean at %s (%s)' % (at, names),
        'description': 'Created by the robot vacuum app. Edit it in the app.',
        'triggers': [{'trigger': 'time', 'at': at + ':00'}],
        'conditions': [{'condition': 'time', 'weekday': days}],
        'actions': [{'action': 'vacuum.start', 'target': {'entity_id': vacuum['entity_id']}}],
        'mode': 'single'})
    schedule_switch(sid, bool(data.get('on', True)))
    return sid


def schedule_switch(sid, on):
    for _ in range(10):  # Home Assistant reloads automations after a config write
        entity = next((s['entity_id'] for s in ha('states') if s['entity_id'].startswith('automation.')
                       and s.get('attributes', {}).get('id') == sid), None)
        if entity:
            return ha('services/automation/' + ('turn_on' if on else 'turn_off'), {'entity_id': entity})
        time.sleep(0.5)
    raise BridgeError('Home Assistant didn’t load the schedule.')


def schedule_delete(data):
    sid = str(data.get('id', ''))
    if not re.fullmatch(SCHEDULE_PREFIX + r'[a-z0-9]{1,24}', sid):
        raise ValueError('id')
    ha('config/automation/config/' + sid, method='DELETE')


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # Never log credentials or request bodies.

    def send(self, status, body, content_type='application/json'):
        payload = json.dumps(body, ensure_ascii=False).encode() if content_type == 'application/json' else body
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def loopback(self):
        return self.client_address[0] in ('127.0.0.1', '::1', '::ffff:127.0.0.1')

    def valid_host(self):
        # This Mac: only loopback names (blocks DNS rebinding). Other devices: LAN mode and the PIN cookie.
        if self.loopback():
            return self.headers.get('Host') in HOSTS
        if not LAN:
            return False
        cookies = dict(c.strip().split('=', 1) for c in (self.headers.get('Cookie') or '').split(';') if '=' in c)
        return hmac.compare_digest(cookies.get('robot_auth', ''), hmac.new(AUTH_KEY, b'robot-app', 'sha256').hexdigest())

    def same_origin(self):
        if self.loopback():
            return self.headers.get('Origin') in ORIGINS
        return self.headers.get('Origin') == 'http://' + (self.headers.get('Host') or '')

    def pin_gate(self, path, query):
        """Another device without the cookie: show the PIN form, or set the cookie for a right PIN."""
        if path not in ('/', '/index.html'):
            return self.send(401, {'error': 'Enter the PIN first'})
        pin = parse_qs(query).get('pin', [''])[0]
        now = time.time()
        PIN_FAILS[:] = [t for t in PIN_FAILS if now - t < 600]
        if pin and len(PIN_FAILS) >= 10:
            return self.send(429, PIN_PAGE.replace('{msg}', '<p class="e">Too many wrong PINs. Try again in 10 minutes.</p>').encode(), 'text/html; charset=utf-8')
        if pin and hmac.compare_digest(pin.encode(), APP_PIN.encode()):
            self.send_response(302)
            self.send_header('Location', '/')
            self.send_header('Set-Cookie', 'robot_auth=%s; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000' % hmac.new(AUTH_KEY, b'robot-app', 'sha256').hexdigest())
            self.send_header('Content-Length', '0')
            return self.end_headers()
        if pin:
            PIN_FAILS.append(now)
        self.send(200, PIN_PAGE.replace('{msg}', '<p class="e">That PIN is not right.</p>' if pin else '').encode(), 'text/html; charset=utf-8')

    def do_GET(self):
        path, _, query = self.path.partition('?')
        if not self.valid_host():
            if LAN and not self.loopback():
                return self.pin_gate(path, query)
            return self.send(403, {'error': 'Local access only'})
        try:
            if path == '/api/state':
                return self.send(200, snapshot(ha('states'), include_geometry=True))
            if path == '/api/config':
                return self.send(200, {'configured': bool(os.environ.get('HA_TOKEN') or config().get('token')),
                                       'vacuum': config().get('vacuum', '')})
            if path == '/api/schedules':
                return self.send(200, {'schedules': schedule_list()})
            if path == '/api/photo':
                body, mime = obstacle_photo((parse_qs(query).get('name') or [''])[0])
                return self.send(200, body, mime)
            if path == '/api/photo-status':
                return self.send(200, ha('services/roborock_obstacles/photo_status?return_response', {}).get('service_response') or {})
            if path == '/api/map':
                data = snapshot(ha('states'))
                image = next((s for s in data['entities'] if s['entity_id'].startswith('image.')), None)
                if not image:
                    raise BridgeError('Home Assistant has no map image for this robot yet.')
                body, mime = ha('image_proxy/' + image['entity_id'])
                if placeholder(body):
                    if MAP_IMAGE.exists():
                        return self.send(200, MAP_IMAGE.read_bytes(), 'image/png')
                else:
                    MAP_IMAGE.write_bytes(body)
                return self.send(200, body, mime)
            if path in IMAGES:
                return self.send(200, (ROOT / IMAGES[path]).read_bytes(), 'image/jpeg')
            if path not in FILES:
                return self.send(404, {'error': 'Not found'})
            name = FILES[path]
            mime = 'text/html; charset=utf-8' if name.endswith('.html') else 'text/javascript; charset=utf-8'
            self.send(200, (ROOT / name).read_bytes(), mime)
        except BridgeError as exc:
            self.send(503, {'error': str(exc)})

    def do_POST(self):
        if not self.valid_host() or not self.same_origin():
            return self.send(403, {'error': 'Same-origin local access required'})
        if self.headers.get('Content-Type') != 'application/json':
            return self.send(415, {'error': 'JSON required'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 16384:
                return self.send(400, {'error': 'Invalid body'})
            data = json.loads(self.rfile.read(size))
            if self.path == '/api/config':
                token = str(data.get('token', '')).strip()
                if not token or len(token) > 8192:
                    return self.send(400, {'error': 'Paste an access token.'})
                saved = {'token': token, 'vacuum': str(data.get('vacuum', ''))[:200]}
                fd = os.open(CONFIG, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
                with os.fdopen(fd, 'w') as stream:
                    json.dump(saved, stream)
                os.chmod(CONFIG, 0o600)
                return self.send(200, {'saved': True})
            if self.path == '/api/notify':
                text(data, 'title', 80), text(data, 'message', 300)
                return self.send(200, {'sent': notify(data)})
            if self.path == '/api/schedules/delete':
                schedule_delete(data)
                return self.send(200, {'deleted': True})
            if self.path in ('/api/schedules', '/api/schedules/switch'):
                vacuum = snapshot(ha('states'))['vacuum']
                if not vacuum:
                    raise BridgeError('No robot selected.')
                if self.path == '/api/schedules':
                    return self.send(200, {'id': schedule_save(data, vacuum)})
                sid = str(data.get('id', ''))
                if not re.fullmatch(SCHEDULE_PREFIX + r'[a-z0-9]{1,24}', sid):
                    raise ValueError('id')
                schedule_switch(sid, bool(data.get('on')))
                return self.send(200, {'on': bool(data.get('on'))})
            if self.path == '/api/command':
                action = data.get('action')
                if action not in SIMPLE and action not in ('zone', 'zones', 'mode', 'nogo'):
                    return self.send(400, {'error': 'Unsupported action'})
                # Reject bad input before touching Home Assistant.
                if action == 'zone':
                    zone_box(data)
                if action == 'mode' and data.get('mode') not in MODES:
                    raise ValueError('mode')
                if action == 'nogo':
                    nogo_zones(data)
                if action == 'zones':
                    clean_zones(data)
                vacuum = snapshot(ha('states'))['vacuum']
                if not vacuum or vacuum['state'] in ('unavailable', 'unknown'):
                    raise BridgeError('The robot is offline or not selected.')
                command(action, data, vacuum)
                return self.send(200, {'accepted': True})
            self.send(404, {'error': 'Not found'})
        except (ValueError, TypeError, AttributeError):
            self.send(400, {'error': 'Invalid request'})
        except BridgeError as exc:
            self.send(503, {'error': str(exc)})


def lan_address():
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(('192.0.2.1', 9))  # no packet is sent; this only picks the Wi-Fi interface
            return s.getsockname()[0]
        except OSError:
            return 'this-mac.local'


if __name__ == '__main__':
    if LAN and len(APP_PIN) < 6:
        raise SystemExit('LAN=1 needs APP_PIN with at least 6 characters, for example: LAN=1 APP_PIN=482915 python3 server.py')
    print('Robot app: http://127.0.0.1:%d  (Home Assistant: %s)  Ctrl+C to stop' % (PORT, HA_URL), flush=True)
    if LAN:
        print('On phones on the same Wi-Fi: http://%s:%d  (PIN: the APP_PIN you set; traffic is not encrypted)' % (lan_address(), PORT), flush=True)
    ThreadingHTTPServer(('0.0.0.0' if LAN else '127.0.0.1', PORT), Handler).serve_forever()
