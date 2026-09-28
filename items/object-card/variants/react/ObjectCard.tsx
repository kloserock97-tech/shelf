import { useRef, type CSSProperties, type PointerEvent } from 'react';
import './object-card.css';

type Look = {
  /** scene gradient, top → bottom */
  stage: [string, string];
  /** text and button colour */
  ink: string;
  /** tag colour */
  accent: string;
};

type CardObject = {
  src: string;
  /** width / height of the image */
  ratio: number;
  /** width, left and bottom as shares of the card (1.2 = 120 %) */
  w?: number;
  x?: number;
  y?: number;
};

type Props = {
  href: string;
  tag: string;
  title: string;
  subtitle?: string;
  object: CardObject;
  look: Look;
  cta?: string;
  /** the active card shows the button label without hover */
  active?: boolean;
  /** −1…1: the card's place in a row; the object leans out that way */
  tilt?: number;
  /** card width, any CSS length */
  width?: string;
};

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export function ObjectCard({ href, tag, title, subtitle, object, look, cta = 'View case', active, tilt = 0, width }: Props) {
  const ref = useRef<HTMLAnchorElement>(null);

  const move = (e: PointerEvent<HTMLAnchorElement>) => {
    const el = ref.current;
    if (!el || e.pointerType !== 'mouse') return;
    const r = el.getBoundingClientRect();
    const mx = (e.clientX - r.left) / r.width;
    const my = (e.clientY - r.top) / r.height;
    el.style.setProperty('--mx', `${(mx * 100).toFixed(1)}%`);
    el.style.setProperty('--my', `${(my * 100).toFixed(1)}%`);
    el.style.setProperty('--px', (mx * 2 - 1).toFixed(3));
    el.style.setProperty('--py', (my * 2 - 1).toFixed(3));
  };
  const leave = () => {
    ref.current?.style.setProperty('--px', '0');
    ref.current?.style.setProperty('--py', '0');
  };

  const style = {
    '--s1': look.stage[0],
    '--s2': look.stage[1],
    '--ink': look.ink,
    '--accent': look.accent,
    '--ow': pct(object.w ?? 1.2),
    '--ox': pct(object.x ?? -0.08),
    '--oy': pct(object.y ?? -0.04),
    '--oar': object.ratio.toFixed(4),
    '--tilt': Math.max(-1, Math.min(1, tilt)).toFixed(3),
    ...(width ? { '--w': width } : {}),
  } as CSSProperties;

  return (
    <a ref={ref} className={`case${active ? ' is-active' : ''}`} href={href} style={style} onPointerMove={move} onPointerLeave={leave}>
      <span className="case-text">
        <span className="case-tag">{tag}</span>
        <span className="case-title">{title}</span>
        {subtitle && <span className="case-sub">{subtitle}</span>}
      </span>
      <picture className="case-obj" aria-hidden="true">
        <img src={object.src} alt="" width={900} height={Math.round(900 / object.ratio)} decoding="async" draggable={false} />
      </picture>
      <span className="case-go">
        <span className="case-cta-l">{cta}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 17 17 7" />
          <path d="M8.5 7H17v8.5" />
        </svg>
      </span>
    </a>
  );
}
