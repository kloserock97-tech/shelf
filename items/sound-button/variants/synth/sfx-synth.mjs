/* Звуки интерфейса портфолио и этого демо — свои, синтезированы с нуля: без сэмплов, без чужих файлов, без зависимостей.
   node sfx-synth.mjs                                   — собрать все 11 сигналов в ./sfx и проверить их
   node sfx-synth.mjs --only close,expand,press,toggle-on --out ../../demo/sfx  — четыре сигнала этого демо
   node sfx-synth.mjs --out <папка> --wav <папка>       — MP3 в другую папку, исходные WAV сохранить рядом
   Нужен ffmpeg в PATH: он кодирует MP3 и меряет громкость по EBU R128 (ebur128).

   Как устроено. Каждый сигнал — несколько «голосов» из простых кирпичиков, всё считается во Float32 на 44,1 кГц:
   - mallet: мягкий удар по бруску — синус с парой обертонов, у каждого своё экспоненциальное затухание; в момент
     удара высота чуть уходит и садится (так звучит войлочная колотушка) и слышен короткий шорох касания;
   - chime: колокольчик на частотной модуляции — индекс модуляции гаснет быстрее громкости, звук из яркого
     становится чистым синусом;
   - air: белый шум через полосовой фильтр с плывущей частотой (SVF) и мягкий ФНЧ — воздух, порыв;
   - room: маленькая комната — четыре гребёнки с затуханием в петле и два всепропускающих фильтра.
   Высоты — ре-мажорная пентатоника (ре, ми, фа-диез, ля, си): сигналы звучат одним набором и не спорят друг с другом.
   Громкость, длина, каналы и битрейт у каждого сигнала — как у прежнего файла с тем же именем (замер 29.09), чтобы
   баланс звука на сайте не поменялся. Характер тот же: тихо, мягко, низко (центроид спектра 0,3–0,7 кГц), без резких верхов.

   Проверки на готовом MP3 (декодирует тот же ffmpeg): пик ≤ −1 dBFS и истинный пик ≤ −1 dBTP, постоянной составляющей нет,
   по краям затухания 3 и 4 мс (первый и последний отсчёт MP3 тише −50 dBFS — это шум кодека, не щелчок; у WAV там ровно 0),
   громкость ±1 LU от цели,
   длительность ±30 % от прежней. Что-то не так — код выхода 1. */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SR = 44100;
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const OUT = opt("out", join(process.cwd(), "sfx"));
const KEEP_WAV = opt("wav", null);
const ONLY = (opt("only", "") || "").split(",").filter(Boolean);

/* ── кирпичики ────────────────────────────────────────────────────────────── */

/** случайные числа с зерном — Hash Kit (свой, см. shelf/items/hash-kit): последовательность Вейля через наш миксер;
    шум одинаковый при каждой сборке */
const rng = (seed) => {
  let s = (seed >>> 0) ^ 0x51f7ea5e;
  return () => {
    s = (s + 0xb31c96c9) >>> 0;
    let x = s;
    x ^= x >>> 16; x = Math.imul(x, 0x3f9c86cb); x ^= x >>> 14; x = Math.imul(x, 0x1ae9dacf); x ^= x >>> 15;
    return (x >>> 0) / 4294967296;
  };
};
/** огибающая: подъём по полуволне косинуса за att, дальше экспонента с постоянной tau */
const env = (t, att, tau) => (t < att ? 0.5 - 0.5 * Math.cos((Math.PI * t) / att) : Math.exp(-(t - att) / tau));
/** коэффициент однополюсного ФНЧ на частоте f */
const onePole = (f) => 1 - Math.exp((-2 * Math.PI * f) / SR);

/** мягкий удар: основной тон и обертоны [множитель, громкость, доля tau], высота в начале уходит на drop и садится
    за glide, касание — шум через ФНЧ за пару миллисекунд */
