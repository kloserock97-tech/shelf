import { useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent, type PointerEvent } from 'react';
import './ghost-complete.css';

/** Returns the rest of the phrase for the end of `text`, or null. */
export type Source = (text: string, opts: { signal: AbortSignal }) => Promise<string | null>;

type Props = {
  label: string;
  multiline?: boolean;
  rows?: number;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** local phrases: suggestions appear at once */
  phrases?: string[];
  /** async source (a model, a server), asked when no local phrase fits; a shimmer shows while it waits */
  source?: Source;
  /** rotating examples for the empty field; a function is read again at each turn, so it can follow context */
  examples?: string[] | (() => string[]);
  /** ms between examples */
  every?: number;
};

/** The rest of the best phrase for the end of `text`: the longest typed tail that starts a phrase wins. */
export function fromPhrases(text: string, phrases: string[]): string | null {
  for (let k = Math.max(0, text.length - 80); k < text.length; k++) {
    if (k > 0 && !/\s/.test(text[k - 1])) continue;
    const tail = text.slice(k);
    if (tail.length < (k === 0 ? 1 : 2) || /^\s/.test(tail)) continue;
    const low = tail.toLowerCase();
    const p = phrases.find((x) => x.length > tail.length && x.toLowerCase().startsWith(low));
    if (p) return p.slice(tail.length);
  }
  return null;
}

