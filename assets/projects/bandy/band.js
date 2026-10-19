/* Bandy band simulator: every sound is synthesised live with the Web Audio API.
   Outfit = instrument, face = rhythm, hat = effect, scene = genre (tempo, scale, backing). */
(() => {
  const root = document.querySelector("[data-band]");
  if (!root) return;
  const BASE = root.dataset.base;

  const HATS = ["monster", "elf", "electric", "glitch", "bubble", "robot"];
  const FACES = ["angry", "sleepy", "happy", "laughing", "calm", "sad"];
  const OUTFITS = ["guitar", "singer", "piano", "bass", "violin", "drum"];
  const NAMES = {
    monster: "Monster Hat · low pitch", elf: "Elf Hat · high pitch", electric: "Electric Hat · buzz", glitch: "Glitch Hat · signal break", bubble: "Bubble Hat · underwater", robot: "Robot Hat · vocoder",
    angry: "Angry · strong rhythm", sleepy: "Sleepy · lazy rhythm", happy: "Happy · upbeat rhythm", laughing: "Laughing · playful rhythm", calm: "Calm · smooth rhythm", sad: "Sad · slow rhythm",
    guitar: "Guitar", singer: "Singer", piano: "Piano", bass: "Bass", violin: "Violin", drum: "Drums",
  };

  // Genres: tempo, swing, chord roots (MIDI) and chord shapes, plus a backing groove
  const GENRES = {
    country: { bpm: 104, swing: 0.12, chords: [[55, "maj"], [60, "maj"], [62, "maj"], [55, "maj"]], kit: "stomp" },
    rock: { bpm: 124, swing: 0, chords: [[52, "min"], [48, "maj"], [50, "maj"], [52, "min"]], kit: "rock" },
    classical: { bpm: 84, swing: 0, chords: [[60, "maj"], [57, "min"], [53, "maj"], [55, "maj"]], kit: "none" },
    jazz: { bpm: 112, swing: 0.22, chords: [[62, "min7"], [55, "dom7"], [60, "maj7"], [57, "dom7"]], kit: "jazz" },
    electronic: { bpm: 124, swing: 0, chords: [[57, "min"], [53, "maj"], [60, "maj"], [55, "maj"]], kit: "four" },
  };
  const SHAPES = { maj: [0, 4, 7, 12], min: [0, 3, 7, 12], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dom7: [0, 4, 7, 10] };

  // Faces decide when a member plays (16 steps per bar) and how hard
  const RHYTHM = {
    angry: { steps: [0, 2, 4, 6, 8, 10, 12, 14], accent: [0, 4, 8, 12], vel: 1, len: 0.6 },
    sleepy: { steps: [0, 9], accent: [0], vel: 0.6, len: 3.2, lag: 0.04 },
    happy: { steps: [0, 3, 6, 10, 12, 14], accent: [0, 6, 12], vel: 0.85, len: 0.9 },
    laughing: { steps: [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14, 15], accent: [0, 8], vel: 0.75, len: 0.45 },
    calm: { steps: [0, 4, 8, 12], accent: [0], vel: 0.7, len: 3.6 },
    sad: { steps: [0, 7, 12], accent: [0], vel: 0.55, len: 2.4 },
  };

  let ctx = null, master = null, verb = null, playing = false, genre = "country";
  let step = 0, nextTime = 0, timer = 0;
  // the base is a 3 × 6 grid like the prototype: index = row * 6 + col; row 0 is the back
  const ROWS = 3, COLS = 6;
  const slots = Array(ROWS * COLS).fill(null);
  slots[2 * 6 + 0] = { hat: "elf", face: "happy", outfit: "guitar" };
  slots[1 * 6 + 2] = { hat: "bubble", face: "calm", outfit: "piano" };
  slots[2 * 6 + 3] = { hat: "monster", face: "angry", outfit: "drum" };
  slots[0 * 6 + 4] = { hat: "robot", face: "laughing", outfit: "singer" };

  /* ---------- audio graph ---------- */
  const noiseBuf = () => {
    const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  };
  let NOISE = null;
  const makeReverb = () => {
    const len = ctx.sampleRate * 1.8, b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    const cv = ctx.createConvolver(); cv.buffer = b; return cv;
  };
  const init = () => {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master = ctx.createGain(); master.gain.value = 0.8;
    verb = makeReverb(); const wet = ctx.createGain(); wet.gain.value = 0.22;
    verb.connect(wet).connect(comp); master.connect(comp).connect(ctx.destination);
    NOISE = noiseBuf();
  };
  const distCurve = (() => { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / n * 2 - 1; c[i] = Math.tanh(x * 6); } return c; })();

  // One effect chain per hat: returns an input node that ends in master (+ reverb send)
  const fxChain = (hat, t, dur, pan = 0, wet = 0.25) => {
    const out = ctx.createGain();
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; out.connect(p).connect(master); } else out.connect(master);
    const send = ctx.createGain(); send.gain.value = hat === "bubble" ? Math.max(0.6, wet) : wet; out.connect(send).connect(verb);
    if (hat === "electric") { const ws = ctx.createWaveShaper(); ws.curve = distCurve; const g = ctx.createGain(); g.gain.value = 0.45; ws.connect(g).connect(out); return ws; }
    if (hat === "bubble") { const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 700; lp.Q.value = 6; const lfo = ctx.createOscillator(); lfo.frequency.value = 5; const lg = ctx.createGain(); lg.gain.value = 400; lfo.connect(lg).connect(lp.frequency); lfo.start(t); lfo.stop(t + dur + 0.5); lp.connect(out); return lp; }
    if (hat === "robot") { const rm = ctx.createGain(); rm.gain.value = 0; const car = ctx.createOscillator(); car.type = "square"; car.frequency.value = 55; car.connect(rm.gain); car.start(t); car.stop(t + dur + 0.5); rm.connect(out); return rm; }
    if (hat === "monster") { const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1200; lp.connect(out); return lp; }
    return out;
  };
  const pitchFor = (hat) => (hat === "monster" ? 0.5 : hat === "elf" ? 2 : 1);
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  /* ---------- instruments ---------- */
  const env = (g, t, a, peak, d, sustain = 0.0001) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + d); };
  const osc = (type, f, t, dur, dest) => { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.connect(dest); o.start(t); o.stop(t + dur + 0.1); return o; };
  const play = {
    guitar(f, t, dur, v, dest) { const g = ctx.createGain(); env(g, t, 0.005, 0.32 * v, Math.min(dur, 0.9)); const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(4200, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.5); g.connect(lp).connect(dest); osc("sawtooth", f, t, dur, g); osc("triangle", f * 2.005, t, dur, g); },
    piano(f, t, dur, v, dest) { const g = ctx.createGain(); env(g, t, 0.004, 0.35 * v, Math.min(dur + 0.6, 1.6)); g.connect(dest); osc("sine", f, t, dur + 0.6, g); const h = ctx.createGain(); h.gain.value = 0.3; h.connect(g); osc("sine", f * 2, t, dur + 0.6, h); const h3 = ctx.createGain(); h3.gain.value = 0.12; h3.connect(g); osc("triangle", f * 3, t, dur, h3); },
    bass(f, t, dur, v, dest) { const g = ctx.createGain(); env(g, t, 0.01, 0.5 * v, Math.min(dur, 0.7), 0.05); const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 520; lp.Q.value = 3; g.connect(lp).connect(dest); osc("sawtooth", f / 2, t, dur, g); osc("sine", f / 2, t, dur, g); },
    violin(f, t, dur, v, dest) { const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.18 * v, t + 0.12); g.gain.setValueAtTime(0.18 * v, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.25); const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2200; bp.Q.value = 0.7; g.connect(bp).connect(dest); const o = osc("sawtooth", f * 2, t, dur + 0.3, g); const lfo = ctx.createOscillator(); lfo.frequency.value = 5.5; const lg = ctx.createGain(); lg.gain.value = f * 0.012; lfo.connect(lg).connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.4); },
    singer(f, t, dur, v, dest) {
      // a sawtooth "voice" pushed through three vowel formants, with vibrato
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.3 * v, t + 0.06); g.gain.setValueAtTime(0.3 * v, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.2); g.connect(dest);
      const src = ctx.createGain();
      [[700, 8, 1], [1150, 10, 0.6], [2600, 12, 0.25]].forEach(([ff, q, a]) => { const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = ff; bp.Q.value = q; const ga = ctx.createGain(); ga.gain.value = a * 3; src.connect(bp); bp.connect(ga).connect(g); });
      const o = osc("sawtooth", f, t, dur + 0.3, src); const lfo = ctx.createOscillator(); lfo.frequency.value = 5.2; const lg = ctx.createGain(); lg.gain.value = f * 0.015; lfo.connect(lg).connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.4);
    },
  };
  const kick = (t, v, dest, p = 1) => { const g = ctx.createGain(); env(g, t, 0.002, 0.9 * v, 0.35); g.connect(dest); const o = ctx.createOscillator(); o.frequency.setValueAtTime(150 * p, t); o.frequency.exponentialRampToValueAtTime(45 * p, t + 0.25); o.connect(g); o.start(t); o.stop(t + 0.4); };
  const noise = (t, v, dest, type, f, d) => { const s = ctx.createBufferSource(); s.buffer = NOISE; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; const g = ctx.createGain(); env(g, t, 0.002, v, d); s.connect(fl).connect(g).connect(dest); s.start(t); s.stop(t + d + 0.05); };
  const snare = (t, v, dest) => { noise(t, 0.5 * v, dest, "bandpass", 1800, 0.18); const g = ctx.createGain(); env(g, t, 0.002, 0.25 * v, 0.1); g.connect(dest); osc("triangle", 190, t, 0.12, g); };
  const hat = (t, v, dest, open) => noise(t, 0.22 * v, dest, "highpass", 7000, open ? 0.22 : 0.05);

  /* ---------- backing groove per genre ---------- */
  const backing = (s, t) => {
    const g = GENRES[genre], k = g.kit, d = master, b = s % 16;
    if (k === "stomp") { if (b % 8 === 0) kick(t, 0.8, d); if (b === 4 || b === 12) snare(t, 0.35, d); if (b % 2 === 0) hat(t, 0.4, d); }
    if (k === "rock") { if (b === 0 || b === 8 || b === 10) kick(t, 1, d); if (b === 4 || b === 12) snare(t, 0.8, d); if (b % 2 === 0) hat(t, 0.6, d); }
    if (k === "jazz") { if (b === 0 || b === 8) kick(t, 0.45, d); if (b === 4 || b === 12) hat(t, 0.5, d, false); if ([0, 4, 6, 8, 12, 14].includes(b)) noise(t, 0.12, d, "highpass", 5000, 0.35); }
    if (k === "four") { if (b % 4 === 0) kick(t, 1, d); if (b % 4 === 2) hat(t, 0.7, d, true); if (b === 4 || b === 12) noise(t, 0.35, d, "bandpass", 2400, 0.15); }
    // a quiet pad so the scene is audible even with no band
    if (b === 0) { const [root, shape] = g.chords[Math.floor(s / 16) % 3]; SHAPES[shape].slice(0, 3).forEach((iv) => { const gg = ctx.createGain(); gg.gain.setValueAtTime(0.0001, t); gg.gain.linearRampToValueAtTime(genre === "classical" ? 0.07 : 0.045, t + 0.3); gg.gain.linearRampToValueAtTime(0.0001, t + stepDur() * 16); const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1400; gg.connect(lp).connect(master); osc(genre === "electronic" ? "sawtooth" : "triangle", hz(root + iv), t, stepDur() * 16, gg); }); }
  };

  /* ---------- members on the grid ----------
     Columns are time: left to right, each column plays for half a bar, then the loop starts again (3 bars).
     Members in the same column play together. Rows are pitch: the back row plays high, the front row low. */
  const stepDur = () => 60 / GENRES[genre].bpm / 4;
  const STEPS = COLS * 8;
  const posOf = (i) => ({ row: Math.floor(i / COLS), col: i % COLS });
  const memberPlay = (m, i, s, t) => {
    const r = RHYTHM[m.face], b = s % 16, { row, col } = posOf(i);
    if (col !== Math.floor(s / 8)) return;
    if (!r.steps.includes(b)) return;
    if (m.hat === "glitch" && Math.random() < 0.35) return;
    const acc = r.accent.includes(b) ? 1 : 0.7, v = r.vel * acc;
    const tt = t + (r.lag || 0);
    const dur = stepDur() * r.len * (m.outfit === "violin" || m.outfit === "singer" ? 2 : 1);
    const dest = fxChain(m.hat, tt, dur, 0, 0.25);
    if (m.outfit === "drum") {
      const p = pitchFor(m.hat) * [1.5, 1, 0.7][row];
      if (b % 8 === 0) kick(tt, v, dest, p); else if (b % 8 === 4) snare(tt, v, dest); else hat(tt, v, dest, m.face === "calm");
    } else {
      const g = GENRES[genre], [root, shape] = g.chords[Math.floor(s / 16) % 3], tones = SHAPES[shape];
      const oct = (m.outfit === "bass" ? -12 : m.outfit === "violin" || m.outfit === "singer" ? 12 : 0) + [12, 0, -12][row];
      const idx = (Math.floor(b / 2) + (m.face === "laughing" ? b : 0)) % tones.length;
      const f = hz(root + oct + tones[idx]) * pitchFor(m.hat);
      play[m.outfit](f, tt, dur, v, dest);
      if (m.hat === "glitch" && Math.random() < 0.5) play[m.outfit](f, tt + stepDur() / 2, dur / 3, v * 0.7, dest);
    }
    // light up the member on screen in time with its note
    const el = root.querySelector(`[data-slot-i="${i}"] .bs-member`);
    if (el) setTimeout(() => { el.classList.remove("is-hit"); void el.offsetWidth; el.classList.add("is-hit"); }, Math.max(0, (tt - ctx.currentTime) * 1000));
  };
  const schedule = () => {
    while (nextTime < ctx.currentTime + 0.12) {
      const g = GENRES[genre], swing = step % 2 ? g.swing * stepDur() * 2 : 0;
      backing(step, nextTime + swing);
      slots.forEach((m, i) => m && memberPlay(m, i, step, nextTime + swing));
      if (step % 8 === 0) { const col = step / 8; setTimeout(() => showCol(col), Math.max(0, (nextTime - ctx.currentTime) * 1000)); }
      nextTime += stepDur(); step = (step + 1) % STEPS;
    }
  };
  const start = () => {
    if (!ctx) init();
    ctx.resume(); playing = true; step = 0; nextTime = ctx.currentTime + 0.05;
    clearInterval(timer); timer = setInterval(schedule, 25);
    root.classList.add("is-playing");
  };
  const stop = () => { playing = false; clearInterval(timer); root.classList.remove("is-playing"); if (ctx) ctx.suspend(); showCol(-1); };
  // the playhead: which column is playing now
  let nowCol = -1;
  const showCol = (c) => {
    if (!playing && c >= 0) return;
    nowCol = c;
    root.querySelectorAll("[data-slot-i]").forEach((p) => p.classList.toggle("is-now", +p.dataset.slotI % COLS === c));
    root.querySelectorAll("[data-col]").forEach((t) => t.classList.toggle("is-now", +t.dataset.col === c));
    root.querySelectorAll("[data-cell-col]").forEach((t) => t.classList.toggle("is-now", +t.dataset.cellCol === c));
  };

  /* ---------- UI ---------- */
  const stage = root.querySelector("[data-band-slots]");
  const readout = root.querySelector("[data-band-read]");
  const tray = root.querySelector("[data-band-tray]");
  const KINDS = { hat: HATS, face: FACES, outfit: OUTFITS };
  const ROWNAME = ["back · high", "middle", "front · low"];
  const POS = slots.map((_, i) => `column ${(i % COLS) + 1}, ${ROWNAME[Math.floor(i / COLS)]}`);

  /* the base in perspective, measured in % of the stage width (cqw):
     the top face runs from y=TOP (back edge) to y=BOT (front edge) and widens towards the front */
  const TOP = 35, BOT = 55, BACKW = 54, FRONTW = 68, CX = 50;
  const at = (u, v) => { const w = BACKW + (FRONTW - BACKW) * v; return [CX - w / 2 + w * u, TOP + (BOT - TOP) * v]; };
  const IN = { u0: 0.07, u1: 0.93, v0: 0.12, v1: 0.92 }; // the white grid insert
  const cellBox = (row, col, pad = 0.16) => {
    const cu = (IN.u1 - IN.u0) / COLS, cv = (IN.v1 - IN.v0) / ROWS;
    const u0 = IN.u0 + col * cu + cu * pad / 2, u1 = IN.u0 + (col + 1) * cu - cu * pad / 2;
    const v0 = IN.v0 + row * cv + cv * pad, v1 = IN.v0 + (row + 1) * cv - cv * pad;
    return [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)];
  };
  const cellAnchor = (row, col) => { const cu = (IN.u1 - IN.u0) / COLS, cv = (IN.v1 - IN.v0) / ROWS; return at(IN.u0 + (col + 0.5) * cu, IN.v0 + (row + 0.62) * cv); };
  const blockSize = (row) => 6.1 + row * 0.6;
  const pts = (arr) => arr.map(([x, y]) => `${(x * 16).toFixed(1)},${(y * 16).toFixed(1)}`).join(" ");
  // a rounded "stadium" outline through the four corners of a quad, sampled as a polygon
  const stadium = (u0, v0, u1, v1, r) => {
    const out = [], N = 8;
    const corner = (cu, cv, a0) => { for (let k = 0; k <= N; k++) { const a = a0 + (k / N) * Math.PI / 2; out.push(at(cu + Math.cos(a) * r, cv + Math.sin(a) * r * 2.2)); } };
    corner(u1 - r, v1 - r * 2.2, 0); corner(u0 + r, v1 - r * 2.2, Math.PI / 2); corner(u0 + r, v0 + r * 2.2, Math.PI); corner(u1 - r, v0 + r * 2.2, Math.PI * 1.5);
    return out;
  };
  const drawBase = () => {
    const rim = stadium(0, 0, 1, 1, 0.09), lid = stadium(0.03, 0.06, 0.97, 0.95, 0.075);
    // the dark speaker body: the rim outline extruded downwards
    const body = Array.from({ length: 14 }, (_, k) => `<polygon class="bs-body" points="${pts(rim.map(([x, y]) => [x, y + 0.5 * (k + 1)]))}"/>`).join("");
    const cells = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) cells.push(`<polygon class="bs-cell" data-cell-col="${c}" points="${pts(cellBox(r, c))}"/>`);
    const insert = [at(IN.u0 - 0.01, IN.v0 - 0.04), at(IN.u1 + 0.01, IN.v0 - 0.04), at(IN.u1 + 0.01, IN.v1 + 0.03), at(IN.u0 - 0.01, IN.v1 + 0.03)];
    const nums = Array.from({ length: COLS }, (_, c) => { const [x] = cellAnchor(2, c); return `<text class="bs-num" data-col="${c}" x="${(x * 16).toFixed(1)}" y="${((BOT + 4.6) * 16).toFixed(1)}">${c + 1}</text>`; }).join("");
    root.querySelector("[data-band-base]").innerHTML = `<svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMin slice">
      ${body}
      <polygon class="bs-rim" points="${pts(rim)}"/><polygon class="bs-lid" points="${pts(lid)}"/>
      <polygon class="bs-insert" points="${pts(insert)}"/>${cells.join("")}
      ${nums}</svg>`;
  };
  const src = (kind, name) => `${BASE}blocks/${kind}-${name}.webp`;
  let sel = null; // { i, kind }: a block on the board waiting for a new one from the tray

  tray.innerHTML = Object.entries(KINDS).map(([kind, list]) => `<div class="bs-tray__row" data-kind="${kind}"><small>${kind === "hat" ? "Hats · effect" : kind === "face" ? "Faces · rhythm" : "Outfits · instrument"}</small><div>${list.map((n) => `<button type="button" class="bs-chip" data-pick="${kind}:${n}" title="${NAMES[n]}"><img src="${src(kind, n)}" alt="${NAMES[n]}" draggable="false"></button>`).join("")}</div></div>`).join("");

  const render = (flash) => {
    stage.innerHTML = slots.map((m, i) => { const { row, col } = posOf(i), [x, y] = cellAnchor(row, col); return `<div class="bs-pad${m ? " is-full" : ""}${col === nowCol ? " is-now" : ""}" data-slot-i="${i}" style="--x:${x.toFixed(2)};--y:${y.toFixed(2)};--b:${blockSize(row)};z-index:${row + 2}">${m
      ? `<div class="bs-member" data-member="${i}">${["hat", "face", "outfit"].map((k) => `<button type="button" class="bs-block${sel && sel.i === i && sel.kind === k ? " is-sel" : ""}${flash && flash.i === i && flash.kind === k ? " is-swap" : ""}" data-block="${k}" data-i="${i}" aria-label="${NAMES[m[k]]}: change it"><img src="${src(k, m[k])}" alt="" draggable="false"></button>`).join("")}<button type="button" class="bs-remove" data-remove="${i}" aria-label="Take this member off">×</button></div>`
      : `<button type="button" class="bs-add" data-add="${i}" aria-label="Add a member: ${POS[i]}"><span>+</span></button>`}</div>`; }).join("");
    const n = slots.filter(Boolean).length;
    readout.textContent = n ? `${n} of 6 · ` + slots.map((m, i) => m && `${NAMES[m.outfit]} (${POS[i]})`).filter(Boolean).join(", ") : "No members yet: only the scene is playing.";
    root.classList.toggle("has-sel", !!sel);
    tray.querySelectorAll(".bs-tray__row").forEach((r) => r.classList.toggle("is-target", !!sel && r.dataset.kind === sel.kind));
    tray.querySelectorAll("[data-pick]").forEach((b) => { const [k, n] = b.dataset.pick.split(":"); b.classList.toggle("is-on", !!sel && sel.kind === k && slots[sel.i] && slots[sel.i][k] === n); });
  };

  // the scene board: background and label
  const boards = (root.dataset.boards || "").split(" ");
  const bgImg = root.querySelector(".bs-bg__img");
  boards.forEach((k) => { new Image().src = `${BASE}boards/${k}.webp`; });
  const setGenre = (k) => {
    genre = k; root.dataset.genre = k;
    root.querySelectorAll("[data-genre]").forEach((b) => b.toggleAttribute("aria-current", b.dataset.genre === k));
    root.classList.toggle("has-art", boards.includes(k));
    if (boards.includes(k)) bgImg.src = `${BASE}boards/${k}.webp`;
  };
  const rand = (arr) => arr[(Math.random() * arr.length) | 0];
  const randMember = () => ({ hat: rand(HATS), face: rand(FACES), outfit: rand(OUTFITS) });
  const putBlock = (i, kind, name) => {
    if (!slots[i]) slots[i] = randMember();
    slots[i][kind] = name; render({ i, kind });
  };
  const move = (from, to) => { if (from === to) return; [slots[from], slots[to]] = [slots[to], slots[from]]; sel = null; render(); };

  /* tap: pick a block on the board, then a new one from the tray */
  let dragged = false;
  root.addEventListener("click", (e) => {
    if (dragged) { dragged = false; return; }
    const bl = e.target.closest("[data-block]"), pk = e.target.closest("[data-pick]"), a = e.target.closest("[data-add]"), r = e.target.closest("[data-remove]"), g = e.target.closest("[data-genre]");
    if (bl) { const i = +bl.dataset.i, kind = bl.dataset.block; sel = sel && sel.i === i && sel.kind === kind ? null : { i, kind }; render(); }
    else if (pk) {
      const [kind, name] = pk.dataset.pick.split(":");
      if (sel && sel.kind === kind) putBlock(sel.i, kind, name);
      else { // no block picked yet: give it to the first member, or start a member in the first free spot
        const i = sel ? sel.i : slots.findIndex(Boolean) >= 0 ? slots.findIndex(Boolean) : 2 * COLS;
        sel = { i, kind }; putBlock(i, kind, name);
      }
    }
    else if (a) { const i = +a.dataset.add; slots[i] = randMember(); sel = null; render(); }
    else if (r) { slots[+r.dataset.remove] = null; sel = null; render(); }
    else if (g) setGenre(g.dataset.genre);
    else if (!e.target.closest(".bs-tray, .bs-bar")) { sel = null; render(); }
  });

  /* drag: a tray block onto a member (or an empty spot), or a member to another spot */
  let drag = null;
  const ghost = document.createElement("div"); ghost.className = "bs-ghost"; ghost.setAttribute("aria-hidden", "true"); document.body.append(ghost);
  // drop target = the grid cell under the pointer (members may hide cells behind them)
  const inQuad = (px, py, q) => { let inside = false; for (let a = 0, b = q.length - 1; a < q.length; b = a++) { const [xa, ya] = q[a], [xb, yb] = q[b]; if ((ya > py) !== (yb > py) && px < ((xb - xa) * (py - ya)) / (yb - ya) + xa) inside = !inside; } return inside; };
  const stageEl = root.querySelector(".bs-stage");
  const padAt = (x, y) => {
    const r = stageEl.getBoundingClientRect(), px = ((x - r.left) / r.width) * 100, py = ((y - r.top) / r.width) * 100;
    for (let i = 0; i < slots.length; i++) { const { row, col } = posOf(i); if (inQuad(px, py, cellBox(row, col, 0))) return root.querySelector(`[data-slot-i="${i}"]`); }
    return null;
  };
  root.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const pk = e.target.closest("[data-pick]"), mem = e.target.closest("[data-member]");
    if (e.target.closest("[data-remove]")) return;
    if (pk) { const [kind, name] = pk.dataset.pick.split(":"); drag = { kind, name, x: e.clientX, y: e.clientY, html: `<img src="${src(kind, name)}" alt="">` }; }
    else if (mem) drag = { from: +mem.dataset.member, x: e.clientX, y: e.clientY, html: mem.innerHTML.replace(/<button type="button" class="bs-remove"[^]*?<\/button>/, "") };
  });
  addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (!drag.on && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
    if (!drag.on) { drag.on = true; ghost.innerHTML = drag.html; ghost.classList.toggle("is-member", drag.from != null); ghost.classList.add("is-on"); root.classList.add("is-dragging"); }
    e.preventDefault();
    ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    root.querySelectorAll(".bs-pad.is-over").forEach((p) => p.classList.remove("is-over"));
    padAt(e.clientX, e.clientY)?.classList.add("is-over");
  }, { passive: false });
  const drop = (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.on) return;
    dragged = true; setTimeout(() => (dragged = false), 0);
    ghost.classList.remove("is-on"); root.classList.remove("is-dragging");
    root.querySelectorAll(".bs-pad.is-over").forEach((p) => p.classList.remove("is-over"));
    const pad = e.type === "pointerup" && padAt(e.clientX, e.clientY);
    if (!pad) return;
    const to = +pad.dataset.slotI;
    if (d.from != null) move(d.from, to);
    else { sel = { i: to, kind: d.kind }; putBlock(to, d.kind, d.name); }
  };
  addEventListener("pointerup", drop);
  addEventListener("pointercancel", drop);

  root.querySelector("[data-band-start]").addEventListener("click", () => { root.classList.add("is-on"); start(); });
  root.querySelector("[data-band-toggle]").addEventListener("click", () => (playing ? stop() : start()));
  root.querySelector("[data-band-shuffle]").addEventListener("click", () => {
    const spots = slots.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, 4 + ((Math.random() * 3) | 0));
    slots.fill(null); spots.forEach((i) => (slots[i] = randMember())); sel = null; render();
  });
  // pause when the demo scrolls far away, so it never plays unseen
  new IntersectionObserver((es) => es.forEach((en) => { if (!en.isIntersecting && playing) stop(); }), { threshold: 0 }).observe(root);
  setGenre(genre);
  drawBase();
  render();
  window.__bandy = { slots, start, stop, render, get playing() { return playing; }, get ctx() { return ctx; } };
})();
