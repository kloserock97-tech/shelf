// Scented Filter Chips.
// Markup: .sfc[data-noun] > .sfc__chips > button.sfc-chip[data-filter][data-miss], .sfc__list > li.sfc-row[data-tags].
// Filters combine with AND. Every chip shows how many rows it would leave (a bar and a number); hover, keyboard focus
// or a long press previews the result on the list; pressing commits and the list moves there with FLIP.
(() => {
  const HOLD_MS = 380; // long press on touch
  const CLEAR_DELAY = 90; // gap between two chips does not flash the list back
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  // Damped spring (mass 1) sampled into a CSS linear() easing.
  function spring(stiffness, damping) {
    const w = Math.sqrt(stiffness);
    const z = damping / (2 * w);
    const wd = w * Math.sqrt(Math.max(1e-6, 1 - z * z));
    const at = (t) => 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
    const T = Math.min(1.6, 6.9 / (z * w));
    const pts = [];
    for (let i = 0; i <= 32; i++) pts.push(i === 32 ? 1 : +at((T * i) / 32).toFixed(4));
    return { easing: `linear(${pts.join(', ')})`, duration: Math.round(T * 1000) };
  }
  const MOVE = spring(240, 27);

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function init(root) {
    const chips = [...root.querySelectorAll('.sfc-chip')];
    const list = root.querySelector('.sfc__list');
    const rows = [...list.querySelectorAll('.sfc-row')];
    const countEl = root.querySelector('.sfc__count');
    const previewEl = root.querySelector('.sfc__preview');
    const clearBtn = root.querySelector('.sfc__clear');
    const noun = root.dataset.noun || 'result';
    const plural = (n) => `${n} ${noun}${n === 1 ? '' : 's'}`;
    const tags = new Map(rows.map((r) => [r, new Set((r.dataset.tags || '').split(/\s+/).filter(Boolean))]));
    const active = new Set(chips.filter((c) => c.getAttribute('aria-pressed') === 'true').map((c) => c.dataset.filter));
    let previewing = null;
    let clearTimer = 0;

    rows.forEach((r) => {
      if (!r.querySelector('.sfc-row__why')) r.append(el('span', 'sfc-row__why'));
      r.querySelector('.sfc-row__why').setAttribute('aria-hidden', 'true');
    });

    chips.forEach((chip) => {
      const label = chip.textContent.trim();
      chip.dataset.label = label;
      chip.type = 'button';
      chip.textContent = '';
      const meter = el('span', 'sfc-chip__meter');
      meter.append(el('i'));
      meter.setAttribute('aria-hidden', 'true');
      const count = el('span', 'sfc-chip__count');
      count.setAttribute('aria-hidden', 'true');
      chip.append(el('span', 'sfc-chip__label', label), meter, count, el('span', 'sfc-sr'));
      if (!chip.hasAttribute('aria-pressed')) chip.setAttribute('aria-pressed', 'false');
    });

    const matches = (row, set) => {
      const t = tags.get(row);
      for (const k of set) if (!t.has(k)) return false;
      return true;
    };
    const resultsFor = (set) => rows.filter((r) => matches(r, set));
    const toggled = (key) => {
      const next = new Set(active);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    };

    function render() {
      const n = resultsFor(active).length;
      chips.forEach((chip) => {
        const key = chip.dataset.filter;
        const on = active.has(key);
        const m = resultsFor(toggled(key)).length;
        chip.setAttribute('aria-pressed', String(on));
        chip.querySelector('.sfc-chip__count').textContent = on ? `+${m - n}` : String(m);
        chip.style.setProperty('--sfc-p', n ? (m / n).toFixed(3) : '0');
        const zero = !on && m === 0;
        if (zero) chip.setAttribute('aria-disabled', 'true');
        else chip.removeAttribute('aria-disabled');
        chip.querySelector('.sfc-sr').textContent = on
          ? `, on; turning it off shows ${plural(m)}`
          : zero ? `, would leave no ${noun}s` : `, would leave ${m} of ${plural(n)}`;
      });
      countEl.textContent = plural(n);
      if (clearBtn) clearBtn.hidden = active.size === 0;
    }

    function setPreviewText(html) {
      previewEl.replaceChildren(...html);
    }

    function preview(chip) {
      clearTimeout(clearTimer);
      if (previewing === chip) return;
      unpreview();
      previewing = chip;
      chip.classList.add('is-previewing');
      root.classList.add('is-previewing');
      const key = chip.dataset.filter;
      const label = chip.dataset.label;
      const next = toggled(key);
      const m = resultsFor(next).length;
      if (active.has(key)) {
        setPreviewText(['→ ', el('b', null, String(m)), ` without ${label}`]);
        return;
      }
      if (m === 0) {
        setPreviewText([`nothing left with ${label}`]);
        return;
      }
      setPreviewText(['→ ', el('b', null, String(m)), ` with ${label}`]);
      const why = chip.dataset.miss || `No ${label.toLowerCase()}`;
      rows.forEach((r) => {
        if (r.hidden || matches(r, next)) return;
        r.querySelector('.sfc-row__why').textContent = why;
        r.classList.add('is-going');
      });
    }

    function unpreview() {
      clearTimeout(clearTimer);
      if (!previewing) return;
      previewing.classList.remove('is-previewing');
      previewing = null;
      root.classList.remove('is-previewing');
      rows.forEach((r) => r.classList.remove('is-going'));
    }
    const unpreviewSoon = () => {
      clearTimeout(clearTimer);
      clearTimer = setTimeout(unpreview, CLEAR_DELAY);
    };

    // FLIP: rows that stay glide to their new place, rows that go leave from where they are, new rows fade in.
    function apply() {
      const calm = reduced.matches;
      rows.forEach((r) => {
        if (!r.classList.contains('is-exiting')) return;
        r.getAnimations().forEach((a) => a.cancel());
        r.hidden = true;
        r.classList.remove('is-exiting', 'is-going');
        r.style.cssText = '';
      });
      const first = new Map();
      rows.forEach((r) => { if (!r.hidden) first.set(r, r.getBoundingClientRect().top); });
      const h0 = list.getBoundingClientRect().height;
      list.getAnimations().forEach((a) => a.cancel());
      rows.forEach((r) => r.getAnimations().forEach((a) => a.cancel()));

      const keep = new Set(resultsFor(active));
      const exits = [];
      const enters = [];
      rows.forEach((r) => {
        if (!r.hidden && !keep.has(r)) exits.push({ r, top: r.offsetTop });
        else if (r.hidden && keep.has(r)) enters.push(r);
      });
      exits.forEach(({ r, top }) => {
        r.classList.add('is-exiting');
        r.style.cssText = `position:absolute;left:0;right:0;top:${top}px;pointer-events:none`;
      });
      enters.forEach((r) => { r.hidden = false; r.classList.remove('is-going'); });
      rows.forEach((r) => { if (keep.has(r)) r.classList.remove('is-going'); });
      const h1 = list.getBoundingClientRect().height;

      exits.forEach(({ r }) => {
        const a = r.animate(
          calm ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(28px)' }],
          { duration: calm ? 150 : 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' }
        );
        a.onfinish = () => {
          r.hidden = true;
          r.classList.remove('is-exiting', 'is-going');
          r.style.cssText = '';
          a.cancel();
        };
      });
      if (calm) {
        enters.forEach((r) => r.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease' }));
        return;
      }
      rows.forEach((r) => {
        if (!keep.has(r) || !first.has(r)) return;
        const dy = first.get(r) - r.getBoundingClientRect().top;
        if (Math.abs(dy) < 0.5) return;
        r.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], MOVE);
      });
      enters.forEach((r) => {
        r.animate(
          [{ opacity: 0, transform: 'translateX(-12px)' }, { opacity: 1, transform: 'none' }],
          { duration: 260, delay: 70, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'backwards' }
        );
      });
      if (Math.abs(h1 - h0) > 0.5) {
        list.animate([{ height: `${h0}px` }, { height: `${h1}px` }], MOVE);
      }
    }

    function commit(chip) {
      if (chip.getAttribute('aria-disabled') === 'true') {
        unpreview();
        preview(chip);
        return;
      }
      const key = chip.dataset.filter;
      if (active.has(key)) active.delete(key);
      else active.add(key);
      unpreview();
      chip.dataset.fresh = '1'; // no preview of the undo until the pointer leaves or focus moves
      apply();
      render();
      root.dispatchEvent(new CustomEvent('filterchange', { detail: [...active] }));
    }

    chips.forEach((chip) => {
      let holdTimer = 0;
      let held = false;
      chip.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'touch' || chip.dataset.fresh) return;
        preview(chip);
      });
      chip.addEventListener('pointerleave', (e) => {
        delete chip.dataset.fresh;
        if (e.pointerType === 'touch') return;
        if (previewing === chip && !chip.matches(':focus-visible')) unpreviewSoon();
      });
      chip.addEventListener('focus', () => {
        if (chip.matches(':focus-visible') && !chip.dataset.fresh) preview(chip);
      });
      chip.addEventListener('blur', () => {
        delete chip.dataset.fresh;
        if (previewing === chip) unpreviewSoon();
      });
      chip.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'touch') return;
        held = false;
        clearTimeout(holdTimer);
        holdTimer = setTimeout(() => { held = true; preview(chip); }, HOLD_MS);
      });
      const release = () => {
        clearTimeout(holdTimer);
        if (held) unpreview();
      };
      chip.addEventListener('pointerup', release);
      chip.addEventListener('pointercancel', () => { release(); held = false; });
      chip.addEventListener('contextmenu', (e) => { if (held) e.preventDefault(); });
      chip.addEventListener('click', (e) => {
        if (held) { held = false; e.preventDefault(); return; }
        commit(chip);
      });
      chip.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && previewing === chip) { unpreview(); chip.dataset.fresh = '1'; }
      });
    });

    clearBtn?.addEventListener('click', () => {
      active.clear();
      unpreview();
      apply();
      render();
      root.dispatchEvent(new CustomEvent('filterchange', { detail: [] }));
    });

    render();
    rows.forEach((r) => { r.hidden = !matches(r, active); });

    root.sfc = {
      set(keys) {
        active.clear();
        keys.forEach((k) => active.add(k));
        unpreview();
        rows.forEach((r) => { r.hidden = !matches(r, active); });
        render();
      },
      preview(key) {
        const chip = chips.find((c) => c.dataset.filter === key);
        if (chip) preview(chip);
      },
      get active() { return [...active]; }
    };
  }

  document.querySelectorAll('.sfc').forEach(init);
})();
