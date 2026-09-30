// Intent grammar: reads a line like "Lunch with @ben friday 1pm for 1h #offsite €40" into structured parts.
// Small and local: a list of patterns, the longest match wins, overlaps are dropped, a date and a time that
// stand next to each other become one "when". Ranges marked literal are left as text.
(function (global) {
  const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const WORDNUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  // sat and sun only in full: "sun cream" is not a date
  const DAY = 'mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|saturday|sunday';
  const MON = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
  const NUM = '\\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten';
  const S = '(?<![\\p{L}\\p{N}_@#€])'; // a token starts at a word edge
  const E = '(?![\\p{L}\\p{N}_])'; // … and ends at one
  const rx = (src) => new RegExp(S + src + E, 'giu');
  const LINKS = /^(with|for|to|and|call|email|ask|tell|ping|meet|text|remind|thank|invite|cc|from|by)$/i;

  const day0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const num = (w) => (/^\d+$/.test(w) ? Number(w) : WORDNUM[w.toLowerCase()] ?? 1);
  const dow = (w) => DAYS.indexOf(w.slice(0, 3).toLowerCase());
  const mon = (w) => MONTHS.indexOf(w.slice(0, 3).toLowerCase());
  const hm = (h, m = 0) => ({ h, m });
  const to24 = (h, m, ap) => {
    ap = ap.replace(/\./g, '').toLowerCase();
    if (h < 1 || h > 12 || m > 59) return null;
    return hm((h % 12) + (ap === 'pm' ? 12 : 0), m);
  };
  function nextDow(now, target, { strict = true } = {}) {
    let diff = (target - now.getDay() + 7) % 7;
    if (diff === 0 && strict) diff = 7;
    return addDays(day0(now), diff);
  }

  // each rule: what it is and how to read a match into { date, time, end, ... }
  const RULES = [
    { type: 'kind', re: /^\s*(remind me to|remind me|todo:|task:|event:)(?=\s)/giu,
      read: (m) => ({ kind: /remind/i.test(m[1]) ? 'Reminder' : /event/i.test(m[1]) ? 'Event' : 'Task' }) },
    { type: 'person', re: rx('@([\\p{L}][\\p{L}\\p{N}._-]*)'), read: (m) => ({ handle: m[1].toLowerCase() }) },
    { type: 'project', re: rx('#([\\p{L}\\p{N}_-]+)'), read: (m) => ({ tag: m[1].toLowerCase() }) },
    { type: 'amount', re: rx('(?:€\\s?(\\d[\\d.,]*\\d|\\d)|(\\d[\\d.,]*\\d|\\d)\\s?(?:€|eur(?:os?)?))'),
      read: (m) => {
        let s = m[1] ?? m[2];
        if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, ''); // 1,200 or 1.200
        else s = s.replace(',', '.'); // 12,50
        const v = Number(s);
        return Number.isFinite(v) ? { amount: v } : null;
      } },
    { type: 'priority', re: rx('p([1-3])'), read: (m) => ({ priority: Number(m[1]) }) },
    { type: 'repeat', re: rx(`(?:every\\s+(other\\s+)?(day|weekday|week|month|year|${DAY})|(daily|weekly|monthly|yearly))`),
      read: (m, now) => {
        const unit = (m[2] ?? m[3]).toLowerCase();
        const other = m[1] ? 'other ' : '';
        if (dow(unit) >= 0 && !/^(week|weekday)/.test(unit)) {
          const d = dow(unit);
          const name = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d];
          return { repeat: `Every ${other}${name}`, date: nextDow(now, d, { strict: false }) };
        }
        const map = { day: 'day', daily: 'day', weekday: 'weekday', week: 'week', weekly: 'week', month: 'month', monthly: 'month', year: 'year', yearly: 'year' };
        const u = map[unit];
        return { repeat: `Every ${other}${u}`, date: day0(now) };
      } },
    { type: 'duration', re: rx('for\\s+(\\d+(?:[.,]\\d+)?|an?|one|two|three|half\\s+an)\\s*(h|hrs?|hours?|m|mins?|minutes?)'),
      read: (m) => {
        const n = /half/i.test(m[1]) ? 0.5 : /^\d/.test(m[1]) ? Number(m[1].replace(',', '.')) : num(m[1]);
        return { duration: Math.round(/^h/i.test(m[2]) ? n * 60 : n) };
      } },
    // time ranges: 2-3pm, 14:00–15:30, from 2 to 3pm
    { type: 'time', re: rx('(?:from\\s+)?(\\d{1,2})(?:[:.](\\d{2}))?\\s*(am|pm)?\\s*(?:-|–|to)\\s*(\\d{1,2})(?:[:.](\\d{2}))?\\s*(am|pm)'),
      read: (m) => {
        const end = to24(Number(m[4]), Number(m[5] ?? 0), m[6]);
        let start = to24(Number(m[1]), Number(m[2] ?? 0), m[3] ?? m[6]);
        if (!end || !start) return null;
        if (start.h * 60 + start.m >= end.h * 60 + end.m && !m[3]) start = to24(Number(m[1]), Number(m[2] ?? 0), 'am');
        return start && start.h * 60 + start.m < end.h * 60 + end.m ? { time: start, end } : null;
      } },
    { type: 'time', re: rx('(?:at\\s+)?(\\d{1,2})(?:[:.](\\d{2}))?\\s?(am|pm|a\\.m\\.|p\\.m\\.)'),
      read: (m) => { const t = to24(Number(m[1]), Number(m[2] ?? 0), m[3]); return t && { time: t }; } },
    { type: 'time', re: rx('(?:at\\s+)?([01]?\\d|2[0-3])[:.]([0-5]\\d)'), read: (m) => ({ time: hm(Number(m[1]), Number(m[2])) }) },
    { type: 'time', re: rx('(?:at\\s+)?(noon|midday|midnight)'), read: (m) => ({ time: /mid(night)$/i.test(m[1]) ? hm(0) : hm(12) }) },
    // "at 3" is a guess: office hours, so 1–6 read as afternoon
    { type: 'time', re: rx('at\\s+(\\d{1,2})(?![:.\\d])'),
      read: (m) => { const h = Number(m[1]); return h >= 1 && h <= 12 ? { time: hm(h <= 6 ? h + 12 : h), guess: true } : null; } },
    { type: 'time', re: rx('(?:in\\s+the\\s+|this\\s+)?(morning|afternoon|evening)'),
      read: (m) => ({ time: { morning: hm(9), afternoon: hm(14), evening: hm(18) }[m[1].toLowerCase()] }) },
    { type: 'date', re: rx('(?:(?:on|by|due)\\s+)?(day after tomorrow|today|tonight|tomorrow|tmrw|tmr)'),
      read: (m, now) => {
        const w = m[1].toLowerCase();
        if (w === 'tonight') return { date: day0(now), time: hm(20) };
        return { date: addDays(day0(now), w === 'today' ? 0 : w === 'day after tomorrow' ? 2 : 1) };
      } },
    { type: 'date', re: rx(`(?:(on|by|due|next|this|coming)\\s+)?(${DAY})`),
      read: (m, now) => {
        const d = dow(m[2]);
        const how = (m[1] ?? '').toLowerCase();
        let date = nextDow(now, d, { strict: how !== 'this' });
        if (how === 'next') {
          const monday = addDays(day0(now), ((8 - now.getDay()) % 7) || 7); // start of next week
          if (date < monday) date = addDays(date, 7);
        }
        return { date };
      } },
    { type: 'date', re: rx('(?:(?:by|on|due)\\s+)?(?:the\\s+)?(end\\s+of\\s+(?:the\\s+)?(?:week|month)|eow|eom|next\\s+week|next\\s+month|(?:this\\s+)?weekend)'),
      read: (m, now) => {
        const w = m[1].toLowerCase().replace(/\s+/g, ' ');
        if (/next week/.test(w)) return { date: nextDow(now, 1) };
        if (/next month/.test(w)) return { date: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
        if (/month|eom/.test(w)) return { date: new Date(now.getFullYear(), now.getMonth() + 1, 0) };
        if (/week|eow/.test(w) && !/weekend/.test(w)) return { date: nextDow(now, 5, { strict: false }) };
        return { date: nextDow(now, 6, { strict: false }) };
      } },
    { type: 'date', re: rx(`in\\s+(${NUM})\\s+(days?|weeks?|months?)`),
      read: (m, now) => {
        const n = num(m[1]);
        const u = m[2][0].toLowerCase();
        if (u === 'm') return { date: new Date(now.getFullYear(), now.getMonth() + n, now.getDate()) };
        return { date: addDays(day0(now), u === 'w' ? n * 7 : n) };
      } },
    { type: 'date', re: rx(`in\\s+(${NUM}|half\\s+an)\\s+(hours?|hrs?|minutes?|mins?)`),
      read: (m, now) => {
        const mins = /half/i.test(m[1]) ? 30 : num(m[1]) * (/^h/i.test(m[2]) ? 60 : 1);
        const t = new Date(now.getTime() + mins * 60000);
        return { date: day0(t), time: hm(t.getHours(), Math.round(t.getMinutes() / 5) * 5 % 60) };
      } },
    { type: 'date', re: rx(`(?:(?:on|by|due)\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MON})`), read: (m, now) => dayMonth(now, Number(m[1]), mon(m[2])) },
    { type: 'date', re: rx(`(?:(?:on|by|due)\\s+)?(${MON})\\s+(\\d{1,2})(?:st|nd|rd|th)?`), read: (m, now) => dayMonth(now, Number(m[2]), mon(m[1])) },
    { type: 'date', re: rx('(?:(?:on|by|due)\\s+)?the\\s+(\\d{1,2})(?:st|nd|rd|th)'),
      read: (m, now) => {
        const d = Number(m[1]);
        if (d < 1 || d > 31) return null;
        let date = new Date(now.getFullYear(), now.getMonth(), d);
        if (date < day0(now)) date = new Date(now.getFullYear(), now.getMonth() + 1, d);
        return { date };
      } }
  ];
  function dayMonth(now, d, m) {
    if (m < 0 || d < 1 || d > 31) return null;
    let date = new Date(now.getFullYear(), m, d);
    if (date.getMonth() !== m) return null;
    if (date < day0(now)) date = new Date(now.getFullYear() + 1, m, d);
    return { date };
  }

  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const pad = (n) => String(n).padStart(2, '0');
  const clock = (t) => `${pad(t.h)}:${pad(t.m)}`;
  function dayLabel(date, now) {
    const diff = Math.round((day0(date) - day0(now)) / 864e5);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return `${DAY_NAMES[date.getDay()]} ${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`;
  }
  const money = (v) => `€${v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  /**
   * @param {string} text
   * @param {{ now?: Date, people?: {handle:string,name:string}[], projects?: {tag:string,name:string}[], literal?: [number, number][] }} ctx
   */
  function parse(text, ctx = {}) {
    const now = ctx.now ?? new Date();
    const people = ctx.people ?? [];
    const projects = ctx.projects ?? [];
    const literal = ctx.literal ?? [];
    const found = [];
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      for (const m of text.matchAll(rule.re)) {
        const start = m.index + (m[0].length - m[0].trimStart().length);
        const end = m.index + m[0].trimEnd().length;
        if (end <= start || literal.some(([a, b]) => start < b && end > a)) continue;
        const data = rule.read(m, now);
        if (data) found.push({ type: rule.type, start, end, data });
      }
    }
    // longest first at each start, then no overlaps
    found.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
    const picked = [];
    for (const f of found) if (!picked.some((p) => f.start < p.end && f.end > p.start)) picked.push(f);

    // glue a date and a time (or a repeat and a time) that stand side by side: "tomorrow at 9am", "9am tomorrow"
    const tokens = [];
    const gap = (a, b) => /^[\s,]*(?:at\s*)?$/i.test(text.slice(a.end, b.start));
    for (const t of picked) {
      const prev = tokens[tokens.length - 1];
      const whenish = (x) => x && (x.type === 'date' || x.type === 'time' || x.type === 'repeat');
      if (prev && whenish(prev) && whenish(t) && gap(prev, t) && !(prev.data.time && t.data.time) && !(prev.data.date && t.data.date)) {
        prev.end = t.end;
        prev.data = { ...prev.data, ...t.data, date: prev.data.date ?? t.data.date, repeat: prev.data.repeat ?? t.data.repeat };
        if (t.type === 'repeat') prev.type = 'repeat';
        continue;
      }
      tokens.push({ ...t, data: { ...t.data } });
    }

    // one of each, except people; the rest stays plain text
    const seen = new Set();
    const chips = [];
    for (const t of tokens) {
      const kind = t.type === 'date' || t.type === 'time' ? 'when' : t.type;
      if (kind !== 'person' && seen.has(kind)) continue;
      // "from thursday to friday": the day after "to" is the due one, "from thursday" stays in the title
      const before = text.slice(0, t.start).trim().split(/\s+/).pop() ?? '';
      if (kind === 'when' && /^from$/i.test(before) && tokens.some((o) => o.start >= t.end && (o.type === 'date' || o.type === 'time'))) continue;
      seen.add(kind);
      chips.push({ ...t, type: kind, text: text.slice(t.start, t.end) });
    }

    const out = { kind: 'Task', title: '', due: null, hasTime: false, end: null, repeat: null, people: [], project: null, amount: null, priority: null, duration: null };
    for (const c of chips) {
      const d = c.data;
      if (c.type === 'kind') { out.kind = d.kind; c.label = d.kind; }
      if (c.type === 'when' || c.type === 'repeat') {
        let date = d.date;
        if (!date && d.time) {
          date = day0(now);
          if (d.time.h * 60 + d.time.m <= now.getHours() * 60 + now.getMinutes()) date = addDays(date, 1);
        }
        const due = new Date(date);
        if (d.time) due.setHours(d.time.h, d.time.m, 0, 0);
        out.due = due;
        out.hasTime = !!d.time;
        if (d.end) { out.end = new Date(date); out.end.setHours(d.end.h, d.end.m, 0, 0); }
        if (d.repeat) out.repeat = d.repeat;
        const time = d.time ? `${clock(d.time)}${d.end ? `–${clock(d.end)}` : ''}` : '';
        c.label = d.repeat ? `${d.repeat}${time ? `, ${time}` : ''}` : `${dayLabel(date, now)}${time ? `, ${time}` : ''}`;
        if (d.guess) c.note = 'guessed from office hours';
      }
      if (c.type === 'person') {
        const hits = people.filter((p) => p.handle.startsWith(d.handle));
        const p = hits.find((x) => x.handle === d.handle) ?? (hits.length === 1 ? hits[0] : null);
        c.person = p ?? { handle: d.handle, name: `@${d.handle}`, unknown: true };
        c.label = p ? p.name : 'Not in the team yet';
        out.people.push(c.person);
      }
      if (c.type === 'project') {
        const p = projects.find((x) => x.tag === d.tag);
        out.project = p ? p.name : d.tag.replace(/^./, (s) => s.toUpperCase());
        c.label = p ? `Project · ${p.name}` : `New project · ${out.project}`;
      }
      if (c.type === 'amount') { out.amount = d.amount; c.label = money(d.amount); }
      if (c.type === 'priority') { out.priority = d.priority; c.label = `Priority ${d.priority}`; }
      if (c.type === 'duration') { out.duration = d.duration; c.label = d.duration >= 60 ? `${+(d.duration / 60).toFixed(1)} h` : `${d.duration} min`; }
    }
    if (out.due && out.hasTime && !out.end && out.duration) out.end = new Date(out.due.getTime() + out.duration * 60000);
    if (out.end && out.kind === 'Task') out.kind = 'Event';

    // the title: the text without its chips; a name after "with", "for", "call"… stays as a first name
    let title = '';
    let at = 0;
    for (const c of chips) {
      let keep = '';
      if (c.type === 'person' && !c.person.unknown) {
        const before = text.slice(0, c.start).trim().split(/\s+/).pop() ?? '';
        if (LINKS.test(before)) keep = c.person.name.split(' ')[0];
      }
      title += text.slice(at, c.start) + keep;
      at = c.end;
    }
    title += text.slice(at);
    title = title.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
    for (let i = 0; i < 3; i++) title = title.replace(/^[,;:–-]+\s*|\s*[,;:–-]+$/g, '').replace(/\s+(at|on|by|for|with|to|and|in|from|due|about|until)$/i, '').trim();
    out.title = title.replace(/^\p{Ll}/u, (s) => s.toUpperCase());
    out.chips = chips;
    out.dueLabel = chips.find((c) => c.type === 'when' || c.type === 'repeat')?.label ?? null;
    return out;
  }

  /** "Task · Thu 1 Oct, 09:00 · Anna Kovacs · Offsite · €240.00" */
  function summary(r) {
    const parts = [r.kind];
    if (r.dueLabel) parts.push(r.dueLabel);
    if (r.duration && r.kind !== 'Event') parts.push(r.duration >= 60 ? `${+(r.duration / 60).toFixed(1)} h` : `${r.duration} min`);
    for (const p of r.people) parts.push(p.unknown ? `@${p.handle}` : p.name);
    if (r.project) parts.push(r.project);
    if (r.amount != null) parts.push(money(r.amount));
    if (r.priority) parts.push(`P${r.priority}`);
    return parts;
  }

  global.IntentParse = { parse, summary, money };
})(typeof window !== 'undefined' ? window : globalThis);
