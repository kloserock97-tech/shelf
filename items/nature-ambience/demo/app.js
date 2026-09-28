// items/nature-ambience/variants/ts/ambient.ts
var clamp01 = (x) => Math.min(1, Math.max(0, x));
function gust(t) {
  if (t < 0 || t > 3.4) return 0;
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const easeInOut = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  return t < 0.9 ? 1.7 * easeOut(t / 0.9) : 1.7 * (1 - easeInOut((t - 0.9) / 2.5));
}
var windScale = (w) => 1 + (w === "rain" ? 0.8 : 0) + (w === "cloudy" || w === "rain" ? 0.15 : 0);
function createAmbient(ctx2) {
  const now = () => ctx2.currentTime;
  const set = (p, v, tc = 0.35) => p.setTargetAtTime(v, now(), tc);
  const out = ctx2.createGain();
  out.gain.value = 0;
  const muffle2 = ctx2.createBiquadFilter();
  muffle2.type = "lowpass";
  muffle2.frequency.value = 16e3;
  muffle2.Q.value = 0.5;
  const sub = ctx2.createBiquadFilter();
  sub.type = "highpass";
  sub.frequency.value = 45;
  muffle2.connect(sub).connect(out).connect(ctx2.destination);
  const len = Math.floor(ctx2.sampleRate * 4);
  const brown = ctx2.createBuffer(1, len, ctx2.sampleRate);
  const pink = ctx2.createBuffer(1, len, ctx2.sampleRate);
  {
    const b = brown.getChannelData(0), p = pink.getChannelData(0);
    let last2 = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last2 = (last2 + 0.02 * w) / 1.02;
      b[i] = last2 * 3.5;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      p[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
    }
    const fade = Math.floor(ctx2.sampleRate * 0.05);
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      b[len - fade + i] = b[len - fade + i] * (1 - k) + b[i] * k;
      p[len - fade + i] = p[len - fade + i] * (1 - k) + p[i] * k;
    }
  }
  const sources = [];
  const loop = (buf, rate, offset) => {
    const src = ctx2.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = rate;
    src.start(0, offset);
    sources.push(src);
    return src;
  };
  const windLP = ctx2.createBiquadFilter();
  windLP.type = "lowpass";
  windLP.frequency.value = 420;
  const windGain = ctx2.createGain();
  windGain.gain.value = 0;
  const windHP = ctx2.createBiquadFilter();
  windHP.type = "highpass";
  windHP.frequency.value = 200;
  const windHP2 = ctx2.createBiquadFilter();
  windHP2.type = "highpass";
  windHP2.frequency.value = 200;
  loop(brown, 1, 0).connect(windHP).connect(windHP2).connect(windLP).connect(windGain).connect(muffle2);
  const rustleHP = ctx2.createBiquadFilter();
  rustleHP.type = "highpass";
  rustleHP.frequency.value = 1800;
  const rustleLP = ctx2.createBiquadFilter();
  rustleLP.type = "lowpass";
  rustleLP.frequency.value = 6500;
  const rustleGain = ctx2.createGain();
  rustleGain.gain.value = 0;
  const merge = ctx2.createChannelMerger(2);
  loop(pink, 1, 0.7).connect(merge, 0, 0);
  loop(pink, 0.97, 2.3).connect(merge, 0, 1);
  merge.connect(rustleHP).connect(rustleLP).connect(rustleGain).connect(muffle2);
  const rainHP = ctx2.createBiquadFilter();
  rainHP.type = "highpass";
  rainHP.frequency.value = 900;
  const rainGain = ctx2.createGain();
  rainGain.gain.value = 0;
  loop(pink, 1.35, 1.1).connect(rainHP).connect(rainGain).connect(muffle2);
  const cricketGain = ctx2.createGain();
  cricketGain.gain.value = 0;
  const cricketAM = ctx2.createGain();
  cricketAM.gain.value = 0;
  const cricket = ctx2.createOscillator();
  cricket.frequency.value = 4300;
  cricket.connect(cricketAM).connect(cricketGain).connect(muffle2);
  cricket.start();
  let birdsOn = 0;
  let birdVoices = 0;
  const bird = () => {
    if (birdVoices > 2 || birdsOn < 0.05) return;
    const t0 = now() + 0.05;
    const osc = ctx2.createOscillator();
    const g = ctx2.createGain();
    const pan = ctx2.createStereoPanner();
    const lp = ctx2.createBiquadFilter();
    osc.type = "sine";
    g.gain.value = 0;
    pan.pan.value = Math.random() * 1.4 - 0.7;
    lp.type = "lowpass";
    const near = 0.35 + Math.random() * 0.65;
    lp.frequency.value = 3500 + near * 6e3;
    const amp = 0.05 * near * birdsOn;
    const f = osc.frequency, a = g.gain;
    let t = t0;
    const kind = Math.random();
    if (kind < 0.45) {
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
    osc.connect(g).connect(lp).connect(pan).connect(muffle2);
    osc.start(t0);
    osc.stop(t + 0.05);
    birdVoices++;
    osc.onended = () => {
      birdVoices--;
      osc.disconnect();
      g.disconnect();
      lp.disconnect();
      pan.disconnect();
    };
  };
  let birdTimer = 0;
  const scheduleBird = () => {
    birdTimer = window.setTimeout(() => {
      bird();
      if (Math.random() < 0.3) window.setTimeout(bird, 500 + Math.random() * 900);
      scheduleBird();
    }, 2500 + Math.random() * 7e3 / Math.max(0.3, birdsOn));
  };
  scheduleBird();
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
        am.linearRampToValueAtTime(1, t + 8e-3);
        am.linearRampToValueAtTime(0, t + 0.03);
        t += 0.045;
      }
      cricketNext = t + 0.7 + Math.random() * 0.4;
    }
  };
  let breath = 0.5;
  let fadeIn = 0;
  const update = (st, dt) => {
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
    set(muffle2.frequency, 16e3 * Math.pow(1 - muffled, 2.2) + 650, 0.4);
    const windBase = { clear: 0.05, cloudy: 0.1, rain: 0.03, dusk: 0.025 }[st.weather];
    const windTone = { clear: 520, cloudy: 620, rain: 480, dusk: 440 }[st.weather];
    set(windGain.gain, windBase * (0.8 + breath * 0.4) + gusting * 0.09, gusting > 0.05 ? 0.3 : 1.2);
    set(windLP.frequency, windTone + breath * 80 + gusting * 420, 0.8);
    const rustleBase = { clear: 6e-3, cloudy: 0.011, rain: 3e-3, dusk: 4e-3 }[st.weather];
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
    get birds() {
      return birdVoices;
    },
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
    }
  };
}

