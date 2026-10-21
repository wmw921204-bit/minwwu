"""Expose cached Roborock obstacle metadata, and fetch an obstacle's photo on request.

read: cached map data only, no robot requests.
photo: one get_photo request for one photo name taken from the cached map; results are kept in memory.
photo_status: one get_camera_status request, to tell whether the robot saves obstacle photos at all.
"""
import base64
import re
from datetime import timedelta
import logging
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.core import SupportsResponse, callback

_LOGGER = logging.getLogger(__name__)
GROUPS = ('obstacles', 'ignored_obstacles', 'obstacles_with_photo', 'ignored_obstacles_with_photo')

def snapshot(hass, include_path=False):
    maps = []
    for entry in hass.config_entries.async_entries('roborock'):
        runtime = getattr(entry, 'runtime_data', None)
        if runtime is None or not hasattr(runtime, "values"):
            continue
        for coordinator in runtime.values():
            api = getattr(coordinator, 'properties_api', None)
            home = getattr(api, 'home', None)
            contents = getattr(home, 'home_map_content', None) or {}
            for flag, content in contents.items():
                data = getattr(content, 'map_data', None)
                if data is None:
                    continue
                obstacles = []
                for group in GROUPS:
                    for item in getattr(data, group, None) or []:
                        details = getattr(item, 'details', None)
                        obstacles.append({
                            'group': group, 'x': getattr(item, 'x', None), 'y': getattr(item, 'y', None),
                            'type_code': getattr(details, 'type', None),
                            'description': getattr(details, 'description', None),
                            'confidence_raw': getattr(details, 'confidence_level', None),
                            'has_photo_reference': bool(getattr(details, 'photo_name', None)),
                            'photo_name': getattr(details, 'photo_name', None) or None,
                        })
                updated = getattr(coordinator, 'last_home_update', None)
                image = getattr(data, 'image', None)
                dimensions = getattr(image, 'dimensions', None)
                def point(item):
                    if item is None:
                        return None
                    return {'x': item.x, 'y': item.y, 'angle': getattr(item, 'a', None)}
                path = getattr(getattr(data, 'path', None), 'path', None) or []
                sampled = []
                if include_path:
                    for segment in path:
                        sampled.append([point(p) for p in segment])
                maps.append({'map_id': flag, 'source_updated_at': updated.isoformat() if updated else None,
                             'obstacles': obstacles,
                             'calibration': data.calibration() if image is not None else None,
                             'robot': point(getattr(data, 'vacuum_position', None)),
                             'charger': point(getattr(data, 'charger', None)),
                             'path': sampled, 'path_complete': include_path,
                             'rooms': [r.as_dict() for r in (getattr(data, 'rooms', None) or {}).values()],
                             'no_go_areas': [a.as_list() for a in (getattr(data, 'no_go_areas', None) or [])],
                             'image_size': {'width': round(dimensions.width * dimensions.scale),
                                            'height': round(dimensions.height * dimensions.scale)} if dimensions else None})
    return {'maps': maps, 'count': sum(len(m['obstacles']) for m in maps),
            'confidence_note': 'Parser-derived raw value; not a validated probability.',
            'source': 'Existing Roborock integration map cache'}

PHOTO_NAME = re.compile(r'^[A-Za-z0-9_.-]{1,80}$')
_PHOTOS = {}  # photo name -> (content type, bytes); a photo never changes once taken


def _photo_apis(hass):
    for entry in hass.config_entries.async_entries('roborock'):
        runtime = getattr(entry, 'runtime_data', None)
        if runtime is None or not hasattr(runtime, 'values'):
            continue
        for coordinator in runtime.values():
            api = getattr(coordinator, 'properties_api', None)
            trait = getattr(api, 'obstacle_photos', None)
            if trait is not None:
                yield trait


def _known_photo(hass, name):
    # only names that appear in the cached map can be fetched
    return any(o.get('photo_name') == name for m in snapshot(hass)['maps'] for o in m['obstacles'])


async def async_setup(hass, config):
    @callback
    def publish(now=None):
        try:
            result = snapshot(hass)
            hass.states.async_set('sensor.roborock_obstacles', result['count'] if result['maps'] else 'unavailable',
                                  {'friendly_name': 'Roborock obstacles', **result})
        except Exception:
            _LOGGER.exception('Unable to read cached obstacle metadata')
    async def read(call):
        return snapshot(hass, include_path=True)
    hass.services.async_register('roborock_obstacles', 'read', read, supports_response=SupportsResponse.ONLY)

    async def photo(call):
        name = str(call.data.get('photo_name', ''))
        if not PHOTO_NAME.match(name):
            return {'error': 'bad photo name'}
        if name not in _PHOTOS:
            if not _known_photo(hass, name):
                return {'error': 'unknown photo name'}
            for trait in _photo_apis(hass):
                try:
                    result = await trait.get_photo(name)
                except Exception as exc:  # the robot may be offline or the photo gone
                    _LOGGER.warning('Obstacle photo %s not available: %s', name, exc)
                    return {'error': 'photo not available'}
                body = result.image_content
                _PHOTOS[name] = ('image/png' if body.startswith(b'\x89PNG') else 'image/jpeg', body)
                break
            else:
                return {'error': 'this robot has no obstacle photos'}
        mime, body = _PHOTOS[name]
        return {'photo_name': name, 'content_type': mime, 'data': base64.b64encode(body).decode()}

    async def photo_status(call):
        out = []
        for trait in _photo_apis(hass):
            try:
                out.append(await trait.get_enabled())
            except Exception as exc:
                _LOGGER.warning('Camera status not available: %s', exc)
                out.append(None)
        return {'supported': bool(out), 'enabled': any(out) if out else False, 'robots': out}

    hass.services.async_register('roborock_obstacles', 'photo', photo, supports_response=SupportsResponse.ONLY)
    hass.services.async_register('roborock_obstacles', 'photo_status', photo_status, supports_response=SupportsResponse.ONLY)
    async_track_time_interval(hass, publish, timedelta(seconds=30))
    publish()
    return True