function mallet(f, { len = 0.3, att = 0.002, tau = 0.05, drop = 0.02, glide = 0.012, partials = [[2, 0.15, 0.5]], tick = 0.04, tickLp = 1800, seed = 1 } = {}) {
  const n = Math.round(len * SR), v = new Float32Array(n), rnd = rng(seed), ph = new Float64Array(partials.length + 1);
  const kt = onePole(tickLp);
  let noise = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, bend = 1 + drop * Math.exp(-t / glide);
    ph[0] += (2 * Math.PI * f * bend) / SR;
    let s = Math.sin(ph[0]) * env(t, att, tau);
    for (let j = 0; j < partials.length; j++) {
      const [m, g, k] = partials[j];
      ph[j + 1] += (2 * Math.PI * f * m * bend) / SR;
      s += g * Math.sin(ph[j + 1]) * env(t, att, tau * k);
    }
    noise += kt * (rnd() * 2 - 1 - noise);
    v[i] = s + tick * noise * env(t, 0.0008, 0.0025);
  }
  return v;
}

/** колокольчик: несущая f, модулятор f·ratio, индекс index гаснет с постоянной indexTau */
function chime(f, { len = 0.3, att = 0.002, tau = 0.05, ratio = 2, index = 1, indexTau = 0.012 } = {}) {
  const n = Math.round(len * SR), v = new Float32Array(n);
  let pc = 0, pm = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    pc += (2 * Math.PI * f) / SR;
    pm += (2 * Math.PI * f * ratio) / SR;
    v[i] = Math.sin(pc + index * Math.exp(-t / indexTau) * Math.sin(pm)) * env(t, att, tau);
  }
  return v;
}

/** воздух: белый шум через полосовой SVF, центр плывёт от f0 к f1 за sweep секунд; тон — тихий синус по тому же центру.
    rel — спад не экспонентой, а дугой (1 − x)² за rel секунд: порыв держится и потом быстро стихает */
function air(f0, f1, { len = 0.3, att = 0.05, tau = 0.04, rel = 0, sweep = 0.15, q = 1.5, lp = 1200, tone = 0, seed = 7 } = {}) {
  const n = Math.round(len * SR), v = new Float32Array(n), rnd = rng(seed), k = 1 / q, kl = onePole(lp);
  let ic1 = 0, ic2 = 0, soft = 0, ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, fc = f0 * Math.pow(f1 / f0, Math.min(1, t / sweep));
    const g = Math.tan((Math.PI * fc) / SR), a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = rnd() * 2 - 1 - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    soft += kl * (v1 * k - soft); // полоса с единичным усилением в центре, затем мягкий ФНЧ
    ph += (2 * Math.PI * fc) / SR;
    const e = rel && t >= att ? Math.max(0, 1 - (t - att) / rel) ** 2 : env(t, att, tau);
    v[i] = (soft + tone * Math.sin(ph)) * e;
  }
  return v;
}

/** маленькая комната: гребёнки 23–30 мс с ФНЧ в петле (t60 — время спада на 60 дБ), затем два всепропускающих.
    shift сдвигает задержки — у правого канала своя комната, стерео выходит шире без панорамы */
