/* Earcon Kit: a set of interface sounds synthesised with Web Audio and composed from three "brand" settings.
   timbre — soft (felt mallet), glass (FM bell with an inharmonic partial) or wood (short bar with a click);
   key — every pitch comes from one pentatonic scale, so the sounds never clash with each other;
   character — 0 restrained … 1 playful: the motif (fewer notes, small steps → more notes, leaps), tempo, pitch
   glides, vibrato and grace notes.
   Each sound is a score (notes and filtered-noise sweeps) that compose() derives from the settings; the same score
   plays live (play) or renders offline into samples (render) for a waveform. No samples, no files. */

/* ── Hash Kit (items/hash-kit): our integer mixer and a seeded Weyl sequence through it ── */
const SALT = 0xb31c96c9;
function hashU(x) {
  x ^= x >>> 16; x = Math.imul(x, 0x3f9c86cb);
  x ^= x >>> 14; x = Math.imul(x, 0x1ae9dacf);
  x ^= x >>> 15;
  return x >>> 0;
}
function makeRandom(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s + SALT) >>> 0; return hashU(s) / 4294967296; };
}

export const SOUND_NAMES = ['tap', 'toggle-on', 'toggle-off', 'success', 'error', 'warning', 'notification', 'delete', 'undo', 'send', 'received'];
export const KEYS = ['C major', 'D major', 'E♭ major', 'F major', 'G major', 'A minor', 'C minor', 'E minor'];

/* partials: [frequency ratio, gain, share of the decay]; att and tau in seconds; lp — low-pass, wet — room */
export const TIMBRES = {
  soft: { label: 'Soft', octave: 5, att: 0.006, tau: 0.11, partials: [[1, 1, 1], [2, 0.16, 0.5], [3, 0.04, 0.3]], lp: 2400, wet: 0.16 },
  glass: {
    label: 'Glass', octave: 6, att: 0.002, tau: 0.18, partials: [[1, 1, 1], [2.76, 0.2, 0.45], [5.4, 0.07, 0.25]],
    fm: { ratio: 3.5, index: 2.2, tau: 0.05 }, lp: 9000, wet: 0.26
  },
  wood: {
    label: 'Wood', octave: 5, att: 0.001, tau: 0.065, partials: [[1, 1, 1], [3.93, 0.3, 0.35], [9.2, 0.08, 0.15]],
    click: { f: 2600, q: 1.4, v: 0.3, len: 0.006 }, lp: 5200, wet: 0.08
  }
};

const SCALES = { major: [0, 2, 4, 7, 9], minor: [0, 3, 5, 7, 10] };
const ROOTS = { C: 0, D: 2, 'E♭': 3, E: 4, F: 5, G: 7, A: 9, 'B♭': 10, B: 11 };

/* Motifs: [restrained, playful]. Notes: d — scale degree (0 = the key's root, may run past an octave), t / l — start
   and length in beats, v — velocity, g — pitch glide in semitones, r — a second voice detuned by r cents (beating,
   for unease). x — noise sweeps: t, l (beats), band from f0 to f1 Hz, q, v. */