const nextWord = (g: string) => (g.match(/^\s*[^\s]+[.,;:!?)]*/) || [g])[0];
const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** An ordinary field with inline completion: Tab takes it all, Ctrl/⌘ + → one word, typing the same letters uses it up. */
export function GhostCompleteField({ label, multiline = false, rows = 4, defaultValue = '', onChange, phrases = [], source, examples = [], every = 3600 }: Props) {
  const [text, setText] = useState(defaultValue);
  const [ghost, setGhost] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  const [example, setExample] = useState('');
  const [phase, setPhase] = useState<'' | 'is-out' | 'is-in'>('');
  const [said, setSaid] = useState('');
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const ghostRef = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const prev = useRef(defaultValue);
  const ghostNow = useRef('');
  ghostNow.current = ghost;
  const pending = useRef<{ ctrl: AbortController; timer: number } | null>(null);
  const hintId = useId();

  const cancel = () => {
    if (pending.current) { clearTimeout(pending.current.timer); pending.current.ctrl.abort(); pending.current = null; }
    setWaiting(false);
  };
  const suggest = (value: string, remote = true) => {
    cancel();
    const local = (value.trim() && fromPhrases(value, phrases)) || '';
    setGhost(local);
    if (local || !remote || !source || !value.trim()) return;
    const ctrl = new AbortController();
    // a short pause first, so fast typing doesn't send a request per key
    const timer = window.setTimeout(async () => {
      setWaiting(true);
      try {
        const rest = await source(value, { signal: ctrl.signal });
        if (!ctrl.signal.aborted && field.current?.value === value) setGhost(rest || '');
      } catch { /* aborted or failed: no suggestion */ }
      if (pending.current?.ctrl === ctrl) { pending.current = null; setWaiting(false); }
    }, 130);
    pending.current = { ctrl, timer };
  };

  const track = () => {
    const el = field.current;
    setAtEnd(!!el && document.activeElement === el && el.selectionStart === el.selectionEnd && el.selectionEnd === el.value.length);
  };
  useEffect(() => {
    document.addEventListener('selectionchange', track);
    return () => { document.removeEventListener('selectionchange', track); cancel(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // announce a new suggestion once it settles
  useEffect(() => {
    const t = setTimeout(() => setSaid(ghost && atEnd ? `Suggestion: ${ghost.trim()}. Tab to accept.` : ''), 700);
    return () => clearTimeout(t);
  }, [ghost === '', atEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  // the rotating example; it starts over when the list changes (the context moved on)
  const exRef = useRef(examples);
  exRef.current = examples;
  const exKey = (typeof examples === 'function' ? examples() : examples).join('|');
  useEffect(() => {
    const list = () => { const e = exRef.current; return typeof e === 'function' ? e() : e; };
    let i = 0;
    setExample(list()[0] ?? '');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const id = setInterval(() => {
      if (field.current?.value || document.hidden) return;
      const l = list();
      if (!l.length) return;
      i = (i + 1) % l.length;
      if (reduce) { setExample(l[i]); return; }
      setPhase('is-out');
      setTimeout(() => {
        setExample(l[i]);
        setPhase('is-in');
        requestAnimationFrame(() => requestAnimationFrame(() => setPhase('')));
      }, 220);
    }, every);
    return () => clearInterval(id);
  }, [exKey, every]);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    const before = prev.current;
    prev.current = value;
    setText(value);
    onChange?.(value);
    setDismissed(false);
    requestAnimationFrame(track);
    const added = value.startsWith(before) ? value.slice(before.length) : null;
    const g = ghostNow.current;
    if (added && g && g.toLowerCase().startsWith(added.toLowerCase())) {
      // typed (or accepted) what the ghost said: use it up instead of asking again
      const rest = g.slice(added.length);
      if (rest) setGhost(rest);
      else suggest(value);
      return;
    }
    suggest(value, !!added);
  };

  const insert = (str: string) => {
    const el = field.current!;
    el.focus();
    // execCommand keeps the insertion in the field's own undo history; setRangeText is the fallback
    if (!document.execCommand?.('insertText', false, str)) {
      el.setRangeText(str, el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length, 'end');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  const show = atEnd && !dismissed;
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!ghost || !show || e.nativeEvent.isComposing) return;
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      insert(ghost);
    } else if (e.key === 'ArrowRight' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault();
      insert(nextWord(ghost));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDismissed(true);
      cancel();
      setSaid('Suggestion hidden');
    }
  };
  // a tap or click on the grey text takes it up to that word
  const onPointerDown = (e: PointerEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const node = ghostRef.current?.firstChild;
    if (!node || !ghost || !show) return;
    const r = document.createRange();
    const re = /\s*[^\s]+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(ghost))) {
      r.setStart(node, m.index);
      r.setEnd(node, m.index + m[0].length);
      if ([...r.getClientRects()].some((b) => e.clientX >= b.left - 2 && e.clientX <= b.right + 2 && e.clientY >= b.top - 3 && e.clientY <= b.bottom + 3)) {
        e.preventDefault();
        insert(ghost.slice(0, m.index + m[0].length));
        return;
      }
    }
  };
  const onScroll = () => { if (!multiline && inner.current && field.current) inner.current.style.transform = `translateX(${-field.current.scrollLeft}px)`; };

  const common = {
    ref: field,
    className: 'gcf-input',
    value: text,
    placeholder: ' ', // blank: keeps :placeholder-shown for the example overlay
    'aria-label': label,
    'aria-describedby': hintId,
    autoComplete: 'off',
    onChange: handleChange,
    onKeyDown,
    onPointerDown,
    onScroll,
    onFocus: () => { track(); if (text.trim() && !ghost) suggest(text); },
    onBlur: () => { cancel(); setAtEnd(false); },
    onSelect: track
  };
  return (
    <div className={`gcf ${multiline ? 'is-multi' : 'is-line'}${text ? ' has-text' : ''}`}>
      <div className="gcf-mirror" aria-hidden="true">
        <span ref={inner} className="gcf-mirror-in">
          <span className="gcf-typed">{text}</span>
          <span className={`gcf-wait${show && waiting && !ghost ? ' is-on' : ''}`} style={{ display: show && waiting && !ghost ? undefined : 'none' }} />
          <span ref={ghostRef} className="gcf-ghost">{show ? ghost : ''}</span>
          <kbd className="gcf-key">{show && ghost ? 'Tab' : ''}</kbd>
        </span>
      </div>
      {multiline ? <textarea {...common} rows={rows} /> : <input {...common} type="text" />}
      <div className={`gcf-ph ${phase}`} aria-hidden="true">{example}</div>
      <p className="gcf-sr" id={hintId}>Suggestions appear after the caret. Tab accepts, {isMac() ? 'Command' : 'Control'} plus Right Arrow accepts one word, Escape hides it.</p>
      <p className="gcf-sr" aria-live="polite">{said}</p>
    </div>
  );
}
