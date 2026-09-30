/* Audio Graph — a line or bar chart you can listen to.
   Value becomes pitch on a musical (logarithmic) scale, position becomes stereo pan, missing data is silence.
   Play sweeps the chart left to right; scrubbing with a pointer or the arrow keys plays the value under it;
   a spoken summary names the minimum, the maximum, the trend and the gaps. The synth is our own Web Audio graph:
   a sine with a quiet triangle an octave up, through a soft low-pass, an envelope and a panner. */

const SVG = 'http://www.w3.org/2000/svg';
const LOW_HZ = 220;   // lowest value → A3
const OCTAVES = 2;    // highest value → A5
const M = { top: 14, right: 12, bottom: 26, left: 40 };

const make = (name, attrs = {}, parent) => {
  const n = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  parent?.append(n);
  return n;
};

/** A tiny synth. Nothing is created until the first gesture calls wake(). */
export function createSynth() {
  let ctx = null;
  let master = null;
  let muted = false;
  const voices = new Set();

  function wake() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 3;
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(comp).connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /** One voice: sine + triangle an octave up → low-pass → envelope → pan. */
  function voice(pan = 0) {
    const osc = ctx.createOscillator();
    const over = ctx.createOscillator();
    const overGain = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    const env = ctx.createGain();
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    osc.type = 'sine';
    over.type = 'triangle';
    overGain.gain.value = 0.16;
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    lp.Q.value = 0.5;
    env.gain.value = 0;
    osc.connect(lp);
    over.connect(overGain).connect(lp);
    lp.connect(env);
    if (panner) { panner.pan.value = pan; env.connect(panner).connect(master); } else env.connect(master);
    const v = {
      osc, over, env, panner,
      freq(hz, at, glide) {
        for (const [o, k] of [[osc, 1], [over, 2]]) {
          if (glide) o.frequency.exponentialRampToValueAtTime(hz * k, at);
          else o.frequency.setValueAtTime(hz * k, at);
        }
      },
      start(at) { osc.start(at); over.start(at); },
      stop(at) {
        try { osc.stop(at); over.stop(at); } catch { /* already stopped */ }
      },
      kill() {
        const t = ctx.currentTime;
        env.gain.cancelScheduledValues(t);
        env.gain.setTargetAtTime(0, t, 0.012);
        v.stop(t + 0.08);
      }
    };
    voices.add(v);
    osc.onended = () => { voices.delete(v); env.disconnect(); };
    return v;
  }

  return {
    wake,
    get ctx() { return ctx; },
    get muted() { return muted; },
    setMuted(m) {
      muted = m;
      if (master) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.02);
    },
    /** A short tone: 8 ms attack, gone by about 150 ms. */
    blip(hz, pan = 0, at = 0, len = 0.12) {
      if (!ctx || muted) return;
      const t = Math.max(ctx.currentTime, at);
      const v = voice(pan);
      v.freq(hz, t);
      v.env.gain.setValueAtTime(0, t);
      v.env.gain.linearRampToValueAtTime(0.9, t + 0.008);
      v.env.gain.setTargetAtTime(0, t + len * 0.45, len * 0.25);
      v.start(t);
      v.stop(t + len + 0.2);
      return v;
    },
    voice,
    silence() { for (const v of voices) v.kill(); }
  };
}

const hz = (norm) => LOW_HZ * 2 ** (OCTAVES * norm);
const NOTES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
/** The nearest note name, e.g. 523 Hz → C5. */
export const noteOf = (f) => {
  const midi = Math.round(69 + 12 * Math.log2(f / 440));
  return `${NOTES[midi % 12]}${Math.floor(midi / 12) - 1}`;
};

/**
 * audioGraph(root, { points, labelX, labelY, format, summary, durationMs })
 *   points — [{ x, v }] in order; v = null is a gap (silence).
 *   Returns { setMode('line' | 'bars'), play(), pause(), speak() }.
 */
