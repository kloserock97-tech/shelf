/* Nature ambience: not a recording but a small Web Audio graph, so it weighs nothing on the network and lives
   with the scene (gusts of wind are heard in the grass, the weather changes the sound).
   - wind: brown noise through two high-passes at 200 Hz and a low-pass, its level breathes on a random walk;
   - grass rustle: pink noise above 1.8 kHz, grows with the gusts;
   - birds: short phrases from one oscillator with pitch and level envelopes, in stereo, every 3–10 s;
     their nodes live only while a phrase sounds;
   - rain and crickets for the rain and dusk weather.
   A tonal "sunny" pad (sines at 110–165 Hz) used to sit under it all; without loud wind it droned, so it's gone.
   Everything is driven from update() about 10 times a second through setTargetAtTime, never from the frame loop.
   Create the AudioContext inside a user gesture (iOS wants resume() synchronously there), then call createAmbient. */

export type Weather = "clear" | "cloudy" | "rain" | "dusk";
export type AmbientState = {
  /** the scene's wind: ~1 normal, up to ~2.7 at the peak of a gust */
  wind: number;
  weather: Weather;
  /** 0 open … 1 muffled: the scene recedes behind something (a transition, an overlay) */
  muffle?: number;
  /** 0…1 overall presence: turn nature down where the page is about something else */
  level?: number;
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** a gust: 0.9 s up to 1.7 with an ease-out, then 2.5 s back down; t in seconds since it started */
export function gust(t: number) {
  if (t < 0 || t > 3.4) return 0;
  const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
  const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  return t < 0.9 ? 1.7 * easeOut(t / 0.9) : 1.7 * (1 - easeInOut((t - 0.9) / 2.5));
}

/** the wind multiplier of each weather: gustier in the rain */
export const windScale = (w: Weather) => 1 + (w === "rain" ? 0.8 : 0) + (w === "cloudy" || w === "rain" ? 0.15 : 0);

export function createAmbient(ctx: AudioContext) {
  const now = () => ctx.currentTime;
  const set = (p: AudioParam, v: number, tc = 0.35) => p.setTargetAtTime(v, now(), tc);

  /* ── output: a shared low-pass "muffles" everything on transitions, the master level fades in ── */
  const out = ctx.createGain();
  out.gain.value = 0;
  const muffle = ctx.createBiquadFilter();
  muffle.type = "lowpass";
  muffle.frequency.value = 16000;
  muffle.Q.value = 0.5;
  /* cut the infrasound and the DC of the noises on the master output: no hum in headphones */
  const sub = ctx.createBiquadFilter();
  sub.type = "highpass";
  sub.frequency.value = 45;
  muffle.connect(sub).connect(out).connect(ctx.destination);

  /* ── noise: 4 s of brown (wind) and pinkish (rustle, rain) noise, mono, generated once ── */
  const len = Math.floor(ctx.sampleRate * 4);
  const brown = ctx.createBuffer(1, len, ctx.sampleRate);
  const pink = ctx.createBuffer(1, len, ctx.sampleRate);
  {
    const b = brown.getChannelData(0), p = pink.getChannelData(0);
    let last = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      b[i] = last * 3.5;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      p[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
    }
    /* the loop seam: a short crossfade from the end into the start, so it doesn't click */
    const fade = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      b[len - fade + i] = b[len - fade + i] * (1 - k) + b[i] * k;
      p[len - fade + i] = p[len - fade + i] * (1 - k) + p[i] * k;
    }
  }
  const sources: AudioBufferSourceNode[] = [];
  const loop = (buf: AudioBuffer, rate: number, offset: number) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = rate;
    src.start(0, offset);
    sources.push(src);
    return src;
  };

  /* wind */
  const windLP = ctx.createBiquadFilter();
  windLP.type = "lowpass";
  windLP.frequency.value = 420;
  const windGain = ctx.createGain();
  windGain.gain.value = 0;
  /* cut the lows: brown noise keeps its energy at the bottom, and in a quiet wind it was heard as a drone.
     Two 200 Hz high-passes in a row (−24 dB/oct) leave the "hiss" of air at 200–700 Hz */
  const windHP = ctx.createBiquadFilter();
  windHP.type = "highpass";
  windHP.frequency.value = 200;
  const windHP2 = ctx.createBiquadFilter();
  windHP2.type = "highpass";
  windHP2.frequency.value = 200;
  loop(brown, 1, 0).connect(windHP).connect(windHP2).connect(windLP).connect(windGain).connect(muffle);

  /* grass rustle: stereo width from two slightly different copies of the noise */
  const rustleHP = ctx.createBiquadFilter();
  rustleHP.type = "highpass";
  rustleHP.frequency.value = 1800;
  const rustleLP = ctx.createBiquadFilter();
  rustleLP.type = "lowpass";
  rustleLP.frequency.value = 6500;
  const rustleGain = ctx.createGain();
  rustleGain.gain.value = 0;
  const merge = ctx.createChannelMerger(2);
  loop(pink, 1, 0.7).connect(merge, 0, 0);
  loop(pink, 0.97, 2.3).connect(merge, 0, 1);
  merge.connect(rustleHP).connect(rustleLP).connect(rustleGain).connect(muffle);

  /* rain: broad noise without the lows */
  const rainHP = ctx.createBiquadFilter();
  rainHP.type = "highpass";
  rainHP.frequency.value = 900;
  const rainGain = ctx.createGain();
  rainGain.gain.value = 0;
  loop(pink, 1.35, 1.1).connect(rainHP).connect(rainGain).connect(muffle);

  /* crickets: a ~4.3 kHz carrier chopped by pulses, two nodes for the whole time */
  const cricketGain = ctx.createGain();
  cricketGain.gain.value = 0;
  const cricketAM = ctx.createGain();
  cricketAM.gain.value = 0;
  const cricket = ctx.createOscillator();
  cricket.frequency.value = 4300;
  cricket.connect(cricketAM).connect(cricketGain).connect(muffle);
  cricket.start();

  /* ── birds: a phrase = one oscillator + envelopes + a panner, lives about a second ── */
  let birdsOn = 0; // 0…1: how "birdy" the moment is
  let birdVoices = 0;
  const bird = () => {
    if (birdVoices > 2 || birdsOn < 0.05) return;
    const t0 = now() + 0.05;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const pan = ctx.createStereoPanner();
    const lp = ctx.createBiquadFilter();
    osc.type = "sine";
    g.gain.value = 0;
    pan.pan.value = Math.random() * 1.4 - 0.7;
    lp.type = "lowpass";
    /* far birds are duller and quieter */
    const near = 0.35 + Math.random() * 0.65;
    lp.frequency.value = 3500 + near * 6000;
    const amp = 0.05 * near * birdsOn;
    const f = osc.frequency, a = g.gain;
    let t = t0;
    const kind = Math.random();
    if (kind < 0.45) {
      /* a trill: 5–9 notes with slides */
      const n = 5 + Math.floor(Math.random() * 5);
      const base = 2400 + Math.random() * 1400;
      f.setValueAtTime(base, t);
      for (let i = 0; i < n; i++) {
        const d = 0.06 + Math.random() * 0.07;
        const to = base * (0.8 + Math.random() * 0.6);
        f.linearRampToValueAtTime(to, t + d * 0.7);
        a.setValueAtTime(0, t);
        a.linearRampToValueAtTime(amp, t + 0.012);
        a.linearRampToValueAtTime(amp * 0.6, t + d * 0.6);
        a.linearRampToValueAtTime(0, t + d);
        t += d + 0.02 + Math.random() * 0.05;
      }
    } else if (kind < 0.8) {
      /* "tee-cha, tee-cha": pairs of falling notes */
      const hi = 4800 + Math.random() * 900, lo = hi * 0.78;
      const reps = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < reps; i++) {
        for (const [from, to] of [[hi * 1.04, hi], [lo * 1.05, lo * 0.94]]) {
          f.setValueAtTime(from, t);
          f.exponentialRampToValueAtTime(to, t + 0.07);
          a.setValueAtTime(0, t);
          a.linearRampToValueAtTime(amp * 0.8, t + 0.01);
          a.linearRampToValueAtTime(0, t + 0.08);
          t += 0.11;
        }
        t += 0.06;
      }
    } else {
      /* a long whistle with vibrato, a far-off oriole */
      const base = 1700 + Math.random() * 500;
      f.setValueAtTime(base, t);
      f.linearRampToValueAtTime(base * 1.25, t + 0.25);
      f.linearRampToValueAtTime(base * 0.92, t + 0.55);
      a.setValueAtTime(0, t);
      a.linearRampToValueAtTime(amp * 0.7, t + 0.08);
      a.linearRampToValueAtTime(amp * 0.5, t + 0.4);
      a.linearRampToValueAtTime(0, t + 0.6);
      t += 0.62;
    }
    osc.connect(g).connect(lp).connect(pan).connect(muffle);
    osc.start(t0);
    osc.stop(t + 0.05);
    birdVoices++;
    osc.onended = () => {
      birdVoices--;
      osc.disconnect(); g.disconnect(); lp.disconnect(); pan.disconnect();
    };
  };
  let birdTimer = 0;
  const scheduleBird = () => {
    birdTimer = window.setTimeout(() => {
      bird();
      /* sometimes a second bird answers */
      if (Math.random() < 0.3) window.setTimeout(bird, 500 + Math.random() * 900);
      scheduleBird();
    }, 2500 + Math.random() * 7000 / Math.max(0.3, birdsOn));
  };
  scheduleBird();

  /* crickets: a burst of 3–4 chirps every ~0.9 s, scheduled half a second ahead */
  let cricketsOn = 0;
  let cricketNext = 0;
  const scheduleCrickets = () => {
    if (cricketsOn < 0.05) return;
    const am = cricketAM.gain;
    while (cricketNext < now() + 1.2) {
      let t = Math.max(cricketNext, now() + 0.05);
      const n = 3 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) {
        am.setValueAtTime(0, t);
        am.linearRampToValueAtTime(1, t + 0.008);
        am.linearRampToValueAtTime(0, t + 0.03);
        t += 0.045;
      }
      cricketNext = t + 0.7 + Math.random() * 0.4;
    }
  };

  /* ── scene state → parameters, ~10 times a second ── */
  let breath = 0.5;
  let fadeIn = 0;
  const update = (st: AmbientState, dt: number) => {
    fadeIn = Math.min(1, fadeIn + dt / 3.5);
    breath = clamp01(breath + (Math.random() - 0.5) * dt * 0.9);
    const gusting = clamp01((st.wind - 1) / 1.6);
    const rain = st.weather === "rain" ? 1 : 0;
    const dusk = st.weather === "dusk" ? 1 : 0;
    const cloudy = st.weather === "cloudy" ? 1 : 0;
    const muffled = clamp01(st.muffle ?? 0);
    const presence = clamp01(st.level ?? 1);

    const level = Math.max(0.16, 1 - muffled) * presence;
    set(out.gain, 0.8 * level * fadeIn * fadeIn, 0.6);
    /* muffling closes the low-pass from 16 kHz down to 650 Hz along a curve, not a line */
    set(muffle.frequency, 16000 * Math.pow(1 - muffled, 2.2) + 650, 0.4);

    /* the wind used to be too loud; now it is a quiet bed of its own for each weather: clear barely there,
       cloudy more, rain hides it, dusk almost calm. It is mostly heard on a gust, then settles at once */
    const windBase = { clear: 0.05, cloudy: 0.1, rain: 0.03, dusk: 0.025 }[st.weather];
    const windTone = { clear: 520, cloudy: 620, rain: 480, dusk: 440 }[st.weather];
    set(windGain.gain, windBase * (0.8 + breath * 0.4) + gusting * 0.09, gusting > 0.05 ? 0.3 : 1.2);
    set(windLP.frequency, windTone + breath * 80 + gusting * 420, 0.8);
    const rustleBase = { clear: 0.006, cloudy: 0.011, rain: 0.003, dusk: 0.004 }[st.weather];
    set(rustleGain.gain, rustleBase * (0.7 + breath * 0.6) + gusting * 0.05, gusting > 0.05 ? 0.25 : 1);
    set(rainGain.gain, rain * 0.08, 1.2);
    birdsOn = (1 - rain) * (1 - dusk) * (1 - cloudy * 0.6) * (1 - muffled) * presence;
    cricketsOn = dusk * (1 - muffled) * presence;
    set(cricketGain.gain, cricketsOn * 0.012, 1);
    scheduleCrickets();
  };

  return {
    update,
    /** the master output, e.g. to tap an AnalyserNode */
    output: out,
    /** the layer gains, e.g. for level meters */
    layers: { wind: windGain, rustle: rustleGain, rain: rainGain, crickets: cricketGain },
    /** bird phrases sounding right now */
    get birds() { return birdVoices; },
    /** switch off: the master level to zero, then let the context sleep */
    fadeOut: () => {
      fadeIn = 0;
      out.gain.cancelScheduledValues(now());
      out.gain.setTargetAtTime(0, now(), 0.25);
    },
    dispose: () => {
      clearTimeout(birdTimer);
      for (const s of sources) s.stop();
      cricket.stop();
      out.disconnect();
    },
  };
}
