import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import './work-menu.css';

/* Work mega menu: a trigger and a dark "Templates" dropdown. Categories come from the data (every project has a
   `kind`), the count next to a category is how many projects stay. Opens on hover (mouse, 60 ms) and on click
   (finger, keyboard); closes 220 ms after the cursor left both the trigger and the panel, on Esc and on a click
   outside. The category switches only on click: on hover it would change under the cursor on its way to the cards. */

type Filter = 'all' | 'web' | 'mobile';
const FILTERS: Filter[] = ['all', 'web', 'mobile'];

export type Project = {
  id: string;
  title: string;
  tag: string;
  kind: Exclude<Filter, 'all'>[];
  href?: string;
  look: { stage: [string, string]; ink: string; accent: string };
  object: { src: string; ratio: number };
};

type Props = {
  projects: Project[];
  label?: string;
  labels?: Partial<Record<'all' | 'web' | 'mobile' | 'filters' | 'note' | 'allCases', string>>;
  onAll?: () => void;
  className?: string;
};

const pad = (n: number) => String(n).padStart(2, '0');
const INK = 'fill="#1d1d1f"';
/* placeholder product screens: a web dashboard and a phone app in the project's accent (currentColor) */
const webScreen = `<svg viewBox="0 0 320 200" style="color:var(--accent)"><rect width="320" height="200" fill="#fff"/><rect width="62" height="200" fill="currentColor" opacity=".07"/><rect x="12" y="16" width="26" height="8" rx="4" fill="currentColor"/>${[40, 56, 72, 88, 104].map((y, i) => `<rect x="12" y="${y}" width="${i === 1 ? 38 : 30}" height="5" rx="2.5" ${INK} opacity="${i === 1 ? 0.5 : 0.16}"/>`).join('')}<rect x="76" y="16" width="86" height="9" rx="4.5" ${INK} opacity=".82"/><rect x="266" y="14" width="40" height="13" rx="6.5" fill="currentColor"/>${[76, 154, 232].map((x, i) => `<rect x="${x}" y="38" width="72" height="42" rx="7" fill="currentColor" opacity="${i ? 0.07 : 0.14}"/><rect x="${x + 9}" y="47" width="26" height="5" rx="2.5" ${INK} opacity=".35"/><rect x="${x + 9}" y="59" width="${36 - i * 6}" height="11" rx="3" ${INK} opacity=".8"/>`).join('')}<rect x="76" y="92" width="150" height="94" rx="8" ${INK} opacity=".035"/><polyline points="86,170 104,158 122,162 140,142 158,148 176,124 194,130 214,108" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>${[98, 118, 138, 158].map((y) => `<rect x="236" y="${y}" width="70" height="12" rx="4" ${INK} opacity=".07"/>`).join('')}</svg>`;
const phoneScreen = `<svg viewBox="0 0 180 390" preserveAspectRatio="xMidYMin slice" style="color:var(--accent)"><rect width="180" height="390" fill="#f6f6f4"/><rect x="16" y="14" width="22" height="6" rx="3" ${INK} opacity=".7"/><rect x="138" y="14" width="26" height="6" rx="3" ${INK} opacity=".5"/><rect x="16" y="40" width="96" height="12" rx="6" ${INK} opacity=".85"/><rect x="16" y="58" width="64" height="7" rx="3.5" ${INK} opacity=".3"/><rect x="16" y="80" width="148" height="92" rx="16" fill="currentColor"/><rect x="30" y="96" width="54" height="7" rx="3.5" fill="#fff" opacity=".7"/><rect x="30" y="112" width="84" height="18" rx="5" fill="#fff"/><rect x="30" y="146" width="120" height="12" rx="6" fill="#fff" opacity=".28"/><rect x="30" y="146" width="78" height="12" rx="6" fill="#fff" opacity=".85"/>${[190, 238, 286].map((y) => `<rect x="16" y="${y}" width="148" height="38" rx="10" fill="#fff"/><circle cx="36" cy="${y + 19}" r="9" fill="currentColor" opacity=".18"/><rect x="54" y="${y + 11}" width="70" height="6" rx="3" ${INK} opacity=".7"/><rect x="54" y="${y + 22}" width="46" height="5" rx="2.5" ${INK} opacity=".25"/>`).join('')}<rect x="0" y="340" width="180" height="50" fill="#fff"/>${[30, 70, 110, 150].map((x, i) => `<circle cx="${x}" cy="360" r="6" fill="${i ? '#1d1d1f' : 'currentColor'}" opacity="${i ? 0.2 : 1}"/>`).join('')}</svg>`;

const Arrow = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 17 17 7" />
    <path d="M8.5 7H17v8.5" />
  </svg>
);

