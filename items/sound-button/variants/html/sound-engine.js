// UI cue player for the Sound Button, loaded only after sound is first turned on.
// Our own pre-rendered MP3 files (made by the synth variant, sfx-synth.mjs), not runtime synthesis: on the site synthesis cost 9–55 ms of JS per cue,
// a frame hitch on a weak phone. The files weigh 1–5 KB and decodeAudioData runs off the main thread.
// They load one per idle slot (all at once gave a scroll hitch); frequent cues are throttled,
// and no more than four voices play at once.
window.createSoundEngine = function createSoundEngine(ctx, { base = 'sfx/', bus } = {}) {
  // default loudness of each cue; the second argument of cue() is a share of it
  const SFX = { press: 0.2, 'toggle-on': 0.2, 'toggle-off': 0.18, close: 0.17, expand: 0.16, select: 0.16 };
  // cues that reuse another file
  const FILE = { 'toggle-off': 'close', select: 'press' };
  // minimum gap between two plays of one cue, ms; 60 when not listed (the site: hover 140, progress-step 180)
  const COOLDOWN = {};
  const LEVEL = 0.9;

  const out = ctx.createGain();
  out.gain.value = LEVEL;
  out.connect(ctx.destination);

  const buffers = new Map();
  const load = (name) => {
    let b = buffers.get(name);
    if (!b) {
      b = fetch(`${base}${name}.mp3`)
        .then((r) => r.arrayBuffer())
        .then((ab) => ctx.decodeAudioData(ab))
        .then((buf) => { buffers.set(name, buf); return buf; })
        .catch(() => null);
      buffers.set(name, b);
    }
    return Promise.resolve(b);
  };
  const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 400));
  const queue = [...new Set(Object.keys(SFX).map((c) => FILE[c] || c))];
  const next = () => {
    const name = queue.shift();
    if (name) idle(() => load(name).then(next));
  };
  next();

  const lastAt = new Map();
  let voices = 0;
  const play = (name, volume = 1) => {
    if (ctx.state !== 'running' || voices >= 4 || !(name in SFX)) return;
    const t = performance.now();
    if (t - (lastAt.get(name) ?? -1e9) < (COOLDOWN[name] ?? 60)) return;
    lastAt.set(name, t);
    const buf = buffers.get(FILE[name] || name);
    // not loaded yet: skip the cue rather than play it late
    if (!(buf instanceof AudioBuffer)) { load(FILE[name] || name); return; }
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buf;
    g.gain.value = SFX[name] * volume * 2.2;
    src.connect(g).connect(out);
    voices++;
    src.onended = () => { voices--; src.disconnect(); g.disconnect(); };
    src.start();
  };
  if (bus) bus.setImpl(play);

  return {
    load: (cue) => load(FILE[cue] || cue),
    fadeIn: () => { out.gain.cancelScheduledValues(ctx.currentTime); out.gain.setTargetAtTime(LEVEL, ctx.currentTime, 0.05); },
    fadeOut: () => { out.gain.cancelScheduledValues(ctx.currentTime); out.gain.setTargetAtTime(0, ctx.currentTime, 0.25); },
    dispose: () => { if (bus) bus.setImpl(null); },
  };
};
