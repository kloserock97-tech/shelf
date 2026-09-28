import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import './toc-capsule.css';

export type TocEntry = {
  /** id of the section heading on the page */
  id: string;
  label: string;
  icon?: ReactNode;
  /** nested entries: ids of <details> deep dives inside this section */
  children?: { id: string; label: string }[];
};

type Props = {
  sections: TocEntry[];
  /** the scrolling element; the window when omitted */
  scroller?: HTMLElement | null;
  /** a jump leaves this many px above the target (84 on the case page, under its top bar) */
  offset?: number;
  /** a heading above this line (px from the top) counts as being read */
  edge?: number;
  title?: string;
};

const pad = (n: number) => String(n).padStart(2, '0');
const byDocOrder = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
const ListIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" aria-hidden="true">
    <path d="M3 4.5h10M3 8h10M3 11.5h7" />
  </svg>
);

/** Floating contents capsule: current section, reading ring, a sheet with the page map. */
export function TocCapsule({ sections, scroller = null, offset = 84, edge = 150, title = 'Contents' }: Props) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const ids = useMemo(() => sections.flatMap((s) => [s.id, ...(s.children ?? []).map((c) => c.id)]), [sections]);

  /* Scroll-spy by position: the current section is the last heading that rose above the line.
     An IntersectionObserver misses the heading that a jump parks right under the top edge.
     A deep dive (<details>) counts only while it is open. */
  useEffect(() => {
    const view: HTMLElement | Window = scroller ?? window;
    let raf = 0;
    const update = () => {
      raf = 0;
      const pos = scroller ? scroller.scrollTop : window.scrollY;
      const max = scroller ? scroller.scrollHeight - scroller.clientHeight : document.documentElement.scrollHeight - window.innerHeight;
      button.current?.style.setProperty('--p', (max > 0 ? Math.min(1, pos / max) : 0).toFixed(4));
      const line = (scroller ? scroller.getBoundingClientRect().top : 0) + edge;
      const els = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el).sort(byDocOrder);
      let cur: string | null = null;
      for (const el of els) {
        if (el.getBoundingClientRect().top > line) break;
        if (!(el instanceof HTMLDetailsElement) || el.open) cur = el.id;
      }
      setCurrent(cur);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    view.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    document.addEventListener('toggle', onScroll, true); // <details> opened or closed: what counts has changed
    update();
    return () => {
      cancelAnimationFrame(raf);
      view.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('toggle', onScroll, true);
    };
  }, [scroller, edge, ids]);

  /* the capsule names the top-level entry: a deep dive shows the section it lives in */
  const k = sections.findIndex((s) => s.id === current || s.children?.some((c) => c.id === current));

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) button.current?.focus({ preventScroll: true });
  }, []);

  const jump = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el instanceof HTMLDetailsElement) el.open = true;
    close(false);
    const focusEl = el instanceof HTMLDetailsElement ? el.querySelector('summary') : el;
    if (focusEl && !(el instanceof HTMLDetailsElement) && !focusEl.hasAttribute('tabindex')) focusEl.setAttribute('tabindex', '-1');
    focusEl?.focus({ preventScroll: true });
    requestAnimationFrame(() => {
      const top = el.getBoundingClientRect().top - (scroller ? scroller.getBoundingClientRect().top : 0) + (scroller ? scroller.scrollTop : window.scrollY) - offset;
      (scroller ?? window).scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
  }, [scroller, offset, close]);

  /* focus moves into the sheet on open: the current entry, or the first one */
  useEffect(() => {
    if (!open) return;
    const a = panel.current?.querySelector<HTMLAnchorElement>('a.is-on') ?? panel.current?.querySelector<HTMLAnchorElement>('a');
    a?.focus({ preventScroll: true });
    a?.scrollIntoView({ block: 'nearest' });
  }, [open]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab' || !panel.current) return;
    const f = [...panel.current.querySelectorAll<HTMLElement>('a[href], button')];
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  };

  return (
    <>
      <button ref={button} type="button" className="toc-capsule" aria-haspopup="dialog" aria-expanded={open} aria-label={title} onClick={() => (open ? close() : setOpen(true))}>
        <ListIcon />
        <span className="toc-now"><b>{pad(Math.max(0, k) + 1)}</b><em>{k >= 0 ? sections[k].label : title}</em></span>
        <i className="toc-ring" aria-hidden="true" />
      </button>
      {open && (
        <div className="toc-sheet" role="dialog" aria-modal="true" aria-label={title} onKeyDown={onKey} onClick={(e) => e.target === e.currentTarget && close()}>
          <div ref={panel} className="toc-panel">
            <div className="toc-head"><b>{title}</b><button type="button" className="toc-close" aria-label="Close" onClick={() => close()}>×</button></div>
            <ol className="toc-list">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className={current === s.id ? 'is-on' : undefined} onClick={(e) => { e.preventDefault(); jump(s.id); }}>
                    {s.icon}<span>{pad(i + 1)}</span><em>{s.label}</em>
                  </a>
                  {s.children?.length ? (
                    <ol>
                      {s.children.map((c) => (
                        <li key={c.id}>
                          <a href={`#${c.id}`} className={current === c.id ? 'is-on' : undefined} onClick={(e) => { e.preventDefault(); jump(c.id); }}>{c.label}</a>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
