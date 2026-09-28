import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import './magnetic-dock.css';

export type DockLink = {
  /** id of the section on the page; the link scrolls to it and lights up while it is on screen */
  id: string;
  label: string;
  icon: ReactNode;
  /** the brighter "call to action" item */
  accent?: boolean;
};

type Props = {
  items: DockLink[];
  mark: ReactNode;
  markLabel?: string;
  /** id of the top of the page for the mark */
  homeId?: string;
  /** the active section is the last one whose top passed this share of the window */
  line?: number;
};

const approach = (value: number, target: number, rate: number, dt: number) =>
  value + (target - value) * (1 - Math.exp(-rate * dt));

export function MagneticDock({ items, mark, markLabel = 'Back to the start', homeId = 'top', line = 0.4 }: Props) {
  const dockRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const [phase, setPhase] = useState<'hidden' | 'in' | 'settled'>('hidden');

  // Proximity growth and the edge glint: one frame loop, DOM writes only on change, sleeps when settled
  useEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const FINE = matchMedia('(hover: hover) and (pointer: fine)');
    const els = [...dock.querySelectorAll<HTMLElement>('[data-dock]')];
    const near = els.map(() => ({ value: 0, written: -1 }));
    const pointer = { x: 0, y: 0, seen: false };
    let glint = 0, glintWritten = -1, keyboardFocus = -1, raf = 0, last = 0;
    let box: DOMRect | null = null, centers: number[] = [], dirty = true, gx = '', gy = '';

    const targets = () => {
      const out = els.map(() => 0);
      if (keyboardFocus >= 0) { out[keyboardFocus] = 1; return { out, glintTarget: 0.6 }; }
      if (!pointer.seen || !FINE.matches || REDUCED) return { out, glintTarget: 0 };
      if (dirty || !box) {
        dirty = false;
        box = dock.getBoundingClientRect();
        centers = els.map((el) => { const r = el.getBoundingClientRect(); return r.left + r.width / 2; });
      }
      const reachX = box.height * 2.6;
      const inBand = pointer.y > box.top - box.height && pointer.y < box.bottom + box.height * 2.2
        && pointer.x > box.left - reachX && pointer.x < box.right + reachX;
      if (!inBand) return { out, glintTarget: 0 };
      els.forEach((_, i) => {
        const t = Math.max(0, 1 - Math.abs(pointer.x - centers[i]) / reachX);
        out[i] = t * t * (3 - 2 * t);
      });
      const nx = `${(pointer.x - box.left).toFixed(0)}px`;
      const ny = `${(pointer.y - box.top).toFixed(0)}px`;
      if (nx !== gx) { gx = nx; dock.style.setProperty('--gx', nx); }
      if (ny !== gy) { gy = ny; dock.style.setProperty('--gy', ny); }
      return { out, glintTarget: 1 };
    };

    const frame = (now: number) => {
      raf = 0;
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
      last = now;
      const { out, glintTarget } = targets();
      let busy = false;
      els.forEach((el, i) => {
        const n = near[i];
        n.value = approach(n.value, out[i], 14, dt);
        if (Math.abs(n.value - out[i]) < 0.002) n.value = out[i]; else busy = true;
        const v = Math.round(n.value * 1000) / 1000;
        if (v !== n.written) {
          n.written = v;
          el.style.setProperty('--near', String(v));
          el.dataset.near = v > 0.35 ? 'true' : 'false';
        }
      });
      glint = approach(glint, glintTarget, 8, dt);
      const g = Math.round(glint * 100) / 100;
      if (g !== glintWritten) { glintWritten = g; dock.style.setProperty('--glint', String(g)); }
      if (Math.abs(glint - glintTarget) >= 0.005) busy = true;
      if (busy) raf = requestAnimationFrame(frame);
    };
    const wake = () => { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      pointer.x = e.clientX; pointer.y = e.clientY; pointer.seen = true;
      wake();
    };
    const onLeave = () => { pointer.seen = false; wake(); };
    const onResize = () => { dirty = true; };
    const onScroll = () => { dirty = true; wake(); };
    const onFocusIn = (e: FocusEvent) => {
      const item = (e.target as HTMLElement).closest<HTMLElement>('[data-dock]');
      keyboardFocus = item && item.matches(':focus-visible') ? els.indexOf(item) : -1;
      wake();
    };
    const onFocusOut = () => requestAnimationFrame(() => {
      if (!dock.contains(document.activeElement)) { keyboardFocus = -1; wake(); }
    });
    const ro = 'ResizeObserver' in window ? new ResizeObserver(onResize) : null;
    ro?.observe(dock);
    addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    addEventListener('resize', onResize);
    addEventListener('scroll', onScroll, { passive: true });
    dock.addEventListener('focusin', onFocusIn);
    dock.addEventListener('focusout', onFocusOut);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      removeEventListener('resize', onResize);
      removeEventListener('scroll', onScroll);
      dock.removeEventListener('focusin', onFocusIn);
      dock.removeEventListener('focusout', onFocusOut);
    };
  }, [items.length]);

  // Scroll-spy: the last section whose top passed `line` of the window
  useEffect(() => {
    let raf = 0;
    const pick = () => {
      raf = 0;
      const y = innerHeight * line;
      for (const item of [...items].reverse()) {
        const s = document.getElementById(item.id);
        if (s && s.offsetParent !== null && s.getBoundingClientRect().top <= y) return setActive(item.id);
      }
      setActive(null);
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(pick); };
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', schedule);
    pick();
    return () => { cancelAnimationFrame(raf); removeEventListener('scroll', schedule); removeEventListener('resize', schedule); };
  }, [items, line]);

  // Entrance: blur-in cascade, then the filter is dropped for good
  useEffect(() => {
    const a = requestAnimationFrame(() => setPhase('in'));
    const b = window.setTimeout(() => setPhase('settled'), 1000);
    return () => { cancelAnimationFrame(a); clearTimeout(b); };
  }, []);

  const go = (id: string) => (e: MouseEvent) => {
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div className="dock-wrap">
      <nav
        ref={dockRef}
        className={['dock', phase !== 'hidden' && 'is-in', phase === 'settled' && 'is-settled'].filter(Boolean).join(' ')}
        data-enter=""
        aria-label="Primary"
      >
        <a className="dock-item dock-mark" data-dock="" href={`#${homeId}`} style={{ '--d': '120ms' } as CSSProperties} aria-label={markLabel} onClick={go(homeId)}>
          {mark}
        </a>
        {items.map((item, i) => (
          <a
            key={item.id}
            className={['dock-item', item.accent && 'dock-item--enter', active === item.id && 'is-active'].filter(Boolean).join(' ')}
            data-dock=""
            href={`#${item.id}`}
            style={{ '--d': `${180 + i * 50}ms` } as CSSProperties}
            aria-current={active === item.id ? 'true' : undefined}
            onClick={go(item.id)}
          >
            <span className="dock-glyph" aria-hidden="true">{item.icon}</span>
            <span className="dock-label">{item.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
