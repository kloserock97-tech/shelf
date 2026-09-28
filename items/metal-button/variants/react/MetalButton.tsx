import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import './metal-button.css';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** lg: hero button, md: the same on a phone, icon: round, icon only (give it an aria-label) */
  size?: 'lg' | 'md' | 'icon';
  icon?: ReactNode;
};

const RIM_SLOW = 9; // s per turn at rest
const RIM_FAST = 3.2; // s per turn under the cursor

export function MetalButton({ size = 'lg', icon, children, className, type = 'button', onClick, ...rest }: Props) {
  const ref = useRef<HTMLButtonElement>(null);

  // Speed the rim up through the playback rate: changing animation-duration would make the angle jump.
  useEffect(() => {
    const button = ref.current;
    const rim = button?.querySelector<HTMLElement>('.metal-rim');
    if (!button || !rim || typeof rim.getAnimations !== 'function') return;
    const spin = () =>
      rim.getAnimations({ subtree: true }).find((a) => (a as CSSAnimation).animationName === 'metal-spin');
    if (!spin()) return;
    button.classList.add('has-rim-rate');
    const fast = () => spin()?.updatePlaybackRate(RIM_SLOW / RIM_FAST);
    const slow = () => spin()?.updatePlaybackRate(1);
    button.addEventListener('pointerenter', fast);
    button.addEventListener('pointerleave', slow);
    return () => {
      button.removeEventListener('pointerenter', fast);
      button.removeEventListener('pointerleave', slow);
    };
  }, []);

  return (
    <button
      ref={ref}
      type={type}
      className={['metal', `metal--${size}`, className].filter(Boolean).join(' ')}
      // The glow follows the cursor; written straight to the style, no re-render
      onPointerMove={(e) => {
        const el = e.currentTarget;
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
        el.style.setProperty('--my', `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
      }}
      onPointerLeave={(e) => {
        e.currentTarget.style.removeProperty('--mx');
        e.currentTarget.style.removeProperty('--my');
      }}
      onClick={(e) => {
        const el = e.currentTarget;
        el.classList.remove('is-rippling');
        void el.offsetWidth; // restart the ring
        el.classList.add('is-rippling');
        onClick?.(e);
      }}
      {...rest}
    >
      <i className="metal-rim" aria-hidden="true" />
      {icon}
      {children != null && <span className="metal__label">{children}</span>}
    </button>
  );
}