const MOTIFS = {
  tap: [{ n: [{ d: 4, l: 0.5, v: 0.5 }] }, { n: [{ d: 5, l: 0.5, v: 0.6, g: 2 }] }],
  'toggle-on': [{ n: [{ d: 2, v: 0.6 }, { d: 4, t: 0.7, v: 0.7 }] }, { n: [{ d: 0, v: 0.55 }, { d: 2, t: 0.6, v: 0.65 }, { d: 5, t: 1.2, v: 0.75 }] }],
  'toggle-off': [{ n: [{ d: 4, v: 0.6 }, { d: 2, t: 0.7, v: 0.55 }] }, { n: [{ d: 5, v: 0.65 }, { d: 2, t: 0.6, v: 0.6 }, { d: 0, t: 1.2, v: 0.55 }] }],
  success: [
    { n: [{ d: 0, v: 0.6 }, { d: 2, t: 1, v: 0.65 }, { d: 4, t: 2, l: 3, v: 0.75 }] },
    { n: [{ d: 0, v: 0.6 }, { d: 2, t: 0.8, v: 0.65 }, { d: 4, t: 1.6, v: 0.7 }, { d: 7, t: 2.4, l: 4, v: 0.85 }], grace: true }
  ],
  error: [
    { n: [{ d: 1, l: 1.5, v: 0.7, r: 38 }, { d: -1, t: 1.5, l: 3, v: 0.75, r: 38 }], low: 1 },
    { n: [{ d: 2, v: 0.7, r: 30 }, { d: 1, t: 0.9, v: 0.7, r: 30 }, { d: -1, t: 1.8, l: 3, v: 0.8, g: -3, r: 30 }], low: 1 }
  ],
  warning: [{ n: [{ d: 3, v: 0.7 }, { d: 3, t: 1.3, v: 0.7 }] }, { n: [{ d: 3, v: 0.7 }, { d: 3, t: 0.9, v: 0.7 }, { d: 3, t: 1.8, v: 0.8, g: 1 }] }],
  notification: [{ n: [{ d: 2, l: 2, v: 0.6 }, { d: 5, t: 1.3, l: 4, v: 0.7 }] }, { n: [{ d: 2, v: 0.6 }, { d: 4, t: 0.7, v: 0.65 }, { d: 7, t: 1.4, l: 4, v: 0.75 }], grace: true }],
  delete: [
    { n: [{ d: 2, v: 0.6 }, { d: -2, t: 0.9, l: 2, v: 0.6 }], x: [{ t: 0, l: 2.2, f0: 2400, f1: 500, q: 1.2, v: 0.14 }] },
    { n: [{ d: 4, l: 2.5, v: 0.65, g: -12 }], x: [{ t: 0.2, l: 2.8, f0: 3200, f1: 350, q: 1.6, v: 0.2 }] }
  ],
  undo: [{ n: [{ d: 2, v: 0.6 }, { d: 0, t: 0.7, v: 0.55 }, { d: 2, t: 1.4, v: 0.65 }] }, { n: [{ d: 4, v: 0.6 }, { d: 2, t: 0.5, v: 0.55 }, { d: 0, t: 1, v: 0.55 }, { d: 4, t: 1.6, v: 0.7 }] }],
  send: [
    { n: [{ d: 2, t: 0.6, l: 1.5, v: 0.6, g: 5 }], x: [{ t: 0, l: 1.8, f0: 600, f1: 3600, q: 1.1, v: 0.12 }] },
    { n: [{ d: 0, v: 0.55 }, { d: 4, t: 0.5, v: 0.6 }, { d: 7, t: 1, l: 1.5, v: 0.7, g: 7 }], x: [{ t: 0.3, l: 1.8, f0: 700, f1: 5200, q: 1.3, v: 0.16 }], grace: true }
  ],
  received: [{ n: [{ d: 4, v: 0.6 }, { d: 2, t: 1, l: 3, v: 0.65 }] }, { n: [{ d: 5, v: 0.6 }, { d: 4, t: 0.6, v: 0.6 }, { d: 2, t: 1.2, l: 3, v: 0.7 }] }]
};

function parseKey(key) {
  const [name, mode] = String(key).split(' ');
  return { root: ROOTS[name] ?? 2, scale: SCALES[mode] || SCALES.major };
}
const midiOf = (deg, root, scale, base) => {
  const n = scale.length, o = Math.floor(deg / n), i = ((deg % n) + n) % n;
  return base + root + 12 * o + scale[i];
};
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

/** The score of one sound for the given settings: times and lengths in seconds. */
export function compose(name, { timbre = 'soft', key = 'D major', character = 0.3 } = {}) {
  const c = Math.max(0, Math.min(1, character));
  const tm = TIMBRES[timbre] || TIMBRES.soft;
  const motif = MOTIFS[name][c < 0.5 ? 0 : 1];
  const { root, scale } = parseKey(key);
  const base = 12 * (tm.octave + 1) - 12 * (motif.low || 0);
  const beat = 0.074 - 0.02 * c; // playful is quicker
  const notes = motif.n.map((n) => ({
    time: (n.t || 0) * beat,
    midi: midiOf(n.d, root, scale, base),
    len: n.l || 1,
    dur: (n.l || 1) * beat,
    vel: (n.v ?? 0.7) * (0.85 + 0.2 * c),
    glide: (n.g || 0) * (0.35 + 0.65 * c),
    rough: n.r || 0,
    vib: c > 0.75 && (n.l || 1) >= 3 ? 14 * (c - 0.75) * 4 : 0 // cents, on long notes only
  }));
  // very playful: a grace note one scale step under the first note
  if (motif.grace && c > 0.75) {
    const first = motif.n[0];
    notes.forEach((n) => (n.time += beat * 0.45));
    notes.unshift({ time: 0, midi: midiOf(first.d - 1, root, scale, base), len: 0.4, dur: beat * 0.4, vel: 0.35, glide: 0, rough: 0, vib: 0 });
  }
  const noise = (motif.x || []).map((x) => ({ time: x.t * beat, dur: x.l * beat, f0: x.f0, f1: x.f1, q: x.q, vel: x.v }));
  const tail = tm.att + tm.tau * 2.5; // down to about −22 dB
  const duration = Math.max(...notes.map((n) => n.time + n.dur * 0.5 + tail * Math.sqrt(n.len)), ...noise.map((x) => x.time + x.dur), 0.05);
  return { name, notes, noise, duration };
}

