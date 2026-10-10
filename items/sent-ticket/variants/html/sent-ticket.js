/* Sent Ticket.
   Submit → the form morphs into a ticket (element-scoped view transition, document one, or a plain fade).
   The stub tears off with a drag past a threshold, or with its button: it copies the ticket number or
   downloads an .ics reminder for the reply date. A damped spring brings it back or lets it go. */
(() => {
  const PULL_T = 96;    // drag distance (px) where the perforation gives way
  const STRAIN = 0.3;  // before the threshold the stub moves at 0.3 of the finger
  const TORN_AT = 30;   // where a torn stub rests (px along the tear axis)
  // finger distance → stub offset: resists inwards, strains up to the threshold, then hangs loose
  const pullMap = (d) => (d < 0 ? d * 0.12 : d <= PULL_T ? d * STRAIN : PULL_T * STRAIN + (d - PULL_T) * 0.85);
  const K = 420;        // spring stiffness
  const C = 24;         // spring damping (about 0.6 of critical)
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  /* integer hash from Hash Kit: shifts 16/14/15, own multipliers */
  function hashU(x) {
    x ^= x >>> 16; x = Math.imul(x, 0x3f9c86cb);
    x ^= x >>> 14; x = Math.imul(x, 0x1ae9dacf);
    x ^= x >>> 15;
    return x >>> 0;
  }
  const SALT = 0xb31c96c9;
  const hashText = (s) => { let h = SALT; for (let i = 0; i < s.length; i++) h = hashU((h + s.charCodeAt(i)) >>> 0); return h; };

  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MO = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const short = (s) => s.slice(0, 3);
  function addWorkdays(d, n) {
    const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    while (n > 0) { r.setDate(r.getDate() + 1); if (r.getDay() % 6 !== 0) n--; }
    return r;
  }

  /* ---------- .ics: RFC 5545 text escaping and 75-octet folding ---------- */
  const icsText = (s) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  function fold(line) {
    const enc = new TextEncoder();
    if (enc.encode(line).length <= 75) return line;
    const out = [];
    let cur = '';
    let bytes = 0;
    for (const ch of line) {
      const b = enc.encode(ch).length;
      if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
      cur += ch; bytes += b;
    }
    out.push(cur);
    return out.join('\r\n ');
  }
  const ymd = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const utcStamp = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  function makeIcs(t) {
    const end = new Date(t.due); end.setDate(end.getDate() + 1);
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Shelf//Sent Ticket//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${t.no.toLowerCase()}-${t.sent.getTime()}@sent-ticket`,
      `DTSTAMP:${utcStamp(new Date())}`,
      `DTSTART;VALUE=DATE:${ymd(t.due)}`,
      `DTEND;VALUE=DATE:${ymd(end)}`,
      `SUMMARY:${icsText(`Reply due · ticket ${t.no}`)}`,
      `DESCRIPTION:${icsText(`${t.replier} promised a reply to your message by ${WD[t.due.getDay()]} ${t.due.getDate()} ${MO[t.due.getMonth()]}. Ticket ${t.no}, sent ${t.sentText}.`)}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT17H', `DESCRIPTION:${icsText(`No reply yet? Ticket ${t.no}`)}`, 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'
    ];
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.append(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
      return ok;
    }
  }

  /* ---------- a paper rip: sparse crackle through a falling band-pass ---------- */
  let audio = null;
  function rip(root, strength = 1) {
    if (root.dataset.sound === 'off') return;
    try {
      audio ??= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const sr = audio.sampleRate;
      const len = Math.floor(sr * 0.26);
      const buf = audio.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      let s = hashU(len + 7);
      for (let i = 0; i < len; i++) {
        s = hashU((s + SALT) >>> 0);
        const r = s / 4294967296;
        const fibre = (s & 0xff) < 70 ? 1 : 0.18; // sparse clicks over a soft hiss
        const env = Math.pow(1 - i / len, 1.6);
        d[i] = (r * 2 - 1) * fibre * env;
      }
      const src = audio.createBufferSource(); src.buffer = buf;
      const bp = audio.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
      const t0 = audio.currentTime;
      bp.frequency.setValueAtTime(3200, t0); bp.frequency.exponentialRampToValueAtTime(1100, t0 + 0.24);
      const g = audio.createGain(); g.gain.value = 0.32 * strength;
      src.connect(bp).connect(g).connect(audio.destination);
      src.start();
    } catch { /* no audio, no problem */ }
  }

  // vibration only after a real gesture: Chrome logs an error otherwise
  const buzz = (ms) => { if (navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.(ms); };

  let instances = 0;

  function init(root) {
    if (root.st) return root.st;
    const n = ++instances;
    const $ = (s) => root.querySelector(s);
    const form = $('.st-form');
    const done = $('.st-done-view');
    const ticket = $('.st-ticket');
    const stub = $('.st-stub');
    const send = $('.st-send');
    const status = $('[data-st="status"]');
    const tearBtn = $('.st-tear');
    const tearLabel = $('[data-st="tear"]');
    const doneText = $('[data-st="done"] span');
    const radios = [...root.querySelectorAll('.st-choice input')];
    radios.forEach((r) => { r.name = `st-act-${n}`; });
    const prefix = root.dataset.prefix || 'NO';
    const replier = root.dataset.replier || 'I';
    const days = Number(root.dataset.replyDays || 3);
    let t = null; // the current ticket
    let sending = false;

    const action = () => radios.find((r) => r.checked)?.value || 'copy';
    const actionWord = () => (action() === 'ics' ? 'save the reminder' : 'copy the number');
    function syncTearLabel(loose = false) {
      if (stub.classList.contains('is-torn')) { tearLabel.textContent = 'Put the stub back'; tearBtn.setAttribute('aria-label', 'Put the stub back'); return; }
      tearLabel.textContent = loose ? (action() === 'ics' ? 'Release to save' : 'Release to copy') : 'Tear to save';
      tearBtn.setAttribute('aria-label', `Tear off the stub and ${actionWord()}`);
    }
    radios.forEach((r) => r.addEventListener('change', () => syncTearLabel()));

    /* ---------- fill the ticket ---------- */
    function fill(data, now) {
      const key = `${data.name}|${data.email}|${data.message}|${now.getTime()}`;
      const h = hashText(key);
      const no = `${prefix}-${1000 + (h % 9000)}`;
      const due = addWorkdays(now, days);
      const sentText = `${short(WD[now.getDay()])} ${now.getDate()} ${short(MO[now.getMonth()])}, ${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const dueText = `${short(WD[due.getDay()])} ${due.getDate()} ${short(MO[due.getMonth()])}`;
      const soon = (due - now) / 864e5 < 6.5;
      t = { no, due, sent: now, sentText, replier, h };
      $('[data-st="no"]').textContent = no;
      $('[data-st="from"]').textContent = data.name;
      $('[data-st="sent"]').textContent = sentText;
      $('[data-st="due"]').textContent = dueText;
      const when = soon ? WD[due.getDay()] : `${due.getDate()} ${MO[due.getMonth()]}`;
      const promise = $('[data-st="promise"]');
      promise.textContent = '';
      promise.append(`${replier === 'I' ? 'I’ll' : `${replier} will`} reply by `, Object.assign(document.createElement('b'), { textContent: when }), '.');
      drawBarcode($('[data-st="barcode"]'), h);
      return { no, when, dueLong: `${WD[due.getDay()]}, ${due.getDate()} ${MO[due.getMonth()]}` };
    }
    function drawBarcode(svg, seed) {
      const bars = [];
      let x = 0;
      let s = seed;
      while (x < 118) {
        s = hashU((s + SALT) >>> 0);
        const w = 1 + (s & 3);           // bar 1–4
        const gap = 1 + ((s >>> 2) & 1) + ((s >>> 3) & 1); // gap 1–3
        if (x + w > 120) break;
        bars.push(`<rect x="${x}" y="0" width="${w}" height="34"/>`);
        x += w + gap;
      }
      svg.setAttribute('viewBox', `0 0 ${x} 34`);
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.innerHTML = `<g fill="currentColor">${bars.join('')}</g>`;
    }

    /* ---------- the morph ---------- */
    function morph(update, names) {
      const scoped = typeof root.startViewTransition === 'function';
      const docVT = typeof document.startViewTransition === 'function';
      if (reduce.matches || (!scoped && !docVT)) {
        update();
        const shown = form.hidden ? ticket : form;
        shown.animate?.([{ opacity: 0, transform: reduce.matches ? 'none' : 'translateY(8px) scale(0.98)' }, { opacity: 1, transform: 'none' }], { duration: reduce.matches ? 160 : 320, easing: 'cubic-bezier(.23,1,.32,1)' });
        return Promise.resolve();
      }
      const tag = (on) => {
        for (const [el, cls] of names()) {
          el.style.viewTransitionName = on ? `st-${cls}-${n}` : '';
          el.style.viewTransitionClass = on ? `st-${cls}` : '';
        }
      };
      tag(true);
      let vt;
      try {
        vt = scoped ? root.startViewTransition(() => { tag(false); update(); tag(true); }) : document.startViewTransition(() => { tag(false); update(); tag(true); });
      } catch { tag(false); update(); return Promise.resolve(); }
      vt.ready.catch(() => {});
      return vt.finished.catch(() => {}).finally(() => tag(false));
    }
    const formNames = () => [[form, 'card'], [send, 'stub']];
    const ticketNames = () => [[ticket, 'card'], [stub, 'stub']];

    function showTicket(data, now = new Date(), animate = true) {
      const info = fill(data, now);
      resetStub();
      const update = () => { form.hidden = true; done.hidden = false; };
      const after = () => {
        $('.st-title').focus({ preventScroll: true });
        status.textContent = `Message sent. Ticket ${info.no}. ${replier === 'I' ? 'I’ll' : `${replier} will`} reply by ${info.dueLong}.`;
      };
      if (!animate) { update(); return; }
      // names on the form side before the snapshot, on the ticket side after the update
      const names = () => (form.hidden ? ticketNames() : formNames());
      morph(update, names).then(after);
      root.dispatchEvent(new CustomEvent('sent', { bubbles: true, detail: { number: info.no, due: t.due } }));
    }
    function showForm() {
      const names = () => (form.hidden ? ticketNames() : formNames());
      morph(() => { done.hidden = true; form.hidden = false; form.elements.message.value = ''; }, names).then(() => {
        form.elements.message.focus({ preventScroll: true });
        status.textContent = '';
      });
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (sending) return;
      const data = { name: form.elements.name.value.trim(), email: form.elements.email.value.trim(), message: form.elements.message.value.trim() };
      sending = true;
      send.setAttribute('aria-disabled', 'true');
      $('.st-send__label').textContent = 'Sending…';
      // no backend here: the "send" is a short pause. Hook a real request in via root.st.send = async (data) => {...}
      Promise.resolve(api.send ? api.send(data) : new Promise((ok) => setTimeout(ok, reduce.matches ? 150 : 520))).then(() => {
        sending = false;
        send.removeAttribute('aria-disabled');
        $('.st-send__label').textContent = 'Send';
        showTicket(data, api.now ? api.now() : new Date());
      }, () => {
        sending = false;
        send.removeAttribute('aria-disabled');
        $('.st-send__label').textContent = 'Send';
        status.textContent = 'Not sent. Check the connection and try again.';
      });
    });
    $('.st-again').addEventListener('click', showForm);

    /* ---------- the stub: pose, spring, drag ---------- */
    let o = 0; // offset along the tear axis, px
    let v = 0;
    let target = 0;
    let raf = 0;
    let last = 0;
    const axis = () => (getComputedStyle(stub).getPropertyValue('--st-axis').trim() === 'y' ? 'y' : 'x');
    function pose() {
      const ax = axis();
      const torn = stub.classList.contains('is-torn');
      const rot = Math.max(-8, Math.min(8, o * 0.2));
      const drift = torn || o > PULL_T * STRAIN ? Math.max(0, o - 14) * 0.3 : 0; // a loose stub sags a little
      if (ax === 'x') { stub.style.translate = `${o.toFixed(2)}px ${drift.toFixed(2)}px`; stub.style.rotate = `${rot.toFixed(2)}deg`; }
      else { stub.style.translate = `${(-drift).toFixed(2)}px ${o.toFixed(2)}px`; stub.style.rotate = `${(-rot).toFixed(2)}deg`; }
    }
    function step(ts) {
      const dt = Math.min(1 / 30, last ? (ts - last) / 1000 : 1 / 60);
      last = ts;
      const a = -K * (o - target) - C * v;
      v += a * dt;
      o += v * dt;
      pose();
      if (Math.abs(o - target) < 0.15 && Math.abs(v) < 4) { o = target; v = 0; pose(); raf = 0; last = 0; return; }
      raf = requestAnimationFrame(step);
    }
    function springTo(to, v0 = v) {
      target = to; v = v0;
      if (reduce.matches) { o = to; v = 0; pose(); return; }
      if (!raf) { last = 0; raf = requestAnimationFrame(step); }
    }
    function resetStub() {
      cancelAnimationFrame(raf); raf = 0;
      o = 0; v = 0; target = 0;
      stub.classList.remove('is-torn', 'is-loose', 'is-dragging');
      stub.style.translate = ''; stub.style.rotate = '';
      syncTearLabel();
    }

    async function tear(vel = 0) {
      stub.classList.remove('is-loose');
      stub.classList.add('is-torn');
      springTo(TORN_AT, vel);
      rip(root);
      buzz(12);
      syncTearLabel();
      const what = action();
      const icon = $('[data-st="done"]');
      if (what === 'copy') {
        const ok = await copyText(t.no);
        doneText.textContent = ok ? `${t.no} copied` : `Copy failed: ${t.no}`;
        icon.toggleAttribute('data-fail', !ok);
        status.textContent = ok ? `Ticket number ${t.no} copied.` : `Couldn’t copy. The number is ${t.no}.`;
      } else {
        const blob = new Blob([makeIcs(t)], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), { href: url, download: `reply-${t.no.toLowerCase()}.ics` });
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        doneText.textContent = 'Reminder saved';
        status.textContent = `Calendar reminder for ${WD[t.due.getDay()]} saved as a file.`;
      }
      root.dispatchEvent(new CustomEvent('stub', { bubbles: true, detail: { action: what, number: t.no } }));
    }
    function putBack() {
      stub.classList.remove('is-torn');
      springTo(0, 0);
      syncTearLabel();
      status.textContent = 'Stub back in place.';
    }

    let drag = null;
    stub.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || stub.classList.contains('is-torn')) return;
      if (e.target.closest('.st-tear')) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, ax: axis(), moved: false, lastP: 0, lastT: e.timeStamp, vel: 0 };
      cancelAnimationFrame(raf); raf = 0;
    });
    stub.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag.ax === 'x' ? e.clientX - drag.x : e.clientY - drag.y;
      if (!drag.moved) {
        const cross = drag.ax === 'x' ? Math.abs(e.clientY - drag.y) : Math.abs(e.clientX - drag.x);
        if (Math.abs(d) < 6) return;
        if (cross > Math.abs(d)) { drag = null; return; } // a scroll or a sideways move, not a tear
        drag.moved = true;
        stub.setPointerCapture(e.pointerId);
        stub.classList.add('is-dragging');
      }
      // resists inwards, strains up to the threshold, then hangs loose
      const p = pullMap(d);
      const dt = Math.max(1, e.timeStamp - drag.lastT);
      drag.vel = ((p - drag.lastP) / dt) * 1000;
      drag.lastP = p; drag.lastT = e.timeStamp;
      o = p; pose();
      const loose = d >= PULL_T;
      if (loose !== stub.classList.contains('is-loose')) {
        stub.classList.toggle('is-loose', loose);
        syncTearLabel(loose);
        if (loose) buzz(6);
      }
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const moved = drag.moved;
      const vel = Math.max(-1500, Math.min(1500, drag.vel));
      drag = null;
      stub.classList.remove('is-dragging');
      if (!moved) return;
      stub.dataset.justDragged = "1";
      setTimeout(() => { delete stub.dataset.justDragged; }, 0);
      if (stub.classList.contains('is-loose') && e.type === 'pointerup') tear(vel);
      else { stub.classList.remove('is-loose'); syncTearLabel(); springTo(0, vel); }
    };
    stub.addEventListener('pointerup', end);
    stub.addEventListener('pointercancel', end);
    // a drag that started on a pill should not also pick it
    stub.addEventListener('click', (e) => { if (stub.dataset.justDragged) { e.preventDefault(); e.stopPropagation(); } }, true);

    tearBtn.addEventListener('click', () => {
      if (stub.classList.contains('is-torn')) putBack();
      else tear(reduce.matches ? 0 : 900);
    });

    const api = {
      send: null,
      now: null,
      /* jump straight to a ticket: poster frames and tests */
      show(data, now = new Date()) { showTicket(data, now, false); },
      /* pull the stub to a raw drag distance without letting go */
      pull(d) {
        const p = pullMap(d);
        o = p; pose();
        stub.classList.toggle('is-loose', d >= PULL_T);
        syncTearLabel(d >= PULL_T);
      },
      tear: () => tear(0),
      reset: resetStub
    };
    root.st = api;
    syncTearLabel();
    return api;
  }

  const boot = () => document.querySelectorAll('.st').forEach(init);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  window.SentTicket = { init };
})();
