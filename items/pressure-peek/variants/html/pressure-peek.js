/* Pressure Peek — press depth as one continuous input.
   A light press lifts the card, a deeper one opens a blurred preview of where it leads and grows it,
   full depth opens it; letting go early puts everything back. Depth comes from pen pressure or a
   force-sensing trackpad when the device reports it, otherwise from how long the press is held.

   PressurePeek.init({ selector: '[data-peek]', closeLabel: 'Done' })
   A card names its destination with data-peek="#template-id". Events on the card (they bubble):
   peeksource { source: 'hold' | 'pen' | 'force' }, peekopen (preview shown), peekcommit, peekcancel, peekclose. */
(function () {
  'use strict';

  const PEEK = 0.32;          // depth at which the preview opens
  const HOLD_DELAY = 140;     // ms; a shorter press stays a plain tap
  const HOLD_SPAN = 1400;     // ms from the end of the delay to full depth
  const SLOP = 9;             // px of travel that turns a press into a scroll or a drag
  const PEN_FLOOR = 0.1;      // pen pressure where depth starts
  const PEN_SPAN = 0.62;      // pressure range from zero to full depth
  const G_PEEK = 0.3;         // preview size when it opens (0 = the card, 1 = the full sheet)
  const G_DEEP = 0.78;        // preview size just before it commits
  const BLUR = 8;             // px of blur on a fresh preview; it sharpens as the press deepens
  const TIPS = {
    hold: ['Hold to peek', 'Keep holding to open'],
    pressure: ['Press to peek', 'Press deeper to open']
  };

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (_) { /* not allowed here */ } };

  // A damped spring, integrated in two half steps so a stiff one stays stable at low frame rates.
  function Spring(k, zeta) { this.k = k; this.c = 2 * Math.sqrt(k) * zeta; this.x = 0; this.v = 0; this.to = 0; }
  Spring.prototype.step = function (dt) {
    const h = dt / 2;
    for (let i = 0; i < 2; i++) { this.v += (this.k * (this.to - this.x) - this.c * this.v) * h; this.x += this.v * h; }
  };
  Spring.prototype.idle = function () { return Math.abs(this.v) < 0.003 && Math.abs(this.to - this.x) < 0.0015; };
  Spring.prototype.snap = function (x) { this.x = this.to = x; this.v = 0; };

  const lift = new Spring(620, 0.92);
  const grow = new Spring(340, 0.78);

  let sel = '[data-peek]';
  let layer, scrim, sheet, body, closeBtn, ring, arc, tip, tips = true, ghost = null;
  let raf = 0, last = 0, suppressUntil = 0;
  // the one press or open sheet the layer is busy with
  const S = { card: null, pointer: null, kind: 'mouse', source: 'hold', t0: 0, x: 0, y: 0, sx: 0, sy: 0,
    raw: 0, p: 0, depth: 0, pressed: false, mounted: false, peeked: false, committed: false, C: null, R: null, radius: 16 };

  function make(tag, cls) { const n = document.createElement(tag); if (cls) n.className = cls; return n; }

  function build(opts) {
    layer = make('div', 'pp-layer');
    layer.hidden = true;
    scrim = make('div', 'pp-scrim');
    sheet = make('div', 'pp-sheet');
    sheet.tabIndex = -1;
    sheet.setAttribute('aria-hidden', 'true');
    closeBtn = make('button', 'pp-sheet__close');
    closeBtn.type = 'button';
    closeBtn.textContent = opts.closeLabel || 'Done';
    body = make('div', 'pp-sheet__body');
    sheet.append(closeBtn, body);
    const NS = 'http://www.w3.org/2000/svg';
    ring = document.createElementNS(NS, 'svg');
    ring.setAttribute('class', 'pp-ring');
    ring.setAttribute('viewBox', '0 0 52 52');
    ring.setAttribute('aria-hidden', 'true');
    const a = (PEEK * 360 - 90) * Math.PI / 180;
    ring.innerHTML =
      '<circle class="pp-ring__bg" cx="26" cy="26" r="25"/>' +
      '<circle class="pp-ring__track" cx="26" cy="26" r="18"/>' +
      '<circle class="pp-ring__arc" cx="26" cy="26" r="18" pathLength="100" stroke-dasharray="0 100" transform="rotate(-90 26 26)"/>' +
      `<line class="pp-ring__tick" x1="${26 + 22.5 * Math.cos(a)}" y1="${26 + 22.5 * Math.sin(a)}" x2="${26 + 13.5 * Math.cos(a)}" y2="${26 + 13.5 * Math.sin(a)}"/>` +
      '<circle class="pp-ring__dot" cx="26" cy="26" r="3"/>';
    arc = ring.querySelector('.pp-ring__arc');
    tip = make('div', 'pp-tip');
    tip.setAttribute('aria-hidden', 'true');
    layer.append(scrim, sheet, ring, tip);
    document.body.append(layer);
    scrim.addEventListener('click', () => close());
    closeBtn.addEventListener('click', () => close());
  }

  function emit(type, detail) {
    if (S.card) S.card.dispatchEvent(new CustomEvent(type, { bubbles: true, detail }));
  }

  // Where the destination ends up: a centred sheet as tall as its content, with a margin of page around it.
  function sheetRect(contentH) {
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    const w = Math.min(vw - 32, 540);
    const h = Math.min(vh - (vw < 520 ? 32 : 96), 640, Math.max(contentH || 0, 240));
    return { x: (vw - w) / 2, y: (vh - h) / 2, w, h, vw, vh };
  }

  // Lay the destination out at the sheet's width and fit the sheet to it.
  function fit() {
    sheet.style.width = sheetRect().w + 'px';
    body.style.height = 'auto';
    S.R = sheetRect(body.scrollHeight);
    body.style.height = S.R.h + 'px';
  }

  function begin(card, kind, x, y) {
    S.card = card; S.kind = kind; S.source = 'hold';
    S.t0 = performance.now(); S.x = S.sx = x; S.y = S.sy = y;
    S.raw = S.p = S.depth = 0; S.pressed = true; S.mounted = S.peeked = S.committed = false;
    lift.snap(0); grow.snap(0);
    emit('peeksource', { source: 'hold' });
    kick();
  }

  function setSource(source, value) {
    if (S.source === source) return;
    S.source = source; S.raw = S.p = value;
    emit('peeksource', { source });
  }

  // Build the layer for this card: a lifted copy of it and its destination at full size.
  function mount() {
    const card = S.card;
    const tpl = document.querySelector(card.getAttribute('data-peek'));
    S.C = card.getBoundingClientRect();
    S.radius = parseFloat(getComputedStyle(card).borderTopLeftRadius) || 16;
    ghost = card.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.removeAttribute('href');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.classList.add('pp-ghost');
    Object.assign(ghost.style, { left: S.C.left + 'px', top: S.C.top + 'px', width: S.C.width + 'px', height: S.C.height + 'px' });
    layer.insertBefore(ghost, sheet);
    body.replaceChildren(tpl && tpl.content ? tpl.content.cloneNode(true) : document.createTextNode(''));
    sheet.style.opacity = '0';
    layer.hidden = false;
    fit();
    card.classList.add('pp-is-source');
    S.mounted = true;
  }

  function commit() {
    if (S.committed) return;
    S.committed = true; S.peeked = true; S.pressed = false; S.pointer = null;
    lift.to = 1; grow.to = 1;
    suppressUntil = performance.now() + 600;
    buzz(14);
    const heading = body.querySelector('h1, h2, h3');
    sheet.removeAttribute('aria-hidden');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', heading ? heading.textContent.trim() : 'Preview');
    layer.classList.add('pp-open');
    // with Space still down, focus waits for the key to come up, or it would press Done at once
    if (S.kind !== 'key') setTimeout(() => { if (S.committed) closeBtn.focus({ preventScroll: true }); }, 120);
    emit('peekcommit');
    kick();
  }

  // Letting go before full depth: everything settles back into the card.
  function release() {
    if (!S.pressed) return;
    S.pressed = false; S.pointer = null;
    if (!S.mounted) { S.card = null; return; }   // a plain tap: the click that follows opens it
    suppressUntil = performance.now() + 600;
    S.peeked = false;
    emit('peekcancel');
    kick();
  }

  function close() {
    if (!S.committed) return;
    S.committed = false; S.peeked = false;
    lift.to = 0; grow.to = 0;
    layer.classList.remove('pp-open');
    sheet.setAttribute('aria-hidden', 'true');
    sheet.removeAttribute('role');
    sheet.removeAttribute('aria-modal');
    S.returnFocus = true;
    emit('peekclose');
    kick();
  }

  // A tap or Enter goes straight to the destination, growing it out of the card.
  function open(card) {
    if (S.card) return;
    begin(card, 'tap', 0, 0);
    S.pressed = false;
    mount();
    commit();
  }

  function teardown() {
    const card = S.card;
    layer.hidden = true;
    if (ghost) ghost.remove();
    ghost = null;
    body.replaceChildren();
    ring.classList.remove('pp-on', 'pp-peeked');
    tip.classList.remove('pp-on');
    card.classList.remove('pp-is-source');
    S.card = null; S.mounted = false;
    if (S.returnFocus) card.focus({ preventScroll: true });
    S.returnFocus = false;
  }

  function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  function frame(now) {
    raf = 0;
    const dt = clamp((now - last) / 1000, 0.001, 0.05);
    last = now;
    if (S.pressed) {
      let d;
      if (S.source === 'hold') d = (now - S.t0 - HOLD_DELAY) / HOLD_SPAN;
      else {
        S.p += (S.raw - S.p) * (1 - Math.exp(-dt / 0.045));   // pressure sensors are noisy
        d = S.source === 'pen' ? (S.p - PEN_FLOOR) / PEN_SPAN : S.p - 1;
      }
      S.depth = clamp(d, 0, 1);
      if (S.depth > 0 && !S.mounted) mount();
      if (!S.peeked && S.depth >= PEEK) { S.peeked = true; buzz(8); emit('peekopen'); }
      else if (S.peeked && S.depth < PEEK - 0.1) S.peeked = false;   // pressure eased off: back to the lifted card
      if (S.depth >= 1) commit();
    }
    if (!S.committed) {
      lift.to = S.pressed ? clamp(S.depth / PEEK, 0, 1) : 0;
      grow.to = S.pressed && S.peeked ? lerp(G_PEEK, G_DEEP, (S.depth - PEEK) / (1 - PEEK)) : 0;
    }
    lift.step(dt);
    grow.step(dt);
    if (S.mounted) paint();
    if (S.pressed || !lift.idle() || !grow.idle()) raf = requestAnimationFrame(frame);
    else if (!S.committed && S.mounted) teardown();
  }

  function paint() {
    const l = clamp(lift.x, 0, 1.2), g = grow.x, C = S.C, R = S.R, still = reduced();
    const showSheet = clamp(g / 0.1, 0, 1);

    ghost.style.opacity = String(1 - showSheet);
    ghost.style.transform = still ? 'none' : `translateY(${-3 * l}px) scale(${1 + 0.035 * l})`;
    ghost.style.boxShadow = `0 ${2 + 14 * l}px ${6 + 32 * l}px rgb(0 0 0 / ${(0.14 * Math.min(l, 1)).toFixed(3)})`;
    scrim.style.opacity = String(clamp(0.55 * l + 0.45 * clamp(g / G_PEEK, 0, 1), 0, 1));

    if (still) {
      // no growth: the destination fades in where it will stay
      sheet.style.transform = `translate(${R.x}px, ${R.y}px)`;
      sheet.style.height = R.h + 'px';
      sheet.style.borderRadius = '22px';
      sheet.style.opacity = String(clamp(g / G_PEEK, 0, 1));
    } else {
      const w = lerp(C.width, R.w, g), h = lerp(C.height, R.h, g);
      const x = lerp(C.left, R.x, g), y = lerp(C.top, R.y, g);
      const s = w / R.w;
      sheet.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${s.toFixed(4)})`;
      sheet.style.height = (h / s).toFixed(2) + 'px';
      sheet.style.borderRadius = (lerp(S.radius, 22, clamp(g, 0, 1)) / s).toFixed(2) + 'px';
      sheet.style.opacity = String(showSheet);
    }
    const t = clamp((g - G_PEEK) / (G_DEEP - G_PEEK), 0, 1);
    const blur = S.committed ? 0 : BLUR * Math.pow(1 - t, 1.6);
    body.style.filter = blur > 0.1 ? `blur(${blur.toFixed(2)}px)` : 'none';

    const on = S.pressed && S.depth > 0;
    ring.classList.toggle('pp-on', on);
    ring.classList.toggle('pp-peeked', S.peeked);
    arc.setAttribute('stroke-dasharray', `${(S.depth * 100).toFixed(2)} 100`);
    tip.classList.toggle('pp-on', on && tips);
    if (on) {
      // above a finger, so it is not hidden under it; around the cursor or pen tip otherwise
      const up = S.kind === 'touch' ? -70 : 0;
      const rx = clamp(S.x, 30, R.vw - 30), ry = clamp(S.y + up, 30, R.vh - 30);
      ring.style.transform = `translate(${rx}px, ${ry}px)`;
      if (tips) {
        const text = TIPS[S.source === 'hold' ? 'hold' : 'pressure'][S.peeked ? 1 : 0];
        if (tip.textContent !== text) tip.textContent = text;
        const w = tip.offsetWidth;
        const left = rx + 34 + w < R.vw - 8 ? rx + 34 : rx - 34 - w;
        tip.style.transform = `translate(${left}px, ${ry - 13}px)`;
      }
    }
  }

  function onPointerDown(e) {
    const card = e.target.closest && e.target.closest(sel);
    if (!card || S.card || !e.isPrimary || e.button !== 0) return;
    begin(card, e.pointerType, e.clientX, e.clientY);
    S.pointer = e.pointerId;
    if (e.pointerType === 'pen' && e.pressure > 0 && e.pressure !== 0.5) setSource('pen', e.pressure);
    try { card.setPointerCapture(e.pointerId); } catch (_) { /* the pointer is already gone */ }
  }

  function onPointerMove(e) {
    if (e.pointerId !== S.pointer || !S.pressed) return;
    S.x = e.clientX; S.y = e.clientY;
    if (S.source === 'pen') S.raw = e.pressure;
    else if (e.pointerType === 'pen' && S.depth === 0 && e.pressure > 0 && e.pressure !== 0.5) setSource('pen', e.pressure);
    if (!S.mounted && Math.hypot(S.x - S.sx, S.y - S.sy) > SLOP) { S.pressed = false; S.pointer = null; S.card = null; }
  }

  function onPointerEnd(e) {
    if (e.pointerId !== S.pointer) return;
    release();
  }

  function onClick(e) {
    const card = e.target.closest && e.target.closest(sel);
    if (!card) return;
    e.preventDefault();
    if (performance.now() < suppressUntil) return;   // the click that ends a long press
    open(card);
  }

  function onKeyDown(e) {
    if (S.committed) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Tab') trap(e);
      return;
    }
    if (e.key === 'Escape' && S.pressed) { release(); return; }
    const card = e.target.closest && e.target.closest(sel);
    if (!card || (e.key !== ' ' && e.key !== 'Spacebar')) return;
    e.preventDefault();   // Space would scroll the page
    if (e.repeat || S.card) return;
    const r = card.getBoundingClientRect();
    begin(card, 'key', r.right - 36, r.top + r.height / 2);
  }

  function onKeyUp(e) {
    if ((e.key !== ' ' && e.key !== 'Spacebar') || S.kind !== 'key') return;
    if (S.committed && document.activeElement !== closeBtn) closeBtn.focus({ preventScroll: true });
    else release();
  }

  function trap(e) {
    const list = [...sheet.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((n) => !n.disabled && n.offsetParent !== null);
    if (!list.length) return;
    const first = list[0], lastEl = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
    else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
  }

  function init(opts) {
    opts = opts || {};
    if (layer) return;
    sel = opts.selector || sel;
    tips = opts.tips !== false;
    build(opts);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerEnd);
    document.addEventListener('pointercancel', onPointerEnd);
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    // once the card is lifted the finger belongs to the press, not to the page scroll
    document.addEventListener('touchmove', (e) => { if (S.pressed && S.mounted) e.preventDefault(); }, { passive: false });
    document.addEventListener('contextmenu', (e) => { if (S.card && e.target.closest && e.target.closest(sel)) e.preventDefault(); });
    // Safari on a force-sensing trackpad: webkitForce is 1 at a click and 2 at a force click
    document.addEventListener('webkitmouseforcewillbegin', (e) => { if (e.target.closest && e.target.closest(sel)) e.preventDefault(); });
    document.addEventListener('webkitmouseforcedown', (e) => { if (e.target.closest && e.target.closest(sel)) e.preventDefault(); });
    document.addEventListener('webkitmouseforcechanged', (e) => {
      if (!S.pressed || S.kind !== 'mouse') return;
      const f = e.webkitForce;
      if (S.source === 'hold' && S.depth === 0 && f > 1.05) setSource('force', f);
      if (S.source === 'force') S.raw = f;
    });
    addEventListener('resize', () => {
      if (!S.mounted) return;
      fit();
      if (!S.card.classList.contains('pp-is-source')) return;
      S.card.classList.remove('pp-is-source');
      S.C = S.card.getBoundingClientRect();
      S.card.classList.add('pp-is-source');
      paint();
    });
  }

  // Freeze the layer at a given depth, for posters and tests: PressurePeek.pose(card, 0.7, x, y)
  function pose(card, depth, x, y) {
    if (!layer) init();
    begin(card, 'mouse', x, y);
    mount();
    S.depth = depth;
    S.peeked = depth >= PEEK;
    lift.snap(clamp(depth / PEEK, 0, 1));
    grow.snap(S.peeked ? lerp(G_PEEK, G_DEEP, (depth - PEEK) / (1 - PEEK)) : 0);
    cancelAnimationFrame(raf);
    raf = 0;
    paint();
  }

  window.PressurePeek = { init, open, close, pose };
})();
