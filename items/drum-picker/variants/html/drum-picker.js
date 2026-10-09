// Drum Wheel Picker.
// A wheel is a vertical scroller with scroll-snap; every row turns on the drum through a CSS animation on its own
// view() timeline, so the 3D follows the scroll without script. Where animation-timeline is missing, a rAF pass on
// scroll writes the same transform. The script only ticks on every row that crosses the centre, reads the value where
// the scroll came to rest and couples the wheels (day count follows month and year).
//   DrumPicker.wheel(el, { values, labels, index, label, onChange })  — one wheel
//   DrumPicker.date(root, { value: Date, from: 1950, to: 2050 })       — month / day / year, dispatches "change"
// Markup for auto start: <div class="dp" data-date="2026-11-14" data-from="1950" data-to="2050"></div>
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const hasTimeline = CSS.supports?.('animation-timeline: view()') ?? false;
  const hasScrollEnd = 'onscrollend' in window;
  const hasSnapChange = 'onscrollsnapchange' in window;
  // the drum: rows of --dp-row px in a wheel of --dp-h px, radius R; must match the keyframes in drum-picker.css
  const R = 130;
  const PERSP = 600;

  /* ---- sound: a short ratchet click synthesised on the fly, no files ---- */
  const sound = (() => {
    const AC = window.AudioContext || window.webkitAudioContext;
    let ctx = null, out = null, noise = null;
    // Hash Kit mixer (items/hash-kit): seeded noise for the click
    const hashU = (x) => { x ^= x >>> 16; x = Math.imul(x, 0x3f9c86cb); x ^= x >>> 14; x = Math.imul(x, 0x1ae9dacf); x ^= x >>> 15; return x >>> 0; };
    function wake() {
      if (!AC) return;
      if (!ctx) {
        ctx = new AC();
        out = ctx.createGain();
        out.gain.value = 0.5;
        out.connect(ctx.destination);
        const n = Math.round(ctx.sampleRate * 0.04);
        noise = ctx.createBuffer(1, n, ctx.sampleRate);
        const d = noise.getChannelData(0);
        let s = 3;
        for (let i = 0; i < n; i++) { s = (s + 0xb31c96c9) >>> 0; d[i] = hashU(s) / 2147483648 - 1; }
      }
      if (ctx.state === 'suspended') ctx.resume();
    }
    let last = 0;
    function click(f = 2000) {
      if (!ctx || ctx.state !== 'running') return;
      const t = ctx.currentTime;
      const gap = t - last;
      if (gap < 0.022) return; // a fast fling stays a purr, not a buzz
      last = t;
      const gain = gap < 0.06 ? 0.16 : 0.28; // quieter when the wheel spins fast
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = 4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.0008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
      src.connect(bp).connect(g).connect(out);
      src.start(t);
      src.stop(t + 0.025);
    }
    return { wake, click };
  })();
  const buzz = (ms) => { if (navigator.vibrate && navigator.userActivation?.hasBeenActive !== false) try { navigator.vibrate(ms); } catch { /* not allowed here */ } };

  function wheel(el, { values, labels = values.map(String), index = 0, label = '', pitch = 2000, sound: soundOn = () => true, onChange = () => {} }) {
    el.classList.add('dp__wheel');
    el.tabIndex = 0;
    el.setAttribute('role', 'spinbutton');
    if (label) el.setAttribute('aria-label', label);
    const list = document.createElement('ul');
    list.className = 'dp__list';
    list.setAttribute('aria-hidden', 'true');
    const rows = labels.map((t, i) => {
      const li = document.createElement('li');
      li.className = 'dp__item';
      // the row is the snap target and stays put; its face turns (a transformed snap target throws Chrome's snap off)
      const face = document.createElement('span');
      face.className = 'dp__face';
      face.textContent = t;
      li.append(face);
      li.dataset.i = i;
      list.append(li);
      return li;
    });
    el.replaceChildren(list);

    const w = { el, values, rows, index: -1, live: -1, max: values.length - 1, dragging: false, raf: 0, timer: 0 };
    const rowH = () => rows[0].offsetHeight || 36;
    const at = () => Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / rowH())));

    function aria() {
      el.setAttribute('aria-valuemin', String(values[0]));
      el.setAttribute('aria-valuemax', String(values[w.max]));
      el.setAttribute('aria-valuenow', String(values[w.index]));
      el.setAttribute('aria-valuetext', labels[w.index]);
    }

    // fallback for browsers without scroll-driven animations: the same drum, written per frame while scrolling
    function drum() {
      const h = rowH();
      const mid = el.scrollTop + el.clientHeight / 2;
      const first = Math.max(0, Math.floor((mid - el.clientHeight) / h));
      const last = Math.min(rows.length - 1, Math.ceil((mid + el.clientHeight) / h));
      for (let i = first; i <= last; i++) {
        const d = Math.max(-R * 1.15, Math.min(R * 1.15, rows[i].offsetTop + h / 2 - mid));
        const th = d / R;
        const dy = R * Math.sin(th) - d;
        const dz = R * (Math.cos(th) - 1);
        rows[i].firstChild.style.transform = `perspective(${PERSP}px) translate3d(0, ${dy.toFixed(2)}px, ${dz.toFixed(2)}px) rotateX(${(-th * 180 / Math.PI).toFixed(2)}deg)`;
        rows[i].firstChild.style.opacity = Math.max(0.12, Math.cos(th) ** 1.2).toFixed(3);
      }
    }

    function frame() {
      w.raf = 0;
      if (!hasTimeline) drum();
      const i = at();
      if (i !== w.live) {
        if (w.live !== -1 && !w.silent) {
          if (soundOn()) sound.click(pitch);
          buzz(3);
        }
        w.live = i;
        rows.forEach((r, k) => r.classList.toggle('is-centre', k === i));
      }
    }
    el.addEventListener('scroll', () => {
      if (!w.raf) w.raf = requestAnimationFrame(frame);
      if (!hasScrollEnd && !w.dragging) { clearTimeout(w.timer); w.timer = setTimeout(settle, 140); }
    }, { passive: true });
    el.addEventListener('scrollend', () => { if (!w.dragging) settle(); });
    if (hasSnapChange) el.addEventListener('scrollsnapchange', () => { if (!w.dragging) settle(); });

    function settle() {
      if (w.dragging) return;
      const i = at();
      if (Math.abs(el.scrollTop - i * rowH()) > 2) return; // still on the way
      w.silent = false;
      w.pending = null;
      if (i > w.max) return set(w.max, true); // a day the month does not have: roll back
      if (i === w.index) return;
      w.index = i;
      aria();
      onChange(values[i], i);
    }

    function set(i, smooth) {
      i = Math.max(0, Math.min(w.max, i));
      w.pending = i; // quick key presses add up from here, not from the value still on its way
      const top = i * rowH();
      if (Math.abs(el.scrollTop - top) < 1) { settle(); return; }
      el.scrollTo({ top, behavior: smooth && !reduced.matches ? 'smooth' : 'instant' });
    }
    w.set = set;
    /** rows above max are shown but disabled; a value past them rolls back */
    w.limit = (max) => {
      w.max = max;
      rows.forEach((r, k) => r.classList.toggle('is-off', k > max));
      el.setAttribute('aria-valuemax', String(values[max]));
      if (w.index > max) set(max, true);
    };

    // keyboard: up adds, down takes away (spinbutton); page keys jump by five
    el.addEventListener('keydown', (e) => {
      const i = w.pending ?? w.index;
      const step = { ArrowUp: 1, ArrowDown: -1, PageUp: 5, PageDown: -5 }[e.key];
      if (step) { e.preventDefault(); set(i + step, true); return; }
      if (e.key === 'Home') { e.preventDefault(); set(0, true); }
      else if (e.key === 'End') { e.preventDefault(); set(w.max, true); }
    });

    // a tap on a row above or below the centre brings it to the centre
    el.addEventListener('click', (e) => {
      if (w.moved) { w.moved = false; return; }
      const row = e.target.closest('.dp__item');
      if (row && !row.classList.contains('is-off')) set(+row.dataset.i, true);
    });

    // a mouse cannot drag a scroller: its own drag with snap off, a short projection and the nearest row on release
    let drag = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      drag = { y: e.clientY, top: el.scrollTop, moved: false, samples: [[e.timeStamp, e.clientY]] };
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dy = e.clientY - drag.y;
      if (!drag.moved) {
        if (Math.abs(dy) < 4) return;
        drag.moved = true;
        w.dragging = true;
        el.setPointerCapture(e.pointerId);
        el.classList.add('is-dragging');
      }
      el.scrollTop = drag.top - dy;
      drag.samples.push([e.timeStamp, e.clientY]);
      while (drag.samples.length > 2 && e.timeStamp - drag.samples[0][0] > 100) drag.samples.shift();
    });
    const endDrag = (e) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (!d.moved) return;
      w.moved = true;
      const [t0, y0] = d.samples[0];
      const v = (e.clientY - y0) / Math.max(16, e.timeStamp - t0);
      const aim = Math.round((el.scrollTop - v * 260) / rowH());
      w.dragging = false;
      let done = false;
      // snap stays off until the ride ends: turned back on mid-way, the browser re-snaps to the old row
      const back = () => { if (done) return; done = true; el.classList.remove('is-dragging'); settle(); };
      if (hasScrollEnd) el.addEventListener('scrollend', back, { once: true });
      setTimeout(back, reduced.matches ? 0 : 800);
      set(aim, true);
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);

    // start: put the wheel on its row without ticking
    w.silent = true;
    w.index = Math.max(0, Math.min(values.length - 1, index));
    el.scrollTop = w.index * rowH();
    w.live = w.index;
    rows[w.index].classList.add('is-centre');
    aria();
    if (!hasTimeline) drum();
    return w;
  }

  function daysIn(month, year) { return new Date(year, month + 1, 0).getDate(); }

  function date(root, { value = new Date(), from = 1950, to = 2050, locale = document.documentElement.lang || 'en' } = {}) {
    root.classList.add('dp');
    const soundOn = () => root.dataset.sound !== 'off';
    for (const type of ['pointerdown', 'touchend', 'keydown', 'wheel']) root.addEventListener(type, () => soundOn() && sound.wake(), { passive: true, capture: true });
    const monthNames = Array.from({ length: 12 }, (_, m) => new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(2001, m, 1)));
    const years = Array.from({ length: to - from + 1 }, (_, k) => from + k);
    const days = Array.from({ length: 31 }, (_, k) => k + 1);
    let y = Math.min(to, Math.max(from, value.getFullYear()));
    let m = value.getMonth();
    let d = value.getDate();

    root.replaceChildren();
    const lens = document.createElement('div');
    lens.className = 'dp__lens';
    lens.setAttribute('aria-hidden', 'true');
    const wrap = document.createElement('div');
    wrap.className = 'dp__wheels';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', root.getAttribute('aria-label') || 'Date');
    const mk = (cls) => { const el = document.createElement('div'); el.className = cls; wrap.append(el); return el; };
    const elM = mk('dp__wheel dp__wheel--month');
    const elD = mk('dp__wheel dp__wheel--day');
    const elY = mk('dp__wheel dp__wheel--year');
    root.append(lens, wrap);

    const emit = () => {
      const dt = new Date(y, m, d);
      root.value = dt;
      root.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { date: dt } }));
    };
    const fit = () => {
      const n = daysIn(m, y);
      wD.limit(n - 1);
      if (d > n) d = n;
    };
    const wM = wheel(elM, { values: monthNames.map((_, k) => k + 1), labels: monthNames, index: m, label: 'Month', pitch: 1800, sound: soundOn, onChange: (v) => { m = v - 1; fit(); emit(); } });
    const wD = wheel(elD, { values: days, index: d - 1, label: 'Day', pitch: 2300, sound: soundOn, onChange: (v) => { d = v; emit(); } });
    const wY = wheel(elY, { values: years, index: y - from, label: 'Year', pitch: 2000, sound: soundOn, onChange: (v) => { y = v; fit(); emit(); } });
    fit();
    root.value = new Date(y, m, d);

    // left and right walk between the wheels
    const wheels = [wM, wD, wY];
    wrap.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const i = wheels.findIndex((w) => w.el === document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      wheels[Math.max(0, Math.min(2, i + (e.key === 'ArrowRight' ? 1 : -1)))].el.focus();
    });

    return {
      wheels: { month: wM, day: wD, year: wY },
      get value() { return new Date(y, m, d); },
      set(dt, smooth = true) {
        wY.set(dt.getFullYear() - from, smooth);
        wM.set(dt.getMonth(), smooth);
        wD.set(dt.getDate() - 1, smooth);
      }
    };
  }

  window.DrumPicker = { wheel, date };
  document.querySelectorAll('.dp[data-date]:not([data-manual])').forEach((root) => {
    const [yy, mm, dd] = root.dataset.date.split('-').map(Number);
    root.drumPicker = date(root, { value: new Date(yy, mm - 1, dd), from: +root.dataset.from || 1950, to: +root.dataset.to || 2050 });
  });
})();
