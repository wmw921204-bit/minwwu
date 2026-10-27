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
  const zh = !!(window.__i18n && window.__i18n.zh);
  const t = (en, cn) => (zh ? cn : en);
  const SONG_ZH = { "Oh! Susanna": "噢！苏珊娜", "Camptown Races": "康城赛马", "Yankee Doodle": "扬基歌", "In the Hall of the Mountain King": "山魔王的大厅", "Drunken Sailor": "醉酒的水手", "Block Party (original)": "积木派对（原创）", "Ode to Joy": "欢乐颂", "Canon in D": "D 大调卡农", "Eine kleine Nachtmusik": "弦乐小夜曲", "When the Saints Go Marching In": "圣徒进行曲", "Jingle Bells": "铃儿响叮当", "Frère Jacques (minor swing)": "两只老虎（小调摇摆）", "Korobeiniki": "货郎（俄罗斯方块）", "Twinkle Twinkle": "小星星", "Neon Blocks (original)": "霓虹积木（原创）" };
  const NAMES = zh ? {
    monster: "怪兽帽 · 低音", elf: "精灵帽 · 高音", electric: "闪电帽 · 嗡鸣", glitch: "故障帽 · 信号断裂", bubble: "泡泡帽 · 水下", robot: "机器人帽 · 声码器",
    angry: "生气 · 强劲节奏", sleepy: "困倦 · 慵懒节奏", happy: "开心 · 轻快节奏", laughing: "大笑 · 俏皮节奏", calm: "平静 · 顺滑节奏", sad: "难过 · 缓慢节奏",
    guitar: "吉他", singer: "歌手", piano: "钢琴", bass: "贝斯", violin: "小提琴", drum: "鼓",
  } : {
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

  /* Genres: how each style is played (see the backing grooves below)
     country    boom-chick bass, brushed backbeat, strummed steel-string guitar, fiddle lead
     rock       loud snare on 2 and 4, driving eighth-note bass, distorted power chords and lead
     classical  no drums, Alberti-bass piano, sustained strings, violin lead
     jazz       swung, walking bass, ride cymbal, piano comping off the beat
     electronic four-on-the-floor kick, off-beat hats, sidechain-pumping pads, synth bass and lead */
  const GENRES = {
    country: { swing: 0.06, kit: "acoustic", lead: "violin", inst: { guitar: "acoustic_guitar_steel", bass: "acoustic_bass" } },
    rock: { swing: 0, kit: "acoustic", lead: "distortion_guitar", inst: { guitar: "distortion_guitar", bass: "electric_bass_finger" } },
    classical: { swing: 0, kit: null, lead: "violin", inst: { guitar: "acoustic_guitar_steel", bass: "acoustic_bass" } },
    jazz: { swing: 0.3, kit: "acoustic", lead: "acoustic_grand_piano", inst: { guitar: "electric_guitar_jazz", bass: "acoustic_bass" } },
    electronic: { swing: 0, kit: "techno", lead: null, inst: { guitar: null, bass: "synth_bass_1" } },
  };
  const MAJ = [0, 2, 4, 5, 7, 9, 11], MIN = [0, 2, 3, 5, 7, 8, 10], DOR = [0, 2, 3, 5, 7, 9, 10];
  /* The songs: public-domain tunes (plus two originals), written as scale degrees.
     A bar is 16 steps: "5:2" is degree 5 for two steps, "-7" is an octave down, "#4" raised, "b2" lowered, "r" a rest.
     "V.I" splits a bar between two chords. Every song plays intro → A (verse) → B (chorus) → A → B → outro,
     and each genre steps through its list, so coming back to a scene plays the next song. */
  const SONGS = {
    country: [
      { name: "Oh! Susanna", key: 55, mode: MAJ, bpm: 104,
        A: { c: ["I", "I.V", "I", "V.I"], m: ["3:2 5:2 5:3 6:1 5:2 3:2 1:3 2:1", "3:2 3:2 2:2 1:2 2:8", "3:2 5:2 5:3 6:1 5:2 3:2 1:3 2:1", "3:2 3:2 2:2 2:2 1:8"] },
        B: { c: ["IV", "I.V", "I", "V.I"], m: ["4:4 4:4 6:4 6:4", "5:2 5:2 3:2 1:2 2:8", "3:2 5:2 5:3 6:1 5:2 3:2 1:3 2:1", "3:2 3:2 2:2 2:2 1:8"] } },
      { name: "Camptown Races", key: 55, mode: MAJ, bpm: 112,
        A: { c: ["I", "V", "I", "V.I"], m: ["5:2 5:2 3:2 5:2 6:2 5:2 3:4", "3:2 2:6 3:2 2:6", "5:2 5:2 3:2 5:2 6:2 5:2 3:4", "2:2 2:2 3:2 2:2 1:8"] },
        B: { c: ["I", "IV.I", "I", "V.I"], m: ["1:3 1:1 3:2 5:2 8:8", "6:3 6:1 8:2 6:2 5:8", "5:2 5:2 3:2 3:2 5:2 5:2 3:4", "2:2 3:2 4:2 3:2 2:2 2:2 1:4"] } },
      { name: "Yankee Doodle", key: 55, mode: MAJ, bpm: 116,
        A: { c: ["I", "V", "I.IV", "V.I"], m: ["1:2 1:2 2:2 3:2 1:2 3:2 2:4", "1:2 1:2 2:2 3:2 1:4 -7:4", "1:2 1:2 2:2 3:2 4:2 3:2 2:2 1:2", "-7:2 -5:2 -6:2 -7:2 1:4 1:4"] },
        B: { c: ["IV", "I", "IV", "V.I"], m: ["6:2 7:2 6:2 5:2 6:2 7:2 8:4", "5:2 6:2 5:2 4:2 3:4 5:4", "6:2 7:2 6:2 5:2 6:2 7:2 8:2 6:2", "5:2 8:2 7:2 9:2 8:4 8:4"] } },
    ],
    rock: [
      { name: "In the Hall of the Mountain King", key: 52, mode: MIN, bpm: 128,
        A: { c: ["i", "II7.iv", "i", "bVII"], m: ["1:2 2:2 3:2 4:2 5:2 3:2 5:4", "#4:2 2:2 #4:4 4:2 b2:2 4:4", "1:2 2:2 3:2 4:2 5:2 3:2 5:2 8:2", "7:2 5:2 3:2 5:2 7:8"] },
        B: { up: 12, c: ["i", "II7.iv", "i", "bVII"], m: ["1:2 2:2 3:2 4:2 5:2 3:2 5:4", "#4:2 2:2 #4:4 4:2 b2:2 4:4", "1:2 2:2 3:2 4:2 5:2 3:2 5:2 8:2", "7:2 5:2 3:2 5:2 7:8"] } },
      { name: "Drunken Sailor", key: 50, mode: DOR, bpm: 132,
        A: { c: ["i", "bVII", "i", "bVII.i"], m: ["5:2 5:1 5:1 5:2 5:1 5:1 5:2 1:2 3:2 5:2", "4:2 4:1 4:1 4:2 4:1 4:1 4:2 -7:2 2:2 4:2", "5:2 5:1 5:1 5:2 5:1 5:1 5:2 6:2 7:2 8:2", "7:2 5:2 4:2 2:2 1:4 1:4"] },
        B: { c: ["i", "bVII", "i", "bVII.i"], m: ["5:4 5:4 5:2 5:2 1:2 3:2", "4:4 4:4 4:2 4:2 -7:2 2:2", "5:4 5:4 5:2 6:2 7:2 8:2", "7:2 5:2 4:2 2:2 1:4 1:4"] } },
      { name: "Block Party (original)", key: 52, mode: MIN, bpm: 124,
        A: { c: ["i", "bVI", "bIII", "bVII"], m: ["1:2 1:2 3:2 1:2 4:4 3:4", "1:2 1:2 3:2 1:2 6:4 5:4", "3:2 3:2 5:2 3:2 7:4 5:4", "4:4 3:2 2:2 1:8"] },
        B: { c: ["bVI", "bVII", "i", "i"], m: ["8:4 7:2 6:2 5:4 3:4", "7:4 6:2 5:2 4:4 5:4", "8:2 8:2 7:2 8:2 10:4 8:4", "7:4 5:4 8:8"] } },
    ],
    classical: [
      { name: "Ode to Joy", key: 60, mode: MAJ, bpm: 100,
        A: { c: ["I", "V", "I", "V", "I", "V", "I", "V.I"], m: ["3:4 3:4 4:4 5:4", "5:4 4:4 3:4 2:4", "1:4 1:4 2:4 3:4", "3:6 2:2 2:8", "3:4 3:4 4:4 5:4", "5:4 4:4 3:4 2:4", "1:4 1:4 2:4 3:4", "2:6 1:2 1:8"] },
        B: { c: ["V", "V.I", "V.I", "V", "I", "V", "I", "V.I"], m: ["2:4 2:4 3:4 1:4", "2:4 3:2 4:2 3:4 1:4", "2:4 3:2 4:2 3:4 2:4", "1:4 2:4 -5:8", "3:4 3:4 4:4 5:4", "5:4 4:4 3:4 2:4", "1:4 1:4 2:4 3:4", "2:6 1:2 1:8"] } },
      { name: "Canon in D", key: 62, mode: MAJ, bpm: 76,
        A: { c: ["I.V", "vi.iii", "IV.I", "IV.V"], m: ["10:8 9:8", "8:8 7:8", "6:8 5:8", "6:8 7:8"] },
        B: { c: ["I.V", "vi.iii", "IV.I", "IV.V"], m: ["8:4 10:4 9:4 7:4", "8:4 6:4 7:4 5:4", "6:4 4:4 5:4 8:4", "6:4 4:4 5:4 7:4"] } },
      { name: "Eine kleine Nachtmusik", key: 55, mode: MAJ, bpm: 120,
        A: { c: ["I", "I", "V7", "V7"], m: ["1:4 r:2 -5:2 1:4 r:2 -5:2", "1:2 -5:2 1:2 3:2 5:8", "4:4 r:2 2:2 4:4 r:2 2:2", "4:2 2:2 -7:2 2:2 -5:8"] },
        B: { c: ["I", "V7", "I", "V.I"], m: ["5:2 5:2 5:2 4:2 3:4 3:4", "4:2 4:2 4:2 3:2 2:4 2:4", "3:2 3:2 3:2 2:2 1:4 3:4", "2:4 -7:4 1:8"] } },
    ],
    jazz: [
      { name: "When the Saints Go Marching In", key: 53, mode: MAJ, bpm: 132,
        A: { c: ["I", "I", "I", "I", "I", "I", "V", "V"], m: ["r:4 1:4 3:4 4:4", "5:16", "r:4 1:4 3:4 4:4", "5:16", "r:4 1:4 3:4 4:4", "5:8 3:4 1:4", "3:8 2:8", "2:16"] },
        B: { c: ["I", "I7", "IV", "IV", "I", "I.V", "V", "I"], m: ["r:4 3:4 3:4 2:4", "1:12 1:4", "3:8 5:8", "5:4 4:12", "r:4 3:4 4:4 5:4", "3:8 1:8", "2:16", "1:16"] } },
      { name: "Jingle Bells", key: 53, mode: MAJ, bpm: 140,
        A: { c: ["I", "I", "I", "IV", "IV", "V", "V", "I"], m: ["5:4 3:4 2:4 1:4", "5:12 5:2 5:2", "5:4 3:4 2:4 1:4", "6:16", "6:4 4:4 3:4 2:4", "-7:16", "5:4 5:4 4:4 2:4", "3:16"] },
        B: { c: ["I", "I", "I", "I", "IV", "I", "V", "I"], m: ["3:4 3:4 3:8", "3:4 3:4 3:8", "3:4 5:4 1:6 2:2", "3:16", "4:4 4:4 4:6 4:2", "4:4 3:4 3:4 3:2 3:2", "5:4 5:4 4:4 2:4", "1:16"] } },
      { name: "Frère Jacques (minor swing)", key: 50, mode: MIN, bpm: 120,
        A: { c: ["i7", "i7", "iv7", "i7"], m: ["1:4 2:4 3:4 1:4", "1:4 2:4 3:4 1:4", "3:4 4:4 5:8", "3:4 4:4 5:8"] },
        B: { c: ["i7", "iv7", "V7", "i7"], m: ["5:3 6:1 5:2 4:2 3:4 1:4", "5:3 6:1 5:2 4:2 3:4 1:4", "1:4 -5:4 1:8", "1:4 -5:4 1:8"] } },
    ],
    electronic: [
      { name: "Korobeiniki", key: 57, mode: MIN, bpm: 126,
        A: { c: ["i", "i", "V", "i"], m: ["5:4 2:2 3:2 4:4 3:2 2:2", "1:4 1:2 3:2 5:4 4:2 3:2", "2:6 3:2 4:4 5:4", "3:4 1:4 1:8"] },
        B: { c: ["iv", "i", "V", "i"], m: ["r:2 4:4 6:2 8:4 7:2 6:2", "5:6 3:2 5:4 4:2 3:2", "2:4 2:2 3:2 4:4 5:4", "3:4 1:4 1:8"] } },
      { name: "Twinkle Twinkle", key: 60, mode: MAJ, bpm: 124,
        A: { c: ["I", "IV.I", "IV.I", "V.I"], m: ["1:4 1:4 5:4 5:4", "6:4 6:4 5:8", "4:4 4:4 3:4 3:4", "2:4 2:4 1:8"] },
        B: { c: ["I.IV", "I.V", "I.IV", "I.V"], m: ["5:4 5:4 4:4 4:4", "3:4 3:4 2:8", "5:4 5:4 4:4 4:4", "3:4 3:4 2:8"] } },
      { name: "Neon Blocks (original)", key: 57, mode: MIN, bpm: 126,
        A: { c: ["i", "bVI", "bIII", "bVII"], m: ["1:2 3:2 5:2 3:2 8:4 7:4", "6:2 5:2 3:2 5:2 6:8", "5:2 7:2 10:2 7:2 5:4 3:4", "4:2 5:2 7:2 5:2 4:4 2:4"] },
        B: { c: ["bVI", "bVII", "i", "i"], m: ["8:4 8:2 7:2 6:4 5:4", "7:4 7:2 6:2 5:4 4:4", "5:2 8:2 10:2 8:2 12:4 10:4", "8:16"] } },
    ],
  };
  const CHORD = { I: [0, "maj"], ii: [2, "min"], iii: [4, "min"], IV: [5, "maj"], iv: [5, "min"], V: [7, "maj"], vi: [9, "min"], i: [0, "min"], bIII: [3, "maj"], bVI: [8, "maj"], bVII: [10, "maj"], ii7: [2, "min7"], iii7: [4, "min7"], vi7: [9, "min7"], V7: [7, "dom7"], VI7: [9, "dom7"], Imaj7: [0, "maj7"], i7: [0, "min7"], iv7: [5, "min7"], I7: [0, "dom7"], II7: [2, "dom7"], IV7: [5, "dom7"] };
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
  // the base is a 3 × 6 grid like the prototype: index = row * 6 + col; row 0 is the back
  const ROWS = 3, COLS = 6;
  const slots = Array(ROWS * COLS).fill(null);
  slots[2 * 6 + 0] = { hat: "elf", face: "happy", outfit: "guitar" };
  slots[1 * 6 + 2] = { hat: "bubble", face: "calm", outfit: "piano" };
  slots[2 * 6 + 3] = { hat: "monster", face: "angry", outfit: "drum" };
  slots[0 * 6 + 4] = { hat: "robot", face: "calm", outfit: "singer" };

  let ctx = null, master = null, verb = null, band = null, back = null, duck = null, playing = false, genre = "country";
  let step = 0, bar = 0, nextTime = 0, timer = 0;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  /* ---------- songs ---------- */
  const parseBar = (str, mode, up = 0) => {
    let at = 0; const out = [];
    str.trim().split(/\s+/).forEach((tok) => {
      const [p, d] = tok.split(":"), len = +d;
      if (p !== "r") {
        let s = p, oct = 0, acc = 0;
        if (s[0] === "-") { oct = -12; s = s.slice(1); } else if (s[0] === "+") { oct = 12; s = s.slice(1); }
        if (s[0] === "#") { acc = 1; s = s.slice(1); } else if (s[0] === "b") { acc = -1; s = s.slice(1); }
        const n = +s - 1;
        out.push({ at, len, semi: mode[n % 7] + 12 * Math.floor(n / 7) + acc + oct + up });
      }
      at += len;
    });
    return out;
  };
  // a song becomes a list of bars: section, energy (0 intro, 1 verse, 2 chorus), chords and melody notes
  const build = (S) => {
    const tl = [], tonic = S.mode === MAJ ? "I" : "i";
    const add = (sec, part, e, withTune = true) => part.c.forEach((c, i) => tl.push({ sec, e, c: c.split("."), m: withTune ? parseBar(part.m[i], S.mode, part.up || 0) : [] }));
    add("intro", { c: S.A.c.slice(0, 4) }, 0, false);
    add("A", S.A, 1); add("B", S.B, 2); add("A", S.A, 1); add("B", S.B, 2);
    tl.push({ sec: "outro", e: 0.5, c: [tonic], m: [] }, { sec: "outro", e: 0.4, c: [tonic], m: [] });
    return tl;
  };
  const order = {};
  const song = { S: null, tl: [], bpm: 110, key: 60, groove: 0 };
  const nextSong = (g) => { const n = SONGS[g].length; order[g] = order[g] == null ? (Math.random() * n | 0) : (order[g] + 1) % n; return SONGS[g][order[g]]; };
  const newSong = () => {
    const S = nextSong(genre);
    song.S = S; song.tl = build(S); song.bpm = S.bpm + Math.round(rnd(-3, 3)); song.key = S.key + ((Math.random() * 3 | 0) - 1); song.groove = Math.random() * 3 | 0;
    bar = 0;
    const el = root.querySelector("[data-band-song]"); if (el) el.textContent = (zh && SONG_ZH[S.name]) || S.name;
  };

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
  const cur = (barN) => song.tl[((barN % song.tl.length) + song.tl.length) % song.tl.length];
  const chordAt = (barN, b = 0) => { const c = cur(barN).c, [off, q] = CHORD[c[c.length > 1 && b >= 8 ? 1 : 0]]; return { root: song.key + off, tones: SHAPES[q] }; };
  const snap = (midi, ch) => { let best = midi, bd = 99; for (let d = -2; d <= 2; d++) { const pc = (((midi + d - ch.root) % 12) + 12) % 12; if (ch.tones.some((x) => x % 12 === pc) && Math.abs(d) < bd) { bd = Math.abs(d); best = midi + d; } } return best; };
  const voicing = (ch, low) => ch.tones.map((x) => { let m = ch.root + x; while (m < low) m += 12; while (m >= low + 12) m -= 12; return m; }).sort((a, b) => a - b);
  const stepDur = () => 60 / song.bpm / 4;

  /* ---------- the scene's own band: groove by genre, louder and fuller in the chorus ---------- */
  const backing = (s, t) => {
    const b = s % 16, d = back, c = cur(bar), e = c.e, ch = chordAt(bar, b), sd = stepDur(), I = G().inst;
    const chorus = e >= 2, drumsOn = e >= 1, dv = chorus ? 1.1 : 0.8;
    const intoChorus = cur(bar + 1).e === 2 && !chorus, firstChorus = chorus && cur(bar - 1).e !== 2;
    const gv = chorus ? (song.groove + 1) % 3 : song.groove;
    const bassNote = (m, len, v = 0.8) => note(I.bass, m, t, len, v, d, { release: 0.12 });
    const lowRoot = ((ch.root - 40) % 12 + 12) % 12 + 40;
    if (firstChorus && b === 0 && G().kit) { const s2 = ctx.createBufferSource(); s2.buffer = NOISE; const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 5000; const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.16, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 1.6); s2.connect(hp).connect(g2).connect(d); s2.start(t); s2.stop(t + 1.7); }
    if (c.sec === "outro") { if (b === 0) { voicing(ch, 55).forEach((m) => note("string_ensemble_1", m, t, sd * 15, 0.45 * e * 2, d, { attack: 0.1, release: 0.8 })); bassNote(lowRoot, sd * 14, 0.6); if (G().kit) drum("kick", t, 0.5, d); } return; }
    if (genre === "country") {
      if (drumsOn && (b === 0 || b === 8)) drum("kick", t, 0.55 * dv, d);
      if (drumsOn && (b === 4 || b === 12)) brush(t, 1.2 * dv, d);
      if (chorus && b % 2 === 0) drum("hihat", t, 0.08, d, 1, 0.05);
      if (b === 0) bassNote(lowRoot, sd * 3.5); if (b === 8) bassNote(lowRoot + 7, sd * 3.5, 0.7);
      const strum = (v, up) => voicing(ch, 52).concat([voicing(ch, 52)[0] + 12]).forEach((m, n, arr) => note("acoustic_guitar_steel", m, t + (up ? arr.length - n : n) * 0.014, sd * 1.6, v, d));
      if (e === 0 && b % 4 === 0) { const v = voicing(ch, 55); note("acoustic_guitar_steel", v[(b / 4) % v.length], t, sd * 4, 0.38, d); }
      else if (gv === 0 && (b === 4 || b === 12)) strum(0.45);
      else if (gv === 1 && [0, 4, 6, 10, 12, 14].includes(b)) strum(b % 4 === 2 ? 0.3 : 0.42, b % 4 === 2);
      else if (gv === 2 && b % 2 === 0) { const v = voicing(ch, 55); note("acoustic_guitar_steel", v[(b / 2) % v.length], t, sd * 3, 0.38, d); }
    }
    if (genre === "rock") {
      if (drumsOn && (b === 0 || b === 8 || (chorus && (b === 6 || b === 10)))) drum("kick", t, 0.85 * dv, d);
      if (drumsOn && (b === 4 || b === 12)) drum("snare", t, 0.75 * dv, d);
      if (b % 2 === 0) drum("hihat", t, (b % 4 ? 0.1 : 0.18) * (drumsOn ? 1 : 0.6), d, 1, 0.08);
      if (intoChorus && b >= 8) drum("snare", t, 0.3 + (b - 8) * 0.06, d);
      if (drumsOn && b % 2 === 0) bassNote(lowRoot, sd * 1.7, 0.75);
      const pc = [ch.root - 12, ch.root - 5];
      if ((e === 0 && b === 0) || (!chorus && drumsOn && (b === 0 || b === 10)) || (chorus && b % 4 === 0)) pc.forEach((m) => note("distortion_guitar", m + 12, t, chorus ? sd * 3.5 : sd * (e === 0 ? 14 : 6), 0.45, d));
    }
    if (genre === "classical") {
      const v = voicing(ch, 48);
      if (gv === 0 && b % 2 === 0) note("acoustic_grand_piano", [v[0], v[2], v[1], v[2]][(b / 2) % 4], t, sd * 2, 0.32, d); // Alberti bass
      if (gv === 1 && b % 4 === 0) [v[0] - 12, ...v].forEach((m, n) => note("acoustic_grand_piano", m, t + n * 0.03, sd * 3.5, 0.28, d)); // rolled chords
      if (gv === 2 && b % 2 === 0) note("acoustic_grand_piano", [v[0], v[1], v[2], v[1] + 12][(b / 2) % 4], t, sd * 2, 0.3, d);
      if (b === 0 || (b === 8 && cur(bar).c.length > 1)) voicing(ch, chorus ? 60 : 55).forEach((m) => note("string_ensemble_1", m, t, sd * 7.5, chorus ? 0.55 : 0.4, d, { attack: 0.3, release: 0.5 }));
      if (b === 0 || (b === 8 && cur(bar).c.length > 1)) note("acoustic_bass", lowRoot, t, sd * 7, 0.6, d, { attack: 0.08, release: 0.3 });
    }
    if (genre === "jazz") {
      if ([0, 4, 8, 12, 6, 14].includes(b)) ride(t, (b % 4 ? 0.7 : 1) * (drumsOn ? dv : 0.5), d);
      if (drumsOn && (b === 4 || b === 12)) drum("hihat", t, 0.12, d, 1, 0.05);
      if (chorus && (b === 0 || b === 10)) drum("kick", t, 0.3, d);
      if (drumsOn && b % 4 === 0) { // walking bass: root, a chord tone, the fifth, an approach note into the next chord
        const nx = chordAt(bar + (b === 12 ? 1 : 0), b === 12 ? 0 : b + 4).root, q = b / 4, m = [lowRoot, lowRoot + ch.tones[1], lowRoot + 7, ((nx - 40) % 12 + 12) % 12 + 40 + (Math.random() < 0.5 ? 1 : -1)][q];
        bassNote(m, sd * 3.6, 0.85);
      } else if (!drumsOn && b === 0) bassNote(lowRoot, sd * 8, 0.6);
      const comp = gv === 0 ? [6, 14] : gv === 1 ? [3, 10] : [0, 7];
      if (comp.includes(b)) voicing(ch, 55).forEach((m) => note("acoustic_grand_piano", m, t, sd * 1.5, 0.26, d));
    }
    if (genre === "electronic") {
      if (drumsOn && b % 4 === 0) { drum("kick", t, 0.95 * dv, d); duck.gain.cancelScheduledValues(t); duck.gain.setValueAtTime(0.25, t); duck.gain.linearRampToValueAtTime(1, t + sd * 3); }
      if (chorus && (b === 4 || b === 12)) drum("snare", t, 0.45, d);
      if (b % 4 === 2) drum("hihat", t, drumsOn ? 0.28 : 0.12, d, 1, 0.12);
      if (chorus && b % 2 === 1) drum("hihat", t, 0.08, d, 1.2, 0.03);
      if (intoChorus && b >= 8) drum("snare", t, 0.2 + (b - 8) * 0.05, d); // build-up roll into the drop
      if (drumsOn && (b % 4 === 2 || (chorus && b % 4 === 3))) bassNote(lowRoot, sd * 1.2, 0.7);
      if (b === 0) voicing(ch, 57).forEach((m) => note("string_ensemble_1", m, t, sd * 15, 0.55, drumsOn ? duck : d, { attack: drumsOn ? 0.05 : 0.6, release: 0.3 }));
      if ((chorus || gv === 1) && b % 2 === 0) { const v = voicing(ch, 69); synth(hz(v[(b / 2) % v.length]), t, sd, chorus ? 0.5 : 0.35, d); }
    }
  };

  /* the tune itself, played by the scene's lead instrument (quieter while a singer has it) */
  let singerNow = false;
  const tune = (s, t) => {
    const b = s % 16, c = cur(bar), sd = stepDur();
    c.m.forEach((n) => {
      if (n.at !== b) return;
      const midi = song.key + 12 + n.semi, dur = n.len * sd, lead = G().lead, v = (c.e >= 2 ? 0.42 : 0.32) * (singerNow ? 0.45 : 1);
      if (lead) note(lead, lead === "distortion_guitar" ? midi - 12 : midi, t, dur * 0.95, v, back, { attack: lead === "violin" ? 0.03 : 0.004, release: 0.18 });
      else synth(hz(midi), t, dur, v * 1.4, back);
      if (c.e >= 2 && genre !== "rock") note("string_ensemble_1", midi - 12, t, dur, 0.22, back, { attack: 0.05, release: 0.2 });
    });
  };

  /* ---------- members on the grid ----------
     Columns are time: left to right, each column plays for half a bar, then the loop starts again (3 bars).
     Members in the same column play together. Rows are pitch: the back row plays high, the front row low.
     Players accompany the song (strums, broken chords, bass lines, counter-melodies); a singer sings the tune. */
  const posOf = (i) => ({ row: Math.floor(i / COLS), col: i % COLS });
  const memberPlay = (m, i, s, t) => {
    const r = RHYTHM[m.face], b = s % 16, { row, col } = posOf(i);
    if (col !== Math.floor(s / 8)) return;
    const c = cur(bar), ch = chordAt(bar, b), sd = stepDur(), boost = c.e >= 2 ? 1.1 : c.e < 1 ? 0.8 : 1;
    const oct = [12, 0, -12][row] + hatShift(m.hat);
    let tt = t;
    if (m.outfit === "singer") {
      // sings the song's own phrases, held and joined up; with no tune (intro, outro) it hums the chord
      const notes = c.m.filter((n) => n.at === b);
      const fold = (x) => { while (x < 57) x += 12; while (x > 82) x -= 12; return x; };
      const sing = (midi, len, v) => { const dest = fxChain(m.hat, t, len); note("voice", fold(midi), t, len, v, dest, { attack: 0.06, release: 0.35 }); };
      if (notes.length) notes.forEach((n) => sing(song.key + 12 + n.semi + (oct > 0 ? 12 : oct < 0 ? -12 : 0), n.len * sd * 1.08, 0.9 * boost * (r.vel + 0.2)));
      else if (b % 8 === 0 && !c.m.length) sing(voicing(ch, 64)[1], sd * 7.5, 0.6 * boost);
      else return;
    } else {
      if (!r.steps.includes(b)) return;
      const acc = r.accent.includes(b) ? 1 : 0.72, v = r.vel * acc * boost, k = r.steps.indexOf(b);
      tt = t + (r.lag || 0);
      const dur = sd * r.len, dest = fxChain(m.hat, tt, dur), I = G().inst;
      if (m.outfit === "drum") { // rows are pitch for drums too: back = cymbals, middle = snare, front = kick and toms
        const p = m.hat === "monster" ? 0.8 : m.hat === "elf" ? 1.25 : 1;
        if (row === 0) { if (genre === "jazz") ride(tt, v, dest); else drum("hihat", tt, 0.3 * v, dest, p, b % 4 === 2 ? 0.3 : 0.08); }
        else if (row === 1) { if (genre === "country" || genre === "jazz") brush(tt, v * 1.5, dest); else drum("snare", tt, 0.6 * v, dest, p); }
        else drum(b % 4 === 0 ? "kick" : pick(["tom1", "tom2", "tom3"]), tt, 0.8 * v, dest, p);
      } else if (m.outfit === "guitar") {
        if (!I.guitar) voicing(ch, 60 + oct).forEach((x) => synth(hz(x), tt, Math.max(dur, sd), v * 0.8, dest));
        else if (genre === "rock") [0, 7, 12].forEach((x) => note(I.guitar, ch.root - 12 + oct + x + 12, tt, Math.max(dur, sd * 1.5), 0.6 * v, dest));
        else voicing(ch, 52 + oct).concat([voicing(ch, 52 + oct)[0] + 12]).forEach((x, n) => note(I.guitar, x, tt + n * 0.013, Math.max(dur, sd * 2), 0.7 * v, dest)); // a strum
      } else if (m.outfit === "piano") {
        const vv = voicing(ch, 60 + oct);
        note("acoustic_grand_piano", vv[k % vv.length], tt, Math.max(dur, sd * 2), v, dest);
        if (r.accent.includes(b)) note("acoustic_grand_piano", vv[(k + 1) % vv.length], tt, Math.max(dur, sd * 2), 0.7 * v, dest);
      } else if (m.outfit === "bass") {
        const root = ((ch.root - 40) % 12 + 12) % 12 + 40 + (oct > 0 ? 12 : oct < 0 ? -12 : 0);
        note(I.bass, Math.max(28, r.accent.includes(b) ? root : root + 7), tt, Math.max(dur, sd * 1.5), v, dest, { release: 0.15 });
      } else if (m.outfit === "violin") { // a counter-melody on the third and fifth
        const vv = voicing(ch, 67 + oct);
        note("violin", Math.max(55, vv[1 + (k % 2)]), tt, Math.max(dur, sd * 3), 0.85 * v, dest, { attack: 0.06, release: 0.3 });
      }
    }
    // light up the member on screen in time with its note
    const el = root.querySelector(`[data-slot-i="${i}"] .bs-member`);
    if (el) setTimeout(() => { el.classList.remove("is-hit"); void el.offsetWidth; el.classList.add("is-hit"); }, Math.max(0, (tt - ctx.currentTime) * 1000));
  };
  const schedule = () => {
    while (nextTime < ctx.currentTime + 0.12) {
      const swing = step % 2 ? G().swing * stepDur() * 2 : 0, t = nextTime + swing, col = Math.floor(step / 8);
      singerNow = slots.some((m, i) => m && m.outfit === "singer" && i % COLS === col);
      backing(step, t); tune(step, t);
      slots.forEach((m, i) => m && memberPlay(m, i, step, t));
      if (step % 8 === 0) setTimeout(() => showCol(col), Math.max(0, (nextTime - ctx.currentTime) * 1000));
      nextTime += stepDur(); step = (step + 1) % STEPS;
      if (step % 16 === 0) { bar++; if (bar >= song.tl.length) newSong(); } // the song ended: on to the next one
    }
  };
  const STEPS = COLS * 8;
  let loading = false;
  const start = async () => {
    if (!ctx) init();
    ctx.resume();
    if (loading) return;
    loading = true; root.classList.add("is-loading");
    await load(genre);
    loading = false; root.classList.remove("is-loading");
    newSong();
    playing = true; step = 0; nextTime = ctx.currentTime + 0.08;
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
    root.querySelectorAll("[data-mcol]").forEach((t) => t.classList.toggle("is-now", +t.dataset.mcol === c));
  };
  // a new scene board starts the next song in that genre (its sounds load first)
  const onGenre = async () => {
    if (!ctx || !playing) { const el = root.querySelector("[data-band-song]"); if (el) el.textContent = ""; return; }
    clearInterval(timer); root.classList.add("is-loading");
    await load(genre); root.classList.remove("is-loading");
    newSong(); step = 0; nextTime = ctx.currentTime + 0.08;
    if (playing) timer = setInterval(schedule, 25);
  };

  /* ---------- UI ---------- */
  const stage = root.querySelector("[data-band-slots]");
  const readout = root.querySelector("[data-band-read]");
  const tray = root.querySelector("[data-band-tray]");
  const KINDS = { hat: HATS, face: FACES, outfit: OUTFITS };
  const ROWNAME = zh ? ["后排 · 高音", "中排", "前排 · 低音"] : ["back · high", "middle", "front · low"];
  const POS = slots.map((_, i) => t(`column ${(i % COLS) + 1}, ${ROWNAME[Math.floor(i / COLS)]}`, `第 ${(i % COLS) + 1} 列，${ROWNAME[Math.floor(i / COLS)]}`));

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

  tray.innerHTML = Object.entries(KINDS).map(([kind, list]) => `<div class="bs-tray__row" data-kind="${kind}"><small>${kind === "hat" ? t("Hats · effect", "帽子 · 音效") : kind === "face" ? t("Faces · rhythm", "表情 · 节奏") : t("Outfits · instrument", "服装 · 乐器")}</small><div>${list.map((n) => `<button type="button" class="bs-chip" data-pick="${kind}:${n}" title="${NAMES[n]}"><img src="${src(kind, n)}" alt="${NAMES[n]}" draggable="false"></button>`).join("")}</div></div>`).join("");

  const render = (flash) => {
    stage.innerHTML = slots.map((m, i) => { const { row, col } = posOf(i), [x, y] = cellAnchor(row, col); return `<div class="bs-pad${m ? " is-full" : ""}${col === nowCol ? " is-now" : ""}" data-slot-i="${i}" style="--x:${x.toFixed(2)};--y:${y.toFixed(2)};--b:${blockSize(row)};z-index:${row + 2}">${m
      ? `<div class="bs-member" data-member="${i}">${["hat", "face", "outfit"].map((k) => `<button type="button" class="bs-block${sel && sel.i === i && sel.kind === k ? " is-sel" : ""}${flash && !flash.from && flash.i === i && flash.kind === k ? " is-swap" : ""}" data-block="${k}" data-i="${i}" aria-label="${NAMES[m[k]]}${t(": change it", "：换一个")}"><img src="${src(k, m[k])}" alt="" draggable="false"></button>`).join("")}<button type="button" class="bs-remove" data-remove="${i}" aria-label="${t("Take this member off", "移除这位成员")}">×</button></div>`
      : `<button type="button" class="bs-add" data-add="${i}" aria-label="${t("Add a member: ", "添加成员：")}${POS[i]}"><span>+</span></button>`}</div>`; }).join("");
    const n = slots.filter(Boolean).length;
    readout.textContent = n ? t(`${n} of 6 · `, `${n} / 6 · `) + slots.map((m, i) => m && t(`${NAMES[m.outfit]} (${POS[i]})`, `${NAMES[m.outfit]}（${POS[i]}）`)).filter(Boolean).join(t(", ", "，")) : t("No members yet: only the scene is playing.", "还没有成员：只有场景在演奏。");
    root.classList.toggle("has-sel", !!sel);
    tray.querySelectorAll(".bs-tray__row").forEach((r) => r.classList.toggle("is-target", !!sel && r.dataset.kind === sel.kind));
    tray.querySelectorAll("[data-pick]").forEach((b) => { const [k, n] = b.dataset.pick.split(":"); b.classList.toggle("is-on", !!sel && sel.kind === k && slots[sel.i] && slots[sel.i][k] === n); });
    applyPeek();
    if (flash && flash.from && window.__cubeTurn) window.__cubeTurn(stage.querySelector(`[data-slot-i="${flash.i}"] [data-block="${flash.kind}"]`), src(flash.kind, flash.from), src(flash.kind, slots[flash.i][flash.kind]), 480);
    // the grid from above: every cell reachable, front row at the bottom
    map.innerHTML = slots.map((m, i) => `<button type="button" data-map="${i}" data-mcol="${i % COLS}" class="${m ? "is-full" : ""}${sel && sel.i === i ? " is-sel" : ""}${i % COLS === nowCol ? " is-now" : ""}" aria-label="${m ? NAMES[m.outfit] + ", " + POS[i] : t("Add a member: ", "添加成员：") + POS[i]}">${m ? `<img src="${src("hat", m.hat)}" alt="">` : "+"}</button>`).join("");
  };
  const map = root.querySelector("[data-band-map]");
  map.addEventListener("click", (e) => {
    const b = e.target.closest("[data-map]"); if (!b || !root.classList.contains("is-on")) return;
    e.stopPropagation();
    const i = +b.dataset.map;
    if (!slots[i]) slots[i] = randMember();
    sel = { i, kind: "hat" }; render(); // picked: it comes forward on the stage, ready to edit
  });
  map.addEventListener("pointerover", (e) => { const b = e.target.closest("[data-map]"); if (b && e.pointerType === "mouse" && slots[+b.dataset.map]) { hoverPeek = +b.dataset.map; applyPeek(); } });
  map.addEventListener("pointerleave", () => { if (hoverPeek != null) { hoverPeek = null; applyPeek(); } });
  /* reaching the back rows: the member you point at (or have selected) comes forward,
     and the members standing in front of it in that column fade and let clicks through */
  let hoverPeek = null;
  function applyPeek() {
    const i = hoverPeek != null ? hoverPeek : sel ? sel.i : null;
    stage.querySelectorAll(".bs-pad").forEach((p) => {
      const j = +p.dataset.slotI, front = i != null && j % COLS === i % COLS && Math.floor(j / COLS) > Math.floor(i / COLS) && slots[j];
      p.classList.toggle("is-ghost", !!front);
      p.classList.toggle("is-peek", i != null && j === i && slots.some((m, k) => m && k % COLS === i % COLS && Math.floor(k / COLS) > Math.floor(i / COLS)));
    });
  }
  stage.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "mouse" || root.classList.contains("is-dragging")) return;
    const mem = e.target.closest("[data-member]"); if (!mem) return;
    const i = +mem.dataset.member;
    if (hoverPeek !== i) { hoverPeek = i; applyPeek(); }
  });
  stage.addEventListener("pointermove", (e) => {
    if (hoverPeek == null) return;
    const el = stage.querySelector(`[data-member="${hoverPeek}"]`), r = el && el.getBoundingClientRect();
    if (!r || e.clientX < r.left - 6 || e.clientX > r.right + 6 || e.clientY < r.top - 6 || e.clientY > r.bottom + 6) {
      const over = document.elementFromPoint(e.clientX, e.clientY), mem = over && over.closest("[data-member]");
      hoverPeek = mem ? +mem.dataset.member : null; applyPeek();
    }
  });
  stage.addEventListener("pointerleave", () => { if (hoverPeek != null) { hoverPeek = null; applyPeek(); } });

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
  // a new block is placed at once and the choice is done: nothing stays selected
  const putBlock = (i, kind, name) => {
    const fresh = !slots[i];
    if (fresh) slots[i] = randMember();
    const from = fresh ? null : slots[i][kind];
    slots[i][kind] = name; sel = null; render({ i, kind, from });
  };
  // clicking anywhere outside the demo cancels a selection (a click that re-drew the band is not "outside")
  document.addEventListener("click", (e) => { if (sel && e.target.isConnected && !root.contains(e.target)) { sel = null; render(); } });
  const move = (from, to) => { if (from === to) return; [slots[from], slots[to]] = [slots[to], slots[from]]; sel = null; render(); };

  /* tap: pick a block on the board, then a new one from the tray */
  let dragged = false;
  const ready = () => root.classList.contains("is-on"); // nothing can be changed before "Start the band"
  root.addEventListener("click", (e) => {
    if (!ready() && !e.target.closest("[data-band-start]")) return;
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
    else if (!e.target.closest(".bs-tray, .bs-bar, .bs-map")) { sel = null; render(); }
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
    if (e.button !== 0 || !root.classList.contains("is-on")) return;
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
