import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react';
import { parse, summary, type Parsed, type Person, type Project } from './intent-parse';
import './intent-quick-add.css';

export type QuickAddValue = Omit<Parsed, 'chips'> & { text: string };

type Props = {
  label?: string;
  placeholder?: string;
  people?: Person[];
  projects?: Project[];
  /** the clock the dates are read against */
  now?: () => Date;
  onSubmit?: (v: QuickAddValue) => void;
};

type Range = [number, number];

/** Keep literal ranges on the same words while the text around them changes. */
function shiftRanges(ranges: Range[], before: string, after: string): Range[] {
  let a = 0;
  while (a < before.length && a < after.length && before[a] === after[a]) a++;
  let b = 0;
  while (b < before.length - a && b < after.length - a && before[before.length - 1 - b] === after[after.length - 1 - b]) b++;
  const endOld = before.length - b;
  const delta = after.length - before.length;
  return ranges.flatMap(([s, e]): Range[] => {
    if (e <= a) return [[s, e]];
    if (s >= endOld) return [[s + delta, e + delta]];
    if (s <= a && endOld <= e) return e + delta > s ? [[s, e + delta]] : [];
    return [];
  });
}

/** One field that reads the line as you type: dates, @people, #projects and € amounts become chips in place. */
export function IntentQuickAdd({ label = 'New task', placeholder = 'Add a task, e.g. Lunch with @ben friday 1pm', people = [], projects = [], now = () => new Date(), onSubmit }: Props) {
  const [text, setText] = useState('');
  const [literal, setLiteral] = useState<Range[]>([]);
  const [raw, setRaw] = useState(false);
  const [caret, setCaret] = useState<number | null>(null);
  const [said, setSaid] = useState('');
  const field = useRef<HTMLDivElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const float = useRef<HTMLDivElement>(null);
  const shown = useRef(new Set<string>());
  const hintId = useId();

  const result = useMemo(() => parse(text, { now: now(), people, projects, literal }), [text, literal, people, projects]); // eslint-disable-line react-hooks/exhaustive-deps
  const chips = raw ? [] : result.chips;
  const title = raw ? text.trim() : result.title;
  const [kind, ...meta] = summary(result);

  // the mirror: the same text, chips wrapped
  const pieces: ReactNode[] = [];
  let at = 0;
  for (const c of chips) {
    const key = `${c.type}:${c.start}`;
    pieces.push(text.slice(at, c.start));
    pieces.push(
      <mark key={key} className={`iqa-chip${shown.current.has(key) ? '' : ' is-new'}`} data-type={c.type} data-start={c.start}>
        {text.slice(c.start, c.end)}
      </mark>
    );
    at = c.end;
  }
  pieces.push(text.slice(at));
  useEffect(() => { shown.current = new Set(chips.map((c) => `${c.type}:${c.start}`)); });

  // what the chip at the caret means, above the first line
  const active = caret == null || raw ? null : result.chips.find((c) => c.start <= caret && caret <= c.end) ?? null;
  useLayoutEffect(() => {
    const fl = float.current;
    const el = active && mirror.current?.querySelector<HTMLElement>(`.iqa-chip[data-start="${active.start}"]`);
    if (!fl || !el || !field.current || !mirror.current) { fl?.classList.remove('is-on'); return; }
    const f = field.current.getBoundingClientRect();
    const r = el.getClientRects()[0];
    const w = fl.offsetWidth;
    const x = Math.min(Math.max(r.left - f.left + r.width / 2 - w / 2, 4), f.width - w - 4);
    const firstLine = mirror.current.getBoundingClientRect().top - f.top + parseFloat(getComputedStyle(mirror.current).paddingTop);
    fl.style.transform = `translate(${x.toFixed(1)}px, ${(firstLine - fl.offsetHeight - 6).toFixed(1)}px)`;
    fl.classList.add('is-on');
  });

  // spoken summary, once typing pauses
  useEffect(() => {
    const t = setTimeout(() => setSaid(text.trim() ? `Will create: ${[raw ? 'Task' : kind, title || 'no title yet', ...(raw ? [] : meta)].join(', ')}` : ''), 900);
    return () => clearTimeout(t);
  }, [text, raw, literal]); // eslint-disable-line react-hooks/exhaustive-deps

  const track = () => {
    const el = input.current;
    setCaret(el && document.activeElement === el && el.selectionStart === el.selectionEnd ? el.selectionStart : null);
  };
  const onChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value.replace(/\r?\n/g, ' '); // one line only
    setLiteral((l) => shiftRanges(l, text, next));
    setText(next);
    requestAnimationFrame(track);
  };
  const submit = () => {
    if (!title) return;
    const { chips: _c, ...rest } = result;
    onSubmit?.(raw ? { ...rest, text, title, kind: 'Task', due: null, hasTime: false, end: null, repeat: null, people: [], project: null, amount: null, priority: null, duration: null, dueLabel: null } : { ...rest, text, title });
    setText('');
    setLiteral([]);
    setRaw(false);
    setSaid(`Added: ${title}`);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setRaw((r) => !r);
      setSaid(raw ? 'Reading on' : 'Reading off: plain text');
    } else if (e.key === 'Backspace' && !raw && el.selectionStart === el.selectionEnd) {
      const c = result.chips.find((x) => x.end === el.selectionStart);
      if (c) {
        e.preventDefault(); // the first Backspace keeps the words as text, the next one deletes
        setLiteral((l) => [...l, [c.start, c.end]]);
        setSaid(`Kept “${c.text}” as text`);
      }
    }
  };

  return (
    <div className={`iqa${raw ? ' is-raw' : ''}`}>
      <div ref={field} className="iqa-field">
        <div ref={mirror} className="iqa-mirror" aria-hidden="true">{pieces}</div>
        <textarea
          ref={input}
          className="iqa-input"
          rows={1}
          value={text}
          placeholder={placeholder}
          aria-label={label}
          aria-describedby={hintId}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="done"
          onChange={onChange}
          onKeyDown={onKeyDown}
          onSelect={track}
          onFocus={track}
          onBlur={() => setCaret(null)}
        />
        <button className="iqa-add" type="button" disabled={!title} onClick={() => { submit(); input.current?.focus(); }}>Add</button>
        <div ref={float} className="iqa-float" aria-hidden="true">
          {active?.label}
          {active?.note && <small>{active.note}</small>}
        </div>
      </div>
      <p className="iqa-ghost" aria-hidden="true">
        {text.trim() && (
          <>
            <span className="iqa-kind">{raw ? 'Task' : kind}</span>
            {title ? <span className="iqa-title">{title}</span> : <span className="iqa-off">Add a title</span>}
            {raw ? <span className="iqa-off">Reading off · Esc to turn it on</span> : meta.map((m, i) => <span key={i}>{m}</span>)}
          </>
        )}
      </p>
      <p className="iqa-sr" id={hintId}>Dates, @people, #projects and euro amounts are read as you type. Backspace right after one keeps it as text. Escape turns reading off. Enter adds.</p>
      <p className="iqa-sr" aria-live="polite">{said}</p>
    </div>
  );
}
