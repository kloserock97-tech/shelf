import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import './bento-lightbox.css';

export type Screen = {
  src: string;
  width: number;
  height: number;
  /** alt text and caption; the first sentence is set in ink */
  caption: string;
  srcSet?: string;
  /** the screenshot already has a device frame: no rounding, a shadow along its outline */
  device?: boolean;
};

type Props = { images: Screen[]; title?: string; label?: string };

const MAX = 6; // past this the file has no more pixels to show

/** run-in: the first sentence (or the part before a colon) in ink, the rest in grey */
function runIn(text: string): ReactNode {
  const head = text.slice(0, 140);
  let cut = -1;
  for (const mark of [': ', '. ', '? ', '! ']) {
    const i = head.indexOf(mark);
    if (i > 12 && (cut < 0 || i < cut)) cut = i + mark.length - 1;
  }
  if (cut < 0 || cut >= text.length - 1) return text;
  return <><b className="bento-run">{text.slice(0, cut)}</b> {text.slice(cut + 1)}</>;
}

/** Bento grid of screens; a click opens a full-screen viewer with wheel, pinch and double-click zoom. */
export function BentoLightbox({ images, title, label = 'Screens' }: Props) {
  const [index, setIndex] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const z = useRef({ scale: 1, tx: 0, ty: 0 });

  /* scale and shift live in the picture's own transform: no re-render and no layout while a finger moves */
  const apply = (ease = false) => {
    const el = img.current, v = view.current;
    if (!el || !v) return;
    const { scale, tx, ty } = z.current;
    el.classList.toggle('is-eased', ease);
    el.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${scale.toFixed(3)})`;
    v.classList.toggle('is-zoom', scale > 1.01);
  };
  /* the frame can't be dragged past its edge */
  const hold = () => {
    const el = img.current, v = view.current;
    if (!el || !v) return;
    const r = v.getBoundingClientRect(), s = z.current;
    const mx = Math.max(0, (el.clientWidth * s.scale - r.width) / 2);
    const my = Math.max(0, (el.clientHeight * s.scale - r.height) / 2);
    s.tx = Math.min(mx, Math.max(-mx, s.tx));
    s.ty = Math.min(my, Math.max(-my, s.ty));
  };
  /* zoom k times around (cx, cy): the spot under the cursor or the fingers stays put */
  const zoomAt = (k: number, cx: number, cy: number, ease = false) => {
    const v = view.current;
    if (!v) return;
    const r = v.getBoundingClientRect(), s = z.current;
    const px = cx - r.left - r.width / 2, py = cy - r.top - r.height / 2;
    const to = Math.min(MAX, Math.max(1, s.scale * k));
    const f = to / s.scale;
    s.tx = px - (px - s.tx) * f;
    s.ty = py - (py - s.ty) * f;
    s.scale = to;
    if (s.scale <= 1.001) z.current = { scale: 1, tx: 0, ty: 0 };
    hold();
    apply(ease);
  };
  const reset = (ease = false) => { z.current = { scale: 1, tx: 0, ty: 0 }; apply(ease); };
  const zoomCentre = (k: number) => {
    const r = view.current?.getBoundingClientRect();
    if (r) zoomAt(k, r.left + r.width / 2, r.top + r.height / 2, true);
  };
  const go = (i: number) => setIndex((i + images.length) % images.length);

  useEffect(() => reset(), [index]); // a new screen opens unzoomed

  /* wheel needs a non-passive listener; fingers and mouse take one road: two points pinch, one drags a zoomed frame */
  useEffect(() => {
    const v = view.current, d = dialog.current;
    if (!v || !d) return;
    const pts = new Map<number, { x: number; y: number }>();
    let span = 0, dragging = false;
    const pair = () => [...pts.values()];
    const gap = () => { const [a, b] = pair(); return Math.hypot(a.x - b.x, a.y - b.y); };
    const mid = () => { const [a, b] = pair(); return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
    const wheel = (e: WheelEvent) => { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.0018), e.clientX, e.clientY); };
    const dbl = (e: globalThis.MouseEvent) => { e.preventDefault(); zoomAt(z.current.scale > 1.01 ? 1 / z.current.scale : 2.6, e.clientX, e.clientY, true); };
    const down = (e: PointerEvent) => {
      v.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { span = gap(); dragging = false; }
      else if (z.current.scale > 1.01) { dragging = true; v.classList.add('is-drag'); }
    };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 2) {
        const g = gap();
        if (span > 0) { const c = mid(); zoomAt(g / span, c.x, c.y); }
        span = g;
      } else if (dragging) {
        z.current.tx += dx; z.current.ty += dy;
        hold();
        apply();
      }
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) span = 0;
      if (pts.size === 0) { dragging = false; v.classList.remove('is-drag'); }
    };
    const closed = () => { reset(); opener.current?.focus({ preventScroll: true }); };
    v.addEventListener('wheel', wheel, { passive: false });
    v.addEventListener('dblclick', dbl);
    v.addEventListener('pointerdown', down);
    v.addEventListener('pointermove', move);
    v.addEventListener('pointerup', up);
    v.addEventListener('pointercancel', up);
    d.addEventListener('close', closed);
    return () => {
      v.removeEventListener('wheel', wheel);
      v.removeEventListener('dblclick', dbl);
      v.removeEventListener('pointerdown', down);
      v.removeEventListener('pointermove', move);
      v.removeEventListener('pointerup', up);
      v.removeEventListener('pointercancel', up);
      d.removeEventListener('close', closed);
    };
  }, []);

  /* a click on the field around the frame closes; on the frame itself it doesn't (checked by coordinates:
     with pointer capture on the view the click lands on the view either way) */
  const onBoxClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialog.current) return dialog.current.close();
    if ((e.target !== view.current && e.target !== img.current) || z.current.scale > 1.01 || !img.current) return;
    const r = img.current.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.current?.close();
  };
  /* Escape closes natively; arrows and + / − / 0 are extra */
  const onKey = (e: KeyboardEvent<HTMLDialogElement>) => {
    const keys: Record<string, () => void> = {
      ArrowLeft: () => go(index - 1), ArrowRight: () => go(index + 1),
      '+': () => zoomCentre(1.6), '=': () => zoomCentre(1.6), '-': () => zoomCentre(1 / 1.6), '0': () => reset(true)
    };
    if (keys[e.key] && (images.length > 1 || !e.key.startsWith('Arrow'))) { e.preventDefault(); keys[e.key](); }
  };

  const cur = images[index];
  return (
    <div className="bento">
      {title && <h3 className="bento-title">{title}</h3>}
      <div className="bento-grid">
        {images.map((im, i) => (
          <figure key={im.src} className="bento-item">
            <div className="bento-stage" style={{ '--ar': (im.width / im.height).toFixed(4) } as CSSProperties}>
              <button
                type="button"
                className={im.device ? 'bento-media is-device' : 'bento-media'}
                aria-label={`Open full size: ${im.caption}`}
                onClick={(e) => { opener.current = e.currentTarget; setIndex(i); dialog.current?.showModal(); closeBtn.current?.focus(); }}
              >
                <img src={im.src} srcSet={im.srcSet} sizes={im.srcSet ? '(max-width: 900px) 92vw, 500px' : undefined} alt={im.caption} width={im.width} height={im.height} loading="lazy" decoding="async" />
              </button>
            </div>
            <figcaption>{runIn(im.caption)}</figcaption>
          </figure>
        ))}
      </div>
      <dialog ref={dialog} className="lb" aria-label={label} onClick={onBoxClick} onKeyDown={onKey}>
        <div ref={view} className="lb-view">
          {/* the frame fills the screen here, so the largest file of the set is wanted */}
          <img ref={img} src={cur?.src} srcSet={cur?.srcSet} sizes={cur?.srcSet ? '100vw' : undefined} alt={cur?.caption ?? ''} draggable={false} />
        </div>
        <p className="lb-cap">{images.length > 1 && <span>{index + 1} / {images.length}</span>}{cur?.caption}</p>
        {images.length > 1 && (
          <>
            <button type="button" className="lb-btn lb-prev" aria-label="Previous screen" onClick={() => go(index - 1)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" /></svg></button>
            <button type="button" className="lb-btn lb-next" aria-label="Next screen" onClick={() => go(index + 1)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 4 6 6-6 6" /></svg></button>
          </>
        )}
        <button ref={closeBtn} type="button" className="lb-btn lb-close" aria-label="Close" onClick={() => dialog.current?.close()}>×</button>
      </dialog>
    </div>
  );
}
