// Feedforward Action.
// Markup: .ffa[data-noun] > .ffa__actions > button.ffa-btn[data-ffa], .ffa__status, .ffa__stage > ul.ffa__list > li.ffa-row.
// Kinds: data-ffa="archive" (rows whose data-status equals data-match), "sort" (by data-<key>, ascending),
// "style" (adds data-class to rows whose data-status equals data-match).
// Texts: data-preview / data-done / data-noop, with {n} {names} {moves} {total}.
// Hover (after 90 ms), keyboard focus or a touch hold (260 ms) previews on the real rows; press commits, leaving
// cancels. On touch, sliding off the button before release cancels. Every commit can be undone.
(() => {
  const HOVER_DELAY = 90;
  const HOLD_MS = 260;
  const SLIDE_OFF = 16; // px around the button that still counts as on it
  const SVG = 'http://www.w3.org/2000/svg';
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
  const MOVE = spring(250, 27);
  const OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
  let uid = 0;

  function init(root) {
    const list = root.querySelector('.ffa__list');
    const stage = root.querySelector('.ffa__stage') || list.parentElement;
    const statusEl = root.querySelector('.ffa__status');
    const buttons = [...root.querySelectorAll('.ffa-btn[data-ffa]')];
    const rows = [...list.querySelectorAll('.ffa-row')];
    const noun = root.dataset.noun || 'item';
    const plural = (n) => `${n} ${noun}${n === 1 ? '' : 's'}`;
    const nameOf = (r) => r.querySelector('.ffa-row__name')?.textContent.trim() ?? '';
    const names = (rs) => (rs.length <= 3 ? rs.map(nameOf).join(', ') : `${rs.slice(0, 2).map(nameOf).join(', ')} and ${rs.length - 2} more`);
    const visible = () => [...list.children].filter((r) => r.classList.contains('ffa-row') && !r.hidden && !r.classList.contains('is-exiting'));

    const svg = document.createElementNS(SVG, 'svg');
    svg.classList.add('ffa__arrows');
    svg.setAttribute('aria-hidden', 'true');
    stage.append(svg);

    // status: a visual line (previews and results) and a quiet live region for results only
    const line = document.createElement('span');
    line.setAttribute('aria-hidden', 'true');
    const live = document.createElement('span');
    live.className = 'ffa-sr';
    live.setAttribute('role', 'status');
    const undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.className = 'ffa__undo';
    undoBtn.textContent = 'Undo';
    statusEl.replaceChildren(line, live, undoBtn);

    const history = [];
    let previewing = null;
    let hoverTimer = 0;
    let done = null;

    buttons.forEach((b) => {
      const d = document.createElement('span');
      d.className = 'ffa-sr';
      d.id = `ffa-${++uid}`;
      b.append(d);
      b.setAttribute('aria-describedby', d.id);
      b.type = 'button';
    });

    function plan(btn) {
      const kind = btn.dataset.ffa;
      const vis = visible();
      if (kind === 'sort') {
        const key = btn.dataset.key;
        const order = [...vis].sort((a, b) => (a.dataset[key] > b.dataset[key]) - (a.dataset[key] < b.dataset[key]));
        const moves = vis.map((r, i) => ({ r, from: i, to: order.indexOf(r) })).filter((m) => m.from !== m.to);
        return { kind, order, moves, targets: moves.map((m) => m.r), total: vis.length, noop: moves.length === 0 };
      }
      let targets = vis.filter((r) => r.dataset.status === btn.dataset.match);
      if (kind === 'style') targets = targets.filter((r) => !r.classList.contains(btn.dataset.class));
      return { kind, targets, total: vis.length, noop: targets.length === 0 };
    }
    const fill = (tpl, p) => (tpl || '')
      .replace('{n}', plural(p.targets.length))
      .replace('{names}', names(p.targets))
      .replace('{moves}', String(p.moves?.length ?? p.targets.length))
      .replace('{total}', String(p.total))
      .replace(/\.\./g, '.');

    function summary() {
      const vis = visible();
      const by = new Map();
      vis.forEach((r) => by.set(r.dataset.status, (by.get(r.dataset.status) || 0) + 1));
      return [plural(vis.length), ...[...by].map(([s, n]) => `${n} ${s}`)].join(' · ');
    }
    function setLine(text, mode = 'rest') {
      line.textContent = text;
      statusEl.classList.toggle('is-preview', mode === 'preview');
      statusEl.classList.toggle('is-cancel', mode === 'cancel');
      undoBtn.hidden = mode !== 'rest' || !done;
    }
    const rest = () => setLine(done || summary(), 'rest');

    function refresh() {
      buttons.forEach((b) => {
        const p = plan(b);
        const n = b.querySelector('[data-n]');
        if (n) n.textContent = String(p.targets.length);
        if (p.noop) b.setAttribute('aria-disabled', 'true');
        else b.removeAttribute('aria-disabled');
        b.lastElementChild.textContent = p.noop ? b.dataset.noop || 'Nothing to do.' : fill(b.dataset.preview, p);
      });
    }

    // ghost arrows: from each moving row to the slot it will take, bulging left of the list
    function clearArrows() {
      svg.replaceChildren();
    }
    function drawArrows(p) {
      clearArrows();
      const base = stage.getBoundingClientRect();
      const vis = visible();
      const pts = vis.map((r) => {
        const b = (r.querySelector('.ffa-row__dot') || r).getBoundingClientRect();
        return { x: b.left - base.left, y: b.top + b.height / 2 - base.top };
      });
      p.moves.forEach((m, k) => {
        const a = pts[m.from];
        const z = pts[m.to];
        const x = a.x - 5;
        const bend = Math.min(48, 16 + 7 * Math.abs(m.to - m.from));
        const c = x - bend;
        const up = z.y < a.y ? -1 : 1;
        const y0 = a.y + up * 3;
        const y1 = z.y - up * 3;
        const g = document.createElementNS(SVG, 'g');
        const path = document.createElementNS(SVG, 'path');
        path.setAttribute('d', `M ${x} ${y0} C ${c} ${y0}, ${c} ${y1}, ${x} ${y1}`);
        const head = document.createElementNS(SVG, 'path');
        head.setAttribute('d', `M ${x - 5} ${y1 - 3.5} L ${x} ${y1} L ${x - 5} ${y1 + 3.5}`);
        const tail = document.createElementNS(SVG, 'circle');
        tail.setAttribute('class', 'ffa-arrow__tail');
        tail.setAttribute('cx', String(x));
        tail.setAttribute('cy', String(y0));
        tail.setAttribute('r', '1.8');
        g.append(path, head, tail);
        svg.append(g);
        if (reduced.matches) return;
        const len = path.getTotalLength();
        path.style.strokeDasharray = String(len);
        path.animate({ strokeDashoffset: [len, 0] }, { duration: 380, delay: k * 45, easing: OUT, fill: 'backwards' });
        head.animate({ opacity: [0, 1] }, { duration: 140, delay: k * 45 + 300, fill: 'backwards' });
      });
    }

    function preview(btn) {
      clearTimeout(hoverTimer);
      if (previewing === btn) return;
      unpreview(true);
      previewing = btn;
      btn.classList.add('is-previewing');
      const p = plan(btn);
      if (p.noop) { setLine(btn.dataset.noop || 'Nothing to do.', 'preview'); return; }
      setLine(fill(btn.dataset.preview, p), 'preview');
      if (p.kind === 'archive') {
        p.targets.forEach((r, i) => {
          r.style.setProperty('--ffa-delay', `${i * 45}ms`);
          r.classList.add('is-ff-archive');
        });
      } else if (p.kind === 'style') {
        p.targets.forEach((r) => r.classList.add('is-ff-style'));
      } else {
        p.targets.forEach((r) => r.classList.add('is-ff-move'));
        drawArrows(p);
      }
    }
    function unpreview(quiet) {
      clearTimeout(hoverTimer);
      if (!previewing) return;
      previewing.classList.remove('is-previewing');
      previewing = null;
      root.classList.remove('is-cancelling');
      rows.forEach((r) => r.classList.remove('is-ff-archive', 'is-ff-style', 'is-ff-move'));
      clearArrows();
      if (!quiet) rest();
    }

    // FLIP: rows that stay glide, rows that leave slide out, rows that come back fade in
    function flip(mutate, exits = [], instant = false) {
      const calm = instant || reduced.matches;
      rows.forEach((r) => {
        if (!r.classList.contains('is-exiting')) return;
        r.getAnimations().forEach((a) => a.cancel());
        r.hidden = true;
        r.classList.remove('is-exiting', 'is-ff-archive');
        r.style.cssText = '';
      });
      const before = visible();
      const first = new Map(before.map((r) => [r, r.getBoundingClientRect().top]));
      const h0 = list.getBoundingClientRect().height;
      list.getAnimations().forEach((a) => a.cancel());
      rows.forEach((r) => r.getAnimations().forEach((a) => a.cancel()));
      const tops = exits.map((r) => r.offsetTop);
      exits.forEach((r, i) => {
        r.classList.add('is-exiting');
        r.style.cssText = `position:absolute;left:0;right:0;top:${tops[i]}px;pointer-events:none;`;
      });
      mutate();
      const after = visible();
      const h1 = list.getBoundingClientRect().height;
      const leave = (r) => {
        r.hidden = true;
        r.classList.remove('is-exiting', 'is-ff-archive');
        r.style.cssText = '';
      };
      if (calm) {
        exits.forEach(leave);
        if (!instant) after.filter((r) => !first.has(r)).forEach((r) => r.animate({ opacity: [0, 1] }, { duration: 160 }));
        return;
      }
      after.forEach((r) => {
        if (!first.has(r)) {
          r.animate({ opacity: [0, 1], transform: ['translateX(-10px)', 'none'] }, { duration: 260, delay: 60, easing: OUT, fill: 'backwards' });
          return;
        }
        const dy = first.get(r) - r.getBoundingClientRect().top;
        if (Math.abs(dy) > 0.5) r.animate({ transform: [`translateY(${dy}px)`, 'none'] }, MOVE);
      });
      exits.forEach((r, i) => {
        const a = r.animate({ opacity: [1, 0], transform: ['none', 'translateX(28px)'] }, { duration: 240, delay: i * 30, easing: OUT, fill: 'forwards' });
        a.onfinish = () => { leave(r); a.cancel(); };
      });
      if (Math.abs(h1 - h0) > 0.5) list.animate({ height: [`${h0}px`, `${h1}px`] }, MOVE);
    }

    function snapshot() {
      return {
        order: [...list.children],
        hidden: new Set(rows.filter((r) => r.hidden)),
        cls: new Map(rows.map((r) => [r, [...r.classList].filter((c) => !c.startsWith('is-ff') && c !== 'is-exiting')]))
      };
    }

    function commit(btn, { instant = false } = {}) {
      const p = plan(btn);
      if (p.noop) { if (!instant) { unpreview(true); preview(btn); } return; }
      history.push(snapshot());
      if (previewing) previewing.classList.remove('is-previewing');
      previewing = null;
      root.classList.remove('is-cancelling');
      clearArrows();
      rows.forEach((r) => {
        r.classList.remove('is-ff-style', 'is-ff-move');
        if (p.kind !== 'archive' || !p.targets.includes(r)) r.classList.remove('is-ff-archive');
      });
      if (p.kind === 'archive') {
        p.targets.forEach((r) => r.classList.add('is-ff-archive'));
        flip(() => {}, p.targets, instant);
      } else if (p.kind === 'sort') {
        flip(() => {
          const hidden = [...list.children].filter((r) => !p.order.includes(r));
          p.order.forEach((r) => list.append(r));
          hidden.forEach((r) => list.append(r));
        }, [], instant);
      } else {
        p.targets.forEach((r) => r.classList.add(btn.dataset.class));
      }
      done = fill(btn.dataset.done, p);
      live.textContent = `${done} Undo is available.`;
      btn.dataset.fresh = '1';
      refresh();
      rest();
    }

    function undo() {
      const s = history.pop();
      if (!s) return;
      unpreview(true);
      flip(() => {
        s.order.forEach((r) => list.append(r));
        rows.forEach((r) => {
          r.hidden = s.hidden.has(r);
          r.className = s.cls.get(r).join(' ');
        });
      });
      done = history.length ? 'Undone. Earlier steps can be undone too.' : null;
      live.textContent = 'Undone.';
      refresh();
      rest();
    }
    undoBtn.addEventListener('click', undo);

    buttons.forEach((btn) => {
      let holdTimer = 0;
      let held = false;
      let outside = false;
      let swallow = false;
      const holdLine = () => {
        const p = plan(btn);
        if (outside) setLine('Release to cancel.', 'cancel');
        else setLine(`${p.noop ? btn.dataset.noop : fill(btn.dataset.preview, p)} Release to apply, slide off to cancel.`, 'preview');
      };
      btn.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'touch' || btn.dataset.fresh) return;
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => preview(btn), previewing ? 0 : HOVER_DELAY);
      });
      btn.addEventListener('pointerleave', (e) => {
        delete btn.dataset.fresh;
        if (e.pointerType === 'touch') return;
        clearTimeout(hoverTimer);
        if (previewing === btn && !btn.matches(':focus-visible')) unpreview();
      });
      btn.addEventListener('pointerdown', (e) => {
        swallow = false;
        if (e.pointerType !== 'touch') {
          if (e.button === 0 && !btn.dataset.fresh) preview(btn);
          return;
        }
        held = false;
        outside = false;
        clearTimeout(holdTimer);
        holdTimer = setTimeout(() => {
          held = true;
          preview(btn);
          holdLine();
          navigator.vibrate?.(8);
        }, HOLD_MS);
      });
      btn.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'touch' || !held) return;
        const r = btn.getBoundingClientRect();
        const out = e.clientX < r.left - SLIDE_OFF || e.clientX > r.right + SLIDE_OFF || e.clientY < r.top - SLIDE_OFF || e.clientY > r.bottom + SLIDE_OFF;
        if (out === outside) return;
        outside = out;
        root.classList.toggle('is-cancelling', out);
        holdLine();
      });
      btn.addEventListener('pointerup', (e) => {
        if (e.pointerType !== 'touch') return;
        clearTimeout(holdTimer);
        if (!held) return;
        held = false;
        swallow = true;
        if (outside) unpreview();
        else commit(btn);
      });
      btn.addEventListener('pointercancel', () => {
        clearTimeout(holdTimer);
        if (held) unpreview();
        held = false;
      });
      btn.addEventListener('contextmenu', (e) => { if (held || swallow) e.preventDefault(); });
      btn.addEventListener('click', () => {
        if (swallow) { swallow = false; return; }
        commit(btn);
      });
      btn.addEventListener('focus', () => {
        if (btn.matches(':focus-visible') && !btn.dataset.fresh) preview(btn);
      });
      btn.addEventListener('blur', () => {
        delete btn.dataset.fresh;
        if (previewing === btn) unpreview();
      });
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && previewing === btn) {
          unpreview();
          btn.dataset.fresh = '1';
        }
      });
    });

    refresh();
    rest();

    const byKind = (kind) => buttons.find((b) => b.dataset.ffa === kind);
    root.ffa = {
      preview(kind) { const b = byKind(kind); if (b) preview(b); },
      commit(kind, opts) { const b = byKind(kind); if (b) commit(b, opts); },
      undo
    };
  }

  document.querySelectorAll('.ffa').forEach(init);
})();
