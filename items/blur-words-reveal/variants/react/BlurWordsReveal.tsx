import { Fragment, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import './blur-words-reveal.css';

type Props = {
  title: string;
  kicker?: string;
  sub?: string;
  /** scroll length of the reveal, in screens */
  screens?: number;
  /** where the reveal starts, 0…1: a first screen can open already revealed */
  from?: number;
  /** anything drawn under the text: an image, a video, a canvas */
  backdrop?: ReactNode;
};

/** A chapter title that comes out of the blur word by word as you scroll, then lifts away.
    The effect writes one CSS variable (--k); the per-word delays live in the stylesheet. */
export function BlurWordsReveal({ title, kicker, sub, screens = 1.65, from = 0, backdrop }: Props) {
  const ref = useRef<HTMLElement>(null);
  const words = title.trim().split(/\s+/);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    /* vh from a probe: the phone address bar changes innerHeight, not vh */
    const probe = document.createElement('i');
    probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100vh;visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
    let top = 0;
    let run = 1;
    let last = '';
    let raf = 0;
    const frame = () => {
      raf = 0;
      const p = Math.min(1, Math.max(0, (window.scrollY - top) / run));
      const k = (from + (1 - from) * p).toFixed(3);
      if (k !== last) { last = k; el.style.setProperty('--k', k); }
    };
    /* measured on mount and resize only: a scroll frame never reads layout */
    const measure = () => {
      const r = el.getBoundingClientRect();
      top = r.top + window.scrollY;
      run = Math.max(1, r.height - (probe.offsetHeight || window.innerHeight));
      frame();
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(frame); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    measure();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
      cancelAnimationFrame(raf);
      probe.remove();
    };
  }, [from, screens]);

  return (
    <section ref={ref} className="bwr" style={{ '--screens': screens } as CSSProperties}>
      <div className="bwr-stage">
        {backdrop}
        <div className="bwr-intro">
          {kicker && <p className="bwr-kicker">{kicker}</p>}
          <h2 className="bwr-title" aria-label={words.join(' ')}>
            {words.map((w, i) => (
              <Fragment key={i}>
                <span className="bwr-word" aria-hidden="true" style={{ '--i': i } as CSSProperties}>{w}</span>{' '}
              </Fragment>
            ))}
          </h2>
          {sub && <p className="bwr-sub">{sub}</p>}
        </div>
      </div>
    </section>
  );
}