// items/nature-ambience/variants/ts/main.ts
var $ = (sel) => document.querySelector(sel);
var play = $("[data-play]");
var note = $("[data-note]");
var viz = $("[data-viz]");
var g2d = viz.getContext("2d");
var ctx = null;
var engine = null;
var analyser = null;
var bins = new Uint8Array(0);
var playing = false;
var weather = "clear";
var gustAt = -10;
var muffle = 0;
var timer = 0;
var last = 0;
var tick = () => {
  if (!engine) return;
  const t = performance.now();
  const dt = Math.min(0.5, (t - last) / 1e3);
  last = t;
  engine.update({ wind: windScale(weather) + gust(t / 1e3 - gustAt), weather, muffle }, dt);
};
function start() {
  const AC = window.AudioContext ?? window.webkitAudioContext;
  if (!AC) {
    note.textContent = "Web Audio isn't available in this browser.";
    return;
  }
  ctx ??= new AC({ latencyHint: "playback" });
  void ctx.resume();
  if (!engine) {
    engine = createAmbient(ctx);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.82;
    analyser.minDecibels = -120;
    analyser.maxDecibels = -45;
    bins = new Uint8Array(analyser.frequencyBinCount);
    engine.output.connect(analyser);
  }
  playing = true;
  last = performance.now();
  clearInterval(timer);
  timer = window.setInterval(tick, 100);
  tick();
  paint();
}
function stop() {
  playing = false;
  clearInterval(timer);
  engine?.fadeOut();
  window.setTimeout(() => {
    if (!playing) void ctx?.suspend();
  }, 700);
  paint();
}
function paint() {
  play.setAttribute("aria-pressed", String(playing));
  play.querySelector("span").textContent = playing ? "Stop" : "Play";
  note.textContent = playing ? "Sound on. Try a gust, change the weather, muffle it." : "Sound starts only when you press Play.";
}
play.addEventListener("click", () => playing ? stop() : start());
$("[data-gust]").addEventListener("click", () => {
  gustAt = performance.now() / 1e3;
});
var slider = $("[data-muffle]");
slider.addEventListener("input", () => {
  muffle = Number(slider.value);
});
document.querySelectorAll("[data-weather]").forEach(
  (b) => b.addEventListener("click", () => {
    weather = b.dataset.weather;
    document.body.dataset.weather = weather;
    document.querySelectorAll("[data-weather]").forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
  })
);
document.addEventListener("visibilitychange", () => {
  if (!ctx) return;
  if (document.hidden) void ctx.suspend();
  else if (playing) void ctx.resume();
});
var meters = [...document.querySelectorAll("[data-meter]")];
var FULL = { wind: 0.2, rustle: 0.06, rain: 0.08, crickets: 0.012 };
var draw = () => {
  const w = viz.clientWidth, h = viz.clientHeight, k = Math.min(window.devicePixelRatio || 1, 2);
  if (viz.width !== Math.round(w * k)) {
    viz.width = Math.round(w * k);
    viz.height = Math.round(h * k);
  }
  g2d.setTransform(k, 0, 0, k, 0, 0);
  g2d.clearRect(0, 0, w, h);
  const accent = getComputedStyle(document.body).getPropertyValue("--accent").trim() || "#6fa35f";
  if (analyser && ctx) analyser.getByteFrequencyData(bins);
  const n = 48, gap = 3, bw = (w - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    let v = 0;
    if (analyser && ctx) {
      const f0 = 80 * Math.pow(12e3 / 80, i / n), f1 = 80 * Math.pow(12e3 / 80, (i + 1) / n);
      const a = Math.floor(f0 / ctx.sampleRate * 2 * bins.length), b = Math.max(a + 1, Math.floor(f1 / ctx.sampleRate * 2 * bins.length));
      for (let j = a; j < b; j++) v = Math.max(v, bins[j] ?? 0);
      v /= 255;
    }
    const bh = Math.max(2, v * h);
    g2d.fillStyle = accent;
    g2d.globalAlpha = 0.25 + 0.75 * v;
    g2d.beginPath();
    g2d.roundRect(i * (bw + gap), h - bh, bw, bh, Math.min(2, bw / 2));
    g2d.fill();
  }
  g2d.globalAlpha = 1;
  for (const m of meters) {
    const key = m.dataset.meter;
    const v = !engine ? 0 : key === "birds" ? engine.birds / 3 : engine.layers[key].gain.value / FULL[key];
    m.style.setProperty("--v", String(Math.min(1, v)));
  }
  requestAnimationFrame(draw);
};
paint();
requestAnimationFrame(draw);
Object.assign(window, { __ambience: { get state() {
  return ctx?.state ?? "none";
}, get engine() {
  return engine;
}, get bins() {
  return bins;
} } });