/* ── synthesis: one score into any AudioContext, live or offline ── */

const NOISE = (() => {
  const rnd = makeRandom(7), v = new Float32Array(44100);
  for (let i = 0; i < v.length; i++) v[i] = rnd() * 2 - 1;
  return v;
})();
const buffers = new WeakMap(); // per context: noise and the room's impulse response

function assets(ctx) {
  let a = buffers.get(ctx);
  if (a) return a;
  const noise = ctx.createBuffer(1, NOISE.length, 44100);
  noise.copyToChannel(NOISE, 0);
  // a small room: decaying noise, 0.7 s
  const len = Math.round(ctx.sampleRate * 0.7), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  [0, 1].forEach((ch) => {
    const rnd = makeRandom(11 + ch), d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / ctx.sampleRate;
      d[i] = (rnd() * 2 - 1) * Math.exp(-t / 0.16) * (1 - Math.exp(-t / 0.004));
    }
  });
  a = { noise, ir };
  buffers.set(ctx, a);
  return a;
}

/** input → (dry + room) → compressor → master → destination */
export function createBus(ctx, timbre = 'soft') {
  const input = ctx.createGain();
  const room = ctx.createConvolver();
  room.buffer = assets(ctx).ir;
  const wet = ctx.createGain();
  wet.gain.value = (TIMBRES[timbre] || TIMBRES.soft).wet;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.12;
  const master = ctx.createGain();
  input.connect(comp);
  input.connect(room).connect(wet).connect(comp);
  comp.connect(master).connect(ctx.destination);
  return { input, wet, master };
}

function envelope(param, t, att, tau, peak) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + att);
  param.setTargetAtTime(0, t + att, tau);
}

function playNote(ctx, out, n, tm, at) {
  const t = at + n.time;
  const f = hz(n.midi);
  const tau = tm.tau * Math.sqrt(Math.max(1, n.len));
  const end = t + tm.att + tau * 7 + n.dur;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = tm.lp;
  lp.Q.value = 0.4;
  lp.connect(out);
  const voices = n.rough ? [0, n.rough] : [0];
  let vibrato = null; // cents of detune, fading in over the note
  if (n.vib) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 6.2;
    vibrato = ctx.createGain();
    vibrato.gain.setValueAtTime(0, t);
    vibrato.gain.linearRampToValueAtTime(n.vib, t + n.dur);
    lfo.connect(vibrato);
    lfo.start(t); lfo.stop(end);
  }
  // partials above 0.45 of the sample rate would alias (and are clamped by the browser): skip them
  const limit = ctx.sampleRate * 0.45, bend = Math.max(1, Math.pow(2, n.glide / 12));
  for (const [ratio, gain, share] of tm.partials) {
    if (f * ratio * bend > limit) continue;
    for (const cents of voices) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(f * ratio, t);
      if (n.glide) o.frequency.exponentialRampToValueAtTime(f * ratio * Math.pow(2, n.glide / 12), t + tm.att + n.dur);
      o.detune.value = cents;
      if (vibrato) vibrato.connect(o.detune);
      const g = ctx.createGain();
      envelope(g.gain, t, tm.att, tau * share, (n.vel * gain * 0.32) / voices.length);
      o.connect(g).connect(lp);
      if (tm.fm && ratio === 1 && f * tm.fm.ratio * bend < limit) {
        // glass: a modulator whose index dies fast, so the strike is bright and the ring is pure
        const m = ctx.createOscillator();
        m.frequency.setValueAtTime(f * tm.fm.ratio, t);
        const mg = ctx.createGain();
        mg.gain.setValueAtTime(f * tm.fm.index, t);
        mg.gain.setTargetAtTime(0, t, tm.fm.tau);
        m.connect(mg).connect(o.frequency);
        m.start(t); m.stop(end);
      }
      o.start(t); o.stop(end);
    }
  }
  if (tm.click) noiseBurst(ctx, out, { time: n.time, dur: tm.click.len, f0: tm.click.f, f1: tm.click.f, q: tm.click.q, vel: tm.click.v * n.vel }, at, true);
}

