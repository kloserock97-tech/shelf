import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import './cursor-parallax.css';

/* smooth approach to a target, the same at 60 and 120 Hz */
const approach = (value: number, target: number, rate: number, dt: number) => value + (target - value) * (1 - Math.exp(-rate * dt));

type RootProps = { children: ReactNode; className?: string; style?: CSSProperties; rate?: number };

/** Writes --px and --py (−1…1) on its element, eased towards the cursor; layers inside move in CSS.
    Touch is ignored, leaving the window brings everything to rest, reduced motion turns it off. */
export function CursorParallax({ children, className = '', style, rate = 3.2 }: RootProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const pointer = { nx: 0, ny: 0 };
    const tilt = { x: 0, y: 0, lastX: NaN, lastY: NaN };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      pointer.nx = (e.clientX / innerWidth) * 2 - 1;
      pointer.ny = (e.clientY / innerHeight) * 2 - 1;
    };
    const onLeave = () => { pointer.nx = pointer.ny = 0; };
    addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    root.classList.add('cp-on');

    let last = 0;
    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
      last = now;
      tilt.x = approach(tilt.x, pointer.nx, rate, dt);
      tilt.y = approach(tilt.y, pointer.ny, rate, dt);
      /* the DOM is written only when the value rounded to 0.001 has changed */
      const x = Math.round(tilt.x * 1000) / 1000;
      const y = Math.round(tilt.y * 1000) / 1000;
      if (x !== tilt.lastX || y !== tilt.lastY) {
        tilt.lastX = x;
        tilt.lastY = y;
        root.style.setProperty('--px', String(x));
        root.style.setProperty('--py', String(y));
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      root.classList.remove('cp-on');
    };
  }, [rate]);

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}

type LayerProps = { depth: number; children?: ReactNode; className?: string; style?: CSSProperties };

/** A layer that drifts by `depth` px at the edge of the window (vertically by 0.6 of that). */
export function ParallaxLayer({ depth, children, className = '', style }: LayerProps) {
  return (
    <div className={`cp-layer ${className}`} style={{ ...style, ['--pd' as string]: depth }}>
      {children}
    </div>
  );
}

type TiltProps = { children: ReactNode; tilt?: number; float?: boolean; className?: string; style?: CSSProperties };

/** A card that leans towards the cursor (the near side sinks) by `tilt` degrees and slowly floats. */
export function TiltCard({ children, tilt = 2.9, float = true, className = '', style }: TiltProps) {
  return (
    <div className={`cp-tilt ${float ? 'cp-float' : ''} ${className}`} style={{ ...style, ['--tilt' as string]: `${tilt}deg` }}>
      {children}
    </div>
  );
}

/** A frame whose picture slides the other way, like a view through a window. Put an img or svg inside. */
export function ParallaxWindow({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`cp-window ${className}`} style={style}>
      <div className="cp-window__media">{children}</div>
    </div>
  );
}
