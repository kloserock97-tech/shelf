import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import './before-after-slider.css';

export type Shot = { src: string; width: number; height: number; alt: string };

type Props = {
  before: Shot;
  after: Shot;
  /** names of the left and the right side */
  labels?: [string, string];
  /** starting position, percent of "before" shown */
  initial?: number;
  title?: string;
  caption?: string;
  /** accessible name of the slider */
  label?: string;
};

const ratio = (s: Shot) => s.width / s.height;
const clamp = (v: number) => Math.round(Math.min(100, Math.max(0, v)));

/** Two screens under one handle. One CSS variable (--pos) clips the "before" layer and moves the handle. */
export function BeforeAfterSlider({ before, after, labels = ['Before', 'After'], initial = 50, title, caption, label = 'Drag to compare' }: Props) {
  const [pos, setPos] = useState(clamp(initial));
  const box = useRef<HTMLDivElement>(null);
  const range = useRef<HTMLInputElement>(null);
  const down = useRef(false);

  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!down.current || !box.current) return;
    const r = box.current.getBoundingClientRect();
    setPos(clamp(((e.clientX - r.left) / r.width) * 100));
  };
  const img = (s: Shot) => (
    <img src={s.src} alt={s.alt} width={s.width} height={s.height} draggable={false} style={{ '--iar': ratio(s).toFixed(4) } as CSSProperties} />
  );

  return (
    <figure className="ba">
      {title && <h3 className="ba-title">{title}</h3>}
      <div
        ref={box}
        className="ba-box"
        style={{ '--ar': Math.min(ratio(before), ratio(after)).toFixed(4), '--pos': `${pos}%` } as CSSProperties}
        onPointerDown={(e) => {
          if (e.button > 0) return;
          e.preventDefault(); // no text selection, and the mousedown that follows won't pull focus to the body
          down.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          range.current?.focus({ preventScroll: true }); // after a drag the arrow keys carry on from here
          move(e);
        }}
        onPointerMove={move}
        onPointerUp={() => (down.current = false)}
        onPointerCancel={() => (down.current = false)}
      >
        <div className="ba-after">{img(after)}</div>
        <div className="ba-before">{img(before)}</div>
        <span className="ba-label ba-label--a">{labels[0]}</span>
        <span className="ba-label ba-label--b">{labels[1]}</span>
        <div className="ba-handle" aria-hidden="true"><i /></div>
        <input
          ref={range}
          className="ba-range"
          type="range"
          min={0}
          max={100}
          value={pos}
          aria-label={label}
          aria-valuetext={`${pos}% ${labels[0]}, ${100 - pos}% ${labels[1]}`}
          onChange={(e) => setPos(clamp(Number(e.target.value)))}
        />
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
