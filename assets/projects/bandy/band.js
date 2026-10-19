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
  const slots = [
    { hat: "elf", face: "happy", outfit: "guitar" },
    { hat: "bubble", face: "calm", outfit: "piano" },
    { hat: "monster", face: "angry", outfit: "drum" },
    null, null, null,
  ];

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
  const fxChain = (hat, t, dur) => {
    const out = ctx.createGain(); out.connect(master);
    const send = ctx.createGain(); send.gain.value = hat === "bubble" ? 0.6 : 0.25; out.connect(send).connect(verb);
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
    if (b === 0) { const [root, shape] = g.chords[Math.floor(s / 16) % 4]; SHAPES[shape].slice(0, 3).forEach((iv) => { const gg = ctx.createGain(); gg.gain.setValueAtTime(0.0001, t); gg.gain.linearRampToValueAtTime(genre === "classical" ? 0.07 : 0.045, t + 0.3); gg.gain.linearRampToValueAtTime(0.0001, t + stepDur() * 16); const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1400; gg.connect(lp).connect(master); osc(genre === "electronic" ? "sawtooth" : "triangle", hz(root + iv), t, stepDur() * 16, gg); }); }
  };

  /* ---------- members ---------- */
  const stepDur = () => 60 / GENRES[genre].bpm / 4;
  const memberPlay = (m, i, s, t) => {
    const r = RHYTHM[m.face], b = s % 16;
    if (!r.steps.includes(b)) return;
    if (m.hat === "glitch" && Math.random() < 0.35) return;
    const acc = r.accent.includes(b) ? 1 : 0.7, v = r.vel * acc;
    const tt = t + (r.lag || 0);
    const dur = stepDur() * r.len * (m.outfit === "violin" || m.outfit === "singer" ? 2 : 1);
    const dest = fxChain(m.hat, tt, dur);
    if (m.outfit === "drum") {
      const p = pitchFor(m.hat);
      if (b % 8 === 0) kick(tt, v, dest, p); else if (b % 8 === 4) snare(tt, v, dest); else hat(tt, v, dest, m.face === "calm");
    } else {
      const g = GENRES[genre], [root, shape] = g.chords[Math.floor(s / 16) % 4], tones = SHAPES[shape];
      const oct = m.outfit === "bass" ? -12 : m.outfit === "violin" || m.outfit === "singer" ? 12 : 0;
      const idx = (i * 2 + Math.floor(b / 2) + (m.face === "laughing" ? b : 0)) % tones.length;
      const f = hz(root + oct + tones[idx]) * pitchFor(m.hat);
      play[m.outfit](f, tt, dur, v, dest);
      if (m.hat === "glitch" && Math.random() < 0.5) play[m.outfit](f, tt + stepDur() / 2, dur / 3, v * 0.7, dest);
    }
    // light up the member on screen in time with its note
    const el = root.querySelector(`[data-slot-i="${i}"]`);
    if (el) setTimeout(() => { el.classList.remove("is-hit"); void el.offsetWidth; el.classList.add("is-hit"); }, Math.max(0, (tt - ctx.currentTime) * 1000));
  };
  const schedule = () => {
    while (nextTime < ctx.currentTime + 0.12) {
      const g = GENRES[genre], swing = step % 2 ? g.swing * stepDur() * 2 : 0;
      backing(step, nextTime + swing);
      slots.forEach((m, i) => m && memberPlay(m, i, step, nextTime + swing));
      nextTime += stepDur(); step = (step + 1) % 64;
    }
  };
  const start = () => {
    if (!ctx) init();
    ctx.resume(); playing = true; step = 0; nextTime = ctx.currentTime + 0.05;
    clearInterval(timer); timer = setInterval(schedule, 25);
    root.classList.add("is-playing"); render();
  };
  const stop = () => { playing = false; clearInterval(timer); root.classList.remove("is-playing"); if (ctx) ctx.suspend(); render(); };

  /* ---------- UI ---------- */
  const stage = root.querySelector("[data-band-slots]");
  const readout = root.querySelector("[data-band-read]");
  const block = (kind, name, i) => `<button type="button" class="bs-block" data-cycle="${kind}" data-i="${i}" title="${NAMES[name]}"><img src="${BASE}blocks/${kind}-${name}.webp" alt="${NAMES[name]}"></button>`;
  const render = () => {
    stage.innerHTML = slots.map((m, i) => m
      ? `<div class="bs-slot is-full" data-slot-i="${i}">${block("hat", m.hat, i)}${block("face", m.face, i)}${block("outfit", m.outfit, i)}<button type="button" class="bs-remove" data-remove="${i}" aria-label="Remove this member">×</button></div>`
      : `<div class="bs-slot" data-slot-i="${i}"><button type="button" class="bs-add" data-add="${i}" aria-label="Add a band member">+</button></div>`).join("");
    const n = slots.filter(Boolean).length;
    readout.textContent = n ? `${n} of 6 · ${slots.filter(Boolean).map((m) => NAMES[m.outfit]).join(", ")}` : "No members yet: only the scene is playing.";
  };
  // the scene board: background, label and an NFC "detected" ping, as on the real base
  const boards = (root.dataset.boards || "").split(" ");
  const bgImg = root.querySelector(".bs-bg__img");
  boards.forEach((k) => { new Image().src = `${BASE}boards/${k}.webp`; });
  const setGenre = (k) => {
    genre = k; root.dataset.genre = k;
    root.querySelectorAll("[data-genre]").forEach((b) => b.toggleAttribute("aria-current", b.dataset.genre === k));
    const label = root.querySelector(`[data-genre="${k}"]`).textContent;
    root.querySelector("[data-band-label]").textContent = label;
    root.querySelector("[data-band-scene]").textContent = label;
    root.classList.toggle("has-art", boards.includes(k));
    if (boards.includes(k)) bgImg.src = `${BASE}boards/${k}.webp`;
    root.classList.remove("is-ping"); void root.offsetWidth; root.classList.add("is-ping");
  };
  const cycle = (arr, cur) => arr[(arr.indexOf(cur) + 1) % arr.length];
  const rand = (arr) => arr[(Math.random() * arr.length) | 0];
  root.addEventListener("click", (e) => {
    const c = e.target.closest("[data-cycle]"), a = e.target.closest("[data-add]"), r = e.target.closest("[data-remove]"), g = e.target.closest("[data-genre]");
    if (c) { const m = slots[+c.dataset.i], k = c.dataset.cycle; m[k] = cycle(k === "hat" ? HATS : k === "face" ? FACES : OUTFITS, m[k]); render(); root.querySelector(`[data-slot-i="${c.dataset.i}"] [data-cycle="${k}"]`)?.classList.add("is-swap"); }
    if (a) { slots[+a.dataset.add] = { hat: rand(HATS), face: rand(FACES), outfit: rand(OUTFITS) }; render(); }
    if (r) { slots[+r.dataset.remove] = null; render(); }
    if (g) setGenre(g.dataset.genre);
  });
  root.querySelector("[data-band-start]").addEventListener("click", () => { root.classList.add("is-on"); start(); });
  root.querySelector("[data-band-toggle]").addEventListener("click", () => (playing ? stop() : start()));
  root.querySelector("[data-band-shuffle]").addEventListener("click", () => { for (let i = 0; i < 4; i++) slots[i] = { hat: rand(HATS), face: rand(FACES), outfit: rand(OUTFITS) }; slots[4] = slots[5] = null; render(); });
  // pause when the demo scrolls far away, so it never plays unseen
  new IntersectionObserver((es) => es.forEach((en) => { if (!en.isIntersecting && playing) stop(); }), { threshold: 0 }).observe(root);
  setGenre(genre); root.classList.remove("is-ping");
  render();
  window.__bandy = { slots, start, stop, get playing() { return playing; }, get ctx() { return ctx; } };
})();
