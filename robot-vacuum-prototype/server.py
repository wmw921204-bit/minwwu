"""Local-only bridge between the prototype and Home Assistant. Run: python3 server.py

The browser never sees the Home Assistant token. The bridge only returns the
selected robot's entities and only forwards an allowlist of robot commands.
"""
import json
import os
import time
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / '.ha-local.json'
HA_URL = os.environ.get('HA_URL', 'http://127.0.0.1:8124').rstrip('/')
PORT = int(os.environ.get('PORT', '8787'))
HOSTS = ('127.0.0.1:%d' % PORT, 'localhost:%d' % PORT)
ORIGINS = tuple('http://' + h for h in HOSTS)
FILES = {'/': 'index.html', '/index.html': 'index.html', '/ha-model.js': 'ha-model.js', '/ha-live.js': 'ha-live.js'}
SIMPLE = {'start', 'pause', 'return_to_base'}
ZONE_LIMIT = 4000  # mm; a spot retry never covers more than 4 x 4 m


class BridgeError(Exception):
    pass


def config():
    try:
        return json.loads(CONFIG.read_text())
    except (FileNotFoundError, ValueError):
        return {}


def ha(path, data=None):
    token = os.environ.get('HA_TOKEN') or config().get('token')
    if not token:
        raise BridgeError('Add a Home Assistant access token in the connection settings.')
    req = Request(HA_URL + '/api/' + path,
                  data=None if data is None else json.dumps(data).encode(),
                  headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
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
            geometry = ha('services/roborock_obstacles/read?return_response', {}).get('service_response')
        except BridgeError:
            geometry = None  # State is still useful without the map reader.
    return {'received_at': time.time(), 'vacuum': clean(vacuum) if vacuum else None,
            'vacuums': [{'entity_id': s['entity_id'], 'name': s.get('attributes', {}).get('friendly_name', s['entity_id'])}
                        for s in vacuums],
            'entities': related, 'reader': reader is not None, 'geometry': geometry}


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


def command(action, data, vacuum):
    entity = {'entity_id': vacuum['entity_id']}
    if action in SIMPLE:
        return ha('services/vacuum/' + action, entity)
    if action == 'zone':
        x1, y1, x2, y2 = zone_box(data)
        return ha('services/roborock/set_vacuum_zoned_cleaning',
                  dict(entity, x1=x1, y1=y1, x2=x2, y2=y2, repeats=1))
    raise ValueError('action')


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

    def valid_host(self):
        return self.headers.get('Host') in HOSTS

    def do_GET(self):
        if not self.valid_host():
            return self.send(403, {'error': 'Local access only'})
        path = self.path.split('?')[0]
        try:
            if path == '/api/state':
                return self.send(200, snapshot(ha('states'), include_geometry=True))
            if path == '/api/config':
                return self.send(200, {'configured': bool(os.environ.get('HA_TOKEN') or config().get('token')),
                                       'vacuum': config().get('vacuum', '')})
            if path == '/api/map':
                data = snapshot(ha('states'))
                image = next((s for s in data['entities'] if s['entity_id'].startswith('image.')), None)
                if not image:
                    raise BridgeError('Home Assistant has no map image for this robot yet.')
                body, mime = ha('image_proxy/' + image['entity_id'])
                return self.send(200, body, mime)
            if path not in FILES:
                return self.send(404, {'error': 'Not found'})
            name = FILES[path]
            mime = 'text/html; charset=utf-8' if name.endswith('.html') else 'text/javascript; charset=utf-8'
            self.send(200, (ROOT / name).read_bytes(), mime)
        except BridgeError as exc:
            self.send(503, {'error': str(exc)})

    def do_POST(self):
        if not self.valid_host() or self.headers.get('Origin') not in ORIGINS:
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
            if self.path == '/api/command':
                action = data.get('action')
                if action not in SIMPLE and action != 'zone':
                    return self.send(400, {'error': 'Unsupported action'})
                if action == 'zone':
                    zone_box(data)  # Reject a bad box before touching Home Assistant.
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


if __name__ == '__main__':
    print('Robot app: http://127.0.0.1:%d  (Home Assistant: %s)  Ctrl+C to stop' % (PORT, HA_URL), flush=True)
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