export function audioGraph(root, opts) {
  if (!opts?.points?.length) return null;
  const { labelX, labelY, format } = opts;
  const $ = (s) => root.querySelector(s);
  const plot = $('.ag__plot');
  const playBtn = $('.ag__play');
  const speakBtn = $('.ag__speak');
  const muteBtn = $('.ag__mute');
  const readValue = $('.ag__value');
  const readWhere = $('.ag__where');
  const readPitch = $('.ag__pitch');
  const summaryEl = $('.ag__summary');
  const synth = opts.synth ?? createSynth();
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let series = [];   // what is on screen: line points or bars
  let mode = 'line';
  let lo = 0;
  let hi = 1;
  let W = 0;
  let Hh = 0;
  let cursor = -1;   // index under the pointer / keys / playhead
  let play = null;   // { t0, from, dt, voice, raf, clock }
  let lastBlip = 0;
  let held = false;  // a frozen sweep (posters)

  try { synth.setMuted(localStorage.getItem('audio-graph:muted') === '1'); } catch { /* storage blocked */ }

  // bars: half-kilometre averages; a bar with less than half of its samples is a gap
  function barsOf(points, per) {
    const out = [];
    for (let i = 0; i + 1 < points.length; i += per) {
      const chunk = points.slice(i, i + per);
      const have = chunk.filter((p) => p.v !== null);
      out.push({ x: chunk[0].x, x2: points[Math.min(i + per, points.length - 1)].x, v: have.length * 2 >= chunk.length ? have.reduce((s, p) => s + p.v, 0) / have.length : null });
    }
    return out;
  }

  const svg = make('svg', { class: 'ag__svg', 'aria-hidden': 'true' }, plot);
  const uid = `ag${Math.random().toString(36).slice(2, 8)}`;
  const defs = make('defs', {}, svg);
  const clipDone = make('rect', { y: 0, height: '100%', x: 0 }, make('clipPath', { id: `${uid}-done` }, defs));
  const gGrid = make('g', { class: 'ag__grid' }, svg);
  const gDim = make('g', { class: 'ag__marks ag__marks--dim' }, svg);
  const gLit = make('g', { class: 'ag__marks', 'clip-path': `url(#${uid}-done)` }, svg);
  const gGaps = make('g', { class: 'ag__gaps' }, svg);
  const head = make('line', { class: 'ag__cursor' }, svg);
  const dot = make('circle', { class: 'ag__dot', r: 4.5 }, svg);

  let x = () => 0;
  let y = () => 0;
  const norm = (v) => (v - lo) / (hi - lo || 1);

  function layout() {
    const r = plot.getBoundingClientRect();
    if (!r.width || !r.height) return;
    W = r.width;
    Hh = r.height;
    svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`);
    const x0 = opts.points[0].x;
    const x1 = opts.points[opts.points.length - 1].x;
    const iw = W - M.left - M.right;
    const ih = Hh - M.top - M.bottom;
    x = (v) => M.left + ((v - x0) / (x1 - x0)) * iw;
    const ylo = Math.floor(lo / 10) * 10 - 10;
    const yhi = Math.ceil(hi / 10) * 10 + 5;
    y = (v) => M.top + (1 - (v - ylo) / (yhi - ylo)) * ih;

    gGrid.replaceChildren();
    for (let v = Math.ceil(ylo / 20) * 20; v <= yhi; v += 20) {
      make('line', { x1: M.left, x2: W - M.right, y1: y(v), y2: y(v) }, gGrid);
      make('text', { x: M.left - 8, y: y(v), class: 'ag__ylab' }, gGrid).textContent = String(v);
    }
    for (let k = Math.ceil(x0); k <= x1; k += 1) {
      if (k < x1 && x(x1) - x(k) < 40) continue; // leave room for the last label and its unit
      const t = make('text', { x: x(k), y: Hh - 8, class: 'ag__xlab' }, gGrid);
      t.textContent = k === x1 ? `${k} ${labelX}` : String(k);
      if (k === x1) t.classList.add('ag__xlab--end');
    }

    // marks twice: a dim copy, and a lit copy revealed up to the playhead
    for (const g of [gDim, gLit]) {
      g.replaceChildren();
      if (mode === 'line') {
        let d = '';
        series.forEach((p, i) => {
          if (p.v === null) return;
          const pen = i && series[i - 1].v !== null ? 'L' : 'M';
          d += `${pen}${x(p.x).toFixed(1)} ${y(p.v).toFixed(1)}`;
        });
        make('path', { d, class: 'ag__line' }, g);
      } else {
        const bw = Math.max(2, x(series[0].x2) - x(series[0].x) - 3);
        series.forEach((b) => {
          if (b.v === null) return;
          make('rect', { x: x(b.x) + 1.5, y: y(b.v), width: bw, height: Hh - M.bottom - y(b.v), rx: 2, class: 'ag__bar' }, g);
        });
      }
    }
    // gaps: a hatched band saying "no data"
    gGaps.replaceChildren();
    runsOfGaps().forEach(([a, b]) => {
      const gx = x(series[a].x);
      const gx2 = mode === 'bars' ? x(series[b].x2) : x(series[Math.min(b + 1, series.length - 1)].x);
      make('rect', { x: gx, y: M.top, width: Math.max(2, gx2 - gx), height: Hh - M.top - M.bottom, class: 'ag__gap' }, gGaps);
      make('text', { x: (gx + gx2) / 2, y: M.top + 12, class: 'ag__gap-label' }, gGaps).textContent = opts.gapLabel ?? 'No data';
    });
    head.setAttribute('y1', M.top);
    head.setAttribute('y2', Hh - M.bottom);
    drawCursor(cursor, play || held ? cursor : -1);
  }

  function runsOfGaps() {
    const runs = [];
    let start = -1;
    series.forEach((p, i) => {
      if (p.v === null && start < 0) start = i;
      if (p.v !== null && start >= 0) { runs.push([start, i - 1]); start = -1; }
    });
    if (start >= 0) runs.push([start, series.length - 1]);
    return runs;
  }

  const px = (i) => (mode === 'bars' ? (x(series[i].x) + x(series[i].x2)) / 2 : x(series[i].x));
  const pan = (i) => -0.7 + 1.4 * (i / Math.max(1, series.length - 1));

  function drawCursor(i, litUpTo = -1) {
    root.dataset.cursor = String(i >= 0);
    clipDone.setAttribute('width', litUpTo < 0 ? W : mode === 'bars' ? x(series[litUpTo].x2) : px(litUpTo));
    if (i < 0) {
      readWhere.textContent = opts.restWhere;
      readValue.textContent = opts.restValue;
      if (readPitch) readPitch.textContent = '';
      plot.setAttribute('aria-valuetext', `${opts.restWhere}, ${opts.restValue}`);
      return;
    }
    const p = series[i];
    const cx = px(i);
    head.setAttribute('x1', cx);
    head.setAttribute('x2', cx);
    dot.style.display = p.v === null ? 'none' : '';
    if (p.v !== null) { dot.setAttribute('cx', cx); dot.setAttribute('cy', y(p.v)); }
    readWhere.textContent = mode === 'bars' ? `${format.x(p.x)}–${format.x(p.x2)} ${labelX}` : `${format.x(p.x)} ${labelX}`;
    readValue.textContent = p.v === null ? (opts.gapLabel ?? 'No data') : `${Math.round(p.v)} ${labelY}`;
    if (readPitch) readPitch.textContent = p.v === null ? 'silence' : `sounds as ${noteOf(hz(norm(p.v)))}`;
    plot.setAttribute('aria-valuenow', String(i));
    plot.setAttribute('aria-valuetext', `${readWhere.textContent}, ${p.v === null ? opts.gapLabel ?? 'no data' : `${Math.round(p.v)} ${opts.spokenY ?? labelY}`}`);
  }

  // scrubbing: pointer and keys play the value under them
  function scrubTo(i, sound = true) {
    if (play) pause();
    i = Math.max(0, Math.min(series.length - 1, i));
    if (i === cursor) return;
    cursor = i;
    drawCursor(i);
    const v = series[i].v;
    const now = performance.now();
    if (sound && v !== null && synth.ctx && now - lastBlip > 40) {
      lastBlip = now;
      synth.blip(hz(norm(v)), pan(i));
    }
  }
  const indexAt = (clientX) => {
    const r = plot.getBoundingClientRect();
    const px0 = clientX - r.left;
    let best = 0;
    let bd = Infinity;
    series.forEach((_, i) => { const d = Math.abs(px(i) - px0); if (d < bd) { bd = d; best = i; } });
    return best;
  };
  const release = () => { if (play) return; cursor = -1; drawCursor(-1); };

  plot.addEventListener('pointerdown', (e) => { synth.wake(); scrubTo(indexAt(e.clientX)); });
  plot.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch' || e.buttons) scrubTo(indexAt(e.clientX)); });
  plot.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') release(); });
  plot.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') release(); });
  plot.addEventListener('keydown', (e) => {
    const at = cursor < 0 ? -1 : cursor;
    const big = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowRight') scrubTo(at < 0 ? 0 : at + big);
    else if (e.key === 'ArrowLeft') scrubTo(at < 0 ? series.length - 1 : at - big);
    else if (e.key === 'Home') scrubTo(0);
    else if (e.key === 'End') scrubTo(series.length - 1);
    else if (e.key === ' ' || e.key === 'Enter') { toggle(); }
    else return;
    synth.wake();
    e.preventDefault();
  });
  plot.addEventListener('blur', release);

  // the sweep: one voice gliding through the values; bars get one note each
  function toggle() { if (play) pause(); else start(); }
  function start() {
    const ctx = synth.wake();
    const from = cursor >= 0 && cursor < series.length - 1 ? cursor : 0;
    const dt = (opts.durationMs ?? 6000) / 1000 / series.length;
    const clock = ctx ? () => ctx.currentTime : () => performance.now() / 1000;
    const t0 = clock() + 0.06;
    play = { t0, from, dt, clock, voices: [] };
    if (ctx && !synth.muted) schedule(play);
    root.dataset.playing = 'true';
    playBtn.setAttribute('aria-pressed', 'true');
    playBtn.querySelector('.ag__play-label').textContent = 'Pause';
    const tick = () => {
      if (!play) return;
      const i = play.from + Math.floor((play.clock() - play.t0) / play.dt);
      if (i >= series.length) { pause(true); return; }
      if (i >= play.from && i !== cursor) { cursor = i; drawCursor(i, i); }
      play.raf = requestAnimationFrame(tick);
    };
    play.raf = requestAnimationFrame(tick);
  }
  function schedule(p) {
    const { t0, from, dt } = p;
    if (mode === 'bars') {
      for (let i = from; i < series.length; i++) {
        const v = series[i].v;
        if (v === null) continue;
        p.voices.push(synth.blip(hz(norm(v)), pan(i), t0 + (i - from) * dt, Math.min(0.2, dt * 0.8)));
      }
      return;
    }
    const v = synth.voice(pan(from));
    p.voices.push(v);
    const g = v.env.gain;
    let on = false;
    for (let i = from; i < series.length; i++) {
      const t = t0 + (i - from) * dt;
      const val = series[i].v;
      if (val === null) {
        if (on) { g.setTargetAtTime(0, t, 0.012); on = false; }
        continue;
      }
      if (!on) {
        v.freq(hz(norm(val)), t);
        g.setTargetAtTime(0.75, t, 0.012);
        on = true;
      } else v.freq(hz(norm(val)), t, true);
    }
    const end = t0 + (series.length - from) * dt;
    g.setTargetAtTime(0, end, 0.03);
    if (v.panner) {
      v.panner.pan.setValueAtTime(pan(from), t0);
      v.panner.pan.linearRampToValueAtTime(0.7, end);
    }
    v.start(t0);
    v.stop(end + 0.3);
  }
  function pause(done = false) {
    if (!play) return;
    cancelAnimationFrame(play.raf);
    for (const v of play.voices) v?.kill();
    play = null;
    root.dataset.playing = 'false';
    playBtn.setAttribute('aria-pressed', 'false');
    playBtn.querySelector('.ag__play-label').textContent = 'Play';
    if (done) { cursor = -1; drawCursor(-1); } else drawCursor(cursor, -1);
  }
  playBtn.addEventListener('click', toggle);

  // spoken summary: the same words are on the page
  function speak() {
    const text = summaryEl.textContent;
    if (!('speechSynthesis' in window) || synth.muted) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 1.02;
    speechSynthesis.speak(u);
  }
  speakBtn?.addEventListener('click', speak);
  if (speakBtn && !('speechSynthesis' in window)) speakBtn.hidden = true;

  function setMuted(m) {
    synth.setMuted(m);
    muteBtn?.setAttribute('aria-pressed', String(!m));
    if (m) { synth.silence(); if ('speechSynthesis' in window) speechSynthesis.cancel(); }
    try { localStorage.setItem('audio-graph:muted', m ? '1' : '0'); } catch { /* storage blocked */ }
  }
  muteBtn?.addEventListener('click', () => { synth.wake(); setMuted(!synth.muted); });
  muteBtn?.setAttribute('aria-pressed', String(!synth.muted));
  addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'm' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.target.closest('input, textarea')) setMuted(!synth.muted);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  // the first touch or key anywhere unlocks audio, so hover tones work afterwards
  const unlock = () => { synth.wake(); removeEventListener('pointerdown', unlock, true); removeEventListener('keydown', unlock, true); };
  addEventListener('pointerdown', unlock, true);
  addEventListener('keydown', unlock, true);

  function setMode(m) {
    pause();
    mode = m;
    series = m === 'bars' ? barsOf(opts.points, opts.barEvery ?? 5) : opts.points;
    root.dataset.mode = m;
    cursor = -1;
    plot.setAttribute('aria-valuemin', '0');
    plot.setAttribute('aria-valuemax', String(series.length - 1));
    layout();
  }

  const vals = opts.points.filter((p) => p.v !== null).map((p) => p.v);
  lo = Math.min(...vals);
  hi = Math.max(...vals);
  new ResizeObserver(layout).observe(plot);
  setMode('line');
  if (calm) root.dataset.calm = 'true';

  return {
    setMode, play: start, pause, speak, setMuted,
    /** Draw the sweep frozen at index i (posters). */
    freeze(i) { held = true; cursor = i; drawCursor(i, i); root.dataset.playing = 'true'; }
  };
}

/** Words for the summary: min, max, trend (least squares) and gaps. */
export function describe(points, { name, unit, spokenUnit = unit, xUnit, fmtX = (v) => String(v) }) {
  const have = points.filter((p) => p.v !== null);
  if (!have.length) return `${name}. No data.`;
  const min = have.reduce((a, p) => (p.v < a.v ? p : a));
  const max = have.reduce((a, p) => (p.v > a.v ? p : a));
  const n = have.length;
  const mx = have.reduce((s, p) => s + p.x, 0) / n;
  const my = have.reduce((s, p) => s + p.v, 0) / n;
  const slope = have.reduce((s, p) => s + (p.x - mx) * (p.v - my), 0) / have.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  const trend = Math.abs(slope) < 0.5 ? 'flat' : slope > 0 ? 'rising' : 'falling';
  const gaps = [];
  let a = null;
  points.forEach((p, i) => {
    if (p.v === null && a === null) a = points[Math.max(0, i - 1)].x;
    if (p.v !== null && a !== null) { gaps.push([a, p.x]); a = null; }
  });
  const parts = [
    `${name}.`,
    `Lowest ${Math.round(min.v)} ${spokenUnit} at ${xUnit} ${fmtX(min.x)}.`,
    `Highest ${Math.round(max.v)} at ${xUnit} ${fmtX(max.x)}.`,
    `Trend: ${trend}${trend === 'flat' ? '' : `, about ${Math.abs(slope).toFixed(0)} ${spokenUnit} per ${xUnit}`}.`
  ];
  for (const [g0, g1] of gaps) parts.push(`No signal from ${xUnit} ${fmtX(g0)} to ${fmtX(g1)}.`);
  return parts.join(' ');
}
