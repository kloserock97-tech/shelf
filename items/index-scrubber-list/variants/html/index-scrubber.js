// Index Scrubber List.
// Markup: .isl > .isl__scroller > section.isl__sec[data-letter] > h2.isl__head + rows. The script adds the A–Z rail,
// the letter bubble and a sentinel at the top of each section.
// Drag along the rail (finger, pen or mouse): the list jumps to the letter under the pointer, a bubble with the letter
// rides next to it and every new letter ticks. Letters without a section are squeezed into dots and skipped.
// The section header that is stuck to the top changes its look through @container scroll-state(stuck: top);
// where the browser lacks it, an IntersectionObserver on the sentinels sets .is-stuck instead.
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const hasStuckQuery = CSS.supports?.('container-type: scroll-state') ?? false;
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  /* ---- sound: a short tick synthesised on the fly, no files ---- */
  const sound = (() => {
    const AC = window.AudioContext || window.webkitAudioContext;
    let ctx = null, out = null, noise = null;
    // Hash Kit mixer (items/hash-kit): seeded noise for the tick
    const hashU = (x) => { x ^= x >>> 16; x = Math.imul(x, 0x3f9c86cb); x ^= x >>> 14; x = Math.imul(x, 0x1ae9dacf); x ^= x >>> 15; return x >>> 0; };
    function wake() {
      if (!AC) return;
      if (!ctx) {
        ctx = new AC();
        out = ctx.createGain();
        out.gain.value = 0.5;
        out.connect(ctx.destination);
        const n = Math.round(ctx.sampleRate * 0.05);
        noise = ctx.createBuffer(1, n, ctx.sampleRate);
        const d = noise.getChannelData(0);
        let s = 5;
        for (let i = 0; i < n; i++) { s = (s + 0xb31c96c9) >>> 0; d[i] = hashU(s) / 2147483648 - 1; }
      }
      if (ctx.state === 'suspended') ctx.resume();
    }
    let last = 0;
    function tick(k = 0.5) {
      if (!ctx || ctx.state !== 'running') return;
      const t = ctx.currentTime;
      if (t - last < 0.025) return; // a fast sweep would turn into a buzz
      last = t;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2400 + 1400 * k; // higher towards Z
      bp.Q.value = 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.3, t + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.016);
      src.connect(bp).connect(g).connect(out);
      src.start(t);
      src.stop(t + 0.03);
    }
    return { wake, tick };
  })();
  const buzz = (ms) => { if (navigator.vibrate && navigator.userActivation?.hasBeenActive !== false) try { navigator.vibrate(ms); } catch { /* not allowed here */ } };

  let uid = 0;

  function init(root) {
    const soundOn = () => root.dataset.sound !== 'off';
    const scroller = root.querySelector('.isl__scroller');
    const sections = [...scroller.querySelectorAll('.isl__sec')];
    const id = root.id || (root.id = `isl-${++uid}`);
    const letters = (root.dataset.letters || ALPHABET.join('')).split('');
    const byLetter = new Map();
    sections.forEach((sec) => {
      const L = (sec.dataset.letter || sec.querySelector('.isl__head')?.textContent || '').trim().charAt(0).toUpperCase();
      sec.dataset.letter = L;
      sec.id ||= `${id}-${L}`;
      byLetter.set(L, sec);
      const sentinel = document.createElement('i');
      sentinel.className = 'isl__sentinel';
      sentinel.setAttribute('aria-hidden', 'true');
      sec.prepend(sentinel);
    });
    for (const type of ['pointerdown', 'touchend', 'keydown']) root.addEventListener(type, () => soundOn() && sound.wake(), { passive: true, capture: true });

    // the rail: a link per letter with a section, a dot per empty letter
    const rail = document.createElement('nav');
    rail.className = 'isl__rail';
    rail.setAttribute('aria-label', 'Index');
    const items = letters.map((L, i) => {
      const sec = byLetter.get(L);
      let node;
      if (sec) {
        node = document.createElement('a');
        node.href = `#${sec.id}`;
        node.textContent = L;
        node.tabIndex = -1;
        node.setAttribute('aria-label', `${L}, ${sec.querySelectorAll('.isl__rows > li').length} contacts`);
      } else {
        node = document.createElement('span');
        node.className = 'is-empty';
        node.setAttribute('aria-hidden', 'true');
      }
      node.classList.add('isl__key');
      node.dataset.letter = L;
      rail.append(node);
      return { L, i, node, sec };
    });
    const live = items.filter((it) => it.sec);
    live[0] && (live[0].node.tabIndex = 0);
    const bubble = document.createElement('div');
    bubble.className = 'isl__bubble';
    bubble.setAttribute('aria-hidden', 'true');
    root.append(rail, bubble);

    // counts in the headers
    sections.forEach((sec) => {
      const head = sec.querySelector('.isl__head');
      if (head && !head.querySelector('.isl__count')) {
        const n = sec.querySelectorAll('.isl__rows > li').length;
        const c = document.createElement('span');
        c.className = 'isl__count';
        c.textContent = `${n} ${n === 1 ? 'contact' : 'contacts'}`;
        c.setAttribute('aria-hidden', 'true');
        (head.querySelector('.isl__head-in') || head).append(c);
      }
    });

    /* ---- which section is current, which header is stuck ---- */
    // a footer tall enough for the last section to reach the top, so every letter can be jumped to and stuck
    const foot = scroller.querySelector('.isl__foot') || scroller.appendChild(document.createElement('p'));
    foot.classList.add('isl__foot');
    if (!foot.textContent) {
      const n = scroller.querySelectorAll('.isl__rows > li').length;
      foot.textContent = `${n} ${n === 1 ? 'contact' : 'contacts'}`;
    }
    const fit = () => { foot.style.minHeight = `${Math.max(0, scroller.clientHeight - sections.at(-1).offsetHeight + 2)}px`; };
    fit();
    new ResizeObserver(fit).observe(scroller);

    const above = new Set(); // sentinels scrolled past the top edge
    let current = null;
    function mark() {
      let cur = sections[0];
      for (const sec of sections) if (above.has(sec)) cur = sec;
      if (!hasStuckQuery) sections.forEach((sec) => sec.querySelector('.isl__head')?.classList.toggle('is-stuck', sec === cur && above.has(sec)));
      if (cur === current) return;
      current = cur;
      for (const it of live) {
        const on = it.sec === cur;
        it.node.toggleAttribute('aria-current', on);
        if (on) it.node.setAttribute('aria-current', 'location');
      }
      if (!rail.contains(document.activeElement)) live.forEach((it) => { it.node.tabIndex = it.sec === cur ? 0 : -1; });
    }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const sec = e.target.parentElement;
        if (!e.isIntersecting && e.boundingClientRect.top < e.rootBounds.top) above.add(sec);
        else above.delete(sec);
      }
      mark();
    }, { root: scroller, threshold: 0 });
    sections.forEach((sec) => io.observe(sec.firstElementChild));
    mark();

    function jump(sec, smooth) {
      // 2 px past the section top, so its header is already stuck and the sentinel is out of view
      scroller.scrollTo({ top: sec.offsetTop + 2, behavior: smooth && !reduced.matches ? 'smooth' : 'instant' });
    }

    /* ---- scrubbing ---- */
    let scrub = null; // { pointerId, letter }
    let hideTimer = 0;
    // the letter under y; an empty letter hands over to the nearest one with a section
    function pick(y) {
      let best = null, d = Infinity;
      for (const it of live) {
        const r = it.node.getBoundingClientRect();
        const dd = Math.abs(r.top + r.height / 2 - y);
        if (dd < d) { d = dd; best = it; }
      }
      return best;
    }
    function lens(y) {
      for (const it of items) {
        const r = it.node.getBoundingClientRect();
        const f = y == null ? 0 : Math.max(0, 1 - Math.abs(r.top + r.height / 2 - y) / 56);
        it.node.style.setProperty('--f', (f * f * (3 - 2 * f)).toFixed(3));
      }
    }
    function show(it, y) {
      const box = root.getBoundingClientRect();
      const top = Math.min(box.height - 40, Math.max(40, y - box.top));
      bubble.style.setProperty('--y', `${top}px`);
      bubble.textContent = it.L;
      root.classList.add('is-scrubbing');
      clearTimeout(hideTimer);
    }
    function move(y) {
      const it = pick(y);
      if (!reduced.matches) lens(y);
      if (!it) return;
      show(it, y);
      if (scrub.letter === it.L) return;
      scrub.letter = it.L;
      jump(it.sec, false);
      if (soundOn()) sound.tick(it.i / Math.max(1, letters.length - 1));
      buzz(4);
    }
    function end() {
      if (!scrub) return;
      scrub = null;
      lens(null);
      rail.classList.remove('is-active');
      hideTimer = setTimeout(() => root.classList.remove('is-scrubbing'), reduced.matches ? 0 : 380);
    }
    rail.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); // no text selection, no focus jump
      scrub = { pointerId: e.pointerId, letter: '' };
      rail.setPointerCapture(e.pointerId);
      rail.classList.add('is-active');
      move(e.clientY);
    });
    rail.addEventListener('pointermove', (e) => { if (scrub && e.pointerId === scrub.pointerId) move(e.clientY); });
    rail.addEventListener('pointerup', end);
    rail.addEventListener('pointercancel', end);
    rail.addEventListener('lostpointercapture', end);
    // a link click from assistive tech or keyboard (pointer clicks are already handled)
    rail.addEventListener('click', (e) => {
      const a = e.target.closest('a.isl__key');
      if (!a) return;
      e.preventDefault();
      if (e.detail === 0) go(live.find((it) => it.node === a), true);
    });

    function go(it, smooth) {
      if (!it) return;
      jump(it.sec, smooth);
      if (soundOn()) sound.tick(it.i / Math.max(1, letters.length - 1));
    }

    // keyboard on the rail: one tab stop, arrows walk the letters with a section and jump with them
    rail.addEventListener('keydown', (e) => {
      const i = live.findIndex((it) => it.node === document.activeElement);
      if (i < 0) return;
      let j = i;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') j = Math.min(live.length - 1, i + 1);
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') j = Math.max(0, i - 1);
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = live.length - 1;
      else return;
      e.preventDefault();
      live.forEach((it, k) => { it.node.tabIndex = k === j ? 0 : -1; });
      live[j].node.focus();
      go(live[j], false);
    });

    // type a letter anywhere in the list to jump to it (or to the next letter that has people)
    root.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || e.target.closest('input, textarea, [contenteditable]')) return;
      const L = e.key.toUpperCase();
      const i = letters.indexOf(L);
      if (i < 0) return;
      const it = live.find((q) => q.i >= i) || live.at(-1);
      e.preventDefault();
      go(it, true);
    });

    return {
      go(L, smooth = true) { go(live.find((it) => it.L === L), smooth); },
      /** freeze a scrub on a letter, for posters and tests */
      hold(L) {
        const it = live.find((q) => q.L === L);
        if (!it) return;
        jump(it.sec, false);
        const r = it.node.getBoundingClientRect();
        const y = r.top + r.height / 2;
        rail.classList.add('is-active');
        lens(y);
        show(it, y);
      },
      get current() { return current?.dataset.letter; }
    };
  }

  window.IndexScrubber = { init };
  document.querySelectorAll('.isl:not([data-manual])').forEach((r) => { r.indexScrubber = init(r); });
})();
