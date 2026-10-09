// Native Swipe Row.
// Markup: ul.sr-list > li.sr > .sr__content + .sr__actions[data-side="start"] + .sr__actions[data-side="end"],
// action buttons are button[data-act]; data-commit="Deleted" makes an action remove the row and leave an undo strip,
// data-full marks the action a long swipe triggers on that side (the last one by default).
// The swipe itself is the browser's own horizontal scroll with scroll snap inside the row: five snap points
// [commit start | start actions open | rest | end actions open | commit end]. The script only reads where the scroll
// came to rest and what to draw behind the content. Mouse drag, keyboard and the buttons do the same through scrollTo.
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const hasScrollEnd = 'onscrollend' in window;
  const hasSnapChange = 'onscrollsnapchange' in window;
  const hasCommands = 'command' in HTMLButtonElement.prototype;
  const STRIP_MS = 8000; // how long the "Deleted · Undo" strip waits before it folds away

  /* ---- sound: a short filtered click synthesised on the fly, no files ---- */
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
        out.gain.value = 0.55;
        out.connect(ctx.destination);
        const n = Math.round(ctx.sampleRate * 0.08);
        noise = ctx.createBuffer(1, n, ctx.sampleRate);
        const d = noise.getChannelData(0);
        let s = 11;
        for (let i = 0; i < n; i++) { s = (s + 0xb31c96c9) >>> 0; d[i] = hashU(s) / 2147483648 - 1; }
      }
      if (ctx.state === 'suspended') ctx.resume();
    }
    function play({ f = 2400, q = 2.5, len = 0.02, gain = 0.3, tone = 0, toneF = 300, toneTo = 0 } = {}) {
      if (!ctx || ctx.state !== 'running') return;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.0015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      src.connect(bp).connect(g).connect(out);
      src.start(t);
      src.stop(t + len + 0.02);
      if (tone) {
        const o = ctx.createOscillator();
        const og = ctx.createGain();
        o.frequency.setValueAtTime(toneF, t);
        if (toneTo) o.frequency.exponentialRampToValueAtTime(toneTo, t + len * 3);
        og.gain.setValueAtTime(0, t);
        og.gain.linearRampToValueAtTime(tone, t + 0.003);
        og.gain.exponentialRampToValueAtTime(0.0001, t + len * 3);
        o.connect(og).connect(out);
        o.start(t);
        o.stop(t + len * 3 + 0.02);
      }
    }
    return { wake, play };
  })();
  // Android only; Chrome refuses (and logs) before the first tap, so ask only after one
  const buzz = (ms) => { if (navigator.vibrate && navigator.userActivation?.hasBeenActive !== false) try { navigator.vibrate(ms); } catch { /* not allowed here */ } };

  let uid = 0;

  function init(list) {
    const soundOn = () => list.dataset.sound !== 'off';
    const live = document.createElement('p');
    live.className = 'sr-live';
    live.setAttribute('role', 'status');
    list.after(live);
    const say = (text) => { live.textContent = ''; requestAnimationFrame(() => { live.textContent = text; }); };
    for (const type of ['pointerdown', 'touchend', 'keydown']) list.addEventListener(type, () => soundOn() && sound.wake(), { passive: true, capture: true });

    const rows = [...list.querySelectorAll(':scope > .sr')].map(build);

    function build(li) {
      const id = li.id || (li.id = `sr-${++uid}`);
      const content = li.querySelector('.sr__content');
      const groups = { start: li.querySelector('.sr__actions[data-side="start"]'), end: li.querySelector('.sr__actions[data-side="end"]') };
      const under = document.createElement('div');
      under.className = 'sr__under';
      for (const side of ['start', 'end']) if (groups[side]) under.append(groups[side]);
      const full = {};
      for (const side of ['start', 'end']) {
        const g = groups[side];
        if (!g) continue;
        const btns = [...g.querySelectorAll('button[data-act]')];
        full[side] = btns.find((b) => b.hasAttribute('data-full')) || (side === 'end' ? btns.at(-1) : btns[0]);
        full[side]?.classList.add('is-full');
        g.inert = true;
      }

      // the scroller: [pad | start gap | content | end gap | pad]; the gaps are the width of the action groups
      const track = document.createElement('div');
      track.className = 'sr__track';
      const part = (cls) => { const d = document.createElement('div'); d.className = `sr__snap ${cls}`; d.setAttribute('aria-hidden', 'true'); return d; };
      const padS = part('sr__snap--pad-s'), gapS = part('sr__snap--gap-s'), gapE = part('sr__snap--gap-e'), padE = part('sr__snap--pad-e');
      if (!groups.start) padS.hidden = gapS.hidden = true;
      if (!groups.end) gapE.hidden = padE.hidden = true;
      track.append(padS, gapS, content, gapE, padE);

      const strip = document.createElement('div');
      strip.className = 'sr__strip';
      strip.innerHTML = '<span class="sr__strip-text"></span><button type="button" class="sr__undo">Undo</button>';

      // keyboard equivalent of the swipe: shown when focus is in the row; an Invoker Command where the browser has them
      const kbd = document.createElement('button');
      kbd.type = 'button';
      kbd.className = 'sr__kbd';
      kbd.setAttribute('aria-label', 'Actions');
      kbd.setAttribute('aria-expanded', 'false');
      kbd.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/></svg>';
      kbd.setAttribute('commandfor', id);
      kbd.setAttribute('command', '--sr-toggle');
      if (!hasCommands) kbd.addEventListener('click', () => li.dispatchEvent(Object.assign(new Event('command'), { command: '--sr-toggle' })));

      content.append(kbd);
      li.replaceChildren(under, track, strip);
      li.dataset.state = 'rest';
      if (!content.hasAttribute('tabindex')) content.tabIndex = 0;

      const row = { li, track, content, groups, full, strip, kbd, state: 'rest', armed: '', timer: 0, raf: 0, settleTimer: 0, dragging: false };
      const W = () => track.clientWidth;
      const size = (side) => (groups[side] ? parseFloat(getComputedStyle(li).getPropertyValue(side === 'start' ? '--sr-start' : '--sr-end')) || 0 : 0);
      const pos = (state) => {
        const w = W();
        return { 'commit-start': 0, start: w - size('start'), rest: w, end: w + size('end'), 'commit-end': 2 * w }[state] ?? w;
      };
      row.pos = pos;

      function paint() {
        row.raf = 0;
        const w = W();
        const x = track.scrollLeft - w; // > 0: end side open, < 0: start side open
        li.style.setProperty('--x', x.toFixed(1));
        // past the middle between "open" and "commit" the browser will snap to commit on release
        const armEnd = groups.end && x > (size('end') + w) / 2;
        const armStart = groups.start && -x > (size('start') + w) / 2;
        const armed = armEnd ? 'end' : armStart ? 'start' : '';
        if (armed !== row.armed) {
          if (armed && soundOn()) sound.play({ f: 2900, len: 0.018, gain: 0.32, tone: 0.06, toneF: 1400 });
          else if (row.armed && soundOn()) sound.play({ f: 1700, len: 0.014, gain: 0.2 });
          if (armed) buzz(8);
          row.armed = armed;
          li.dataset.armed = armed;
        }
      }
      row.paint = paint;
      row.run = (btn) => run(btn);
      const onScroll = () => {
        if (!row.raf) row.raf = requestAnimationFrame(paint);
        if (!hasScrollEnd && !row.dragging) { clearTimeout(row.settleTimer); row.settleTimer = setTimeout(settle, 140); }
      };
      track.addEventListener('scroll', onScroll, { passive: true });
      track.addEventListener('scrollend', () => { if (!row.dragging) settle(); });
      if (hasSnapChange) track.addEventListener('scrollsnapchange', () => { if (!row.dragging) settle(); });

      function settle() {
        if (row.dragging || row.state === 'gone') return;
        const s = track.scrollLeft;
        let best = 'rest', d = Infinity;
        for (const st of ['commit-start', 'start', 'rest', 'end', 'commit-end']) {
          if ((st.endsWith('start') && !groups.start) || (st.endsWith('end') && !groups.end)) continue;
          const dd = Math.abs(pos(st) - s);
          if (dd < d) { d = dd; best = st; }
        }
        if (d > 3) return; // still moving
        setState(best);
      }

      function setState(st) {
        if (st === row.state) return;
        row.state = st;
        li.dataset.state = st;
        for (const side of ['start', 'end']) if (groups[side]) groups[side].inert = st !== side;
        kbd.setAttribute('aria-expanded', String(st === 'start' || st === 'end'));
        if (st === 'start' || st === 'end') for (const r of rows) if (r !== row && (r.state === 'start' || r.state === 'end')) r.go('rest');
        if (st === 'commit-end' || st === 'commit-start') run(full[st.slice(7)]);
      }

      row.go = (st, instant) => {
        const left = pos(st);
        const behavior = instant || reduced.matches ? 'instant' : 'smooth';
        if (Math.abs(track.scrollLeft - left) < 1) { setState(st); paint(); return; }
        track.scrollTo({ left, behavior });
        if (behavior === 'instant') { paint(); setState(st); }
      };

      function run(btn) {
        if (!btn) return;
        const act = btn.dataset.act;
        const commit = btn.dataset.commit;
        li.dispatchEvent(new CustomEvent('sr:action', { bubbles: true, detail: { act, row: li } }));
        if (commit) return remove(commit);
        if (soundOn()) sound.play({ f: 2200, len: 0.02, gain: 0.25 });
        say(btn.dataset.say || `${btn.textContent.trim()}`);
        row.go('rest');
      }

      // remove: the row folds into a thin strip in its own place, the strip offers Undo
      function remove(label) {
        clearTimeout(row.timer);
        const hadFocus = li.contains(document.activeElement);
        const h0 = li.offsetHeight;
        row.state = 'gone';
        li.dataset.state = 'gone';
        strip.querySelector('.sr__strip-text').textContent = label;
        li.classList.add('is-gone');
        const h1 = li.offsetHeight;
        if (soundOn()) sound.play({ f: 900, q: 1.2, len: 0.05, gain: 0.22, tone: 0.16, toneF: 420, toneTo: 210 });
        buzz(14);
        say(`${label}. Undo is available.`);
        if (!reduced.matches) {
          li.animate({ height: [`${h0}px`, `${h1}px`] }, { duration: 340, easing: 'cubic-bezier(.32,.72,0,1)' });
          strip.animate({ opacity: [0, 1] }, { duration: 260, delay: 80, fill: 'backwards' });
        }
        if (hadFocus) strip.querySelector('.sr__undo').focus({ preventScroll: true });
        row.timer = setTimeout(() => fold(), STRIP_MS);
      }

      function fold() {
        const focused = li.contains(document.activeElement);
        const done = () => {
          const i = rows.indexOf(row);
          li.remove();
          rows.splice(i, 1);
          if (focused) (rows[i] || rows[i - 1])?.content.focus({ preventScroll: true });
        };
        if (reduced.matches) return done();
        li.animate({ height: [`${li.offsetHeight}px`, '0px'], opacity: [1, 0] }, { duration: 260, easing: 'ease-in' }).finished.then(done);
      }

      strip.querySelector('.sr__undo').addEventListener('click', () => {
        clearTimeout(row.timer);
        const h0 = li.offsetHeight;
        li.classList.remove('is-gone');
        row.state = 'rest';
        li.dataset.state = 'rest';
        track.scrollLeft = pos('rest');
        paint();
        const h1 = li.offsetHeight;
        if (soundOn()) sound.play({ f: 1300, q: 1.4, len: 0.04, gain: 0.2, tone: 0.12, toneF: 260, toneTo: 440 });
        say('Restored');
        content.focus({ preventScroll: true });
        if (!reduced.matches) {
          li.animate({ height: [`${h0}px`, `${h1}px`] }, { duration: 340, easing: 'cubic-bezier(.32,.72,0,1)' });
          content.animate({ opacity: [0, 1], translate: ['-24px 0', '0 0'] }, { duration: 300, easing: 'cubic-bezier(.32,.72,0,1)' });
        }
      });

      // the buttons behind the content
      under.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-act]');
        if (btn) run(btn);
      });
      under.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { row.go('rest'); content.focus(); }
      });

      // a tap on the content of an open row closes it instead of opening the item
      content.addEventListener('click', (e) => {
        if (row.state !== 'rest' || row.suppressClick) { e.preventDefault(); e.stopImmediatePropagation(); row.suppressClick = false; if (row.state !== 'rest') row.go('rest'); }
      }, true);

      // keyboard: arrows open a side, Delete runs the end side's long-swipe action, Esc closes
      content.addEventListener('keydown', (e) => {
        if (e.target !== content) return;
        if (e.key === 'ArrowLeft' && groups.end) { e.preventDefault(); row.go(row.state === 'start' ? 'rest' : 'end'); }
        else if (e.key === 'ArrowRight' && groups.start) { e.preventDefault(); row.go(row.state === 'end' ? 'rest' : 'start'); }
        else if ((e.key === 'Delete' || e.key === 'Backspace') && full.end) { e.preventDefault(); run(full.end); }
        else if (e.key === 'Escape' && row.state !== 'rest') { e.preventDefault(); row.go('rest'); }
      });
      li.addEventListener('command', (e) => {
        if (e.command !== '--sr-toggle') return;
        const open = row.state === 'end';
        row.go(open ? 'rest' : 'end');
        if (!open) setTimeout(() => groups.end?.querySelector('button')?.focus({ preventScroll: true }), reduced.matches ? 0 : 320);
      });

      // a mouse cannot drag a scroller, so it gets its own drag: snap off, scrollLeft by hand, nearest point on release
      let drag = null;
      content.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        drag = { x: e.clientX, left: track.scrollLeft, moved: false, samples: [[e.timeStamp, e.clientX]] };
      });
      content.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const dx = e.clientX - drag.x;
        if (!drag.moved) {
          if (Math.abs(dx) < 5) return;
          drag.moved = true;
          row.dragging = true;
          content.setPointerCapture(e.pointerId);
          track.classList.add('is-dragging');
        }
        track.scrollLeft = drag.left - dx;
        drag.samples.push([e.timeStamp, e.clientX]);
        while (drag.samples.length > 2 && e.timeStamp - drag.samples[0][0] > 100) drag.samples.shift();
      });
      const endDrag = (e) => {
        if (!drag) return;
        const d = drag;
        drag = null;
        if (!d.moved) return;
        row.suppressClick = true;
        const [t0, x0] = d.samples[0];
        const v = (e.clientX - x0) / Math.max(16, e.timeStamp - t0); // px per ms
        const aim = track.scrollLeft - v * 220;
        let best = 'rest', dist = Infinity;
        for (const st of ['commit-start', 'start', 'rest', 'end', 'commit-end']) {
          if ((st.endsWith('start') && !groups.start) || (st.endsWith('end') && !groups.end)) continue;
          // a commit needs the row itself past the armed point, a fling alone is not enough
          if (st === 'commit-end' && row.armed !== 'end') continue;
          if (st === 'commit-start' && row.armed !== 'start') continue;
          const dd = Math.abs(pos(st) - aim);
          if (dd < dist) { dist = dd; best = st; }
        }
        // snap stays off until the ride ends: turned back on mid-way, Chrome re-snaps to the old point
        row.dragging = false;
        let done = false;
        const snapBack = () => { if (done) return; done = true; track.classList.remove('is-dragging'); settle(); };
        if (hasScrollEnd) track.addEventListener('scrollend', snapBack, { once: true });
        setTimeout(snapBack, reduced.matches ? 0 : 700);
        row.go(best);
        setTimeout(() => { row.suppressClick = false; }, 0);
      };
      content.addEventListener('pointerup', endDrag);
      content.addEventListener('pointercancel', endDrag);

      return row;
    }

    // start every row at rest; keep the position when the list changes width
    const place = () => rows.forEach((r) => { if (r.state !== 'gone' && !r.dragging) { r.track.scrollLeft = r.pos(r.state); r.paint(); } });
    place();
    new ResizeObserver(place).observe(list);

    return {
      rows: () => rows.map((r) => r.li),
      open: (li, side = 'end', instant = false) => rows.find((r) => r.li === li)?.go(side, instant),
      close: () => rows.forEach((r) => r.state !== 'gone' && r.go('rest')),
      /** freeze a row at a share of its end-side travel (0 = rest, 1 = commit): for posters and tests */
      hold(li, k) {
        const r = rows.find((q) => q.li === li);
        if (!r) return;
        r.dragging = true;
        r.track.classList.add('is-dragging');
        r.track.scrollLeft = r.pos('rest') + k * r.track.clientWidth;
        r.paint();
      },
      remove(li) { const r = rows.find((q) => q.li === li); if (r?.full.end) r.run(r.full.end); }
    };
  }

  window.SwipeRow = { init };
  document.querySelectorAll('.sr-list:not([data-manual])').forEach((l) => { l.swipeRow = init(l); });
})();
