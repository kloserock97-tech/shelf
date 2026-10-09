/* Inline Slot Picker.
   Markup: .spk with a <script type="application/json" class="spk-config"> and empty .spk-clock, .spk-days, .spk-zone,
   .spk-slots, .spk-pick, .spk-status. Hours are written in the host's time zone and shown in the visitor's one.
   Picking a slot builds an .ics file (Blob, text/calendar) and a mailto: link with the subject filled in.
   Optional on .spk: data-now (ISO instant) and data-visitor-tz (IANA name) to pin the clock and the zone. */
(() => {
  const WEEK = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const DAY = 86400000;

  // Hash Kit mixer (items/hash-kit): decides which slots are already taken, the same way on every load
  function hashU(x) {
    x ^= x >>> 16; x = Math.imul(x, 0x3f9c86cb);
    x ^= x >>> 14; x = Math.imul(x, 0x1ae9dacf);
    x ^= x >>> 15;
    return x >>> 0;
  }
  const hashUnit = (h) => (h >>> 8) / 16777216;

  // ---- time zones: Temporal when the browser has it, Intl arithmetic otherwise
  const partFmt = new Map();
  function partsIn(ms, tz) {
    let f = partFmt.get(tz);
    if (!f) {
      f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short' });
      partFmt.set(tz, f);
    }
    const p = {};
    for (const { type, value } of f.formatToParts(ms)) p[type] = value;
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second, wd: p.weekday.toLowerCase().slice(0, 3) };
  }
  function offsetAt(ms, tz) {
    const p = partsIn(ms, tz);
    return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
  }
  function zonedToEpoch(tz, y, m, d, h, mi) {
    const T = globalThis.Temporal;
    if (T && T.ZonedDateTime) {
      return T.ZonedDateTime.from({ timeZone: tz, year: y, month: m, day: d, hour: h, minute: mi }).epochMilliseconds;
    }
    const wall = Date.UTC(y, m - 1, d, h, mi);
    const first = wall - offsetAt(wall, tz);
    return wall - offsetAt(first, tz); // second pass settles slots next to a DST switch
  }
  const dateKey = (p) => `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
  const city = (tz) => (tz.split('/').pop() || tz).replace(/_/g, ' ');

  // ---- .ics
  const icsEscape = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const icsStamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  function fold(line) {
    // lines longer than 75 octets continue on the next line after a space (RFC 5545 §3.1)
    const enc = new TextEncoder();
    const out = [];
    let cur = '';
    let bytes = 0;
    for (const ch of line) {
      const n = enc.encode(ch).length;
      if (bytes + n > (out.length ? 74 : 75)) {
        out.push(cur);
        cur = '';
        bytes = 0;
      }
      cur += ch;
      bytes += n;
    }
    out.push(cur);
    return out.join('\r\n ');
  }
  function buildIcs({ uid, start, end, summary, description, organizer, now }) {
    return [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Shelf//Inline Slot Picker//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${icsStamp(now)}`,
      `DTSTART:${icsStamp(start)}`,
      `DTEND:${icsStamp(end)}`,
      `SUMMARY:${icsEscape(summary)}`,
      `DESCRIPTION:${icsEscape(description)}`,
      `ORGANIZER;CN=${icsEscape(organizer.name)}:mailto:${organizer.email}`,
      'STATUS:TENTATIVE',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Call starts in 10 minutes', 'TRIGGER:-PT10M', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR', ''
    ].map(fold).join('\r\n');
  }

  // ---- roving focus for a radiogroup of buttons: arrows, Home, End; selection follows focus
  function rove(group, onPick) {
    group.addEventListener('keydown', (e) => {
      const items = [...group.querySelectorAll('[role="radio"]:not([aria-disabled="true"])')];
      const i = items.indexOf(document.activeElement);
      if (i < 0) return;
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      let j = null;
      if (step) j = (i + step + items.length) % items.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = items.length - 1;
      if (j == null) return;
      e.preventDefault();
      items[j].focus();
      onPick(items[j]);
    });
    group.addEventListener('click', (e) => {
      const b = e.target.closest('[role="radio"]');
      if (b && group.contains(b) && b.getAttribute('aria-disabled') !== 'true') onPick(b);
    });
  }
  function check(group, btn) {
    for (const b of group.querySelectorAll('[role="radio"]')) {
      const on = b === btn;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    }
  }

  function init(root) {
    if (root.spk) return;
    const cfg = Object.assign(
      { host: 'Host', hostTimeZone: 'UTC', email: 'hello@example.com', minutes: 20, step: 30, days: 7, leadHours: 3, takenShare: 0.3, seed: 1, subject: 'Intro call', week: {} },
      JSON.parse(root.querySelector('.spk-config')?.textContent || '{}')
    );
    const els = {
      clock: root.querySelector('.spk-clock'),
      days: root.querySelector('.spk-days'),
      zone: root.querySelector('.spk-zone'),
      slots: root.querySelector('.spk-slots'),
      pick: root.querySelector('.spk-pick'),
      status: root.querySelector('.spk-status')
    };
    // words (weekday, month) follow the page language; the 12/24-hour clock follows the visitor
    const locale = root.dataset.locale || root.closest('[lang]')?.lang || 'en';
    const hourCycle = root.dataset.hourCycle || new Intl.DateTimeFormat(navigator.language || locale, { hour: 'numeric' }).resolvedOptions().hourCycle || 'h23';
    const visitorTz = root.dataset.visitorTz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const pinned = root.dataset.now ? Date.parse(root.dataset.now) : NaN;
    const born = Date.now();
    const now = () => (Number.isFinite(pinned) ? pinned + (Date.now() - born) : Date.now());

    const fmtTime = (tz) => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle, timeZone: tz });
    const tVisitor = fmtTime(visitorTz);
    const tHost = fmtTime(cfg.hostTimeZone);
    const fDay = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
    const fNum = new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone: 'UTC' });
    const fLong = new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric', timeZone: visitorTz });
    const fFull = new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
    const fOffset = (tz) => {
      try {
        return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(now()).find((p) => p.type === 'timeZoneName')?.value || '';
      } catch { return ''; }
    };

    // ---- slots: host hours → instants → grouped by the visitor's calendar day
    function buildSlots() {
      const t = now();
      const earliest = t + cfg.leadHours * 3600000;
      const byDay = new Map();
      const hostToday = partsIn(t, cfg.hostTimeZone);
      for (let k = -1; k <= cfg.days + 1; k++) {
        const base = new Date(Date.UTC(hostToday.y, hostToday.m - 1, hostToday.d + k));
        const y = base.getUTCFullYear(), m = base.getUTCMonth() + 1, d = base.getUTCDate();
        for (const span of cfg.week[WEEK[base.getUTCDay()]] || []) {
          const [a, b] = span.split('-').map((s) => s.split(':').map(Number));
          for (let min = a[0] * 60 + a[1]; min + cfg.minutes <= b[0] * 60 + b[1]; min += cfg.step) {
            const start = zonedToEpoch(cfg.hostTimeZone, y, m, d, Math.floor(min / 60), min % 60);
            if (start < earliest) continue;
            if (hashUnit(hashU(((start / 60000) ^ Math.imul(cfg.seed, 0x9e37)) >>> 0)) < cfg.takenShare) continue;
            const key = dateKey(partsIn(start, visitorTz));
            if (!byDay.has(key)) byDay.set(key, []);
            byDay.get(key).push(start);
          }
        }
      }
      for (const list of byDay.values()) list.sort((p, q) => p - q);
      return byDay;
    }

    let byDay = new Map();
    let dayKey = null;
    let picked = null;
    let blobUrl = null;

    function renderDays() {
      const v = partsIn(now(), visitorTz);
      els.days.textContent = '';
      let first = null;
      for (let k = 0; k < cfg.days; k++) {
        const utc = Date.UTC(v.y, v.m - 1, v.d + k);
        const dt = new Date(utc);
        const key = dateKey({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() });
        const n = (byDay.get(key) || []).length;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'spk-day';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', 'false');
        b.tabIndex = -1;
        b.dataset.key = key;
        const label = k === 0 ? 'Today' : k === 1 ? 'Tomorrow' : fDay.format(utc);
        b.innerHTML = `<span class="spk-day__wd">${label}</span><span class="spk-day__num">${fNum.format(utc)}</span><span class="spk-day__n">${n ? `${n} free` : '—'}</span>`;
        b.setAttribute('aria-label', `${fFull.format(utc)}, ${n ? `${n} free slot${n === 1 ? '' : 's'}` : 'no free slots'}`);
        if (!n) b.setAttribute('aria-disabled', 'true');
        else if (!first) first = b;
        els.days.appendChild(b);
      }
      const keep = dayKey && els.days.querySelector(`[data-key="${dayKey}"]:not([aria-disabled])`);
      const target = keep || first;
      if (target) selectDay(target, { quiet: true });
      else {
        els.slots.innerHTML = `<p class="spk-empty">No free time this week. Write to <a href="mailto:${cfg.email}">${cfg.email}</a>.</p>`;
        const any = els.days.querySelector('.spk-day');
        if (any) any.tabIndex = 0;
      }
    }

    function selectDay(btn, { quiet = false } = {}) {
      check(els.days, btn);
      dayKey = btn.dataset.key;
      const list = byDay.get(dayKey) || [];
      const cascade = !quiet; // reduced motion turns the cascade into a fade in CSS
      const native = typeof CSS !== 'undefined' && CSS.supports('order', 'sibling-index()');
      els.slots.textContent = '';
      els.slots.classList.toggle('is-entering', cascade);
      const focusAt = Math.max(0, list.indexOf(picked));
      list.forEach((start, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'spk-slot';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(start === picked));
        b.tabIndex = i === focusAt ? 0 : -1;
        b.dataset.start = start;
        b.textContent = tVisitor.format(start);
        if (!native) b.style.setProperty('--i', i);
        els.slots.appendChild(b);
      });
    }

    function pickSlot(btn, { quiet = false } = {}) {
      check(els.slots, btn);
      const start = Number(btn.dataset.start);
      const end = start + cfg.minutes * 60000;
      picked = start;
      const when = `${fLong.format(start)}, ${tVisitor.format(start)}–${tVisitor.format(end)}`;
      const hostWhen = `${tHost.format(start)}–${tHost.format(end)}`;
      const zone = fOffset(visitorTz);
      const subject = `${cfg.subject}: ${fLong.format(start)}, ${tVisitor.format(start)} (${zone})`;
      const body = `Hi ${cfg.host},\n\nCould we talk on ${when} my time (${visitorTz}), which is ${hostWhen} for you?\n\nThanks!`;

      if (blobUrl) URL.revokeObjectURL(blobUrl);
      const ics = buildIcs({
        uid: `${start}-${hashU(start / 60000 >>> 0).toString(36)}@${cfg.email.split('@')[1] || 'example.com'}`,
        start, end, now: now(),
        summary: `${cfg.subject} with ${cfg.host}`,
        description: `Requested by email. ${cfg.host} confirms by reply. ${cfg.host}'s time: ${hostWhen} (${cfg.hostTimeZone}).`,
        organizer: { name: cfg.host, email: cfg.email }
      });
      blobUrl = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
      const stamp = icsStamp(start).slice(0, 13).replace('T', '-');

      els.pick.innerHTML = `
        <p class="spk-pick__when">${when}<span> your time</span></p>
        <p class="spk-pick__host">${hostWhen} for ${cfg.host} in ${city(cfg.hostTimeZone)}</p>
        <div class="spk-pick__actions">
          <a class="spk-btn spk-btn--primary" href="mailto:${cfg.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}">
            <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.75" y="3.25" width="12.5" height="9.5" rx="2"/><path d="m2.5 4.5 5.5 4.25 5.5-4.25"/></svg>Request by email</a>
          <a class="spk-btn" href="${blobUrl}" download="call-${stamp}.ics">
            <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.75" y="2.75" width="12.5" height="11.5" rx="2"/><path d="M1.75 6.25h12.5M5 1.25v3M11 1.25v3M8 8.25v3.5M6.25 10h3.5"/></svg>Add to calendar</a>
        </div>`;
      els.pick.hidden = false;
      els.pick.classList.toggle('is-entering', !quiet);
      if (els.status && !quiet) els.status.textContent = `${when} picked. Request it by email or add it to your calendar.`;
    }

    rove(els.days, (b) => selectDay(b));
    rove(els.slots, (b) => pickSlot(b));

    // ---- the host's clock, once a minute, only while the tab is visible
    let tick = 0;
    function paintClock() {
      const t = now();
      const diffH = (offsetAt(t, cfg.hostTimeZone) - offsetAt(t, visitorTz)) / 3600000;
      const rel = diffH === 0 ? 'same time as you'
        : `${Math.abs(diffH)} h ${diffH > 0 ? 'ahead of' : 'behind'} you`;
      const hp = partsIn(t, cfg.hostTimeZone);
      const mins = hp.h * 60 + hp.mi;
      const open = (cfg.week[hp.wd] || []).some((span) => {
        const [a, b] = span.split('-').map((s) => s.split(':').map(Number));
        return mins >= a[0] * 60 + a[1] && mins < b[0] * 60 + b[1];
      });
      els.clock.classList.toggle('is-open', open);
      els.clock.innerHTML = `<span class="spk-clock__dot" aria-hidden="true"></span><span>It’s <time>${tHost.format(t)}</time> for ${cfg.host} now · ${city(cfg.hostTimeZone)}, ${rel}</span>`;
      if (els.zone) els.zone.textContent = `Times in your time zone · ${city(visitorTz)} (${fOffset(visitorTz)})`;
      clearTimeout(tick);
      tick = setTimeout(paintClock, 60000 - (t % 60000) + 50);
    }
    function refresh() {
      byDay = buildSlots();
      renderDays();
      paintClock();
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearTimeout(tick);
      else refresh();
    });
    refresh();

    root.spk = {
      // for demos: open a day by index among days with slots, then pick the n-th slot
      show(dayIndex = 0, slotIndex = 0) {
        const days = [...els.days.querySelectorAll('.spk-day:not([aria-disabled])')];
        const d = days[Math.min(dayIndex, days.length - 1)];
        if (!d) return;
        selectDay(d, { quiet: true });
        const s = els.slots.querySelectorAll('.spk-slot')[slotIndex];
        if (s) pickSlot(s, { quiet: true });
      },
      ics: () => blobUrl
    };
  }

  const boot = () => document.querySelectorAll('.spk').forEach(init);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
