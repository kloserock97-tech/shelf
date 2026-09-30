import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import './uncertainty-slider.css';

/** low and high bound the central 90% */
export type Estimate = { mean: number; low: number; high: number };

type Props = {
  /** accessible name of the thumb */
  label: string;
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number;
  /** the ± shown at start: half of the 90% range */
  defaultSpread?: number;
  unit?: string;
  /** while dragging or pinching */
  onInput?: (v: Estimate) => void;
  /** when it settles */
  onChange?: (v: Estimate) => void;
};

const Z90 = 1.6449;
const Z50 = 0.6745;
const PAD = 12;
const TOP = 20;
const LOW = 36;
const WORDS: [number, string][] = [[0.1, 'Very sure'], [0.3, 'Fairly sure'], [0.6, 'Not so sure'], [Infinity, 'Rough guess']];
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const niceStep = (span: number) => {
  const raw = span / 6;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw;
};

/** An estimate with its confidence: sideways sets the value, the height of the peak sets how sure. */
export function UncertaintySlider({ label, min = 0, max = 30, step = 1, defaultValue = 12, defaultSpread = 3, unit = 'days', onInput, onChange }: Props) {
  const span = max - min;
  const lnMin = Math.log(step * 0.4);
  const lnMax = Math.log(span / 6);
  const decimals = (String(step).split('.')[1] || '').length;
  const snap = (v: number) => clamp(Math.round((v - min) / step) * step + min, min, max);
  const num = (v: number) => v.toFixed(decimals);

  const [mean, setMean] = useState(() => clamp(defaultValue, min, max));
  const [sigma, setSigma] = useState(() => Math.exp(clamp(Math.log(defaultSpread / Z90), lnMin, lnMax)));
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [grabbed, setGrabbed] = useState(false);
  const [pointerMode, setPointerMode] = useState(false);
  const plot = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const live = useRef({ mean, sigma });
  live.current = { mean, sigma };
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ ox: number; oy: number } | null>(null);
  const pinch = useRef<{ d: number; s: number } | null>(null);
  const anim = useRef(0);
  const hintId = useId();

  useEffect(() => {
    const el = plot.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(anim.current); };
  }, []);

  // geometry (for any mean and sigma, so handlers can use the live values)
  const W = size.w;
  const trackY = size.h - 12;
  const hMax = trackY - TOP;
  const X = (v: number) => PAD + ((v - min) / span) * (W - PAD * 2);
  const invX = (x: number) => min + ((x - PAD) / (W - PAD * 2)) * span;
  const peakH = (s: number) => hMax - ((Math.log(s) - lnMin) / (lnMax - lnMin)) * (hMax - LOW);
  const sigmaFromPeak = (y: number) => Math.exp(lnMin + clamp((hMax - (trackY - y)) / (hMax - LOW), 0, 1) * (lnMax - lnMin));
  const Y = (v: number) => trackY - peakH(sigma) * Math.exp(-0.5 * ((v - mean) / sigma) ** 2);
  const valueOf = (m: number, s: number): Estimate => {
    const sm = snap(m);
    const r = (v: number) => Math.round(v * 10) / 10;
    return { mean: sm, low: r(Math.max(min, sm - Z90 * s)), high: r(Math.min(max, sm + Z90 * s)) };
  };
  const commit = (m: number, s: number, done: boolean) => {
    setMean(m);
    setSigma(s);
    live.current = { mean: m, sigma: s };
    onInput?.(valueOf(m, s));
    if (done) onChange?.(valueOf(m, s));
  };

  const area = (a: number, b: number, n: number) => {
    a = clamp(a, min, max);
    b = clamp(b, min, max);
    if (b <= a || !W) return '';
    let d = `M${X(a).toFixed(1)},${trackY}`;
    for (let i = 0; i <= n; i++) {
      const v = a + ((b - a) * i) / n;
      d += `L${X(v).toFixed(1)},${Y(v).toFixed(1)}`;
    }
    return `${d}L${X(b).toFixed(1)},${trackY}Z`;
  };
  const curve = () => {
    if (!W) return '';
    const a = Math.max(min, mean - 4.5 * sigma);
    const b = Math.min(max, mean + 4.5 * sigma);
    let d = `M${X(a).toFixed(1)},${Y(a).toFixed(1)}`;
    for (let i = 1; i <= 96; i++) {
      const v = a + ((b - a) * i) / 96;
      d += `L${X(v).toFixed(1)},${Y(v).toFixed(1)}`;
    }
    return d;
  };
  const range = (z: number) => {
    const m = snap(mean);
    const lo = Math.max(min, m - z * sigma);
    const hi = Math.min(max, m + z * sigma);
    const f = (v: number) => (hi - lo >= 2 * step ? num(Math.round(v / step) * step) : v.toFixed(Math.max(1, decimals)));
    return `${f(lo)}–${f(hi)} ${unit}`;
  };

  const m = snap(mean);
  const h90 = Z90 * sigma;
  const half = h90 >= 2 ? String(Math.round(h90)) : String(Math.max(0.5, Math.round(h90 * 2) / 2));
  const word = WORDS.find(([k]) => h90 / Math.max(Math.abs(m), span * 0.1) < k)![1];
  const mx = W ? X(mean) : 0;
  const py = trackY - peakH(sigma);
  const tickStep = niceStep(span);
  const ticks: number[] = [];
  for (let v = Math.ceil(min / tickStep) * tickStep; v <= max + 1e-9; v += tickStep) ticks.push(v);

  // the legend for the vertical axis: above the peak when there is room, else beside it, past the curve
  useLayoutEffect(() => {
    const el = tip.current;
    if (!el || !W) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let off = 8;
    let top = py - h - 16;
    if (top < -6) {
      const f = clamp((peakH(sigma) - h / 2 - 2) / peakH(sigma), 0.02, 1);
      off = Math.max(20, Math.sqrt(-2 * Math.log(f)) * sigma * ((W - PAD * 2) / span) + 6);
      top = py - h / 2;
    }
    const left = mx + off + w > W ? mx - off - w : mx + off;
    el.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
  });

  const settle = () => {
    cancelAnimationFrame(anim.current);
    const from = live.current.mean;
    const to = snap(from);
    const s = live.current.sigma;
    if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) { setMean(to); onChange?.(valueOf(to, s)); return; }
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 200);
      setMean(from + (to - from) * (1 - (1 - k) ** 3));
      if (k < 1) anim.current = requestAnimationFrame(tick);
    };
    anim.current = requestAnimationFrame(tick);
    onChange?.(valueOf(to, s));
  };

  const local = (e: PointerEvent) => {
    const r = plot.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button > 0) return;
    e.preventDefault();
    setPointerMode(true);
    cancelAnimationFrame(anim.current);
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    const { mean: cm, sigma: cs } = live.current;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.max(20, Math.abs(a.x - b.x)), s: cs };
      drag.current = null;
      return;
    }
    thumb.current?.focus({ preventScroll: true });
    const p = local(e);
    const ty = trackY - peakH(cs);
    const near = Math.hypot(p.x - X(cm), p.y - ty) < 30;
    drag.current = { ox: near ? p.x - X(cm) : 0, oy: p.y - ty };
    setGrabbed(true);
    commit(near ? cm : clamp(invX(p.x), min, max), cs, false);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, local(e));
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const s = Math.exp(clamp(Math.log(pinch.current.s * (Math.max(20, Math.abs(a.x - b.x)) / pinch.current.d)), lnMin, lnMax));
      commit(live.current.mean, s, false);
    } else if (drag.current) {
      const p = local(e);
      commit(clamp(invX(p.x - drag.current.ox), min, max), sigmaFromPeak(p.y - drag.current.oy), false);
    }
  };
  const onRelease = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    if (pointers.current.size) {
      pinch.current = null;
      const p = [...pointers.current.values()][0];
      drag.current = { ox: p.x - X(live.current.mean), oy: p.y - (trackY - peakH(live.current.sigma)) };
      return;
    }
    drag.current = null;
    pinch.current = null;
    setGrabbed(false);
    settle();
  };
  // trackpad pinch arrives as ctrl + wheel; React's wheel listener is passive, so this one is attached by hand
  const wheelEnd = useRef(0);
  const onWheel = useRef<(e: globalThis.WheelEvent) => void>(() => {});
  onWheel.current = (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const s = Math.exp(clamp(Math.log(live.current.sigma) + e.deltaY * 0.01, lnMin, lnMax));
    commit(live.current.mean, s, false);
    clearTimeout(wheelEnd.current);
    wheelEnd.current = window.setTimeout(() => onChange?.(valueOf(live.current.mean, live.current.sigma)), 250);
  };
  useEffect(() => {
    const el = plot.current!;
    const fn = (e: globalThis.WheelEvent) => onWheel.current(e);
    el.addEventListener('wheel', fn, { passive: false });
    return () => el.removeEventListener('wheel', fn);
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    setPointerMode(false);
    const k = e.key;
    let nm = mean;
    let ns = sigma;
    const s = (lnMax - lnMin) / 12;
    const widen = (f: number) => { ns = Math.exp(clamp(Math.log(sigma) + f, lnMin, lnMax)); };
    if (e.shiftKey && (k === 'ArrowLeft' || k === 'ArrowRight')) widen(k === 'ArrowRight' ? s : -s);
    else if (k === 'ArrowUp') widen(-s * (e.shiftKey ? 3 : 1));
    else if (k === 'ArrowDown') widen(s * (e.shiftKey ? 3 : 1));
    else if (k === 'ArrowLeft') nm = mean - step;
    else if (k === 'ArrowRight') nm = mean + step;
    else if (k === 'PageDown') nm = mean - step * 5;
    else if (k === 'PageUp') nm = mean + step * 5;
    else if (k === 'Home') nm = min;
    else if (k === 'End') nm = max;
    else return;
    e.preventDefault();
    cancelAnimationFrame(anim.current);
    commit(snap(nm), ns, true);
  };

  const ty = trackY;
  return (
    <div className={`us${grabbed ? ' is-grabbed' : ''}${pointerMode ? ' is-pointer' : ''}`}>
      <div className="us-top">
        <div className="us-readout" aria-hidden="true">
          <span className="us-num">{num(m)}</span>
          <span className="us-pm">±</span>
          <span className="us-half">{half}</span>
          <span className="us-unit">{unit}</span>
        </div>
        <span className="us-word" aria-hidden="true">{word}</span>
      </div>
      <div ref={plot} className="us-plot" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onRelease} onPointerCancel={onRelease}>
        <svg className="us-svg" aria-hidden="true" focusable="false" viewBox={`0 0 ${W || 1} ${size.h || 1}`}>
          <path className="us-area90" d={area(mean - Z90 * sigma, mean + Z90 * sigma, 64)} />
          <path className="us-area50" d={area(mean - Z50 * sigma, mean + Z50 * sigma, 40)} />
          <path className="us-curve" d={curve()} />
          {W > 0 && (
            <>
              <line className="us-stem" x1={mx} y1={py} x2={mx} y2={ty} />
              <line className="us-rail" x1={PAD} y1={ty} x2={W - PAD} y2={ty} />
              <line className="us-bar90" x1={X(Math.max(min, mean - Z90 * sigma))} y1={ty} x2={X(Math.min(max, mean + Z90 * sigma))} y2={ty} />
              <line className="us-bar50" x1={X(Math.max(min, mean - Z50 * sigma))} y1={ty} x2={X(Math.min(max, mean + Z50 * sigma))} y2={ty} />
            </>
          )}
        </svg>
        <div className="us-guide" aria-hidden="true" style={{ transform: `translateX(${mx}px)`, top: TOP - 14, height: Math.max(0, ty - TOP + 14) }} />
        <div ref={tip} className="us-tip" aria-hidden="true"><span>↑ More sure</span><span>↓ Less sure</span></div>
        <div
          ref={thumb}
          className="us-thumb"
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={Number(num(m))}
          aria-valuetext={`${num(m)} ${unit}, give or take ${half}. 9 in 10 chance: ${range(Z90)}. ${word}.`}
          aria-describedby={hintId}
          style={{ transform: `translate(${mx}px, ${py}px)`, visibility: W ? 'visible' : 'hidden' }}
          onKeyDown={onKeyDown}
        />
      </div>
      <div className="us-axis" aria-hidden="true">
        {W > 0 && ticks.map((v) => <span key={v} style={{ left: X(v) }}>{num(v)}</span>)}
      </div>
      <p className="us-legend" aria-hidden="true">
        <span><i className="us-sw50" />1 in 2 chance <b>{range(Z50)}</b></span>
        <span><i className="us-sw90" />9 in 10 <b>{range(Z90)}</b></span>
      </p>
      <p className="us-sr" id={hintId}>Left and right arrows set the estimate. Up and down arrows, or Shift with left and right, set how sure you are.</p>
    </div>
  );
}
