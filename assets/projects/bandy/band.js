/* Bandy band simulator: every sound is synthesised live with the Web Audio API.
   Outfit = instrument, face = rhythm, hat = effect, scene board = genre.
   The base is a 3 × 6 grid: columns are time (left to right), rows are pitch (back high, front low). */
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

  /* Genres, from what defines each style:
     country  ~100–112 bpm, I–IV–V in a major key, "boom-chick" bass (root / fifth), brushed backbeat, plucked strings, major pentatonic tunes
     rock     ~118–136 bpm, minor or mixolydian loops (i–bVII–bVI), loud snare on 2 and 4, driving eighth-note bass, distorted power chords, minor pentatonic
     classical ~72–88 bpm, no drums, functional harmony (I–vi–IV–V), Alberti-bass piano and sustained strings, full major scale, legato
     jazz     ~112–140 bpm swung, ii–V–I with seventh chords, walking bass in quarter notes, ride "ding ding-a ding", hi-hat on 2 and 4, comping off the beat, dorian colour
     electronic ~122–128 bpm, four-on-the-floor kick, clap on 2 and 4, off-beat open hats, sidechain-pumping saw pads, sub bass, natural minor */
  const GENRES = {
    country: { bpm: [100, 112], swing: 0.08, root: 55, scale: [0, 2, 4, 7, 9], kit: "train", progs: [["I", "IV", "V", "I"], ["I", "V", "IV", "I"], ["I", "IV", "I", "V"]] },
    rock: { bpm: [118, 136], swing: 0, root: 52, scale: [0, 3, 5, 7, 10], kit: "rock", progs: [["i", "bVII", "bVI", "bVII"], ["I", "bVII", "IV", "I"], ["i", "bVI", "bIII", "bVII"]] },
    classical: { bpm: [72, 88], swing: 0, root: 60, scale: [0, 2, 4, 5, 7, 9, 11], kit: "none", progs: [["I", "vi", "IV", "V"], ["I", "IV", "V", "I"], ["I", "V", "vi", "IV"]] },
    jazz: { bpm: [112, 140], swing: 0.33, root: 53, scale: [0, 2, 3, 5, 7, 9, 10], kit: "jazz", progs: [["ii7", "V7", "Imaj7", "VI7"], ["Imaj7", "vi7", "ii7", "V7"], ["iii7", "VI7", "ii7", "V7"]] },
    electronic: { bpm: [122, 128], swing: 0, root: 57, scale: [0, 2, 3, 5, 7, 8, 10], kit: "house", progs: [["i", "bVI", "bIII", "bVII"], ["i", "bVII", "bVI", "bVII"], ["i", "iv", "bVI", "bVII"]] },
  };
  const CHORD = { I: [0, "maj"], ii: [2, "min"], iii: [4, "min"], IV: [5, "maj"], iv: [5, "min"], V: [7, "maj"], vi: [9, "min"], i: [0, "min"], bIII: [3, "maj"], bVI: [8, "maj"], bVII: [10, "maj"], ii7: [2, "min7"], iii7: [4, "min7"], vi7: [9, "min7"], V7: [7, "dom7"], VI7: [9, "dom7"], Imaj7: [0, "maj7"] };
  const SHAPES = { maj: [0, 4, 7], min: [0, 3, 7], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dom7: [0, 4, 7, 10] };

  // Faces decide when a member plays (16 steps per bar) and how hard
  const RHYTHM = {
    angry: { steps: [0, 2, 4, 6, 8, 10, 12, 14], accent: [0, 4, 8, 12], vel: 1, len: 0.6 },
    sleepy: { steps: [0, 9], accent: [0], vel: 0.6, len: 3.2, lag: 0.04 },
    happy: { steps: [0, 3, 6, 10, 12, 14], accent: [0, 6, 12], vel: 0.85, len: 0.9 },
    laughing: { steps: [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14, 15], accent: [0, 8], vel: 0.75, len: 0.45 },
    calm: { steps: [0, 4, 8, 12], accent: [0], vel: 0.7, len: 3.6 },
    sad: { steps: [0, 7, 12], accent: [0], vel: 0.55, len: 2.4 },
  };

  // the base is a 3 × 6 grid like the prototype: index = row * 6 + col; row 0 is the back
  const ROWS = 3, COLS = 6;
  const slots = Array(ROWS * COLS).fill(null);
  slots[2 * 6 + 0] = { hat: "elf", face: "happy", outfit: "guitar" };
  slots[1 * 6 + 2] = { hat: "bubble", face: "calm", outfit: "piano" };
  slots[2 * 6 + 3] = { hat: "monster", face: "angry", outfit: "drum" };
  slots[0 * 6 + 4] = { hat: "robot", face: "laughing", outfit: "singer" };

  let ctx = null, master = null, verb = null, band = null, back = null, duck = null, playing = false, genre = "country";
  let step = 0, bar = 0, nextTime = 0, timer = 0;
  // a fresh "song" each time the band starts: key, progression, tempo and every member's tune
  const song = { key: 0, prog: 0, bpm: 110 };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const newSong = () => { song.key = (Math.random() * 7 | 0) - 3; song.prog = Math.random() * 3 | 0; song.bpm = Math.round(rnd(...GENRES[genre].bpm)); tunes = new WeakMap(); };
  let tunes = new WeakMap();
  const tuneOf = (m) => {
    if (!tunes.has(m)) {
      // a short motif as a random walk on the scale; laughing faces jump more
      const jump = m.face === "laughing" ? 3 : m.face === "sad" || m.face === "calm" ? 1 : 2;
      let d = Math.random() * 3 | 0; const motif = [];
      for (let k = 0; k < 8; k++) { motif.push(d); d = Math.max(-2, Math.min(7, d + Math.round(rnd(-jump, jump)))); }
      tunes.set(m, motif);
    }
    return tunes.get(m);
  };

  /* ---------- audio graph ---------- */
  let NOISE = null;
  const init = () => {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.005;
    master = ctx.createGain(); master.gain.value = 0.85; master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 2, rb = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = rb.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    verb = ctx.createConvolver(); verb.buffer = rb; const wet = ctx.createGain(); wet.gain.value = 0.26; verb.connect(wet).connect(master);
    band = ctx.createGain(); band.connect(master);
    duck = ctx.createGain(); duck.connect(master); // pads that pump with the kick (electronic)
    back = ctx.createGain(); back.gain.value = 0.55; back.connect(master);
    NOISE = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const nd = NOISE.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  };
  const distCurve = (() => { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / n * 2 - 1; c[i] = Math.tanh(x * 7); } return c; })();

  // One effect chain per hat: returns an input node that ends in the band bus (+ reverb send)
  const fxChain = (hat, t, dur, wet = 0.22) => {
    const out = ctx.createGain(); out.connect(band);
    const send = ctx.createGain(); send.gain.value = hat === "bubble" ? 0.7 : wet; out.connect(send).connect(verb);
    const end = t + dur + 1;
    if (hat === "electric") { const ws = ctx.createWaveShaper(); ws.curve = distCurve; const g = ctx.createGain(); g.gain.value = 0.4; ws.connect(g).connect(out); return ws; }
    if (hat === "bubble") { const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 750; lp.Q.value = 7; const lfo = ctx.createOscillator(); lfo.frequency.value = 4.5; const lg = ctx.createGain(); lg.gain.value = 450; lfo.connect(lg).connect(lp.frequency); lfo.start(t); lfo.stop(end); lp.connect(out); return lp; }
    if (hat === "robot") { const rm = ctx.createGain(); rm.gain.value = 0; const car = ctx.createOscillator(); car.type = "square"; car.frequency.value = 70; car.connect(rm.gain); car.start(t); car.stop(end); rm.connect(out); return rm; }
    if (hat === "monster") { const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1300; lp.connect(out); return lp; }
    if (hat === "glitch") { const g = ctx.createGain(); for (let k = 0; k < dur * 16; k++) g.gain.setValueAtTime(Math.random() < 0.3 ? 0 : 1, t + k / 16); g.connect(out); return g; }
    return out;
  };
  const pitchFor = (hat) => (hat === "monster" ? 0.5 : hat === "elf" ? 2 : 1);
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  /* ---------- instruments ---------- */
  const env = (g, t, a, peak, d, sustain = 0.0001) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a); g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + d); };
  const osc = (type, f, t, dur, dest, detune = 0) => { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune; o.connect(dest); o.start(t); o.stop(t + dur + 0.1); return o; };
  // plucked strings: Karplus–Strong rendered into a cached buffer
  const plucks = new Map();
  const pluckBuf = (f, bright, len) => {
    const key = `${Math.round(f * 4)}|${bright}|${len}`;
    if (plucks.has(key)) return plucks.get(key);
    const sr = ctx.sampleRate, n = Math.max(2, Math.round(sr / f)), total = Math.floor(sr * len), buf = ctx.createBuffer(1, total, sr), y = buf.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; prev = prev + bright * (w - prev); y[i] = prev; }
    const decay = 0.996 - (f > 400 ? 0.002 : 0);
    for (let i = n; i < total; i++) y[i] = decay * 0.5 * (y[i - n] + y[i - n + 1]);
    if (plucks.size > 300) plucks.clear();
    plucks.set(key, buf); return buf;
  };
  const pluck = (f, t, v, dest, bright = 0.6, len = 1.6) => { const s = ctx.createBufferSource(); s.buffer = pluckBuf(f, bright, len); const g = ctx.createGain(); g.gain.value = v; s.connect(g).connect(dest); s.start(t); };
  const VOWELS = [[800, 1150, 2900], [450, 800, 2830], [350, 2000, 2800], [325, 700, 2700], [400, 1700, 2600]]; // a, o, e, u, eh
  const play = {
    guitar(f, t, dur, v, dest) {
      if (genre === "rock") { // distorted power chord: root + fifth through a fuzz
        const ws = ctx.createWaveShaper(); ws.curve = distCurve; const g = ctx.createGain(); env(g, t, 0.005, 0.16 * v, Math.max(dur, 0.25), 0.05); const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600;
        ws.connect(lp).connect(g).connect(dest); [1, 1.5, 2].forEach((r) => osc("sawtooth", f * r, t, dur + 0.2, ws, rnd(-8, 8))); return;
      }
      if (genre === "electronic") { const g = ctx.createGain(); env(g, t, 0.003, 0.22 * v, 0.22); const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 8; lp.frequency.setValueAtTime(5000, t); lp.frequency.exponentialRampToValueAtTime(400, t + 0.2); g.connect(lp).connect(dest); osc("sawtooth", f, t, 0.3, g); osc("sawtooth", f, t, 0.3, g, 12); return; }
      pluck(f, t, 0.55 * v, dest, genre === "country" ? 0.9 : 0.5);
      if (genre === "country" && Math.random() < 0.3) pluck(f * 1.5, t + 0.02, 0.3 * v, dest, 0.9); // a little double-stop twang
    },
    bass(f, t, dur, v, dest) {
      if (genre === "electronic") { const g = ctx.createGain(); env(g, t, 0.005, 0.5 * v, Math.min(dur, 0.4), 0.1); g.connect(dest); osc("sine", f / 2, t, dur, g); const s = ctx.createGain(); s.gain.value = 0.25; s.connect(g); osc("sawtooth", f / 2, t, dur, s); return; }
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = genre === "rock" ? 900 : 650; lp.connect(dest);
      pluck(f / 2, t, 0.9 * v, lp, 0.4, 1.2);
    },
    piano(f, t, dur, v, dest) {
      // a few decaying partials, slightly stretched like real strings; jazz and classical add a second chord tone
      const g = ctx.createGain(); env(g, t, 0.003, 0.3 * v, Math.min(dur + 0.9, 2)); g.connect(dest);
      [[1, 1], [2.003, 0.35], [3.01, 0.14], [4.02, 0.06]].forEach(([r, a]) => { const h = ctx.createGain(); h.gain.value = a; h.connect(g); osc(r === 1 ? "triangle" : "sine", f * r, t, dur + 1, h); });
      const ham = ctx.createGain(); env(ham, t, 0.001, 0.12 * v, 0.03); ham.connect(dest); const n = ctx.createBufferSource(); n.buffer = NOISE; const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f * 4; n.connect(bp).connect(ham); n.start(t); n.stop(t + 0.05);
    },
    violin(f, t, dur, v, dest) {
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16 * v, t + 0.09); g.gain.setValueAtTime(0.16 * v, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.3);
      const body = ctx.createBiquadFilter(); body.type = "peaking"; body.frequency.value = 2800; body.gain.value = 8; const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 6000;
      g.connect(body).connect(lp).connect(dest);
      const o = osc("sawtooth", f, t, dur + 0.4, g); const o2 = osc("sawtooth", f, t, dur + 0.4, g, 7);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 5.6; const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.01, t + 0.25); lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency); lfo.start(t); lfo.stop(t + dur + 0.5);
    },
    singer(f, t, dur, v, dest) {
      // formant voice: a glottal-like buzz through three vowel resonances, with a scoop into the note,
      // delayed vibrato and a breath of noise; each note picks a vowel ("ah", "oh", "ee", "oo")
      const [F1, F2, F3] = pick(VOWELS), d = Math.max(dur, 0.25);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5 * v, t + 0.07); g.gain.setValueAtTime(0.5 * v, t + d); g.gain.linearRampToValueAtTime(0.0001, t + d + 0.18); g.connect(dest);
      const src = ctx.createGain(); const tilt = ctx.createBiquadFilter(); tilt.type = "lowpass"; tilt.frequency.value = 3200; src.connect(tilt);
      [[F1, 80, 1], [F2, 90, 0.5], [F3, 120, 0.22]].forEach(([ff, bw, a]) => { const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = ff; bp.Q.value = ff / bw; const ga = ctx.createGain(); ga.gain.value = a * 6; tilt.connect(bp); bp.connect(ga).connect(g); });
      const o = osc("sawtooth", f * 0.97, t, d + 0.3, src); o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
      const o2 = osc("triangle", f * 0.97, t, d + 0.3, src, 4); o2.frequency.exponentialRampToValueAtTime(f, t + 0.08);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 5.3; const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.018, t + 0.35); lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency); lfo.start(t); lfo.stop(t + d + 0.4);
      const br = ctx.createBufferSource(); br.buffer = NOISE; const bh = ctx.createBiquadFilter(); bh.type = "bandpass"; bh.frequency.value = F2; bh.Q.value = 2; const bg = ctx.createGain(); bg.gain.value = 0.05; br.connect(bh).connect(bg).connect(g); br.start(t); br.stop(t + d + 0.2);
    },
  };
  const noise = (t, v, dest, type, f, d, q = 1) => { const s = ctx.createBufferSource(); s.buffer = NOISE; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = ctx.createGain(); env(g, t, 0.002, v, d); s.connect(fl).connect(g).connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + d + 0.05); };
  const kick = (t, v, dest, p = 1, len = 0.35) => { const g = ctx.createGain(); env(g, t, 0.002, 0.95 * v, len); g.connect(dest); const o = ctx.createOscillator(); o.frequency.setValueAtTime(160 * p, t); o.frequency.exponentialRampToValueAtTime(42 * p, t + 0.12); o.connect(g); o.start(t); o.stop(t + len + 0.05); };
  const snare = (t, v, dest) => { noise(t, 0.5 * v, dest, "bandpass", 1900, 0.17, 0.8); const g = ctx.createGain(); env(g, t, 0.002, 0.28 * v, 0.09); g.connect(dest); osc("triangle", 185, t, 0.12, g); };
  const brush = (t, v, dest) => noise(t, 0.22 * v, dest, "bandpass", 3200, 0.22, 0.6);
  const clap = (t, v, dest) => { for (let k = 0; k < 3; k++) noise(t + k * 0.011, 0.35 * v, dest, "bandpass", 1300, 0.09 + k * 0.03, 1.5); };
  const hihat = (t, v, dest, open) => noise(t, 0.2 * v, dest, "highpass", 7500, open ? 0.25 : 0.045);
  const ride = (t, v, dest) => { noise(t, 0.09 * v, dest, "bandpass", 6500, 0.5, 3); const g = ctx.createGain(); env(g, t, 0.001, 0.03 * v, 0.6); g.connect(dest); [520, 738, 1180].forEach((f) => osc("square", f, t, 0.6, g)); };
  const tom = (t, v, dest, f) => { const g = ctx.createGain(); env(g, t, 0.002, 0.6 * v, 0.3); g.connect(dest); const o = ctx.createOscillator(); o.frequency.setValueAtTime(f * 1.4, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08); o.connect(g); o.start(t); o.stop(t + 0.35); };

  /* ---------- harmony helpers ---------- */
  const G = () => GENRES[genre];
  const chordNow = (barN) => { const [off, q] = CHORD[G().progs[song.prog][barN % 4]]; return { root: G().root + song.key + off, tones: SHAPES[q] }; };
  const degMidi = (deg, base) => { const sc = G().scale, n = sc.length, o = Math.floor(deg / n); return base + sc[((deg % n) + n) % n] + 12 * o; };
  const snap = (midi, ch) => { // nudge a note onto the nearest chord tone
    let best = midi, bd = 99;
    for (let d = -2; d <= 2; d++) { const pc = (((midi + d - ch.root) % 12) + 12) % 12; if (ch.tones.some((x) => x % 12 === pc) && Math.abs(d) < bd) { bd = Math.abs(d); best = midi + d; } }
    return best;
  };
  const stepDur = () => 60 / song.bpm / 4;

  /* ---------- the scene's own groove ---------- */
  const backing = (s, t) => {
    const b = s % 16, d = back, ch = chordNow(bar), k = G().kit, sd = stepDur();
    if (k === "train") { // boom-chick
      if (b === 0 || b === 8) kick(t, 0.7, d, 1, 0.25);
      if (b === 4 || b === 12) brush(t, 1, d);
      if (b % 2 === 0) noise(t, 0.05, d, "highpass", 8000, 0.04);
      if (b === 0) play.bass(hz(ch.root - 12), t, sd * 3, 0.8, d);
      if (b === 8) play.bass(hz(ch.root - 5), t, sd * 3, 0.7, d);
      if (b === 4 || b === 12) ch.tones.forEach((x, n) => pluck(hz(ch.root + x), t + n * 0.012, 0.18, d, 0.7, 0.8)); // strum
    }
    if (k === "rock") {
      if (b === 0 || b === 7 || b === 8 || b === 10) kick(t, 1, d);
      if (b === 4 || b === 12) snare(t, 1, d);
      if (b % 2 === 0) hihat(t, 0.7, d);
      if (b === 0 && bar % 2 === 0) noise(t, 0.12, d, "highpass", 5000, 1.2);
      if (b % 2 === 0) play.bass(hz(ch.root - 12), t, sd * 1.6, 0.7, d);
    }
    if (k === "none") { // Alberti bass + a string pad
      const alb = [0, 2, 1, 2], tone = ch.tones[alb[(b / 2) % 4 | 0]] ?? ch.tones[0];
      if (b % 2 === 0) play.piano(hz(ch.root - 12 + tone), t, sd * 2, 0.45, d);
      if (b === 0) ch.tones.forEach((x) => play.violin(hz(ch.root + x), t, sd * 15, 0.35, d));
    }
    if (k === "jazz") {
      if (b === 0 || b === 4 || b === 8 || b === 12 || b === 6 || b === 14) ride(t, b % 4 ? 0.6 : 1, d);
      if (b === 4 || b === 12) hihat(t, 0.6, d);
      if (b % 4 === 0) { // walking bass: root, chord tone, fifth, approach to the next chord
        const nx = chordNow(bar + 1).root, q = b / 4, m = [ch.root, ch.root + ch.tones[1], ch.root + 7, nx + (Math.random() < 0.5 ? 1 : -1)][q];
        play.bass(hz(m - 12), t, sd * 3.5, 0.75, d);
      }
      if (b === (bar % 2 ? 6 : 10)) ch.tones.slice(1).forEach((x) => play.piano(hz(ch.root + 12 + x), t, sd * 2, 0.35, d)); // rootless comp
    }
    if (k === "house") {
      if (b % 4 === 0) { kick(t, 1.05, d); duck.gain.setValueAtTime(0.15, t); duck.gain.linearRampToValueAtTime(1, t + sd * 3); }
      if (b === 4 || b === 12) clap(t, 0.9, d);
      if (b % 4 === 2) { hihat(t, 0.75, d, true); play.bass(hz(ch.root - 12), t, sd * 1.5, 0.6, d); }
      if (b === 0) ch.tones.forEach((x) => { const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.05); g.gain.setValueAtTime(0.05, t + sd * 15); g.gain.linearRampToValueAtTime(0.0001, t + sd * 16); const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2200; g.connect(lp).connect(duck); [-12, 0, 12].forEach((dt) => osc("sawtooth", hz(ch.root + x), t, sd * 16, g, dt)); });
    }
  };

  /* ---------- members on the grid ----------
     Columns are time: left to right, each column plays for half a bar, then the loop starts again (3 bars).
     Members in the same column play together. Rows are pitch: the back row plays high, the front row low. */
  const STEPS = COLS * 8;
  const REG = { guitar: 55, piano: 60, violin: 67, singer: 62, bass: 43 };
  const posOf = (i) => ({ row: Math.floor(i / COLS), col: i % COLS });
  const memberPlay = (m, i, s, t) => {
    const r = RHYTHM[m.face], b = s % 16, { row, col } = posOf(i);
    if (col !== Math.floor(s / 8)) return;
    if (!r.steps.includes(b)) return;
    const acc = r.accent.includes(b) ? 1 : 0.7, v = r.vel * acc;
    const tt = t + (r.lag || 0);
    const dur = stepDur() * r.len * (m.outfit === "violin" || m.outfit === "singer" ? 2 : 1);
    const dest = fxChain(m.hat, tt, dur);
    if (m.outfit === "drum") { // rows are pitch for drums too: back = cymbals, middle = snare, front = kick and toms
      const p = pitchFor(m.hat);
      if (row === 0) { if (genre === "jazz") ride(tt, v, dest); else hihat(tt, v, dest, b % 4 === 2); }
      else if (row === 1) { if (genre === "electronic") clap(tt, v, dest); else if (genre === "country" || genre === "jazz") brush(tt, v * 1.4, dest); else snare(tt, v, dest); }
      else { if (b % 4 === 0) kick(tt, v, dest, p); else tom(tt, v, dest, 110 * p); }
    } else {
      const ch = chordNow(bar), motif = tuneOf(m), k = r.steps.indexOf(b);
      let midi = degMidi(motif[k % motif.length], REG[m.outfit] + (G().root - 57) + song.key) + [12, 0, -12][row];
      if (b % 4 === 0 || m.outfit === "bass") midi = snap(midi, ch);
      if (m.outfit === "bass") midi = Math.max(28 + 12, Math.min(55, midi));
      const f = hz(midi) * pitchFor(m.hat);
      play[m.outfit](f, tt, dur, v, dest);
      if ((genre === "jazz" || genre === "classical") && m.outfit === "piano" && b % 8 === 0) play.piano(hz(snap(midi - 4, ch)) * pitchFor(m.hat), tt, dur, v * 0.6, dest);
    }
    // light up the member on screen in time with its note
    const el = root.querySelector(`[data-slot-i="${i}"] .bs-member`);
    if (el) setTimeout(() => { el.classList.remove("is-hit"); void el.offsetWidth; el.classList.add("is-hit"); }, Math.max(0, (tt - ctx.currentTime) * 1000));
  };
  const schedule = () => {
    while (nextTime < ctx.currentTime + 0.12) {
      const swing = step % 2 ? G().swing * stepDur() * 2 : 0;
      backing(step, nextTime + swing);
      slots.forEach((m, i) => m && memberPlay(m, i, step, nextTime + swing));
      if (step % 8 === 0) { const col = step / 8; setTimeout(() => showCol(col), Math.max(0, (nextTime - ctx.currentTime) * 1000)); }
      nextTime += stepDur(); step = (step + 1) % STEPS;
      if (step % 16 === 0) bar++;
    }
  };
  const start = () => {
    if (!ctx) init();
    newSong();
    ctx.resume(); playing = true; step = 0; bar = 0; nextTime = ctx.currentTime + 0.05;
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
  // a new scene board is a new song in that genre
  const onGenre = () => { if (ctx) { const was = song.bpm; newSong(); if (!was) song.bpm = 110; } };

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
    genre = k; root.dataset.genre = k; onGenre();
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