export function WorkMenu({ projects, label = 'Work', labels, onAll, className }: Props) {
  const L = { all: 'All', web: 'Web', mobile: 'Mobile', filters: 'Filter projects', note: 'Selected projects, 2023–2026', allCases: 'All case studies', ...labels };
  const id = useId();
  const [open, setOpenState] = useState(false);
  const [filter, setFilterState] = useState<Filter>('all');
  const [shown, setShown] = useState<Filter>('all'); // the set on screen: it changes after the grid has faded out
  const [filtering, setFiltering] = useState(false);
  const [pos, setPos] = useState<CSSProperties>({});
  const trigger = useRef<HTMLAnchorElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLUListElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const t = useRef({ open: 0, close: 0, filter: 0, rail: 0, openedAt: 0 });
  const isOpen = useRef(false);

  const counts = Object.fromEntries(FILTERS.map((f) => [f, f === 'all' ? projects.length : projects.filter((p) => p.kind.includes(f)).length])) as Record<Filter, number>;

  /* the panel stands under the trigger, centred on it, never past the window edge */
  const place = useCallback(() => {
    const tr = trigger.current?.getBoundingClientRect();
    if (!tr) return;
    const top = tr.bottom + 10;
    if (innerWidth <= 900) { setPos({ top, ['--wm-top' as string]: `${top}px` }); return; }
    const pw = panel.current?.offsetWidth ?? 1040, margin = 16, centre = tr.left + tr.width / 2;
    const left = Math.min(Math.max(centre - pw / 2, margin), innerWidth - pw - margin);
    setPos({ top, left, ['--origin-x' as string]: `${centre - left}px` });
  }, []);

  const setOpen = useCallback((on: boolean) => {
    clearTimeout(t.current.close);
    clearTimeout(t.current.open);
    if (on === isOpen.current) return;
    isOpen.current = on;
    if (on) { place(); t.current.openedAt = performance.now(); }
    setOpenState(on);
  }, [place]);
  const closeSoon = () => { clearTimeout(t.current.open); clearTimeout(t.current.close); t.current.close = window.setTimeout(() => setOpen(false), 220); };

  /* the grid fades for a moment, changes its set and shows again with a cascade */
  const setFilter = (next: Filter) => {
    if (next === filter) return;
    setFilterState(next);
    setFiltering(true);
    clearTimeout(t.current.filter);
    t.current.filter = window.setTimeout(() => {
      setShown(next);
      if (grid.current) grid.current.scrollTop = 0;
      requestAnimationFrame(() => setFiltering(false));
    }, 120);
  };

  /* own scroll rail: shown on hover and while scrolling, the scrolled-away edge of the grid dissolves */
  const syncRail = useCallback(() => {
    const g = grid.current, p = pane.current, r = rail.current, b = bar.current;
    if (!g || !p || !r || !b) return;
    const px = (v: number) => Math.max(0, v).toFixed(1) + 'px';
    const range = g.scrollHeight - g.clientHeight;
    const over = range > 2;
    p.classList.toggle('is-scrollable', over);
    g.style.setProperty('--fade-top', over ? px(Math.min(28, g.scrollTop)) : '0px');
    g.style.setProperty('--fade-bot', over ? px(Math.min(28, range - g.scrollTop)) : '0px');
    if (!over) return;
    const h = Math.max(32, (r.clientHeight * g.clientHeight) / g.scrollHeight);
    b.style.height = px(h);
    b.style.translate = '0 ' + px(((r.clientHeight - h) * g.scrollTop) / range);
  }, []);
  useEffect(() => {
    const g = grid.current;
    if (!g) return;
    const ro = new ResizeObserver(syncRail);
    ro.observe(g);
    return () => ro.disconnect();
  }, [syncRail]);
  useEffect(() => { if (open) requestAnimationFrame(syncRail); }, [open, shown, syncRail]);
  const onGridScroll = () => {
    syncRail();
    pane.current?.classList.add('is-scrolling');
    clearTimeout(t.current.rail);
    t.current.rail = window.setTimeout(() => pane.current?.classList.remove('is-scrolling'), 800);
  };
  const dragBar = (e: RPointerEvent<HTMLSpanElement>) => {
    const g = grid.current, r = rail.current, b = bar.current;
    if (!g || !r || !b) return;
    e.preventDefault();
    e.stopPropagation();
    b.setPointerCapture(e.pointerId);
    pane.current?.classList.add('is-dragging');
    const y0 = e.clientY, top0 = g.scrollTop;
    const k = (g.scrollHeight - g.clientHeight) / Math.max(1, r.clientHeight - b.offsetHeight);
    const move = (ev: PointerEvent) => { g.scrollTop = top0 + (ev.clientY - y0) * k; };
    const up = () => {
      pane.current?.classList.remove('is-dragging');
      b.removeEventListener('pointermove', move);
      b.removeEventListener('pointerup', up);
      b.removeEventListener('pointercancel', up);
    };
    b.addEventListener('pointermove', move);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
  };
  const pageRail = (e: RPointerEvent<HTMLDivElement>) => {
    const g = grid.current, b = bar.current;
    if (!g || !b || e.target === b) return;
    const below = e.clientY > b.getBoundingClientRect().top;
    g.scrollBy({ top: (below ? 1 : -1) * g.clientHeight * 0.85, behavior: 'smooth' });
  };

  /* Esc, arrows through the panel, a click outside, window resize */
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const n = e.target as Node;
      if (!panel.current?.contains(n) && !trigger.current?.contains(n)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const all = [...(panel.current?.querySelectorAll<HTMLElement>('button, a') ?? [])].filter((el) => !el.closest('[hidden]'));
      const i = all.indexOf(document.activeElement as HTMLElement);
      all[e.key === 'ArrowDown' ? (i + 1) % all.length : (i - 1 + all.length) % all.length]?.focus();
      e.preventDefault();
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    addEventListener('resize', place);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); removeEventListener('resize', place); };
  }, [open, place, setOpen]);

  const hover = (from: 'trigger' | 'panel') => (e: RPointerEvent) => {
    if (e.pointerType !== 'mouse' || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    clearTimeout(t.current.close);
    if (!isOpen.current) t.current.open = window.setTimeout(() => setOpen(true), from === 'trigger' ? 60 : 0);
  };
  const leave = (e: RPointerEvent) => { if (e.pointerType === 'mouse') closeSoon(); };

  let k = 0;
  return (
    <>
      <a
        ref={trigger}
        href="#work"
        className={className}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onPointerEnter={hover('trigger')}
        onPointerLeave={leave}
        onClick={(e) => {
          e.preventDefault();
          /* a click right after a hover-open must not slam it shut */
          if (isOpen.current && performance.now() - t.current.openedAt < 450) return;
          setOpen(!isOpen.current);
        }}
      >
        {label}
      </a>
      <div
        ref={panel}
        id={id}
        role="dialog"
        aria-label={label}
        className={`work-menu${open ? ' is-open' : ''}${filtering ? ' is-filtering' : ''}`}
        style={pos}
        onPointerEnter={hover('panel')}
        onPointerLeave={leave}
      >
        <div className="work-menu__body">
          <div className="work-menu__filters" role="group" aria-label={L.filters}>
            {FILTERS.map((f) => (
              <button key={f} type="button" className={`work-menu__filter${f === filter ? ' is-on' : ''}`} aria-pressed={f === filter} onClick={(e) => { e.stopPropagation(); setFilter(f); }}>
                <span className="work-menu__filter-l">{L[f]}</span>
                <span className="work-menu__filter-n">{pad(counts[f])}</span>
              </button>
            ))}
          </div>
          <div className="work-menu__pane" ref={pane}>
            <ul className="work-menu__grid" ref={grid} onScroll={onGridScroll}>
              {projects.map((p) => {
                const hidden = shown !== 'all' && !p.kind.includes(shown);
                const i = hidden ? 0 : k++; // cascade order among the visible cards
                const vars = { '--s1': p.look.stage[0], '--s2': p.look.stage[1], '--ink': p.look.ink, '--accent': p.look.accent, '--oar': p.object.ratio.toFixed(4) } as CSSProperties;
                const phone = p.kind.includes('mobile');
                return (
                  <li key={p.id} hidden={hidden} style={{ '--i': i } as CSSProperties}>
                    <a className="work-menu__card" href={p.href ?? `#${p.id}`} onClick={() => setOpen(false)}>
                      <span className="work-menu__thumb" style={vars}>
                        {phone
                          ? <span className="work-menu__dev work-menu__dev--phone" aria-hidden="true" dangerouslySetInnerHTML={{ __html: phoneScreen }} />
                          : <span className="work-menu__dev" aria-hidden="true" dangerouslySetInnerHTML={{ __html: `<i class="work-menu__dev-bar"></i>${webScreen}` }} />}
                        <picture className="work-menu__obj" aria-hidden="true">
                          <img src={p.object.src} alt="" loading="lazy" decoding="async" draggable={false} />
                        </picture>
                        <span className="work-menu__go"><Arrow /></span>
                      </span>
                      <span className="work-menu__name">{p.title}</span>
                      <span className="work-menu__sub">{p.tag}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
            <div className="work-menu__rail" ref={rail} aria-hidden="true" onPointerDown={pageRail}>
              <span className="work-menu__bar" ref={bar} onPointerDown={dragBar} />
            </div>
          </div>
        </div>
        <div className="work-menu__foot">
          <p className="work-menu__note">{L.note}</p>
          <div className="work-menu__actions">
            <button className="work-menu__all" type="button" onClick={() => { setOpen(false); onAll?.(); }}>
              {L.allCases} <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
