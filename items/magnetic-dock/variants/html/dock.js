// Magnetic Dock: items grow toward the cursor, the edge lights up where the hand is,
// the current section is highlighted as the page scrolls. One requestAnimationFrame drives everything,
// writes the DOM only when a value changed, and sleeps when nothing moves.
(function () {
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = matchMedia('(hover: hover) and (pointer: fine)');
  /** frame-rate independent easing toward a target */
  const approach = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));

  function initDock(dock, { spy = true, line = 0.4, enter = true } = {}) {
    if (dock.dataset.dockReady) return null;
    dock.dataset.dockReady = 'true';
    const items = [...dock.querySelectorAll('[data-dock]')];
    const near = items.map(() => ({ value: 0, written: -1 }));
    const pointer = { x: 0, y: 0, seen: false };
    let glint = 0;
    let glintWritten = -1;
    let keyboardFocus = -1;
    let raf = 0;
    let last = 0;

    const wake = () => {
      if (raf) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };

    addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.seen = true;
      wake();
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { pointer.seen = false; wake(); });

    // Rectangles are measured when the dock changed, not every frame:
    // getBoundingClientRect right after style writes would force a layout on every frame.
    let box = null;
    let centers = [];
    let dirty = true;
    let gx = '';
    let gy = '';
    if ('ResizeObserver' in window) new ResizeObserver(() => { dirty = true; }).observe(dock);
    addEventListener('resize', () => { dirty = true; });
    addEventListener('scroll', () => { dirty = true; wake(); }, { passive: true });

    const targets = () => {
      const out = items.map(() => 0);
      if (keyboardFocus >= 0) {
        out[keyboardFocus] = 1;
        return { out, glintTarget: 0.6 };
      }
      if (!pointer.seen || !FINE.matches || REDUCED) return { out, glintTarget: 0 };
      if (dirty || !box) {
        dirty = false;
        box = dock.getBoundingClientRect();
        centers = items.map((el) => { const r = el.getBoundingClientRect(); return r.left + r.width / 2; });
      }
      // the pull reaches 2.6 dock heights sideways, one height above and 2.2 below
      const reachX = box.height * 2.6;
      const inBand = pointer.y > box.top - box.height && pointer.y < box.bottom + box.height * 2.2
        && pointer.x > box.left - reachX && pointer.x < box.right + reachX;
      if (!inBand) return { out, glintTarget: 0 };
      items.forEach((_, i) => {
        const t = Math.max(0, 1 - Math.abs(pointer.x - centers[i]) / reachX);
        out[i] = t * t * (3 - 2 * t); // smoothstep
      });
      const nx = `${(pointer.x - box.left).toFixed(0)}px`;
      const ny = `${(pointer.y - box.top).toFixed(0)}px`;
      if (nx !== gx) { gx = nx; dock.style.setProperty('--gx', nx); }
      if (ny !== gy) { gy = ny; dock.style.setProperty('--gy', ny); }
      return { out, glintTarget: 1 };
    };

    function frame(now) {
      raf = 0;
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
      last = now;
      const { out, glintTarget } = targets();
      let busy = false;
      items.forEach((el, i) => {
        const n = near[i];
        n.value = approach(n.value, out[i], 14, dt);
        if (Math.abs(n.value - out[i]) < 0.002) n.value = out[i];
        else busy = true;
        const v = Math.round(n.value * 1000) / 1000;
        if (v !== n.written) {
          n.written = v;
          el.style.setProperty('--near', String(v));
          el.dataset.near = v > 0.35 ? 'true' : 'false';
        }
      });
      glint = approach(glint, glintTarget, 8, dt);
      const g = Math.round(glint * 100) / 100;
      if (g !== glintWritten) {
        glintWritten = g;
        dock.style.setProperty('--glint', String(g));
      }
      if (Math.abs(glint - glintTarget) >= 0.005) busy = true;
      if (busy) raf = requestAnimationFrame(frame);
    }

    // Keyboard: the focused item grows as if the cursor were on it
    dock.addEventListener('focusin', (e) => {
      const item = e.target.closest('[data-dock]');
      keyboardFocus = item && item.matches(':focus-visible') ? items.indexOf(item) : -1;
      wake();
    });
    dock.addEventListener('focusout', () => requestAnimationFrame(() => {
      if (!dock.contains(document.activeElement)) { keyboardFocus = -1; wake(); }
    }));

    // In-page links scroll to their section
    items.forEach((el) => {
      const href = el.getAttribute('href') || '';
      if (href.length < 2 || href[0] !== '#') return;
      el.addEventListener('click', (e) => {
        const target = document.getElementById(href.slice(1));
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
      });
    });

    // Scroll-spy: the active item is the last section whose top has passed 40% of the window.
    // The mark (home) is never highlighted.
    if (spy) {
      const marks = items
        .filter((el) => !el.classList.contains('dock-mark'))
        .map((el) => {
          const href = el.getAttribute('href') || '';
          const section = href.length > 1 && href[0] === '#' ? document.getElementById(href.slice(1)) : null;
          return section ? [el, section] : null;
        })
        .filter(Boolean)
        .reverse();
      let shown;
      const track = (active) => {
        if (active === shown) return;
        shown = active;
        items.forEach((el) => {
          const on = el === active;
          el.classList.toggle('is-active', on);
          if (on) el.setAttribute('aria-current', 'true');
          else el.removeAttribute('aria-current');
        });
      };
      let spyRaf = 0;
      const pick = () => {
        spyRaf = 0;
        const y = innerHeight * line;
        for (const [el, section] of marks) {
          if (section.offsetParent !== null && section.getBoundingClientRect().top <= y) return track(el);
        }
        track(null);
      };
      const schedule = () => { if (!spyRaf) spyRaf = requestAnimationFrame(pick); };
      addEventListener('scroll', schedule, { passive: true });
      addEventListener('resize', schedule);
      pick();
    }

    // Entrance: hidden state first, then the cascade on the next frame
    if (enter) {
      dock.setAttribute('data-enter', '');
      void dock.offsetHeight;
      requestAnimationFrame(() => {
        dock.classList.add('is-in');
        setTimeout(() => dock.classList.add('is-settled'), 1000);
      });
    }
    return { wake };
  }

  document.querySelectorAll('.dock').forEach((dock) => initDock(dock));
  window.initDock = initDock;
})();
