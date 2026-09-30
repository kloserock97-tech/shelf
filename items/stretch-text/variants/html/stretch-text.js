// Stretch Text.
// Markup: .st > .st__text with the detail written inline as <span data-l="2">…</span> / <span data-l="3">…</span>,
// plus a button.st__handle. Without the script the full text is simply there.
// The script splits every detail span into words (each keeps its leading space) and grows or shrinks them
// in place: width from 0 to the word's own width, blur 6px to 0, fade in. New words keep the accent colour
// for a moment so the eye finds what was added.
(() => {
  const NAMES = ['Summary', 'Detail', 'Full story'];
  const STEP_PX = 34; // drag distance per level
  const PINCH_STEP = 1.3; // finger spread ratio per level
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let uid = 0;

  function init(root) {
    const text = root.querySelector('.st__text');
    const handle = root.querySelector('.st__handle');
    const pieces = [];
    text.querySelectorAll('[data-l]').forEach((span) => {
      const l = Number(span.dataset.l) || 2;
      const frag = document.createDocumentFragment();
      for (const w of span.textContent.match(/\s*\S+|\s+$/g) || []) {
        const el = document.createElement('span');
        el.className = 'st-w';
        el.textContent = w;
        pieces.push({ el, l, on: true, anim: null, ink: 0 });
        frag.append(el);
      }
      span.replaceWith(frag);
    });
    const max = Math.max(1, ...pieces.map((p) => p.l));
    let level = Math.min(max, Math.max(1, Number(root.dataset.level) || 1));

    // screen readers get the current level as plain text, and the handle as a button
    text.setAttribute('aria-hidden', 'true');
    const sr = document.createElement('p');
    sr.className = 'st-sr';
    sr.setAttribute('aria-live', 'polite');
    text.after(sr);
    const id = `st-${++uid}`;
    handle.type = 'button';
    handle.replaceChildren();
    const bars = document.createElement('span');
    bars.className = 'st__bars';
    bars.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < max; i++) bars.append(document.createElement('i'));
    const name = document.createElement('span');
    name.className = 'st__level';
    name.setAttribute('aria-hidden', 'true');
    const act = document.createElement('span');
    act.className = 'st-sr';
    const desc = document.createElement('span');
    desc.className = 'st-sr';
    desc.id = `${id}-level`;
    handle.append(bars, name, act, desc);
    handle.setAttribute('aria-describedby', desc.id);

    const plain = () => [...text.childNodes].map((n) => {
      if (n.nodeType !== 1 || !n.classList.contains('st-w')) return n.textContent;
      const p = pieces.find((x) => x.el === n);
      return p && p.l > level ? '' : n.textContent;
    }).join('').replace(/\s+/g, ' ').trim();

    function ui(announce) {
      root.dataset.level = String(level);
      name.textContent = NAMES[level - 1] || `Level ${level}`;
      act.textContent = level < max ? 'More detail' : 'Back to summary';
      desc.textContent = `Level ${level} of ${max}: ${(NAMES[level - 1] || '').toLowerCase()}`;
      if (announce) sr.textContent = plain();
    }

    function snap() {
      for (const p of pieces) {
        p.anim?.cancel();
        p.anim = null;
        p.on = p.l <= level;
        p.el.classList.toggle('is-off', !p.on);
        p.el.classList.remove('is-growing', 'is-new');
        p.el.style.width = '';
      }
    }

    function set(next, { instant = false, freezeAt = null } = {}) {
      next = Math.min(max, Math.max(1, next));
      if (next === level && !instant) return;
      level = next;
      ui(true);
      if (instant) { snap(); return; }
      const moving = pieces.filter((p) => p.anim || p.on !== (p.l <= level));
      if (reduced.matches) {
        for (const p of moving) {
          const on = p.l <= level;
          p.on = on;
          p.el.classList.toggle('is-off', !on);
          if (on) p.el.animate({ opacity: [0, 1] }, { duration: 160, easing: 'ease' });
        }
        return;
      }
      // read where running animations are, then measure every word at its own width, then animate
      for (const p of moving) {
        p.from = p.anim ? parseFloat(getComputedStyle(p.el).width) || 0 : p.on ? null : 0;
      }
      for (const p of moving) {
        p.anim?.cancel();
        p.anim = null;
        p.el.classList.remove('is-off');
        p.el.classList.add('is-growing');
        p.el.style.width = '';
      }
      for (const p of moving) p.w = p.el.getBoundingClientRect().width;
      let k = 0;
      for (const p of moving) {
        const on = p.l <= level;
        const from = p.from ?? p.w;
        const to = on ? p.w : 0;
        const f0 = p.w ? Math.min(1, from / p.w) : 0;
        const f1 = on ? 1 : 0;
        const delay = on ? Math.min(k++ * 24, 300) : 0;
        const duration = on ? 480 : 260;
        const anim = p.el.animate(
          [
            { width: `${from}px`, opacity: f0, filter: `blur(${((1 - f0) * 6).toFixed(2)}px)` },
            { width: `${to}px`, opacity: f1, filter: `blur(${((1 - f1) * 6).toFixed(2)}px)` }
          ],
          { duration, delay, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'both' }
        );
        p.anim = anim;
        p.on = on;
        clearTimeout(p.ink);
        if (on) {
          p.el.classList.add('is-new');
          p.ink = setTimeout(() => p.el.classList.remove('is-new'), delay + duration + 1100);
        } else p.el.classList.remove('is-new');
        anim.onfinish = () => {
          if (p.anim !== anim) return;
          p.anim = null;
          p.el.classList.remove('is-growing');
          p.el.classList.toggle('is-off', !on);
          p.el.style.width = '';
          anim.cancel();
        };
        if (freezeAt != null) {
          anim.pause();
          anim.currentTime = freezeAt;
          clearTimeout(p.ink);
        }
      }
    }

    // handle: click = next level (from the last one back to the summary), drag sideways = scrub
    let drag = null;
    let swallowClick = false;
    handle.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      drag = { id: e.pointerId, x: e.clientX, start: level, moved: false };
      try { handle.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    });
    handle.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) > 5) {
        drag.moved = true;
        root.classList.add('is-scrubbing');
      }
      if (drag.moved) set(drag.start + Math.round(dx / STEP_PX));
    });
    const endDrag = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      swallowClick = drag.moved;
      drag = null;
      root.classList.remove('is-scrubbing');
    };
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
    handle.addEventListener('click', () => {
      if (swallowClick) { swallowClick = false; return; }
      set(level >= max ? 1 : level + 1);
    });
    handle.addEventListener('keydown', (e) => {
      const k = e.key;
      let next = null;
      if (k === '+' || k === '=' || k === 'ArrowRight' || k === 'ArrowUp') next = level + 1;
      else if (k === '-' || k === '_' || k === 'ArrowLeft' || k === 'ArrowDown') next = level - 1;
      else if (k === 'Home') next = 1;
      else if (k === 'End') next = max;
      if (next == null) return;
      e.preventDefault();
      set(next);
    });

    // pinch the text (touch) or pinch on a trackpad (ctrl + wheel)
    const touches = new Map();
    let pinch = null;
    const spread = () => {
      const [a, b] = [...touches.values()];
      return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    };
    text.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) pinch = { d0: spread(), base: level };
    });
    text.addEventListener('pointermove', (e) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!pinch || touches.size !== 2) return;
      const r = spread() / pinch.d0;
      const steps = r >= 1 ? Math.floor(Math.log(r) / Math.log(PINCH_STEP)) : -Math.floor(Math.log(1 / r) / Math.log(PINCH_STEP));
      set(pinch.base + steps);
    });
    const lift = (e) => {
      touches.delete(e.pointerId);
      if (touches.size < 2) pinch = null;
    };
    text.addEventListener('pointerup', lift);
    text.addEventListener('pointercancel', lift);
    let wheel = 0;
    root.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      wheel += e.deltaY;
      if (wheel <= -40) { wheel = 0; set(level + 1); }
      else if (wheel >= 40) { wheel = 0; set(level - 1); }
    }, { passive: false });

    ui(false);
    sr.textContent = plain();
    snap();

    root.stretch = {
      set,
      get level() { return level; },
      get max() { return max; }
    };
  }

  document.querySelectorAll('.st').forEach(init);
})();