function noiseBurst(ctx, out, x, at, hit = false) {
  const t = at + x.time;
  const src = ctx.createBufferSource();
  src.buffer = assets(ctx).noise;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = x.q;
  bp.frequency.setValueAtTime(x.f0, t);
  if (x.f1 !== x.f0) bp.frequency.exponentialRampToValueAtTime(x.f1, t + x.dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  if (hit) { g.gain.linearRampToValueAtTime(x.vel, t + 0.0008); g.gain.setTargetAtTime(0, t + 0.0008, x.dur / 3); }
  else { g.gain.linearRampToValueAtTime(x.vel, t + x.dur * 0.35); g.gain.linearRampToValueAtTime(0, t + x.dur); }
  src.connect(bp).connect(g).connect(out);
  src.start(t, (hashU(Math.round(t * 1000)) % 20000) / 44100);
  src.stop(t + x.dur + 0.05);
}

/** schedules a score at time `at` of ctx into node `out` */
export function schedule(ctx, out, score, timbre, at = ctx.currentTime + 0.01) {
  const tm = TIMBRES[timbre] || TIMBRES.soft;
  score.notes.forEach((n) => playNote(ctx, out, n, tm, at));
  score.noise.forEach((x) => noiseBurst(ctx, out, x, at));
}

/**
 * The kit: settings, a live AudioContext created on the first play() (call it from a click or key handler),
 * volume and mute, offline renders for waveforms and the settings as JSON.
 */
export function createEarconKit({ timbre = 'soft', key = 'D major', character = 0.3, volume = 0.7, muted = false } = {}) {
  const brand = { timbre, key, character };
  let ctx = null, bus = null, vol = volume, mute = muted, pausedByUs = false;

  const applyVolume = () => { if (bus) bus.master.gain.setTargetAtTime(mute ? 0 : vol * vol, ctx.currentTime, 0.015); };
  const onVis = () => {
    if (!ctx) return;
    if (document.hidden && ctx.state === 'running') { pausedByUs = true; ctx.suspend(); }
    else if (!document.hidden && pausedByUs) { pausedByUs = false; ctx.resume(); }
  };
  document.addEventListener('visibilitychange', onVis);

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC({ latencyHint: 'interactive' });
      bus = createBus(ctx, brand.timbre);
      applyVolume();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  return {
    get settings() { return { ...brand }; },
    get started() { return !!ctx; },
    get muted() { return mute; },
    get volume() { return vol; },
    /** plays a sound now; returns its length in seconds (0 when muted or without Web Audio) */
    play(name) {
      if (mute || !MOTIFS[name]) return 0;
      const c = ensure();
      if (!c) return 0;
      const score = compose(name, brand);
      schedule(c, bus.input, score, brand.timbre, c.currentTime + 0.012);
      return score.duration;
    },
    set(patch) {
      Object.assign(brand, patch);
      if (bus) bus.wet.gain.setTargetAtTime((TIMBRES[brand.timbre] || TIMBRES.soft).wet, ctx.currentTime, 0.02);
    },
    setVolume(v) { vol = Math.max(0, Math.min(1, v)); applyVolume(); },
    setMuted(m) { mute = !!m; applyVolume(); },
    compose: (name) => compose(name, brand),
    /** renders a sound offline (mono): { samples, sampleRate, duration } — for waveforms */
    async render(name, sampleRate = 22050) {
      const score = compose(name, brand);
      const len = Math.ceil((score.duration + 0.12) * sampleRate);
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!OAC) return { samples: new Float32Array(0), sampleRate, duration: score.duration };
      const off = new OAC(1, len, sampleRate);
      const b = createBus(off, brand.timbre);
      b.master.gain.value = 0.49;
      schedule(off, b.input, score, brand.timbre, 0.002);
      const out = await off.startRendering();
      return { samples: out.getChannelData(0), sampleRate, duration: score.duration };
    },
    /** everything needed to rebuild the set elsewhere: settings, the voice and every score */
    exportSettings() {
      const tm = TIMBRES[brand.timbre];
      const r = (v, k = 1000) => Math.round(v * k) / k;
      return {
        kit: 'earcon-kit',
        version: 1,
        settings: { ...brand, character: r(brand.character, 100), volume: r(vol, 100) },
        voice: { ...tm, label: undefined },
        sounds: Object.fromEntries(SOUND_NAMES.map((name) => {
          const s = compose(name, brand);
          return [name, {
            durationMs: Math.round(s.duration * 1000),
            notes: s.notes.map((n) => ({ timeMs: r(n.time * 1000, 10), midi: n.midi, hz: r(hz(n.midi), 100), durMs: r(n.dur * 1000, 10), velocity: r(n.vel), glide: r(n.glide, 100), detuneCents: n.rough, vibratoCents: r(n.vib, 10) })),
            noise: s.noise.map((x) => ({ timeMs: r(x.time * 1000, 10), durMs: r(x.dur * 1000, 10), bandHz: [x.f0, x.f1], q: x.q, velocity: x.vel }))
          }];
        }))
      };
    },
    destroy() { document.removeEventListener('visibilitychange', onVis); ctx?.close(); ctx = null; bus = null; }
  };
}
