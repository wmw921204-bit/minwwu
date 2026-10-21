// Live mode end to end: the real index.html + ha-model.js + ha-live.js in jsdom, against a fake bridge.
// Nothing here can reach Home Assistant or the robot.
const test = require('node:test');
const { afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const DIR = path.join(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CAL = [
  { vacuum: { x: 25500, y: 25500 }, map: { x: 376, y: 860 } },
  { vacuum: { x: 35500, y: 25500 }, map: { x: 1176, y: 860 } },
  { vacuum: { x: 25500, y: 35500 }, map: { x: 376, y: 60 } },
];

function page() {
  let html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  html = html.replace(/<script src="https:\/\/cdnjs[^"]*"><\/script>/, ''); // no three.js: 3D is not under test
  for (const f of ['ha-model.js', 'ha-live.js', 'study-log.js'])
    html = html.replace(`<script src="${f}"></script>`, () => '<script>' + fs.readFileSync(path.join(DIR, f), 'utf8') + '</script>');
  return html;
}

/* A stand-in for server.py: robot state the test changes, and every command the app sends. */
function fakeBridge(init = {}) {
  const st = { vacuum: 'docked', detail: 'charging', err: 'none', battery: 100, area: 0, mode: 'vac_and_mop', water: 'off', mop: 'on', ...init };
  const sent = [];
  const ent = (id, state) => ({ entity_id: id, state, attributes: {} });
  const snapshot = () => ({
    received_at: Date.now() / 1000, reader: true,
    vacuum: { entity_id: 'vacuum.s6', state: st.vacuum, attributes: { friendly_name: 'S6' } },
    vacuums: [{ entity_id: 'vacuum.s6', name: 'S6' }],
    entities: [ent('sensor.s6_battery', String(st.battery)), ent('sensor.s6_status', st.detail), ent('sensor.s6_vacuum_error', st.err),
      ent('sensor.s6_cleaning_area', String(st.area)), ent('sensor.s6_cleaning_time', String(st.minutes ?? 0)), ent('select.s6_cleaning_mode', st.mode),
      ent('binary_sensor.s6_water_shortage', st.water), ent('binary_sensor.s6_mop_attached', st.mop), ent('select.s6_selected_map', 'Map 0')],
    position: { x: 25600, y: 25600, at: Date.now() / 1000 },
    geometry: { maps: [{ map_id: 0, source_updated_at: '2026-10-01T00:00:00Z', calibration: CAL, obstacles: [], no_go_areas: [],
      path: [[{ x: 25600, y: 25600 }, { x: 26000, y: 25600 }]], robot: { x: 25600, y: 25600, angle: 0 }, charger: null, image_size: { width: 1428, height: 1380 } }] },
  });
  const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  async function fetch(url, o = {}) {
    url = String(url).replace(/^https?:\/\/[^/]+/, '');
    if (o.method === 'POST') {
      const b = JSON.parse(o.body);
      if (url === '/api/command') {
        sent.push(b.action);
        if (b.action === 'start') Object.assign(st, { vacuum: 'cleaning', detail: 'cleaning' });
        if (b.action === 'pause') Object.assign(st, { vacuum: 'paused', detail: 'paused' });
        if (b.action === 'return_to_base') Object.assign(st, { vacuum: 'returning', detail: 'returning_home' });
        if (b.action === 'zone' || b.action === 'zones') Object.assign(st, { vacuum: 'cleaning', detail: 'zoned_cleaning' });
        return reply({ accepted: true });
      }
      return reply({ sent: [] });
    }
    if (url.startsWith('/api/state')) return init.noBridge ? reply({}, 404) : reply(snapshot());
    if (url.startsWith('/api/schedules')) return reply({ schedules: [] });
    return reply({ error: 'none' }, 503); // e.g. /api/map: not under test
  }
  return { st, sent, fetch, robotCommands: () => sent.filter(a => a !== 'mode') };
}

const open = [];
afterEach(() => { while (open.length) open.pop().close(); }); // a failed test must not leave timers running

async function boot(bridge, saved = { onboarded: true }) {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', e => errors.push(String(e && e.message || e)));
  const dom = new JSDOM(page(), {
    url: 'http://127.0.0.1:8788/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.fetch = bridge.fetch;
      if (!w.AbortSignal.timeout) w.AbortSignal.timeout = () => new w.AbortController().signal;
      w.createImageBitmap = async () => { throw new Error('no images in tests'); };
      if (saved) w.localStorage.setItem('robot-live-v1', JSON.stringify(saved));
    },
  });
  const w = dom.window;
  const app = {
    w, errors, bridge,
    run: code => w.eval(code),
    async poll(times = 2) { for (let i = 0; i < times; i++) { w.eval('HA.fetching=false;A.cmdRefresh()'); await sleep(25); } },
    close: () => { try { w.close(); } catch (e) {} },
  };
  open.push(app);
  await sleep(30);
  await app.poll();
  return app;
}

test('a cleaning started elsewhere becomes a task, docking finishes it, and nothing is sent', async () => {
  const b = fakeBridge();
  const app = await boot(b);
  b.st.vacuum = 'cleaning'; b.st.detail = 'cleaning';
  await app.poll();
  assert.equal(app.run('S.task.scopeLabel'), 'Started outside the app');
  b.st.vacuum = 'docked'; b.st.detail = 'charging';
  await app.poll();
  assert.equal(app.run('S.task.done'), true);
  assert.deepEqual(b.robotCommands(), []);
  app.close();
});

test('Start cleaning sends start and labels the task Entire home', async () => {
  const b = fakeBridge();
  const app = await boot(b);
  app.run('A.startTask()');
  await app.poll(3);
  assert.deepEqual(b.robotCommands(), ['start']);
  assert.equal(app.run('S.task.scopeLabel'), 'Entire home');
  app.close();
});

test('study events are off by default', async () => {
  const app = await boot(fakeBridge());
  assert.equal(app.run('S.ctl.scenario'), 'none');
  app.close();
});

test('the robot deciding a study event by itself never moves the real robot', async () => {
  const b = fakeBridge({ vacuum: 'cleaning', detail: 'cleaning' });
  const app = await boot(b, { onboarded: true, scenario: 'all', autonomy: 'autoNotify' });
  app.run("S.sim.pending=['rug','extra'];A.haFire();A.haFire()");
  await app.poll(3);
  assert.deepEqual(b.robotCommands(), []);
  assert.match(app.run("S.events.find(e=>e.key==='rug').outcome"), /simulated/);
  app.close();
});

test('a retry you send now goes straight away, then the cleaning carries on', async () => {
  const b = fakeBridge({ vacuum: 'cleaning', detail: 'cleaning' });
  const app = await boot(b, { onboarded: true, scenario: 'all', autonomy: 'assist' });
  app.run("S.sim.pending=['cable'];A.haFire()");
  const id = app.run("S.events.find(e=>e.key==='cable').id");
  app.run(`A.haRetryWhen('${id}|retryCleared|now')`);
  await app.poll(3);
  assert.deepEqual(b.robotCommands(), ['zone']);
  b.st.vacuum = 'docked'; b.st.detail = 'charging'; // the spot is done
  await app.poll(4);
  assert.equal(app.run("S.events.find(e=>e.key==='cable').status"), 'resolved');
  assert.deepEqual(b.robotCommands(), ['zone', 'start']);
  assert.equal(app.run('S.task.done'), false);
  app.close();
});

test('ending the cleaning cancels a retry waiting for the end', async () => {
  const b = fakeBridge({ vacuum: 'cleaning', detail: 'cleaning' });
  const app = await boot(b, { onboarded: true, scenario: 'all', autonomy: 'assist' });
  app.run("S.sim.pending=['cable'];A.haFire()");
  const id = app.run("S.events.find(e=>e.key==='cable').id");
  app.run(`A.haRetryWhen('${id}|retryCleared|after')`);
  await app.poll();
  app.run('A.confirmEnd()');
  await app.poll(2);
  b.st.vacuum = 'docked'; b.st.detail = 'charging';
  await app.poll(4);
  assert.deepEqual(b.robotCommands(), ['return_to_base']);
  assert.equal(app.run("S.events.find(e=>e.key==='cable').status"), 'deferred');
  assert.equal(app.run('S.task.result'), 'ended');
  app.close();
});

test('opening the app with nothing queued sends nothing', async () => {
  const b = fakeBridge();
  const app = await boot(b, { onboarded: true, task: { id: 't1', done: true, startedAt: Date.now() - 3600e3, start: 0, scopeLabel: 'Entire home', result: 'completed' }, retryQueue: [] });
  await app.poll(3);
  assert.deepEqual(b.robotCommands(), []);
  app.close();
});

test('notification settings saved before a switch existed keep the new switches on', async () => {
  const app = await boot(fakeBridge(), { onboarded: true, notif: { review: true, finished: true, decisions: false } });
  assert.equal(app.run('S.notif.problems'), true);
  assert.equal(app.run('S.notif.behaviour'), true);
  app.close();
});

test('a robot error becomes an event and resolves when it clears', async () => {
  const b = fakeBridge({ vacuum: 'cleaning', detail: 'cleaning' });
  const app = await boot(b);
  Object.assign(b.st, { vacuum: 'error', detail: 'error', err: 'wheels_jammed' });
  await app.poll();
  assert.equal(app.run("S.events.find(e=>e.key==='p_wheels_jammed').status"), 'needsReview');
  Object.assign(b.st, { vacuum: 'cleaning', detail: 'cleaning', err: 'none' });
  await app.poll();
  assert.equal(app.run("S.events.find(e=>e.key==='p_wheels_jammed').status"), 'resolved');
  app.close();
});

test('a pause from the app is never "Paused on its own"; a pause from elsewhere is', async () => {
  const b = fakeBridge({ vacuum: 'cleaning', detail: 'cleaning' });
  const app = await boot(b);
  app.run('A.pause()');
  await app.poll(2);
  app.run('HA.appPauseAt=Date.now()-60000'); // a long pause
  await app.poll(2);
  assert.equal(app.run("S.events.some(e=>e.key==='p_paused')"), false);
  Object.assign(b.st, { vacuum: 'cleaning', detail: 'cleaning' });
  await app.poll();
  Object.assign(b.st, { vacuum: 'paused', detail: 'paused' }); // someone pressed the robot's button
  await app.poll(2);
  assert.equal(app.run("S.events.some(e=>e.key==='p_paused'&&e.status==='needsReview')"), true);
  app.close();
});

test('an empty water tank asks before a vacuum-and-mop start', async () => {
  const b = fakeBridge({ water: 'on' });
  const app = await boot(b);
  app.run('A.startTask()');
  assert.equal(app.run('S.ui.modal.title'), 'The water tank is empty');
  assert.deepEqual(b.robotCommands(), []);
  app.close();
});

test('with no bridge behind the page, it switches to the simulation', async () => {
  const app = await boot(fakeBridge({ noBridge: true }));
  await app.poll(2);
  assert.ok(app.errors.some(e => /navigation/i.test(e)), 'expected a navigation to ?demo=1');
  app.close();
});

test('notification switches follow the automation level, and a temporary level puts them back', async () => {
  const app = await boot(fakeBridge(), { onboarded: true, autonomy: 'assist' });
  app.run("A.setAutonomy('fullAuto')");
  assert.equal(app.run('S.notif.decisions'), false);
  assert.equal(app.run('S.notif.finished'), true);
  app.run("A.setAutonomy('autoNotify')");
  assert.equal(app.run('S.notif.decisions'), true);
  app.run("A.notif('finished')"); // your own tweak
  app.run("S.ui.sheet={mode:'fullAuto',for:'1h'};A.sheetApply()");
  assert.equal(app.run('S.notif.decisions'), false);
  app.run('S.temp.until=0;checkTemp()'); // the hour is over
  assert.equal(app.run('S.autonomy'), 'autoNotify');
  assert.equal(app.run('S.notif.decisions'), true);
  assert.equal(app.run('S.notif.finished'), false);
  app.close();
});

test('a robot decision shows a Change label in the list and on the banner', async () => {
  const b = fakeBridge({ vacuum: 'cleaning', detail: 'cleaning' });
  const app = await boot(b, { onboarded: true, scenario: 'all', autonomy: 'autoNotify' });
  app.run("S.sim.pending=['cable'];A.haFire()");
  const ev = "S.events.find(e=>e.key==='cable')";
  assert.match(app.run(`evItem(${ev})`), /pill edit">Change</);
  assert.match(app.run(`evItem(${ev})`), /Robot decided: /);
  // decision notices queue and stay until opened or closed
  app.run(`S.notif.decisions=true;S.ui.decQ=[${ev}.id];render()`);
  assert.match(app.run("document.querySelector('.notice.dec').textContent"), /Change$/);
  assert.equal(app.run(`S.ui.decQ.includes(${ev}.id)`), true);
  app.run(`A.dismissNotice(${ev}.id);render()`);
  assert.equal(app.run("!!document.querySelector('.notice.dec')"), false);
  app.close();
});

test('the study panel: start, exploration until the cleaning ends, guided after-cleaning tasks with Skip and End, then results', async () => {
  const b = fakeBridge();
  const app = await boot(b);
  const tap = sel => app.run(`document.querySelector('${sel}').dispatchEvent(new MouseEvent('click',{bubbles:true}))`);
  const panel = () => app.run("document.querySelector('#study').textContent");
  const p = path => app.run(`STUDY.data().people.P0.${path}`);
  app.run("STUDY.toggle(true);document.querySelector('#study-pid').value='P0'");
  tap('#study [data-s="new"]');
  assert.equal(p('phase'), 'explore');
  assert.match(panel(), /Before you start[\s\S]*Your task/);
  assert.equal(app.run("document.querySelector('.phone #study-card')"), null); // nothing on the phone
  b.st.vacuum = 'cleaning'; b.st.detail = 'cleaning';
  await app.poll(); await sleep(400);
  assert.ok(p('explore.achieved.T2'));
  b.st.vacuum = 'docked'; b.st.detail = 'charging'; // the cleaning ends: so does exploration
  await app.poll(); await sleep(500);
  assert.equal(p('phase'), 'guided');
  assert.match(panel(), /The cleaning is done · Task 1 of/);
  assert.doesNotMatch(panel(), /taps|detour/i); // no data while the participant is using it
  const first = p('run.id');
  tap('#study [data-s="skip"]');
  tap('#study [data-s="ok"]');
  const rows = JSON.parse(app.run('JSON.stringify(STUDY.data().people.P0.tasks)'));
  assert.ok(rows.some(r => r.task === first && r.result === 'skipped'));
  assert.ok(rows.some(r => r.result === 'ended'));
  app.run("document.querySelector('#study [data-s=\"stop\"]')&&document.querySelector('#study [data-s=\"stop\"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))");
  assert.equal(p('phase'), 'done');
  assert.match(panel(), /Results · P0/);
  assert.ok(JSON.parse(app.run('JSON.stringify(STUDY.data().people.P0.tasks)')).some(r => r.phase === 'explore' && r.task === 'T2'));
  assert.match(app.run('STUDY.summaryCSV()'), /^participant,mode,phase,task/);
  assert.deepEqual(b.robotCommands(), []);
  app.close();
});

test('a goal counts whichever way they get there, and the way is recorded (Full auto from Settings)', async () => {
  const app = await boot(fakeBridge());
  const tap = sel => app.run(`document.querySelector('${sel}').dispatchEvent(new MouseEvent('click',{bubbles:true}))`);
  app.run("STUDY.toggle(true);STUDY.begin('P0')");
  app.run("go('autonomy');render()");
  tap('[data-a="setAutonomy"][data-v="fullAuto"]');
  await sleep(400);
  assert.match(app.run('STUDY.data().people.P0.explore.achieved.T10.how'), /until changed.*in Settings/);
  app.close();
});

test('Remember my choice saves the option they picked, and one-time choices are not saved', async () => {
  const b = fakeBridge({ vacuum: 'cleaning', detail: 'cleaning' });
  const app = await boot(b, { onboarded: true, scenario: 'all', autonomy: 'assist' });
  app.run("S.sim.pending=['rug'];A.haFire()");
  const id = app.run("S.events.find(e=>e.key==='rug').id");
  app.run(`S.ui.remember['${id}']=true;A.evAct('${id}|asHard')`);
  app.run(`A.haRetryWhen('${id}|asHard|after')`); // live mode asks when to go
  await app.poll(2);
  assert.equal(app.run("S.rules.filter(r=>r.key==='rug').length"), 1);
  assert.equal(app.run("S.rules.find(r=>r.key==='rug').act"), 'asHard');
  app.run("S.sim.pending=['cable'];A.haFire()");
  const cid = app.run("S.events.find(e=>e.key==='cable').id");
  app.run(`S.ui.remember['${cid}']=true;A.evAct('${cid}|later')`);
  assert.equal(app.run("S.rules.some(r=>r.key==='cable')"), false);
  app.close();
});

test('saved sessions can be viewed, deleted one by one or all at once, only between sessions', async () => {
  const app = await boot(fakeBridge());
  const tap = (sel) => app.run(`document.querySelector('${sel}').dispatchEvent(new MouseEvent('click',{bubbles:true}))`);
  app.run("STUDY.toggle(true);STUDY.begin('A1')");
  assert.equal(app.run("document.querySelector('#study [data-s=\"clear\"]')"), null); // nothing during a session
  app.run("STUDY.finish()");
  app.run("STUDY.data().pid=null;STUDY.begin('A2');STUDY.finish();STUDY.data().pid=null;STUDY.toggle(true)");
  tap('#study [data-s="del"][data-v="A1"]');
  tap('#study [data-s="delyes"][data-v="A1"]');
  assert.deepEqual(JSON.parse(app.run('JSON.stringify(Object.keys(STUDY.data().people))')), ['A2']);
  tap('#study [data-s="clear"]');
  tap('#study [data-s="clearyes"]');
  assert.equal(app.run('Object.keys(STUDY.data().people).length'), 0);
  app.close();
});

test('the robot going home on its own after a minute or two is a stopped cleaning, not a completed one', async () => {
  const b = fakeBridge({ area: 0.4, minutes: 1.7 }); // counters still show the last cleaning
  const app = await boot(b);
  app.run('A.startTask()');
  await app.poll(3);
  assert.equal(app.run('LIVE.barText()'), '—', 'last cleaning\'s area is not shown as this one');
  assert.match(app.run('LIVE.elapsed()'), /^0 min/);
  Object.assign(b.st, { area: 0.3, minutes: 1.0 });
  await app.poll();
  assert.equal(app.run('LIVE.barText()'), '0.3 m²');
  Object.assign(b.st, { vacuum: 'docked', detail: 'charging' });
  await app.poll();
  assert.equal(app.run('S.task.done'), true);
  assert.equal(app.run('S.task.result'), 'partial');
  assert.equal(app.run("S.events.some(e=>e.key==='p_short'&&e.status==='needsReview')"), true);
  assert.equal(app.run('HA.refArea'), null, 'a short run never becomes the full-clean reference');
  app.close();
});

test('a tiny full-clean reference saved by an older version is dropped', async () => {
  const app = await boot(fakeBridge(), { onboarded: true, refArea: 0.4 });
  assert.equal(app.run('HA.refArea'), null);
  app.close();
});