function room(x, { mix = 0.12, t60 = 0.3, damp = 0.3, shift = 0 } = {}) {
  const n = x.length, wet = new Float32Array(n), combs = [1031, 1123, 1237, 1319];
  for (const base of combs) {
    const d = base + shift, buf = new Float32Array(d), g = Math.pow(10, (-3 * d) / (t60 * SR));
    let p = 0, z = 0;
    for (let i = 0; i < n; i++) {
      const y = buf[p];
      z = y * (1 - damp) + z * damp;
      buf[p] = x[i] + z * g;
      p = (p + 1) % d;
      wet[i] += y / combs.length;
    }
  }
  for (const base of [347, 113]) {
    const d = base + (shift >> 1), buf = new Float32Array(d), g = 0.5;
    let p = 0;
    for (let i = 0; i < n; i++) {
      const w = buf[p], u = wet[i] - g * w;
      wet[i] = g * u + w;
      buf[p] = u;
      p = (p + 1) % d;
    }
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = x[i] * (1 - mix) + wet[i] * mix;
  return out;
}

/* ── дорожка сигнала ──────────────────────────────────────────────────────── */

const track = (sec, stereo) => { const n = Math.round(sec * SR); return { n, L: new Float32Array(n), R: stereo ? new Float32Array(n) : null }; };
/** положить голос в дорожку с момента at: громкость gain, панорама pan −1…1 (равная мощность; 0 — по центру) */
function put(tr, v, at, gain = 1, pan = 0) {
  const i0 = Math.round(at * SR), a = ((pan + 1) * Math.PI) / 4;
  const gl = tr.R ? Math.cos(a) * Math.SQRT2 : 1, gr = Math.sin(a) * Math.SQRT2;
  for (let i = 0; i < v.length && i0 + i < tr.n; i++) {
    tr.L[i0 + i] += v[i] * gain * gl;
    if (tr.R) tr.R[i0 + i] += v[i] * gain * gr;
  }
}
/** доводка: комната, мягкий ФНЧ, затухание в начале 3 мс, срез постоянной составляющей (20 Гц), затухание в конце 4 мс.
    Порядок важен: если подрезать начало после среза, первая полуволна становится меньше второй и среднее уходит от нуля */
function finish(tr, { reverb, soft } = {}) {
  const chans = tr.R ? ["L", "R"] : ["L"];
  for (const c of chans) {
    let x = tr[c];
    if (reverb) x = room(x, { ...reverb, shift: c === "R" ? 38 : 0 });
    if (soft) { const k = onePole(soft); let y = 0; for (let i = 0; i < x.length; i++) x[i] = y += k * (x[i] - y); }
    const fi = Math.round(0.003 * SR), fo = Math.round(0.004 * SR);
    for (let i = 0; i < fi; i++) x[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fi);
    const r = Math.exp((-2 * Math.PI * 20) / SR);
    let x1 = 0, y1 = 0;
    for (let i = 0; i < x.length; i++) { const y = x[i] - x1 + r * y1; x1 = x[i]; y1 = y; x[i] = y; }
    for (let i = 0; i < fo; i++) x[x.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fo);
    tr[c] = x;
  }
}

/* ── сигналы ──────────────────────────────────────────────────────────────── */

const N = { D3: 146.83, A3: 220, D4: 293.66, E4: 329.63, Fs4: 369.99, A4: 440, B4: 493.88, D5: 587.33, E5: 659.26, Fs5: 739.99 };

/* len, ch, kbps — как у прежнего файла; lufs — его громкость (ebur128, сигнал дополнен тишиной до 1 с) */
const CUES = {
  /* нажатие: короткий мягкий «войлочный» удар, низкий и сухой */
  press: { len: 0.155, ch: 1, kbps: 64, lufs: -32.3, build(tr) {
    put(tr, mallet(N.A3, { len: 0.15, tau: 0.012, drop: 0.05, partials: [[2, 0.55, 0.75], [3.01, 0.14, 0.5]], tick: 0.12, tickLp: 1500, seed: 11 }), 0);
    return { soft: 2600 };
  } },
  /* наведение: едва слышный тик — крошечный синус и шорох */
  hover: { len: 0.122, ch: 1, kbps: 64, lufs: -38.7, build(tr) {
    put(tr, mallet(N.E5, { len: 0.08, tau: 0.0045, drop: 0.015, partials: [[2, 0.12, 0.6]], tick: 0.35, tickLp: 2200, seed: 3 }), 0);
    return { soft: 3200 };
  } },
  /* открыть: подъём — ре подтягивается вверх, следом ля; воздух маленькой комнаты */
  open: { len: 0.327, ch: 1, kbps: 64, lufs: -26.9, build(tr) {
    put(tr, mallet(N.D4, { len: 0.3, tau: 0.034, drop: -0.04, glide: 0.035, partials: [[2, 0.14, 0.5]], tick: 0.05, seed: 21 }), 0);
    put(tr, mallet(N.A4, { len: 0.24, tau: 0.024, drop: 0.01, partials: [[2, 0.08, 0.5]], tick: 0.03, seed: 22 }), 0.07, 0.5);
    return { reverb: { mix: 0.14, t60: 0.28 }, soft: 2400 };
  } },
  /* закрыть: зеркало открытия — тихая ля, потом ре оседает вниз */
  close: { len: 0.303, ch: 1, kbps: 64, lufs: -27.8, build(tr) {
    put(tr, mallet(N.A4, { len: 0.2, tau: 0.02, drop: 0.01, partials: [[2, 0.24, 0.5]], tick: 0.03, seed: 31 }), 0, 0.65);
    put(tr, mallet(N.D4, { len: 0.25, tau: 0.028, drop: 0.045, glide: 0.035, partials: [[2, 0.4, 0.5]], tick: 0.04, seed: 32 }), 0.045);
    return { reverb: { mix: 0.12, t60: 0.26 }, soft: 3600 };
  } },
  /* раскрыть: три ноты вверх (ре, фа-диез, ля), слева направо */
  expand: { len: 0.327, ch: 2, kbps: 96, lufs: -26.7, build(tr) {
    [[N.D4, 0, 1, -0.18], [N.Fs4, 0.045, 0.82, 0], [N.A4, 0.09, 0.8, 0.18]].forEach(([f, at, g, pan], i) =>
      put(tr, mallet(f, { len: 0.23, tau: 0.024, drop: 0.012, partials: [[2, 0.1, 0.5]], tick: 0.04, seed: 41 + i }), at, g, pan));
    return { reverb: { mix: 0.13, t60: 0.28 }, soft: 2600 };
  } },
  /* свернуть: те же ноты вниз (ля, фа-диез, ре), справа налево; громче последняя — звук «укладывается» */
  collapse: { len: 0.311, ch: 2, kbps: 96, lufs: -27.1, build(tr) {
    [[N.A4, 0, 0.5, 0.18], [N.Fs4, 0.04, 0.72, 0], [N.D4, 0.08, 1, -0.18]].forEach(([f, at, g, pan], i) =>
      put(tr, mallet(f, { len: 0.22, tau: 0.026, drop: 0.012, partials: [[2, 0.1, 0.5]], tick: 0.04, seed: 51 + i }), at, g, pan));
    return { reverb: { mix: 0.12, t60: 0.26 }, soft: 2600 };
  } },
  /* включено: маленькая радостная пара — ля и выше неё ре, вторая громче */
  "toggle-on": { len: 0.268, ch: 1, kbps: 64, lufs: -29, build(tr) {
    put(tr, chime(N.A4, { len: 0.2, tau: 0.016, ratio: 2, index: 0.8, indexTau: 0.01 }), 0);
    put(tr, chime(N.D5, { len: 0.2, tau: 0.02, ratio: 2, index: 0.9, indexTau: 0.012 }), 0.055, 0.95);
    return { reverb: { mix: 0.06, t60: 0.15 }, soft: 3000 };
  } },
  /* вперёд: воздух нарастает и уходит вверх по высоте и чуть вправо */
  forward: { len: 0.278, ch: 2, kbps: 96, lufs: -28.6, build(tr) {
    const o = { len: 0.27, att: 0.1, tau: 0.018, sweep: 0.16, q: 1.3, lp: 1000 };
    const common = air(300, 760, { ...o, tone: 0.35, seed: 61 });
    const side = [air(300, 760, { ...o, seed: 62 }), air(300, 760, { ...o, seed: 63 })];
    for (let i = 0; i < common.length; i++) {
      const drift = Math.min(1, i / common.length / 0.6) * 0.14; // к концу звук смещается вправо
      tr.L[i] = (common[i] + 0.16 * side[0][i]) * (1 - drift);
      tr.R[i] = (common[i] + 0.16 * side[1][i]) * (1 + drift);
    }
    return { soft: 1800 };
  } },
  /* порыв (кнопка ветра): воздух налетает быстро и стихает, полоса шума плывёт вниз, проходит справа налево */
  swipe: { len: 0.319, ch: 2, kbps: 96, lufs: -30.7, build(tr) {
    const o = { len: 0.31, att: 0.016, rel: 0.12, sweep: 0.12, q: 2.2, lp: 620 };
    const common = air(470, 240, { ...o, tone: 0.5, seed: 71 });
    const side = [air(470, 240, { ...o, seed: 72 }), air(470, 240, { ...o, seed: 73 })];
    for (let i = 0; i < common.length; i++) {
      const drift = 0.14 - Math.min(1, i / common.length / 0.5) * 0.28; // справа налево
      tr.L[i] = (common[i] + 0.16 * side[0][i]) * (1 - drift);
      tr.R[i] = (common[i] + 0.16 * side[1][i]) * (1 + drift);
    }
    return { soft: 1600 };
  } },
  /* шаг ленты: маленькая ступенька вверх — два коротких тика колокольчика, си и ре */
  "progress-step": { len: 0.213, ch: 1, kbps: 64, lufs: -32.1, build(tr) {
    put(tr, chime(N.B4, { len: 0.12, tau: 0.009, ratio: 2, index: 0.7, indexTau: 0.006 }), 0);
    put(tr, chime(N.D5, { len: 0.14, tau: 0.01, ratio: 2, index: 0.7, indexTau: 0.006 }), 0.045, 0.8);
    return { reverb: { mix: 0.08, t60: 0.18 }, soft: 3000 };
  } },
  /* рамка поймала предмет: три ступени колокольчика вверх — фа-диез, ля, ре */
  checkpoint: { len: 0.434, ch: 1, kbps: 64, lufs: -28, build(tr) {
    [[N.Fs4, 0, 1], [N.A4, 0.09, 1], [N.D5, 0.18, 0.92]].forEach(([f, at, g], i) =>
      put(tr, chime(f, { len: 0.22, tau: i === 2 ? 0.032 : 0.024, ratio: 2, index: 0.9, indexTau: 0.012 }), at, g));
    return { reverb: { mix: 0.12, t60: 0.24 }, soft: 2800 };
  } },
};

/* ── файлы и замеры ───────────────────────────────────────────────────────── */

function writeWav(path, tr) {
  const ch = tr.R ? 2 : 1, data = Buffer.alloc(tr.n * ch * 4);
  for (let i = 0; i < tr.n; i++) {
    data.writeFloatLE(tr.L[i], i * ch * 4);
    if (tr.R) data.writeFloatLE(tr.R[i], i * 8 + 4);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(ch, 22); // 3 — IEEE float
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * ch * 4, 28); h.writeUInt16LE(ch * 4, 32); h.writeUInt16LE(32, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([h, data]));
}
const run = (cmd, argv) => {
  const r = spawnSync(cmd, argv, { encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.error) throw new Error(`${cmd} не запустился: ${r.error.message} (нужен ffmpeg в PATH)`);
  return r;
};
/** громкость по EBU R128 так же, как мерили прежние файлы: сигнал дополнен тишиной до 1 с, чтобы заполнить блоки 400 мс */
function loudness(file) {
  const s = run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "apad=whole_dur=1,ebur128=peak=true", "-f", "null", "-"]).stderr;
  const num = (re) => Number((s.match(re) || [])[1]);
  return { I: num(/Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+)/), tp: num(/True peak:\s*\n\s*Peak:\s*(-?[\d.]+)/) };
}
function decode(file, ch) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-f", "f32le", "-acodec", "pcm_f32le", "-ar", String(SR), "-ac", String(ch), "-"], { maxBuffer: 1 << 26 });
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength / 4);
}
const duration = (file) => Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).stdout.trim());
const encode = (wav, mp3, cue) =>
  run("ffmpeg", ["-v", "error", "-y", "-i", wav, "-c:a", "libmp3lame", "-b:a", `${cue.kbps}k`, "-ar", String(SR), "-ac", String(cue.ch), "-map_metadata", "-1", "-id3v2_version", "0", "-write_id3v1", "0", mp3]);
