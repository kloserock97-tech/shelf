import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import './liquid-lens.css';

export type SegmentOption = { value: string; label: string };

type Props = {
  /** accessible name of the group */
  label: string;
  options: SegmentOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string, index: number) => void;
  /** 'refract' bends the labels at the rim with an SVG displacement map, 'blur' is the light fallback */
  lens?: 'refract' | 'blur';
};

const X_K = 900, X_Z = 0.78;
const L_K = 520, L_Z = 0.9;
const S_K = 620, S_Z = 0.28;
const LIFT_SCALE = 0.15;
const MAGNIFY = 0.12;
const BLEED = 12;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Capsule displacement map: near the rim each pixel samples from further out (R = x, G = y, 128 = none). */
function capsuleMap(w: number, h: number, band: number, bleed: number) {
  const s = 2;
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round((w + bleed * 2) * s));
  c.height = Math.max(2, Math.round((h + bleed * 2) * s));
  const g = c.getContext('2d')!;
  const img = g.createImageData(c.width, c.height);
  const r = h / 2;
  for (let j = 0; j < c.height; j++) {
    for (let i = 0; i < c.width; i++) {
      const px = (i + 0.5) / s - bleed;
      const py = (j + 0.5) / s - bleed;
      const vx = px - clamp(px, r, w - r);
      const vy = py - r;
      const d = Math.hypot(vx, vy) || 1;
      const inward = r - d;
      const f = inward < 0 || inward >= band ? 0 : (1 - inward / band) ** 1.6;
      const k = (j * c.width + i) * 4;
      img.data[k] = 128 + (vx / d) * f * 127;
      img.data[k + 1] = 128 + (vy / d) * f * 127;
      img.data[k + 2] = 128;
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}

/** A segmented control whose thumb is flat at rest and becomes a glass lens only while it is held. */
export function LiquidLensSegmented({ label, options, value, defaultValue, onChange, lens }: Props) {
  const n = options.length;
  const initial = Math.max(0, options.findIndex((o) => o.value === (value ?? defaultValue)));
  const [index, setIndex] = useState(initial);
  const [pointerMode, setPointerMode] = useState(false);
  const [mode] = useState<'refract' | 'blur'>(() => lens ?? (typeof navigator !== 'undefined' && /Apple/.test(navigator.vendor) ? 'blur' : 'refract'));
  const id = `lls-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const root = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const glass = useRef<SVGGElement>(null);
  const mirror = useRef<SVGGElement>(null);
  const segRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const st = useRef({ x: 0, vx: 0, tx: 0, lift: 0, vl: 0, lt: 0, sq: 0, vs: 0, segW: 0, h: 0, raf: 0, last: 0, index: initial, drag: null as null | { id: number; off: number } });
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  const maxX = () => (n - 1) * st.current.segW;
  const rubber = (v: number) => {
    const R = st.current.segW * 0.32;
    if (v < 0) return -R * (-v / (-v + R));
    if (v > maxX()) return maxX() + R * ((v - maxX()) / (v - maxX() + R));
    return v;
  };

  const paint = () => {
    const s = st.current;
    const t = thumb.current;
    if (!t || !mirror.current || !glass.current) return;
    const motion = !reduce();
    const over = s.x < 0 ? -s.x : s.x > maxX() ? s.x - maxX() : 0;
    const stretch = Math.min(0.1, Math.abs(s.vx) / 5000) + (s.segW ? over / s.segW : 0) * 0.5;
    const k = 1 + (motion ? LIFT_SCALE * s.lift : 0);
    t.style.transform = `translateX(${s.x.toFixed(2)}px) scale(${(k * (1 + 0.5 * s.sq + stretch)).toFixed(4)}, ${(k * (1 - 0.5 * s.sq - 0.6 * stretch)).toFixed(4)})`;
    t.style.setProperty('--lift', s.lift.toFixed(3));
    const m = 1 + (motion ? MAGNIFY * s.lift : 0);
    const ox = BLEED + s.segW / 2 - m * (s.x + s.segW / 2);
    const oy = BLEED + s.h / 2 - m * (s.h / 2);
    mirror.current.setAttribute('transform', `translate(${ox.toFixed(2)} ${oy.toFixed(2)}) scale(${m.toFixed(4)})`);
    const on = s.lift > 0.02;
    if (mode === 'refract') {
      svg.current?.querySelector('feDisplacementMap')?.setAttribute('scale', (s.lift * 0.5 * s.h).toFixed(2));
      if (on) glass.current.setAttribute('filter', `url(#${id})`);
      else glass.current.removeAttribute('filter');
    } else {
      glass.current.style.filter = on ? `blur(${(0.5 * s.lift).toFixed(2)}px)` : '';
    }
  };

  const frame = (now: number) => {
    const s = st.current;
    const dt = Math.min(1 / 30, (now - s.last) / 1000 || 1 / 60);
    s.last = now;
    for (let i = 0; i < 2; i++) {
      const h = dt / 2;
      const spring = (p: number, v: number, target: number, k: number, z: number): [number, number] => {
        const nv = v + (-k * (p - target) - 2 * Math.sqrt(k) * z * v) * h;
        return [p + nv * h, nv];
      };
      [s.x, s.vx] = spring(s.x, s.vx, s.tx, X_K, X_Z);
      [s.lift, s.vl] = spring(s.lift, s.vl, s.lt, L_K, L_Z);
      [s.sq, s.vs] = spring(s.sq, s.vs, 0, S_K, S_Z);
      s.lift = clamp(s.lift, 0, 1.2);
    }
    const settled = !s.drag && Math.abs(s.x - s.tx) < 0.05 && Math.abs(s.vx) < 1 && Math.abs(s.lift - s.lt) < 0.002 && Math.abs(s.vl) < 0.02 && Math.abs(s.sq) < 0.001 && Math.abs(s.vs) < 0.02;
    if (settled) {
      Object.assign(s, { x: s.tx, vx: 0, lift: s.lt, vl: 0, sq: 0, vs: 0, raf: 0 });
      paint();
      return;
    }
    paint();
    s.raf = requestAnimationFrame(frame);
  };
  const kick = () => {
    const s = st.current;
    if (reduce()) {
      Object.assign(s, { x: s.tx, vx: 0, sq: 0, vs: 0, lift: s.lt ? 0.6 : 0 });
      paint();
      return;
    }
    if (!s.raf) {
      s.last = performance.now();
      s.raf = requestAnimationFrame(frame);
    }
  };

  const choose = (i: number, focus: boolean) => {
    const s = st.current;
    i = clamp(i, 0, n - 1);
    const changed = i !== s.index;
    s.index = i;
    s.tx = i * s.segW;
    setIndex(i);
    if (focus) segRefs.current[i]?.focus({ preventScroll: true });
    if (changed) onChange?.(options[i].value, i);
  };

  // follow a controlled value
  useEffect(() => {
    if (value == null) return;
    const i = options.findIndex((o) => o.value === value);
    if (i >= 0 && i !== st.current.index) {
      st.current.index = i;
      st.current.tx = i * st.current.segW;
      st.current.lt = 0;
      setIndex(i);
      kick();
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = root.current!;
    const measure = () => {
      const s = st.current;
      const b = segRefs.current[0];
      if (!b) return;
      s.segW = b.offsetWidth;
      s.h = b.offsetHeight;
      el.style.setProperty('--lls-seg-w', `${s.segW}px`);
      const W = s.segW + BLEED * 2;
      const H = s.h + BLEED * 2;
      const sv = svg.current!;
      sv.setAttribute('width', String(W));
      sv.setAttribute('height', String(H));
      sv.setAttribute('viewBox', `0 0 ${W} ${H}`);
      for (const node of sv.querySelectorAll('filter, feImage, rect')) {
        for (const [k, v] of Object.entries({ x: 0, y: 0, width: W, height: H })) node.setAttribute(k, String(v));
      }
      sv.querySelectorAll('text').forEach((t, k) => {
        t.setAttribute('x', ((k + 0.5) * s.segW).toFixed(2));
        t.setAttribute('y', (s.h / 2).toFixed(2));
      });
      if (mode === 'refract' && s.segW && s.h) sv.querySelector('feImage')!.setAttribute('href', capsuleMap(s.segW, s.h, Math.min(s.h * 0.42, 16), BLEED));
      s.tx = s.index * s.segW;
      if (!s.drag) { s.x = s.tx; s.vx = 0; }
      paint();
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(st.current.raf); };
  }, [n, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const localX = (e: PointerEvent) => {
    const el = root.current!;
    return e.clientX - el.getBoundingClientRect().left - el.clientLeft - parseFloat(getComputedStyle(el).paddingLeft);
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const s = st.current;
    if (e.button > 0 || !s.segW) return;
    e.preventDefault();
    setPointerMode(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    const px = localX(e);
    s.drag = { id: e.pointerId, off: px >= s.x && px <= s.x + s.segW ? px - s.x : s.segW / 2 };
    s.tx = rubber(px - s.drag.off);
    s.lt = 1;
    kick();
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = st.current;
    if (!s.drag || e.pointerId !== s.drag.id) return;
    s.tx = rubber(localX(e) - s.drag.off);
    if (reduce()) { s.x = s.tx = clamp(s.tx, 0, maxX()); paint(); } else kick();
  };
  const onRelease = (e: PointerEvent<HTMLDivElement>) => {
    const s = st.current;
    if (!s.drag || e.pointerId !== s.drag.id) return;
    s.drag = null;
    if (e.type === 'pointerup') choose(Math.round(clamp(s.tx + (reduce() ? 0 : s.vx * 0.06), 0, maxX()) / s.segW), true);
    else s.tx = s.index * s.segW; // the page took the gesture: go back, choose nothing
    s.lt = 0;
    s.vs += reduce() ? 0 : 3.2;
    kick();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    setPointerMode(false);
    const cur = st.current.index;
    let i = cur;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') i = (cur + 1) % n;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') i = (cur - 1 + n) % n;
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = n - 1;
    else return;
    e.preventDefault();
    st.current.lt = 0;
    choose(i, true);
    kick();
  };
  // screen-reader activation arrives as a click without a pointer
  const onClick = (e: MouseEvent<HTMLButtonElement>, i: number) => {
    if (e.detail !== 0) return;
    choose(i, true);
    kick();
  };

  return (
    <div
      ref={root}
      className={`lls${pointerMode ? ' is-pointer' : ''}`}
      role="radiogroup"
      aria-label={label}
      data-lens={mode}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onRelease}
      onPointerCancel={onRelease}
      onLostPointerCapture={onRelease}
      onKeyDown={onKeyDown}
    >
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(b) => { segRefs.current[i] = b; }}
          type="button"
          className="lls-seg"
          role="radio"
          aria-checked={i === index}
          tabIndex={i === index ? 0 : -1}
          value={o.value}
          onClick={(e) => onClick(e, i)}
        >
          {o.label}
        </button>
      ))}
      <div ref={thumb} className="lls-thumb" aria-hidden="true">
        <div className="lls-plate" />
        <div className="lls-clip">
          <svg ref={svg} className="lls-lens" focusable="false">
            <filter id={id} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
              <feImage result="map" x="0" y="0" preserveAspectRatio="none" />
              <feDisplacementMap in="SourceGraphic" in2="map" scale="0" xChannelSelector="R" yChannelSelector="G" />
            </filter>
            <g ref={glass} className="lls-glass">
              <rect className="lls-bleed" />
              <g ref={mirror} className="lls-mirror">
                {options.map((o) => <text key={o.value}>{o.label}</text>)}
              </g>
            </g>
          </svg>
        </div>
        <div className="lls-rim" />
      </div>
    </div>
  );
}
