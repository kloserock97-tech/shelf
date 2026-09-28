import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import './side-project-card.css';

export type SideProject = {
  id: string;
  label: string;
  title: string;
  alt?: string;
  /** poster: the first frame of the clip */
  image: string;
  video?: { webm?: string; mp4?: string };
  kind: string;
  meta: string;
  stats: [string, string][];
  points: string[];
  /** inner SVG markup, viewBox 0 0 64 64 */
  glyph?: string;
  demo?: string;
  repo?: string;
};

type Props = { projects: SideProject[]; ceiling?: number; playOnTouch?: boolean };

const pad = (n: number) => String(n).padStart(2, '0');

export function SideProjectCard({ projects, ceiling = 16, playOnTouch = false }: Props) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [swap, setSwap] = useState<0 | 1 | -1>(0);
  const [playing, setPlaying] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const inView = useRef(true);
  const drag = useRef({ x: 0, y: 0, tracking: false, dragging: false, swipedAt: 0 });
  const moreId = useId();
  const n = projects[index];

  // read once, before the first render decides whether to attach a clip (SSR: no clip)
  const env = useRef<{ calm: boolean; phone: boolean } | null>(null);
  if (env.current === null) {
    env.current = typeof window === 'undefined'
      ? { calm: true, phone: false }
      : {
          calm: matchMedia('(prefers-reduced-motion: reduce)').matches
            || !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData,
          phone: matchMedia('(hover: none) and (pointer: coarse)').matches,
        };
  }
  const clip = !env.current.calm && !(env.current.phone && !playOnTouch) ? n.video : undefined;

  // the clip plays only while the card is visible and the tab is active
  const syncVideo = useCallback(() => {
    const v = videoRef.current;
    if (!v || !clip) return;
    const want = inView.current && !document.hidden;
    if (want && v.paused) v.play().catch(() => {});
    else if (!want && !v.paused) v.pause();
  }, [clip]);

  useEffect(() => {
    setPlaying(false);
    videoRef.current?.load();
    syncVideo();
  }, [n.id, syncVideo]);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const io = new IntersectionObserver(([e]) => { inView.current = e.isIntersecting; syncVideo(); });
    io.observe(card);
    document.addEventListener('visibilitychange', syncVideo);
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', syncVideo); };
  }, [syncVideo]);

  // Near the bottom of the window the open card rises, then its picture gives up to 38%, then the text scrolls inside
  const fit = useCallback(() => {
    const card = cardRef.current;
    const inner = innerRef.current;
    if (!card || !inner) return;
    const reset = () => {
      card.style.setProperty('--note-lift', '0');
      card.style.setProperty('--note-shrink', '0px');
      card.style.removeProperty('--note-max');
      card.classList.remove('is-tight');
    };
    if (!open || matchMedia('(max-width: 900px)').matches) return reset();
    const cs = getComputedStyle(card);
    const restTop = card.getBoundingClientRect().top - (parseFloat(cs.marginTop) || 0);
    const u = parseFloat(cs.getPropertyValue('--u')) || 1;
    const figure = 246 * u;
    const closed = (12 + 246 + 46) * u;
    const overflow = restTop + closed + inner.scrollHeight + ceiling - innerHeight;
    const room = Math.max(0, restTop - ceiling);
    card.style.setProperty('--note-lift', Math.max(0, Math.min(overflow, room)).toFixed(1));
    const shrink = Math.max(0, Math.min(overflow - room, figure * 0.38));
    card.style.setProperty('--note-shrink', `${shrink.toFixed(1)}px`);
    const tight = overflow - room - shrink > 1;
    card.classList.toggle('is-tight', tight);
    if (tight) card.style.setProperty('--note-max', `${Math.max(120, Math.floor(innerHeight - ceiling * 2 - closed + shrink))}px`);
    else card.style.removeProperty('--note-max');
  }, [open, ceiling]);
  useLayoutEffect(fit, [fit, index]);
  useEffect(() => {
    addEventListener('resize', fit);
    return () => removeEventListener('resize', fit);
  }, [fit]);

  // Escape and a click outside close the description
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onClick = (e: MouseEvent) => { if (!cardRef.current?.contains(e.target as Node)) setOpen(false); };
    addEventListener('keydown', onKey);
    addEventListener('click', onClick);
    return () => { removeEventListener('keydown', onKey); removeEventListener('click', onClick); };
  }, []);

  // preload the neighbours' posters in idle time
  useEffect(() => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
    idle(() => projects.slice(1).forEach((p) => { const i = new Image(); i.src = p.image; }));
  }, [projects]);

  // flip: fade and shift toward the flip, change the page, come back when the new poster is decoded
  const timer = useRef(0);
  const go = (step: 1 | -1) => {
    if (projects.length < 2) return;
    setSwap(step);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const next = (index + step + projects.length) % projects.length;
      setIndex(next);
      const img = new Image();
      let shown = false;
      const reveal = () => { if (!shown) { shown = true; requestAnimationFrame(() => setSwap(0)); } };
      img.onload = reveal;
      img.onerror = reveal;
      img.src = projects[next].image;
      if (img.complete) reveal();
      window.setTimeout(reveal, 900);
    }, 200);
  };

  const card = cardRef.current;
  const setDrag = (px: number | null) => {
    if (!card) return;
    if (px === null) { card.classList.remove('is-dragging'); card.style.removeProperty('--drag'); }
    else { card.classList.add('is-dragging'); card.style.setProperty('--drag', px.toFixed(1)); }
  };

  return (
    <article
      ref={cardRef}
      className={['note-card', n.demo && 'has-demo', open && 'is-open', playing && 'is-playing', swap !== 0 && 'is-swapping'].filter(Boolean).join(' ')}
      style={{ '--swap-dir': swap || 1 } as CSSProperties}
      aria-roledescription="carousel"
      aria-label="Side projects"
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      }}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' || (e.target as Element).closest('a, button')) return;
        drag.current = { ...drag.current, x: e.clientX, y: e.clientY, tracking: true, dragging: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d.tracking) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (!d.dragging) {
          if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
          d.dragging = true;
        }
        setDrag(Math.sign(dx) * Math.min(56, Math.abs(dx) * 0.45));
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        if (!d.tracking) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (d.dragging) d.swipedAt = performance.now();
        d.tracking = d.dragging = false;
        setDrag(null);
        if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.4) go(dx < 0 ? 1 : -1);
      }}
      onPointerCancel={() => { drag.current.tracking = drag.current.dragging = false; setDrag(null); }}
    >
      <figure
        className="note-hero"
        onClick={(e) => {
          const d = drag.current;
          if (d.dragging || performance.now() - d.swipedAt < 400 || !n.demo) return;
          if ((e.target as Element).closest('a, button')) return;
          linkRef.current?.click();
        }}
      >
        <span className="note-media">
          <img src={n.image} alt={n.alt ?? ''} decoding="async" />
          {clip && (
            <video key={n.id} ref={videoRef} muted loop playsInline preload="none" aria-hidden="true" tabIndex={-1} poster={n.image} onPlaying={() => setPlaying(true)}>
              {clip.webm && <source src={clip.webm} type="video/webm" />}
              {clip.mp4 && <source src={clip.mp4} type="video/mp4" />}
            </video>
          )}
        </span>
        <div className="note-deck" role="group" aria-label="Pages">
          <button className="note-deck__btn" type="button" aria-label="Previous project" onClick={(e) => { e.stopPropagation(); go(-1); }}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5 5.5 8l4.5 4.5" /></svg>
          </button>
          <span className="note-deck__count" aria-live="polite"><b>{pad(index + 1)}</b>/{pad(projects.length)}</span>
          <button className="note-deck__btn" type="button" aria-label="Next project" onClick={(e) => { e.stopPropagation(); go(1); }}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" /></svg>
          </button>
        </div>
        <figcaption className="note-cap">
          <span className="note-cap__text">
            <h2 className="note-cap__title">
              <a ref={linkRef} className="note-cap__link" href={n.demo} target="_blank" rel="noopener" aria-label={`Open demo: ${n.title}`}>{n.title}</a>
            </h2>
            <span className="note-cap__label">{n.label}</span>
          </span>
          <span className="note-cap__go" aria-hidden="true"><svg viewBox="0 0 12 12"><path d="M3 9 9 3" /><path d="M4.2 3H9v4.8" /></svg></span>
        </figcaption>
      </figure>
      <div className="note-more" id={moreId} aria-hidden={!open}>
        <div className="note-more__in" ref={innerRef}>
          <div className="note-head">
            <div className="note-head__text">
              <h3 className="note-kind">{n.kind}</h3>
              <p className="note-meta">{n.meta}</p>
            </div>
            {n.glyph && <span className="note-glyph" aria-hidden="true"><svg viewBox="0 0 64 64" dangerouslySetInnerHTML={{ __html: n.glyph }} /></span>}
          </div>
          <dl className="note-stats">
            {n.stats.slice(0, 3).map(([value, what]) => (
              <div key={what}><dd>{value}</dd><dt>{what}</dt></div>
            ))}
          </dl>
          <div className="note-body">{n.points.map((p) => <p key={p}>{p}</p>)}</div>
          {n.repo && <p className="note-links"><a href={n.repo} target="_blank" rel="noopener" tabIndex={open ? 0 : -1}>Source on GitHub ↗</a></p>}
        </div>
      </div>
      <button
        className="note-knob"
        type="button"
        aria-expanded={open}
        aria-controls={moreId}
        aria-label={open ? 'Close note' : `Open note: ${n.title}`}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 7.5 10 13l5.5-5.5" /></svg>
      </button>
    </article>
  );
}