const db = (x) => 20 * Math.log10(Math.max(x, 1e-12));

/* ── сборка ───────────────────────────────────────────────────────────────── */

mkdirSync(OUT, { recursive: true });
if (KEEP_WAV) mkdirSync(KEEP_WAV, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), "sfx-synth-"));
const rows = [];
let failed = false;
try {
  for (const [name, cue] of Object.entries(CUES)) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    const tr = track(cue.len, cue.ch === 2);
    finish(tr, cue.build(tr) || {});
    // уровень: сначала пик на −12 dBFS, потом точная подгонка громкости по замеру WAV и ещё раз по готовому MP3
    let peak = 0;
    for (const x of [tr.L, tr.R]) if (x) for (const v of x) peak = Math.max(peak, Math.abs(v));
    const scale = (g) => { for (const x of [tr.L, tr.R]) if (x) for (let i = 0; i < x.length; i++) x[i] *= g; };
    scale(Math.pow(10, -12 / 20) / peak);
    const wav = join(KEEP_WAV || tmp, `${name}.wav`), mp3 = join(OUT, `${name}.mp3`);
    writeWav(wav, tr);
    scale(Math.pow(10, (cue.lufs - loudness(wav).I) / 20));
    let L;
    for (let pass = 0; pass < 3; pass++) {
      writeWav(wav, tr);
      encode(wav, mp3, cue);
      L = loudness(mp3);
      if (Math.abs(L.I - cue.lufs) <= 0.15) break;
      scale(Math.pow(10, (cue.lufs - L.I) / 20));
    }
    // проверки на том, что уйдёт на сайт
    const pcm = decode(mp3, cue.ch), n = pcm.length / cue.ch;
    let p = 0, dc = 0;
    for (const v of pcm) { p = Math.max(p, Math.abs(v)); dc += v; }
    dc /= pcm.length;
    const edge = (from, to) => { let m = 0; for (let i = from * cue.ch; i < to * cue.ch; i++) m = Math.max(m, Math.abs(pcm[i])); return m; };
    const ms = Math.round(SR / 1000);
    const head = edge(0, ms), tail = edge(n - ms, n), first = edge(0, 1), last = edge(n - 1, n);
    const dur = duration(mp3);
    const problems = [];
    if (db(p) > -1 || L.tp > -1) problems.push("пик выше −1 dBFS");
    if (Math.abs(dc) > 2e-4) problems.push(`постоянная составляющая ${dc.toExponential(1)}`);
    if (db(first) > -50 || db(last) > -50) problems.push("на краю не тишина");
    if (Math.abs(L.I - cue.lufs) > 1) problems.push(`громкость ${L.I} вместо ${cue.lufs}`);
    if (Math.abs(dur / cue.len - 1) > 0.3) problems.push(`длина ${dur.toFixed(3)} с вместо ${cue.len}`);
    if (problems.length) failed = true;
    rows.push({ cue: name, ch: cue.ch, kbps: cue.kbps, "len, s": `${cue.len} → ${dur.toFixed(3)}`, "LUFS": `${cue.lufs} → ${L.I}`, "peak dBFS": db(p).toFixed(1), "TP dBTP": L.tp, DC: dc.toExponential(1), "first / last dB": `${db(first).toFixed(0)} / ${db(last).toFixed(0)}`, "1 ms at ends dB": `${db(head).toFixed(0)} / ${db(tail).toFixed(0)}`, ok: problems.join("; ") || "да" });
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.table(rows);
if (failed) { console.error("есть сигналы, не прошедшие проверку"); process.exitCode = 1; }
