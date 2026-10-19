/* Bandy band simulator, played with real instrument recordings.
   Outfit = instrument, face = rhythm, hat = effect, scene board = genre.
   The base is a 3 × 6 grid: columns are time (left to right), rows are pitch (back high, front low).
   Samples: FluidR3 General MIDI soundfont (via gleitz/midi-js-soundfonts) and the Tone.js drum kits. */
(() => {
  const root = document.querySelector("[data-band]");
  if (!root) return;
  const BASE = root.dataset.base;
  const SND = BASE + "sounds/";

  const HATS = ["monster", "elf", "electric", "glitch", "bubble", "robot"];
  const FACES = ["angry", "sleepy", "happy", "laughing", "calm", "sad"];
  const OUTFITS = ["guitar", "singer", "piano", "bass", "violin", "drum"];
  const NAMES = {
    monster: "Monster Hat · low pitch", elf: "Elf Hat · high pitch", electric: "Electric Hat · buzz", glitch: "Glitch Hat · signal break", bubble: "Bubble Hat · underwater", robot: "Robot Hat · vocoder",
    angry: "Angry · strong rhythm", sleepy: "Sleepy · lazy rhythm", happy: "Happy · upbeat rhythm", laughing: "Laughing · playful rhythm", calm: "Calm · smooth rhythm", sad: "Sad · slow rhythm",
    guitar: "Guitar", singer: "Singer", piano: "Piano", bass: "Bass", violin: "Violin", drum: "Drums",
  };

  /* recorded notes on disk (every 4 semitones; the rest are pitched from the nearest one) */
  const MANIFEST = {"acoustic_bass":[28,32,36,40,44,48,52,56],"acoustic_grand_piano":[36,40,44,48,52,56,60,64,68,72,76,80,84,88],"acoustic_guitar_steel":[40,44,48,52,56,60,64,68,72,76],"choir_aahs":[48,52,56,60,64,68,72,76,80],"distortion_guitar":[40,44,48,52,56,60,64,68,72,76],"electric_bass_finger":[28,32,36,40,44,48,52,56],"electric_guitar_jazz":[40,44,48,52,56,60,64,68,72,76],"string_ensemble_1":[36,40,44,48,52,56,60,64,68,72,76,80,84],"synth_bass_1":[28,32,36,40,44,48,52,56],"violin":[52,56,60,64,68,72,76,80,84,88,92]};
  // the recordings come in 15–20 dB quieter than the drums; these bring every instrument to the same level
  const LEVEL = { acoustic_bass: 5, acoustic_grand_piano: 8, acoustic_guitar_steel: 6, choir_aahs: 7, distortion_guitar: 3.2, electric_bass_finger: 5, electric_guitar_jazz: 5.5, string_ensemble_1: 4.5, synth_bass_1: 4.5, violin: 5 };
  const SUSTAIN = { choir_aahs: 1, string_ensemble_1: 1, violin: 1, voice: 1 };
  LEVEL.voice = 0.85;
  const urlOf = (inst, m) => (inst === "voice" ? `${SND}voice/${VOICE[m]}.mp3` : `${SND}${inst}/${noteName(m)}.mp3`);
  // a real singer: Berklee "aa" recordings (female from A3 up, male below), via the Tone.js audio library
  const VOICE = { 45: "m45", 48: "m48", 57: "f57", 61: "f61", 63: "f63", 69: "f69", 73: "f73", 77: "f77", 81: "f81", 84: "f84" };
  MANIFEST.voice = Object.keys(VOICE).map(Number);
  const NOTE = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  const noteName = (m) => NOTE[m % 12] + (Math.floor(m / 12) - 1);

  /* Genres, from what defines each style:
     country    ~96–112 bpm, I–IV–V in a major key, "boom-chick" bass, brushed backbeat, strummed steel-string guitar
     rock       ~116–136 bpm, i–bVII–bVI loops, loud snare on 2 and 4, driving eighth-note bass, distorted power chords
     classical  ~72–88 bpm, no drums, functional harmony, Alberti-bass piano and sustained strings, legato
     jazz       ~112–138 bpm swung, ii–V–I with seventh chords, walking bass, ride cymbal, comping off the beat
     electronic ~120–128 bpm, four-on-the-floor kick, off-beat hats, sidechain-pumping pads, synth bass
     One pass of the grid is 3 bars (6 columns of half a bar), so each song is a 3-chord loop. */
  const GENRES = {
    country: { bpm: [96, 112], swing: 0.06, root: 55, scale: [0, 2, 4, 7, 9], kit: "acoustic", progs: [["I", "IV", "V"], ["I", "V", "IV"], ["IV", "I", "V"], ["I", "vi", "V"], ["vi", "IV", "V"], ["I", "ii", "V"]], inst: { guitar: "acoustic_guitar_steel", bass: "acoustic_bass" } },
    rock: { bpm: [116, 136], swing: 0, root: 52, scale: [0, 3, 5, 7, 10], kit: "acoustic", progs: [["i", "bVII", "bVI"], ["I", "bVII", "IV"], ["i", "bVI", "bVII"], ["I", "V", "IV"], ["i", "iv", "bVII"], ["bVI", "bVII", "i"]], inst: { guitar: "distortion_guitar", bass: "electric_bass_finger" } },
    classical: { bpm: [72, 88], swing: 0, root: 60, scale: [0, 2, 4, 5, 7, 9, 11], kit: null, progs: [["I", "IV", "V"], ["I", "vi", "V"], ["vi", "IV", "V"], ["I", "ii", "V"], ["IV", "V", "vi"], ["ii", "V", "I"]], inst: { guitar: "acoustic_guitar_steel", bass: "acoustic_bass" } },
    jazz: { bpm: [112, 138], swing: 0.3, root: 53, scale: [0, 2, 3, 5, 7, 9, 10], kit: "acoustic", progs: [["ii7", "V7", "Imaj7"], ["vi7", "ii7", "V7"], ["Imaj7", "vi7", "V7"], ["iii7", "VI7", "ii7"], ["ii7", "V7", "vi7"], ["Imaj7", "ii7", "V7"]], inst: { guitar: "electric_guitar_jazz", bass: "acoustic_bass" } },
    electronic: { bpm: [120, 128], swing: 0, root: 57, scale: [0, 2, 3, 5, 7, 8, 10], kit: "techno", progs: [["i", "bVI", "bVII"], ["i", "bVII", "bVI"], ["i", "iv", "bVII"], ["bVI", "bVII", "i"], ["bVI", "bIII", "bVII"], ["i", "bIII", "bVII"]], inst: { guitar: null, bass: "synth_bass_1" } },
  };
  const CHORD = { I: [0, "maj"], ii: [2, "min"], iii: [4, "min"], IV: [5, "maj"], iv: [5, "min"], V: [7, "maj"], vi: [9, "min"], i: [0, "min"], bIII: [3, "maj"], bVI: [8, "maj"], bVII: [10, "maj"], ii7: [2, "min7"], iii7: [4, "min7"], vi7: [9, "min7"], V7: [7, "dom7"], VI7: [9, "dom7"], Imaj7: [0, "maj7"] };
  const SHAPES = { maj: [0, 4, 7], min: [0, 3, 7], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dom7: [0, 4, 7, 10] };

  // Faces decide when a member plays (16 steps per bar) and how hard
  const RHYTHM = {
    angry: { steps: [0, 2, 4, 6, 8, 10, 12, 14], accent: [0, 4, 8, 12], vel: 1, len: 0.8 },
    sleepy: { steps: [0, 10], accent: [0], vel: 0.6, len: 5, lag: 0.03 },
    happy: { steps: [0, 3, 6, 8, 11, 14], accent: [0, 6, 8], vel: 0.85, len: 1.6 },
    laughing: { steps: [0, 2, 3, 4, 6, 8, 10, 11, 12, 14], accent: [0, 8], vel: 0.75, len: 0.9 },
    calm: { steps: [0, 4, 8, 12], accent: [0, 8], vel: 0.7, len: 3.8 },
    sad: { steps: [0, 6, 12], accent: [0], vel: 0.55, len: 5 },
  };
  // melodic shapes (scale degrees) that read as tunes rather than random notes
  const MOTIFS = [[0, 2, 4, 2, 1, 2, 0, -1], [4, 3, 2, 1, 2, 0, 1, 2], [0, 0, 4, 4, 5, 5, 4, 2], [2, 4, 5, 4, 2, 1, 0, 1], [0, 1, 2, 4, 2, 1, 0, 0], [4, 2, 0, 2, 4, 5, 4, 2], [0, 2, 1, 3, 2, 4, 3, 1], [7, 6, 4, 5, 4, 2, 3, 2]];

  // the base is a 3 × 6 grid like the prototype: index = row * 6 + col; row 0 is the back
  const ROWS = 3, COLS = 6;
  const slots = Array(ROWS * COLS).fill(null);
  slots[2 * 6 + 0] = { hat: "elf", face: "happy", outfit: "guitar" };
  slots[1 * 6 + 2] = { hat: "bubble", face: "calm", outfit: "piano" };
  slots[2 * 6 + 3] = { hat: "monster", face: "angry", outfit: "drum" };
  slots[0 * 6 + 4] = { hat: "robot", face: "calm", outfit: "singer" };

  let ctx = null, master = null, verb = null, band = null, back = null, duck = null, playing = false, genre = "country";
  let step = 0, bar = 0, nextTime = 0, timer = 0;
  // a fresh song each start and each scene change: key, progression, tempo, groove and every member's tune
  const song = { key: 0, prog: 0, progB: 1, bpm: 110, groove: 0, form: "AABA", hook: 0 };
  const FORMS = ["AABA", "ABAB", "AABB", "ABAA"];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  let tunes = new WeakMap();
  const otherProg = (n, not) => { let k; do { k = Math.random() * n | 0; } while (k === not && n > 1); return k; };
  const newSong = () => {
    const n = GENRES[genre].progs.length;
    song.key = (Math.random() * 5 | 0) - 2; song.prog = Math.random() * n | 0; song.progB = otherProg(n, song.prog);
    song.bpm = Math.round(rnd(...GENRES[genre].bpm)); song.groove = Math.random() * 3 | 0; song.form = pick(FORMS); song.hook = Math.random() * MOTIFS.length | 0;
    tunes = new WeakMap();
  };
  // each member gets two 16-note phrases (for the A and B sections), built from two motifs and a variation
  const phrase = () => { const a = pick(MOTIFS), b = pick(MOTIFS), lift = pick([1, 2, -1]); return a.concat(b.map((d, i) => (i > 5 ? d : d + lift))); };
  const tuneOf = (m) => { if (!tunes.has(m)) tunes.set(m, { A: phrase(), B: phrase(), n: 0 }); return tunes.get(m); };
  const section = (barN) => song.form[Math.floor(barN / 3) % song.form.length];

  /* ---------- loading the recordings ---------- */
  const raw = new Map(), buffers = new Map();
  const fetchOne = (url) => { if (!raw.has(url)) raw.set(url, fetch(url).then((r) => r.arrayBuffer()).catch(() => null)); return raw.get(url); };
  const instFor = (g) => { const I = GENRES[g].inst, list = ["acoustic_grand_piano", "violin", "voice", "string_ensemble_1", I.bass]; if (I.guitar) list.push(I.guitar); return list; };
  const urlsFor = (g) => {
    const u = []; instFor(g).forEach((inst) => MANIFEST[inst].forEach((m) => u.push(urlOf(inst, m))));
    const k = GENRES[g].kit; if (k) ["kick", "snare", "hihat", "tom1", "tom2", "tom3"].forEach((d) => u.push(`${SND}kit-${k === "techno" ? "techno" : "acoustic-kit"}/${d}.mp3`));
    return u;
  };
  const decode = async (url) => {
    if (buffers.has(url)) return buffers.get(url);
    const ab = await fetchOne(url); if (!ab) return null;
    const buf = await new Promise((res) => ctx.decodeAudioData(ab.slice(0), res, () => res(null)));
    buffers.set(url, buf); return buf;
  };
  const load = (g) => Promise.all(urlsFor(g).map(decode));
  // start downloading the country set when the demo comes near, so "Start" is quick
  new IntersectionObserver((es, io) => es.forEach((e) => { if (e.isIntersecting) { urlsFor("country").forEach(fetchOne); io.disconnect(); } }), { rootMargin: "800px" }).observe(root);

  /* ---------- audio graph ---------- */
  let NOISE = null;
  const init = () => {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.01;
    master = ctx.createGain(); master.gain.value = 0.72; master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 2.2, rb = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = rb.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.5); }
    verb = ctx.createConvolver(); verb.buffer = rb; const wet = ctx.createGain(); wet.gain.value = 0.22; verb.connect(wet).connect(master);
    band = ctx.createGain(); band.gain.value = 0.9; band.connect(master);
    back = ctx.createGain(); back.gain.value = 0.6; back.connect(master);
    const bs = ctx.createGain(); bs.gain.value = 0.12; back.connect(bs).connect(verb);
    duck = ctx.createGain(); duck.connect(back);
    NOISE = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const nd = NOISE.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  };
  const softClip = (() => { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / n * 2 - 1; c[i] = Math.tanh(x * 3); } return c; })();

  /* Hat effects are kept gentle so every member still sits in the song: a wet/dry blend, never a takeover.
     Monster and elf shift the member an octave down or up (handled with the pitch). */
  const fxChain = (hat, t, dur) => {
    const out = ctx.createGain(); out.connect(band);
    const send = ctx.createGain(); send.gain.value = hat === "bubble" ? 0.45 : 0.18; out.connect(send).connect(verb);
    const inp = ctx.createGain(), dry = ctx.createGain(), wet = ctx.createGain(); inp.connect(dry).connect(out); wet.connect(out);
    const end = t + dur + 1.5;
    if (hat === "electric") { dry.gain.value = 0.75; const ws = ctx.createWaveShaper(); ws.curve = softClip; const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 300; wet.gain.value = 0.35; inp.connect(hp).connect(ws).connect(wet); }
    else if (hat === "bubble") { dry.gain.value = 0.35; const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1400; lp.Q.value = 4; const lfo = ctx.createOscillator(); lfo.frequency.value = 3; const lg = ctx.createGain(); lg.gain.value = 500; lfo.connect(lg).connect(lp.frequency); lfo.start(t); lfo.stop(end); wet.gain.value = 0.8; inp.connect(lp).connect(wet); }
    else if (hat === "robot") { dry.gain.value = 0.7; const trem = ctx.createGain(); trem.gain.value = 0.6; const lfo = ctx.createOscillator(); lfo.type = "square"; lfo.frequency.value = 9; const lg = ctx.createGain(); lg.gain.value = 0.4; lfo.connect(lg).connect(trem.gain); lfo.start(t); lfo.stop(end); const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1500; bp.Q.value = 1.5; wet.gain.value = 0.6; inp.connect(bp).connect(trem).connect(wet); }
    else if (hat === "monster") { dry.gain.value = 1; const lp = ctx.createBiquadFilter(); lp.type = "lowshelf"; lp.frequency.value = 250; lp.gain.value = 4; inp.disconnect(); inp.connect(lp).connect(dry); }
    else dry.gain.value = 1;
    return inp;
  };
  const hatShift = (hat) => (hat === "monster" ? -12 : hat === "elf" ? 12 : 0);

  /* ---------- playing recordings ---------- */
  const sampleFor = (inst, midi) => {
    const list = MANIFEST[inst]; let best = list[0];
    list.forEach((m) => { if (Math.abs(m - midi) < Math.abs(best - midi)) best = m; });
    return { buf: buffers.get(urlOf(inst, best)), shift: midi - best };
  };
  const note = (inst, midi, t, dur, v, dest, o = {}) => {
    const { buf, shift } = sampleFor(inst, midi); if (!buf) return;
    const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = Math.pow(2, shift / 12);
    if (SUSTAIN[inst] && dur > buf.duration * 0.7) { s.loop = true; s.loopStart = buf.duration * 0.35; s.loopEnd = buf.duration * 0.85; }
    const g = ctx.createGain(), a = o.attack || 0.004, rel = o.release ?? 0.25, peak = v * (LEVEL[inst] || 1);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + Math.max(a, dur)); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a, dur) + rel);
    s.connect(g).connect(dest); s.start(t, o.offset || 0); s.stop(t + dur + rel + 0.05);
  };
  const kitUrl = (d) => `${SND}kit-${G().kit === "techno" ? "techno" : "acoustic-kit"}/${d}.mp3`;
  const drum = (d, t, v, dest, rate = 1, cut = 0) => {
    const buf = buffers.get(kitUrl(d)); if (!buf) return;
    const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate; const g = ctx.createGain(); g.gain.value = v;
    if (cut) { g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + cut); }
    s.connect(g).connect(dest); s.start(t); s.stop(t + (cut || 2));
  };
  const brush = (t, v, dest) => { const s = ctx.createBufferSource(); s.buffer = NOISE; const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 2800; f.Q.value = 0.7; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18 * v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); s.connect(f).connect(g).connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + 0.3); };
  const ride = (t, v, dest) => drum("hihat", t, 0.35 * v, dest, 0.62, 0.7);
  // electronic lead: a soft detuned saw pluck (the one synth sound, because the genre is synthetic)
  const synth = (f, t, dur, v, dest) => { const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12 * v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(dur, 0.6) + 0.2); const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(600, t + 0.3); g.connect(lp).connect(dest); [-7, 7].forEach((dt) => { const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.detune.value = dt; o.connect(g); o.start(t); o.stop(t + dur + 0.3); }); };
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  /* ---------- harmony ---------- */
  const G = () => GENRES[genre];
  const chordAt = (barN) => { const p = G().progs[section(barN) === "A" ? song.prog : song.progB], [off, q] = CHORD[p[barN % p.length]]; return { root: G().root + song.key + off, tones: SHAPES[q] }; };
  const degMidi = (deg, base) => { const sc = G().scale, n = sc.length, o = Math.floor(deg / n); return base + sc[((deg % n) + n) % n] + 12 * o; };
  const snap = (midi, ch) => { let best = midi, bd = 99; for (let d = -2; d <= 2; d++) { const pc = (((midi + d - ch.root) % 12) + 12) % 12; if (ch.tones.some((x) => x % 12 === pc) && Math.abs(d) < bd) { bd = Math.abs(d); best = midi + d; } } return best; };
  const voicing = (ch, low) => ch.tones.map((x) => { let m = ch.root + x; while (m < low) m += 12; while (m >= low + 12) m -= 12; return m; }).sort((a, b) => a - b);
  const stepDur = () => 60 / song.bpm / 4;

  /* ---------- the scene's own band (three grooves per genre, picked at random) ---------- */
  const backing = (s, t) => {
    const b = s % 16, d = back, ch = chordAt(bar), sd = stepDur(), gv = song.groove, I = G().inst;
    const bassNote = (m, len, v = 0.8) => note(I.bass, m, t, len, v, d, { release: 0.12 });
    const lowRoot = ((ch.root - 12 - 28) % 12 + 12) % 12 + 28 + 12;
    if (genre === "country") {
      if (b === 0 || b === 8) drum("kick", t, 0.55, d);
      if (b === 4 || b === 12) brush(t, 1.2, d);
      if (gv !== 1 && b % 2 === 0) drum("hihat", t, 0.07, d, 1, 0.05);
      if (b === 0) bassNote(lowRoot, sd * 3.5); if (b === 8) bassNote(lowRoot + 7, sd * 3.5, 0.7);
      if (gv === 2 && (b === 6 || b === 14)) bassNote(lowRoot + (b === 6 ? 4 : 5), sd * 1.5, 0.5);
      const strum = (v, up) => voicing(ch, 52).concat(ch.root + 12 + ch.tones[0] < 70 ? [ch.root + 12] : []).forEach((m, n, arr) => note("acoustic_guitar_steel", m, t + (up ? arr.length - n : n) * 0.014, sd * 1.6, v, d));
      if (gv === 0 && (b === 4 || b === 12)) strum(0.45);
      if (gv === 1 && [0, 4, 6, 10, 12, 14].includes(b)) strum(b % 4 === 2 ? 0.3 : 0.42, b % 4 === 2);
      if (gv === 2 && b % 2 === 0) { const v = voicing(ch, 55); note("acoustic_guitar_steel", v[(b / 2) % v.length], t, sd * 3, 0.38, d); } // fingerpicked
    }
    if (genre === "rock") {
      if (b === 0 || b === 8 || (gv === 1 && b === 10) || (gv === 2 && (b === 3 || b === 11))) drum("kick", t, 0.85, d);
      if (b === 4 || b === 12) drum("snare", t, 0.75, d);
      if (b % 2 === 0) drum("hihat", t, b % 4 ? 0.12 : 0.2, d, 1, 0.08);
      if (b % 2 === 0) bassNote(lowRoot, sd * 1.7, 0.75);
      const pc = [ch.root - 12, ch.root - 5]; // power chord: root + fifth
      if ((gv === 0 && b === 0) || (gv === 1 && (b === 0 || b === 6 || b === 10)) || (gv === 2 && b % 4 === 0)) pc.forEach((m) => note("distortion_guitar", m + 12, t, gv === 0 ? sd * 14 : sd * 3, 0.5, d));
    }
    if (genre === "classical") {
      const v = voicing(ch, 48);
      if (gv === 0 && b % 2 === 0) note("acoustic_grand_piano", [v[0], v[2], v[1], v[2]][(b / 2) % 4], t, sd * 2, 0.32, d); // Alberti bass
      if (gv === 1 && b % 4 === 0) [v[0] - 12, ...v].forEach((m, n) => note("acoustic_grand_piano", m, t + n * 0.03, sd * 3.5, 0.28, d)); // rolled chords
      if (gv === 2 && b % 2 === 0) note("acoustic_grand_piano", [v[0], v[1], v[2], v[1] + 12][(b / 2) % 4], t, sd * 2, 0.3, d);
      if (b === 0) voicing(ch, 55).forEach((m) => note("string_ensemble_1", m, t, sd * 15, 0.5, d, { attack: 0.35, release: 0.6 }));
      if (b === 0) note("acoustic_bass", lowRoot, t, sd * 14, 0.6, d, { attack: 0.08, release: 0.4 });
    }
    if (genre === "jazz") {
      if ([0, 4, 8, 12].includes(b) || (b === 6 || b === 14)) ride(t, b % 4 ? 0.7 : 1, d);
      if (b === 4 || b === 12) drum("hihat", t, 0.12, d, 1, 0.05);
      if (gv === 2 && b === 0) drum("kick", t, 0.25, d);
      if (b % 4 === 0) { // walking bass: root, a chord tone, the fifth, an approach note into the next chord
        const nx = chordAt(bar + 1).root, q = b / 4, m = [lowRoot, lowRoot + ch.tones[1], lowRoot + 7, ((nx - 28) % 12 + 12) % 12 + 40 + (Math.random() < 0.5 ? 1 : -1)][q];
        bassNote(m, sd * 3.6, 0.85);
      }
      const comp = gv === 0 ? [6, 14] : gv === 1 ? [3, 10] : [0, 7];
      if (comp.includes(b)) voicing(ch, 55).forEach((m) => note("acoustic_grand_piano", m, t, sd * 1.5, 0.26, d));
    }
    if (genre === "electronic") {
      if (b % 4 === 0) { drum("kick", t, 0.95, d); duck.gain.cancelScheduledValues(t); duck.gain.setValueAtTime(0.25, t); duck.gain.linearRampToValueAtTime(1, t + sd * 3); }
      if (b === 4 || b === 12) drum("snare", t, 0.45, d);
      if (b % 4 === 2) drum("hihat", t, 0.28, d, 1, 0.12);
      if (gv !== 0 && b % 2 === 1) drum("hihat", t, 0.08, d, 1.2, 0.03);
      if (b % 4 === 2 || (gv === 2 && b % 4 === 3)) bassNote(lowRoot, sd * 1.2, 0.7);
      if (b === 0) voicing(ch, 57).forEach((m) => note("string_ensemble_1", m, t, sd * 15, 0.55, duck, { attack: 0.05, release: 0.3 }));
      if (gv === 1 && b % 2 === 0) { const v = voicing(ch, 69); synth(hz(v[(b / 2) % v.length]), t, sd, 0.6, d); }
    }
  };

  /* the scene's lead line: plays in some sections only, so the song breathes */
  const HOOK = { country: "violin", rock: "distortion_guitar", classical: "violin", jazz: "acoustic_grand_piano", electronic: null };
  const HOOK_STEPS = [[0, 3, 6, 8, 10, 12], [0, 2, 4, 7, 10, 12, 14], [0, 4, 6, 8, 12]];
  const hookAndFill = (s, t) => {
    const b = s % 16, pass = Math.floor(bar / 3), sec = section(bar), sd = stepDur(), d = back;
    const plays = sec === "B" || pass % 4 === 3;
    const steps = HOOK_STEPS[song.groove % HOOK_STEPS.length];
    if (plays && steps.includes(b)) {
      const line = MOTIFS[(song.hook + (sec === "B" ? 3 : 0)) % MOTIFS.length], k = (bar % 3) * steps.length + steps.indexOf(b);
      let midi = degMidi(line[k % line.length] + (bar % 3 === 2 && b > 8 ? -1 : 0), 67 + (G().root - 57) + song.key);
      if (b % 4 === 0) midi = snap(midi, chordAt(bar));
      const inst = HOOK[genre];
      if (inst) note(inst, inst === "distortion_guitar" ? midi - 12 : midi, t, sd * 1.8, inst === "acoustic_grand_piano" ? 0.35 : 0.3, d, { attack: inst === "violin" ? 0.04 : 0.004, release: 0.2 });
      else synth(hz(midi + 12), t, sd * 1.5, 0.5, d);
    }
    // a drum fill closes every section
    if (G().kit && bar % 3 === 2 && b >= 12) { const toms = ["tom1", "tom1", "tom2", "tom3"]; if (genre === "electronic") drum("snare", t, 0.25 + (b - 12) * 0.08, d); else drum(toms[b - 12], t, 0.45, d); }
  };

  /* ---------- members on the grid ----------
     Columns are time: left to right, each column plays for half a bar, then the loop starts again (3 bars).
     Members in the same column play together. Rows are pitch: the back row plays high, the front row low. */
  const STEPS = COLS * 8;
  const REG = { guitar: 55, piano: 60, violin: 67, singer: 64, bass: 40 };
  const posOf = (i) => ({ row: Math.floor(i / COLS), col: i % COLS });
  const memberPlay = (m, i, s, t) => {
    const r = RHYTHM[m.face], b = s % 16, { row, col } = posOf(i);
    if (col !== Math.floor(s / 8)) return;
    if (!r.steps.includes(b)) return;
    const acc = r.accent.includes(b) ? 1 : 0.72, v = r.vel * acc;
    const tt = t + (r.lag || 0), sd = stepDur();
    const dur = sd * r.len;
    const dest = fxChain(m.hat, tt, dur);
    if (m.outfit === "drum") { // rows are pitch for drums too: back = cymbals, middle = snare, front = kick and toms
      const p = m.hat === "monster" ? 0.8 : m.hat === "elf" ? 1.25 : 1;
      if (row === 0) { if (genre === "jazz") ride(tt, v, dest); else drum("hihat", tt, 0.3 * v, dest, p, b % 4 === 2 ? 0.3 : 0.08); }
      else if (row === 1) { if (genre === "country" || genre === "jazz") brush(tt, v * 1.5, dest); else drum("snare", tt, 0.6 * v, dest, p); }
      else drum(b % 4 === 0 ? "kick" : pick(["tom1", "tom2", "tom3"]), tt, 0.8 * v, dest, p);
    } else {
      const ch = chordAt(bar), tu = tuneOf(m), line = tu[section(bar)], k = tu.n++;
      let midi = degMidi(line[k % line.length], REG[m.outfit] + (G().root - 57) + song.key) + [12, 0, -12][row] + hatShift(m.hat);
      if (b % 4 === 0 || m.outfit === "bass") midi = snap(midi, ch);
      const I = G().inst;
      if (m.outfit === "bass") { midi = Math.max(28, Math.min(55, midi - 12)); note(I.bass, midi, tt, dur, v, dest, { release: 0.15 }); }
      else if (m.outfit === "guitar") {
        if (!I.guitar) synth(hz(midi + 12), tt, dur, v, dest);
        else if (genre === "rock") [0, 7].forEach((x) => note(I.guitar, midi - 12 + x, tt, dur, 0.7 * v, dest)); // power chord
        else note(I.guitar, midi, tt, Math.max(dur, sd * 2), v, dest);
      }
      else if (m.outfit === "piano") { note("acoustic_grand_piano", midi, tt, Math.max(dur, sd * 2), v, dest); if (b % 8 === 0) note("acoustic_grand_piano", snap(midi - 4, ch), tt, sd * 2, 0.6 * v, dest); }
      else if (m.outfit === "violin") note("violin", Math.max(55, midi), tt, Math.max(dur, sd * 1.5), v, dest, { attack: 0.05, release: 0.3 });
      else if (m.outfit === "singer") { let vm = midi; while (vm < 57) vm += 12; while (vm > 82) vm -= 12; note("voice", vm, tt, Math.max(dur, sd * 2.5), v, dest, { attack: 0.04, release: 0.3 }); }
    }
    // light up the member on screen in time with its note
    const el = root.querySelector(`[data-slot-i="${i}"] .bs-member`);
    if (el) setTimeout(() => { el.classList.remove("is-hit"); void el.offsetWidth; el.classList.add("is-hit"); }, Math.max(0, (tt - ctx.currentTime) * 1000));
  };
  const schedule = () => {
    while (nextTime < ctx.currentTime + 0.12) {
      const swing = step % 2 ? G().swing * stepDur() * 2 : 0;
      backing(step, nextTime + swing); hookAndFill(step, nextTime + swing);
      slots.forEach((m, i) => m && memberPlay(m, i, step, nextTime + swing));
      if (step % 8 === 0) { const col = step / 8; setTimeout(() => showCol(col), Math.max(0, (nextTime - ctx.currentTime) * 1000)); }
      nextTime += stepDur(); step = (step + 1) % STEPS;
      if (step % 16 === 0) { bar++; if (bar % (3 * song.form.length) === 0) { song.progB = otherProg(G().progs.length, song.prog); song.hook = (song.hook + 1) % MOTIFS.length; tunes = new WeakMap(); } }
    }
  };
  let loading = false;
  const start = async () => {
    if (!ctx) init();
    ctx.resume();
    if (loading) return;
    loading = true; root.classList.add("is-loading");
    await load(genre);
    loading = false; root.classList.remove("is-loading");
    newSong();
    playing = true; step = 0; bar = 0; nextTime = ctx.currentTime + 0.08;
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
  // a new scene board is a new song in that genre (its sounds load first)
  const onGenre = async () => {
    if (!ctx || !playing) { newSong(); return; }
    clearInterval(timer); root.classList.add("is-loading");
    await load(genre); root.classList.remove("is-loading");
    newSong(); step = 0; bar = 0; nextTime = ctx.currentTime + 0.08;
    if (playing) timer = setInterval(schedule, 25);
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
  window.__bandy = { slots, start, stop, render, get playing() { return playing; }, get ctx() { return ctx; }, get master() { return master; } };
})();
