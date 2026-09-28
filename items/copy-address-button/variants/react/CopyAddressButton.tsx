import { useEffect, useRef, useState } from 'react';
import './copy-address.css';

type Props = {
  address: string;
  copyLabel?: string;
  copiedLabel?: string;
  /** how long "copied" stays, ms */
  hold?: number;
  onCopied?: (address: string) => void;
};

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch (e) {
    // older browsers, plain http, a frame without clipboard-write
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand?.('copy');
    ta.remove();
    if (!ok) throw e;
  }
}

/** The address itself is the button: click copies it; if the clipboard is closed, the mail app opens. */
export function CopyAddressButton({ address, copyLabel = 'Copy the address', copiedLabel = 'Address copied', hold = 1800, onCopied }: Props) {
  const [done, setDone] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <>
      <button
        className={done ? 'copy-address is-done' : 'copy-address'}
        type="button"
        aria-label={`${copyLabel}: ${address}`}
        onClick={async () => {
          try {
            await copyText(address);
          } catch {
            location.href = `mailto:${address}`;
            return;
          }
          setDone(true);
          onCopied?.(address);
          clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setDone(false), hold);
        }}
      >
        <svg className="copy-address__ic copy-address__ic--copy" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="5.6" y="5.6" width="8" height="8" rx="1.6" />
          <path d="M10.6 5.6V4a1.6 1.6 0 0 0-1.6-1.6H4A1.6 1.6 0 0 0 2.4 4v5a1.6 1.6 0 0 0 1.6 1.6h1.6" />
        </svg>
        <svg className="copy-address__ic copy-address__ic--done" viewBox="0 0 16 16" aria-hidden="true">
          <path d="m3 8.6 3.2 3.2L13 5" />
        </svg>
        <span className="copy-address__label">{done ? copiedLabel : address}</span>
      </button>
      <span className="copy-address__status" role="status">{done ? copiedLabel : ''}</span>
    </>
  );
}
