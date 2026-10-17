const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../ha-model.js');

// Calibration as returned by the roborock_obstacles reader for the S6 MaxV map.
const CAL = [
  { vacuum: { x: 25500, y: 25500 }, map: { x: 376, y: 860 } },
  { vacuum: { x: 35500, y: 25500 }, map: { x: 1176, y: 860 } },
  { vacuum: { x: 25500, y: 35500 }, map: { x: 376, y: 60 } },
];
const ent = (id, state) => ({ entity_id: id, state, attributes: {} });
const snap = (vacuum, extra = {}) => ({
  vacuum: { entity_id: 'vacuum.s6', state: vacuum, attributes: {} },
  entities: Object.entries({ battery: '88', status: 'charging', vacuum_error: 'none', cleaning_area: '43.0', current_room: 'unknown', ...extra })
    .map(([k, v]) => ent('sensor.s6_' + k, v)),
});

test('calibration maps robot millimetres onto the map image', () => {
  const t = M.transform(CAL);
  const p = t({ x: 30696, y: 31168 });
  assert.ok(Math.abs(p.x - 791.68) < 0.01 && Math.abs(p.y - 406.56) < 0.01);
  assert.equal(M.transform([CAL[0], CAL[0], CAL[0]]), null);
  assert.equal(t({ x: NaN, y: 1 }), null);
  assert.ok(Math.abs(M.pxPerMm(CAL) - 0.08) < 1e-9);
});

test('device status follows the robot and keeps unknown as unknown', () => {
  const docked = M.device(snap('docked'));
  assert.deepEqual([docked.status, docked.battery, docked.error, docked.charging, docked.room, docked.area], ['docked', 88, null, true, null, 43]);
  assert.equal(M.device(snap('idle', { status: 'zoned_cleaning' })).status, 'cleaning');
  assert.equal(M.device(snap('cleaning', { status: 'returning_home' })).status, 'returning');
  const stuck = M.device(snap('cleaning', { vacuum_error: 'wheels_jammed' }));
  assert.equal(stuck.status, 'error');
  assert.match(stuck.error, /wheel/i);
  assert.equal(M.device(snap('unavailable')), null);
  assert.equal(M.device({ vacuum: null, entities: [] }), null);
});

test('obstacles become app objects with one stable id', () => {
  const map = { map_id: 0, source_updated_at: '2026-10-17T01:04:09Z', obstacles: [
    { group: 'obstacles_with_photo', x: 30439, y: 26441, type_code: 2, description: 'shoes' },
    { group: 'obstacles_with_photo', x: 26633, y: 24407, type_code: 42, description: null },
    { group: 'obstacles_with_photo', x: 26633, y: 24407, type_code: 42, description: null },
    { group: 'obstacles', x: null, y: 1, type_code: 1 },
  ] };
  const [shoe, unknown, ...rest] = M.objects('vacuum.s6', map);
  assert.equal(rest.length, 0, 'duplicates and records without a position are dropped');
  assert.deepEqual([shoe.label, shoe.status, shoe.k], ['shoe', 'auto', 'live']);
  assert.deepEqual([unknown.label, unknown.status], ['unknown', 'pending']);
  assert.ok(unknown.guesses.length > 0);
  assert.equal(shoe.id, M.objectId('vacuum.s6', 0, map.obstacles[0]));

  const notes = { [unknown.id]: { label: 'cable', name: 'Cable' }, [shoe.id]: { dismissed: true } };
  const after = M.objects('vacuum.s6', map, notes);
  assert.equal(after.length, 1);
  assert.deepEqual([after[0].label, after[0].orig, after[0].status], ['cable', 'unknown', 'corrected']);
});

test('selected map follows the robot select entity', () => {
  const s = { geometry: { maps: [{ map_id: 0 }, { map_id: 1 }] }, entities: [ent('select.s6_selected_map', 'Map 1')] };
  assert.equal(M.selectedMap(s).map_id, 1);
  assert.equal(M.selectedMap({ geometry: { maps: [{ map_id: 0 }, { map_id: 1 }] }, entities: [] }), null);
});

test('path is thinned without inventing points', () => {
  const seg = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 100, y: 0 }, null, { x: 300, y: 0 }];
  assert.deepEqual(M.simplifyPath([seg], 80), [[[0, 0], [100, 0], [300, 0]]]);
  assert.deepEqual(M.simplifyPath([[{ x: 1, y: 1 }]]), []);
});

test('footprint traces only the mapped pixels', () => {
  const w = 24, h = 12, rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < 6; y++) for (let x = 6; x < 18; x++) rgba[(y * w + x) * 4 + 3] = 255;
  const f = M.footprint(rgba, w, h, 6);
  assert.deepEqual(f.bbox, { x0: 6, y0: 0, x1: 18, y1: 6 });
  assert.equal(f.d, 'M6 0h12v6h-12Z');
  assert.match(f.edge, /M6 0H18/);
  assert.deepEqual(f.runs, [[6, 0, 12]]);
  assert.equal(f.segs.length, 4);
  assert.equal(M.footprint(new Uint8ClampedArray(w * h * 4), w, h, 6), null);
  const v = M.view(f.bbox);
  assert.equal(v.x({ x: 18, y: 0 }), 320);
  assert.equal(v.h, 160);
});

test('rooms: drawing converts back to millimetres and snaps to the grid', () => {
  const t = M.transform(CAL), inv = M.inverse(CAL);
  const back = inv(t({ x: 30696, y: 31168 }));
  assert.ok(Math.abs(back.x - 30696) < 1e-6 && Math.abs(back.y - 31168) < 1e-6);
  assert.deepEqual(M.snapBox({ x: 30120, y: 31900 }, { x: 29010, y: 30010 }), [29000, 30000, 30500, 32000]);
  assert.deepEqual(M.snapBox({ x: 30000, y: 30000 }, { x: 30000, y: 30000 }), [30000, 30000, 30500, 30500]);
  assert.deepEqual(M.boxCells([30000, 30000, 31000, 30500]), ['60,60', '61,60']);
  const rooms = [{ id: 'a', parts: [[0, 0, 1000, 1000], [1000, 0, 2000, 500]] }];
  assert.equal(M.roomAt(rooms, { x: 1500, y: 200 }).id, 'a');
  assert.equal(M.roomAt(rooms, { x: 1500, y: 800 }), null);
});

test('map alignment: two taps give rotation and shift, and commands map back', () => {
  // live frame is the map frame rotated by 90 degrees and moved
  const truth = p => ({ x: -p.y + 50000, y: p.x - 1000 });
  const a = { live: { x: 25000, y: 25000 }, map: truth({ x: 25000, y: 25000 }) };
  const b = { live: { x: 27000, y: 25500 }, map: truth({ x: 27000, y: 25500 }) };
  const al = M.alignFrom(a, b);
  const p = M.toMap(al, { x: 26000, y: 30000 }), q = truth({ x: 26000, y: 30000 });
  assert.ok(Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6);
  const back = M.toRobot(al, p);
  assert.ok(Math.abs(back.x - 26000) < 1e-6 && Math.abs(back.y - 30000) < 1e-6);
  assert.deepEqual(M.robotBox(al, [20000, 24000, 21000, 25000]).map(v => Math.round(v)), [25000, 29000, 26000, 30000]);
  const shift = M.alignFrom({ live: { x: 0, y: 0 }, map: { x: 100, y: -50 } });
  assert.deepEqual(M.toMap(shift, { x: 10, y: 10 }), { x: 110, y: -40 });
  assert.equal(M.toMap(null, { x: 1, y: 2 }).x, 1);
});
