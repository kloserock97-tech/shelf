// Radial Thumb Menu.
// Long-press the floating button (or start dragging from it) and an arc of actions opens under the thumb. Slide along
// the arc: the item under the thumb grows, letting go picks it, sliding back to the centre cancels. Letting go at the
// centre without leaving it keeps the arc open for a tap. A short tap opens the same actions as a plain sheet
// (<dialog>), which is also what Enter/Space and assistive tech get. Arrow Up on the button opens the arc for the
// keyboard: arrows walk along it, Enter picks, Escape closes.
// Markup: .rtm[data-hand="right|left"] > .rtm__fab + .rtm__arc (svg.rtm__band, ul.rtm__items > li > button.rtm__item
// [data-action][aria-label] with an svg icon, .rtm__label). Event: "rtm:select" (detail: { action, label, via }).
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const HOLD_MS = 320;   // long-press time
  const DRAG_OPEN = 12;  // or move this far from the press point
  const CENTRE = 44;     // inside this radius nothing is picked

  /* ---- sound: synthesised clicks and tones, no files ---- */
  const hashU = (x) => { x ^= x >>> 16; x = Math.imul(x, 0x3f9c86cb); x ^= x >>> 14; x = Math.imul(x, 0x1ae9dacf); x ^= x >>> 15; return x >>> 0; }; // Hash Kit
  const sound = (() => {
    const AC = window.AudioContext || window.webkitAudioContext;
    let ctx = null, out = null, noise = null;
    function wake() {
      if (!AC) return;
      if (!ctx) {
        ctx = new AC();
        out = ctx.createGain();
        out.gain.value = 0.5;
        out.connect(ctx.destination);
        const n = Math.round(ctx.sampleRate * 0.06);
        noise = ctx.createBuffer(1, n, ctx.sampleRate);
        const d = noise.getChannelData(0);
        let s = 7;
        for (let i = 0; i < n; i++) { s = (s + 0xb31c96c9) >>> 0; d[i] = hashU(s) / 2147483648 - 1; }
      }
      if (ctx.state === 'suspended') ctx.resume();
    }
    function click(at, f, len, gain) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(gain, at + 0.0012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      src.connect(bp).connect(g).connect(out);
      src.start(at); src.stop(at + len + 0.02);
    }
    function tone(at, f0, f1, len, gain) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(f0, at);
      o.frequency.exponentialRampToValueAtTime(f1, at + len);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(gain, at + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      o.connect(g).connect(out);
      o.start(at); o.stop(at + len + 0.02);
    }
    const cues = {
      open(t) { tone(t, 300, 540, 0.1, 0.14); click(t, 1800, 0.02, 0.2); },
      tick(t, i = 0) { click(t, 2500 + i * 260, 0.016, 0.28); },
      pick(t) { tone(t, 660, 680, 0.08, 0.12); tone(t + 0.06, 990, 1000, 0.12, 0.12); },
      cancel(t) { tone(t, 420, 250, 0.12, 0.1); }
    };
    return { wake, play(name, arg) { if (ctx && ctx.state === 'running') cues[name]?.(ctx.currentTime, arg); } };
  })();
  const buzz = (ms) => { if (navigator.vibrate && navigator.userActivation?.hasBeenActive !== false) try { navigator.vibrate(ms); } catch { /* not allowed */ } };

  let uid = 0;

  function init(root) {
    if (root.radialMenu) return root.radialMenu;
    const id = ++uid;
    const fab = root.querySelector('.rtm__fab');
    const list = root.querySelector('.rtm__items');
    const items = [...root.querySelectorAll('.rtm__item')];
    const band = root.querySelector('.rtm__band');
    const label = root.querySelector('.rtm__label');
    const ghost = root.querySelector('.rtm__ghost');
    let scrim = root.querySelector('.rtm__scrim');
    if (!scrim) { scrim = document.createElement('div'); scrim.className = 'rtm__scrim'; root.prepend(scrim); }
    const R = Number(root.dataset.radius) || 136;
    const SPAN = Number(root.dataset.span) || 100;
    const n = items.length;
    const STEP = n > 1 ? SPAN / (n - 1) : 0;
    const soundOn = () => root.dataset.sound !== 'off';
    const cue = (name, arg) => { if (soundOn()) sound.play(name, arg); };
    const nameOf = (b) => b.getAttribute('aria-label') || b.textContent.trim();

    let open = false, mode = null, active = -1, visitedOut = false;
    let pointerId = null, x0 = 0, y0 = 0, timer = 0, lastUp = 0;
    let centre = { x: 0, y: 0 };
    let angles = [];

    list.setAttribute('role', 'menu');
    list.inert = true;
    items.forEach((b, i) => { b.setAttribute('role', 'menuitem'); b.tabIndex = -1; b.style.setProperty('--i', i); });
    fab.setAttribute('aria-haspopup', 'menu');
    fab.setAttribute('aria-expanded', 'false');

    /* ---- the sheet: built from the same items ---- */
    let sheet = root.querySelector('.rtm__sheet');
    if (!sheet) {
      sheet = document.createElement('dialog');
      sheet.className = 'rtm__sheet';
      sheet.setAttribute('aria-labelledby', `rtm${id}-title`);
      sheet.innerHTML = `<h2 id="rtm${id}-title">${list.getAttribute('aria-label') || 'Actions'}</h2><ul role="menu"></ul><button class="rtm__sheet-close" type="button">Cancel</button>`;
      const ul = sheet.querySelector('ul');
      for (const b of items) {
        const li = document.createElement('li');
        li.setAttribute('role', 'none');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('role', 'menuitem');
        btn.dataset.action = b.dataset.action;
        const icon = b.querySelector('svg')?.cloneNode(true);
        if (icon) btn.append(icon);
        btn.append(nameOf(b));
        li.append(btn);
        ul.append(li);
      }
      root.append(sheet);
    }
    const sheetItems = [...sheet.querySelectorAll('[role="menuitem"]')];
    sheet.querySelector('.rtm__sheet-close')?.addEventListener('click', () => sheet.close());
    sheet.addEventListener('click', (e) => {
      const btn = e.target.closest('[role="menuitem"]');
      if (btn) { sheet.close(); emit(btn.dataset.action, btn.textContent.trim(), 'sheet'); return; }
      if (e.target === sheet) {
        const r = sheet.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) sheet.close();
      }
    });
    sheet.addEventListener('keydown', (e) => {
      const i = sheetItems.indexOf(document.activeElement);
      const go = (k) => { e.preventDefault(); sheetItems[(k + sheetItems.length) % sheetItems.length].focus(); };
      if (e.key === 'ArrowDown') go(i + 1);
      else if (e.key === 'ArrowUp') go(i < 0 ? sheetItems.length - 1 : i - 1);
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(sheetItems.length - 1);
    });
    sheet.addEventListener('close', () => fab.setAttribute('aria-expanded', 'false'));
    function openSheet() {
      if (open) close(false);
      fab.setAttribute('aria-expanded', 'true');
      sheet.showModal();
      sheetItems[0]?.focus();
    }

    function emit(action, text, via) {
      root.dispatchEvent(new CustomEvent('rtm:select', { detail: { action, label: text, via } }));
    }

    /* ---- geometry: angles in screen degrees (0 = right, 90 = down), item 0 nearest the thumb's resting sweep ---- */
    const left = () => root.dataset.hand === 'left';
    function layout() {
      const a0 = 175, a1 = a0 + SPAN;
      angles = items.map((_, i) => { const a = a0 + i * STEP; return left() ? 180 - a : a; });
      items.forEach((b, i) => {
        const t = (angles[i] * Math.PI) / 180;
        b.style.setProperty('--x', `${(Math.cos(t) * R).toFixed(1)}px`);
        b.style.setProperty('--y', `${(Math.sin(t) * R).toFixed(1)}px`);
      });
      if (band) {
        const w = Number(getComputedStyle(root).getPropertyValue('--rtm-item').replace('px', '')) || 48;
        const p = (a) => { const t = (a * Math.PI) / 180; return `${(Math.cos(t) * R).toFixed(1)} ${(Math.sin(t) * R).toFixed(1)}`; };
        const sweep = left() ? 0 : 1;
        const from = left() ? 180 - a0 : a0, to = left() ? 180 - a1 : a1;
        band.innerHTML = `<path d="M ${p(from)} A ${R} ${R} 0 0 ${sweep} ${p(to)}" stroke-width="${w + 16}"/><path class="rtm__glow" d="" stroke-width="${w + 16}"/>`;
      }
      const fr = fab.getBoundingClientRect(), rr = root.getBoundingClientRect();
      centre = { x: fr.left + fr.width / 2, y: fr.top + fr.height / 2 };
      root.style.setProperty('--rtm-cx', `${(centre.x - rr.left).toFixed(0)}px`);
      root.style.setProperty('--rtm-cy', `${(centre.y - rr.top).toFixed(0)}px`);
    }

    function placeLabel(i) {
      if (!label) return;
      label.textContent = nameOf(items[i]);
      const t = (angles[i] * Math.PI) / 180, d = R + 70;
      let lx = Math.cos(t) * d, ly = Math.sin(t) * d;
      // keep it inside the root, 12 px from the edges
      const rr = root.getBoundingClientRect(), hw = label.offsetWidth / 2 + 12, hh = label.offsetHeight / 2 + 12;
      const ax = centre.x - rr.left, ay = centre.y - rr.top;
      lx = Math.min(rr.width - hw - ax, Math.max(hw - ax, lx));
      ly = Math.min(rr.height - hh - ay, Math.max(hh - ay, ly));
      label.style.setProperty('--lx', `${lx.toFixed(1)}px`);
      label.style.setProperty('--ly', `${ly.toFixed(1)}px`);
    }

    function setActive(i, quiet = false) {
      if (i === active) return;
      active = i;
      items.forEach((b, k) => {
        b.classList.toggle('is-active', k === i);
        b.classList.toggle('is-near', i >= 0 && Math.abs(k - i) === 1);
      });
      root.toggleAttribute('data-active', i >= 0);
      const glow = band?.querySelector('.rtm__glow');
      if (i >= 0) {
        placeLabel(i);
        if (glow) {
          const p = (a) => { const t = (a * Math.PI) / 180; return `${(Math.cos(t) * R).toFixed(1)} ${(Math.sin(t) * R).toFixed(1)}`; };
          const h = Math.max(4, STEP * 0.32), s = left() ? 0 : 1, a = angles[i], dir = left() ? -1 : 1;
          glow.setAttribute('d', `M ${p(a - h * dir)} A ${R} ${R} 0 0 ${s} ${p(a + h * dir)}`);
        }
        if (!quiet) { cue('tick', i); buzz(4); }
      } else glow?.setAttribute('d', '');
    }

    function openArc(byKey = false) {
      if (open) return;
      if (sheet.open) sheet.close();
      layout();
      open = true; mode = 'arc'; visitedOut = false;
      root.setAttribute('data-open', '');
      root.dataset.mode = 'arc';
      list.inert = false;
      fab.setAttribute('aria-expanded', 'true');
      fab.classList.remove('is-pressing');
      cue('open'); buzz(10);
      if (byKey) { setActive(0, true); items[0].tabIndex = 0; items[0].focus(); }
    }
    function close(withSound = true) {
      if (!open) return;
      open = false; mode = null;
      setActive(-1, true);
      root.removeAttribute('data-open');
      delete root.dataset.mode;
      list.inert = true;
      items.forEach((b) => { b.tabIndex = -1; });
      fab.setAttribute('aria-expanded', 'false');
      if (withSound) cue('cancel');
    }
    function choose(i, via) {
      const b = items[i];
      cue('pick'); buzz(14);
      if (!reduced.matches) { b.classList.remove('is-chosen'); void b.offsetWidth; b.classList.add('is-chosen'); }
      emit(b.dataset.action, nameOf(b), via);
      setTimeout(() => { b.classList.remove('is-chosen'); close(false); }, reduced.matches ? 0 : 200);
    }

    function track(cx, cy) {
      const dx = cx - centre.x, dy = cy - centre.y, d = Math.hypot(dx, dy);
      if (d >= CENTRE) visitedOut = true;
      if (d < CENTRE) { setActive(-1); return; }
      const a = (Math.atan2(dy, dx) * 180) / Math.PI;
      let best = -1, bestDiff = Infinity;
      angles.forEach((t, i) => {
        const diff = Math.abs(((a - t + 540) % 360) - 180);
        if (diff < bestDiff) { bestDiff = diff; best = i; }
      });
      setActive(bestDiff <= STEP / 2 + 16 ? best : -1);
    }

    /* ---- pointer ---- */
    fab.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || pointerId !== null) return;
      if (soundOn()) sound.wake();
      if (open) return; // sticky arc: the click closes it
      pointerId = e.pointerId;
      try { fab.setPointerCapture(e.pointerId); } catch { /* fine */ }
      x0 = e.clientX; y0 = e.clientY;
      fab.classList.add('is-pressing');
      clearTimeout(timer);
      timer = setTimeout(() => { if (pointerId !== null) openArc(); }, HOLD_MS);
    });
    fab.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointerId) return;
      if (!open) {
        if (Math.hypot(e.clientX - x0, e.clientY - y0) > DRAG_OPEN) { clearTimeout(timer); openArc(); }
        else return;
      }
      track(e.clientX, e.clientY);
    });
    const end = (e) => {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      lastUp = performance.now();
      clearTimeout(timer);
      fab.classList.remove('is-pressing');
      if (e.type === 'pointercancel') { close(); return; }
      if (!open) { openSheet(); return; }           // short tap
      if (active >= 0) choose(active, 'arc');
      else if (visitedOut) close();                  // came back to the centre: cancel
      // else: let go without moving — the arc stays open for a tap
    };
    fab.addEventListener('pointerup', end);
    fab.addEventListener('pointercancel', end);
    fab.addEventListener('contextmenu', (e) => e.preventDefault());
    fab.addEventListener('click', (e) => {
      if (performance.now() - lastUp < 400) return; // already handled by the pointer
      if (open) { close(); return; }
      openSheet(); // a click with no press (keyboard clicks are cancelled on keydown): assistive tech
    });
    scrim.addEventListener('pointerdown', () => close());
    items.forEach((b, i) => b.addEventListener('click', () => { if (open) choose(i, 'tap'); }));

    /* ---- keyboard ---- */
    fab.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (open) close(); else openSheet(); }
      else if (e.key === 'ArrowUp' || e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); openArc(true); }
    });
    fab.addEventListener('keyup', (e) => { if (e.key === ' ') e.preventDefault(); });
    list.addEventListener('keydown', (e) => {
      const i = items.indexOf(document.activeElement);
      const towardTop = { ArrowUp: 1, ArrowDown: -1, ArrowRight: left() ? -1 : 1, ArrowLeft: left() ? 1 : -1 };
      let k = null;
      if (e.key in towardTop) k = i + towardTop[e.key];
      else if (e.key === 'Home') k = 0;
      else if (e.key === 'End') k = n - 1;
      else if (e.key === 'Escape' || e.key === 'Tab') { if (e.key === 'Escape') e.preventDefault(); close(); fab.focus(); return; }
      if (k === null) return;
      e.preventDefault();
      k = Math.max(0, Math.min(n - 1, k));
      items.forEach((b, j) => { b.tabIndex = j === k ? 0 : -1; });
      items[k].focus();
      setActive(k);
    });
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) { close(); fab.focus(); } });
    new MutationObserver(() => { if (open) close(false); }).observe(root, { attributes: true, attributeFilter: ['data-hand'] });
    window.addEventListener('resize', () => { if (open) close(false); });

    const api = {
      openArc, close, openSheet,
      get open() { return open; },
      /** a still frame for previews: the arc open, item i under a drawn finger */
      preview(i = 2) {
        openArc();
        setActive(i, true);
        if (ghost) {
          // the pad of a thumb whose base is at the button: its tip on the item, its length pointing home
          const t = (angles[i] * Math.PI) / 180, back = R - 24;
          ghost.style.setProperty('--gx', `${(Math.cos(t) * back).toFixed(1)}px`);
          ghost.style.setProperty('--gy', `${(Math.sin(t) * back).toFixed(1)}px`);
          ghost.style.setProperty('--gr', `${(angles[i] + 90).toFixed(1)}deg`);
          root.setAttribute('data-ghost', '');
        }
      }
    };
    root.radialMenu = api;
    return api;
  }

  window.RadialMenu = { init };
  const boot = () => document.querySelectorAll('[data-radial-menu]').forEach((el) => init(el));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
