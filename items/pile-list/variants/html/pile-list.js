// Pile List.
// Markup: .pl > ul.pl__list > li > .pl-note[data-id] (+ optional .pl__live for announcements, .pl__summary for counts).
// Drop a row onto the middle of another row: they become a pile. Drop near an edge: the row moves there.
// Tap a pile: it fans open in place; drag a note out of an open pile: it leaves the pile.
// Ctrl/Cmd-drag (mouse) or pinch (touch) across rows: everything in between goes into one pile.
// Keyboard: arrows move, Space selects, G piles the selection (or this row with the next), U unpiles,
// Enter/→/← open and close a pile, Alt+↑/↓ moves a row.
(() => {
  const DRAG_START = 6; // px before a press becomes a drag
  const PINCH_COMMIT = 0.35; // pinch closed by a third or more: pile
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  // Damped spring (mass 1) sampled into a CSS linear() easing.
  function spring(stiffness, damping) {
    const w = Math.sqrt(stiffness);
    const z = damping / (2 * w);
    const wd = w * Math.sqrt(Math.max(1e-6, 1 - z * z));
    const at = (t) => 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
    const T = Math.min(1.6, 6.9 / (z * w));
    const pts = [];
    for (let i = 0; i <= 36; i++) pts.push(i === 36 ? 1 : +at((T * i) / 36).toFixed(4));
    return { easing: `linear(${pts.join(', ')})`, duration: Math.round(T * 1000) };
  }
  const SPRING = spring(300, 25);

  const center = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  function make(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function init(root) {
    const list = root.querySelector('.pl__list');
    const liveEl = root.querySelector('.pl__live');
    const summary = root.querySelector('.pl__summary');
    const band = make('div', 'pl__band');
    const bandLabel = make('div', 'pl__band-label');
    band.setAttribute('aria-hidden', 'true');
    bandLabel.setAttribute('aria-hidden', 'true');
    list.before(band);
    list.after(bandLabel);
    root.style.setProperty('--pl-spring', SPRING.easing);
    root.style.setProperty('--pl-spring-ms', `${SPRING.duration}ms`);

    const notes = new Map();
    list.querySelectorAll('.pl-note').forEach((n, i) => {
      if (!n.dataset.id) n.dataset.id = `note-${i + 1}`;
      n.setAttribute('role', 'treeitem');
      n.tabIndex = -1;
      notes.set(n.dataset.id, n);
    });
    list.setAttribute('role', 'tree');
    list.setAttribute('aria-multiselectable', 'true');
    list.replaceChildren();

    let entries = [...notes.keys()].map((id) => ({ kind: 'note', id }));
    const rowLis = new Map();
    const piles = new Map();
    const selected = new Set();
    let seq = 0;
    let focusId = entries[0]?.id;

    const textOf = (id) => notes.get(id).querySelector('.pl-note__text')?.textContent.trim() ?? '';
    const idsOf = (e) => (e.kind === 'note' ? [e.id] : e.items);
    const entryById = (id) => entries.find((e) => e.id === id);
    const pileOfNote = (id) => entries.find((e) => e.kind === 'pile' && e.items.includes(id));
    const liOf = (e) => (e.kind === 'note' ? rowLis.get(e.id) : piles.get(e.id).li);
    const newPile = (items) => ({ kind: 'pile', id: `pile-${++seq}`, items, open: false });
    const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    function announce(msg) {
      if (!liveEl) return;
      liveEl.textContent = '';
      setTimeout(() => { liveEl.textContent = msg; }, 30);
    }

    function rowLi(id) {
      let li = rowLis.get(id);
      if (!li) {
        li = make('li', 'pl-entry pl-row');
        li.setAttribute('role', 'none');
        li.dataset.key = id;
        rowLis.set(id, li);
      }
      if (li.firstElementChild !== notes.get(id)) li.replaceChildren(notes.get(id));
      return li;
    }
    function pileParts(p) {
      let P = piles.get(p.id);
      if (P) return P;
      const li = make('li', 'pl-entry pl-pile');
      li.setAttribute('role', 'treeitem');
      li.dataset.key = p.id;
      li.tabIndex = -1;
      const head = make('div', 'pl-pile__head');
      const title = make('span', 'pl-pile__title');
      const stackBtn = make('button', null, 'Stack');
      const unpileBtn = make('button', null, 'Unpile');
      for (const [b, act] of [[stackBtn, 'stack'], [unpileBtn, 'unpile']]) {
        b.type = 'button';
        b.tabIndex = -1;
        b.dataset.act = act;
      }
      head.append(title, stackBtn, unpileBtn);
      const stack = make('div', 'pl-pile__stack');
      stack.setAttribute('role', 'group');
      const count = make('span', 'pl-pile__count');
      count.setAttribute('aria-hidden', 'true');
      li.append(head, stack, count);
      P = { li, title, stack, count };
      piles.set(p.id, P);
      return P;
    }

    function render() {
      for (const k of [...selected]) if (!entryById(k)) selected.delete(k);
      const want = [];
      const alive = new Set();
      for (const e of entries) {
        if (e.kind === 'note') {
          want.push(rowLi(e.id));
          const n = notes.get(e.id);
          n.removeAttribute('data-depth');
          n.setAttribute('aria-level', '1');
          n.setAttribute('aria-selected', String(selected.has(e.id)));
          continue;
        }
        alive.add(e.id);
        const P = pileParts(e);
        want.push(P.li);
        e.items.forEach((id, i) => {
          const n = notes.get(id);
          if (P.stack.children[i] !== n) P.stack.insertBefore(n, P.stack.children[i] || null);
          n.dataset.depth = String(Math.min(i, 3));
          n.setAttribute('aria-level', '2');
          n.removeAttribute('aria-selected');
        });
        P.li.classList.toggle('is-open', e.open);
        P.li.setAttribute('aria-expanded', String(e.open));
        P.li.setAttribute('aria-selected', String(selected.has(e.id)));
        P.li.setAttribute('aria-level', '1');
        if (e.open) P.stack.removeAttribute('aria-hidden');
        else P.stack.setAttribute('aria-hidden', 'true');
        P.count.textContent = String(e.items.length);
        P.title.textContent = plural(e.items.length, 'note');
        P.li.setAttribute('aria-label', e.open
          ? `Pile, ${plural(e.items.length, 'note')}`
          : `Pile of ${plural(e.items.length, 'note')}, top: ${textOf(e.items[0])}`);
      }
      want.forEach((li, i) => { if (list.children[i] !== li) list.insertBefore(li, list.children[i] || null); });
      while (list.children.length > want.length) list.lastElementChild.remove();
      for (const id of [...piles.keys()]) if (!alive.has(id)) piles.delete(id);
      for (const [id, li] of [...rowLis]) if (!li.isConnected) rowLis.delete(id);
      updateTabStops();
      if (summary) {
        const n = entries.filter((e) => e.kind === 'pile').length;
        summary.textContent = `${plural(notes.size, 'note')} · ${plural(n, 'pile')}`;
      }
    }

    // roving tabindex over what is visible: rows, piles, and the notes of open piles
    function focusables() {
      const out = [];
      for (const e of entries) {
        if (e.kind === 'note') { out.push(notes.get(e.id)); continue; }
        out.push(piles.get(e.id).li);
        if (e.open) e.items.forEach((id) => out.push(notes.get(id)));
      }
      return out;
    }
    const keyOf = (el) => el.dataset.id || el.dataset.key;
    function updateTabStops() {
      const all = focusables();
      let cur = all.find((x) => keyOf(x) === focusId);
      if (!cur) {
        const p = pileOfNote(focusId);
        cur = p ? piles.get(p.id).li : all[0];
      }
      notes.forEach((n) => { n.tabIndex = -1; });
      piles.forEach((P) => { P.li.tabIndex = -1; });
      if (cur) {
        cur.tabIndex = 0;
        focusId = keyOf(cur);
      }
      return cur;
    }
    function focusCurrent() {
      const cur = updateTabStops();
      if (cur && document.activeElement !== cur) cur.focus({ preventScroll: true });
    }

    // FLIP every note (and pile badge) from where it was painted to where it now sits.
    function flipEls() {
      return [...notes.values(), ...[...piles.values()].map((P) => P.count)];
    }
    function flip(mutate, { from = null, land = null } = {}) {
      const calm = reduced.matches;
      const first = new Map();
      if (!calm) for (const el of flipEls()) first.set(el, from?.get(el) ?? center(el));
      const hadFocus = root.contains(document.activeElement);
      mutate();
      render();
      if (hadFocus) focusCurrent();
      if (calm) return;
      const els = flipEls();
      for (const el of els) for (const a of el.getAnimations()) if (a.id === 'pl-flip') a.cancel();
      if (land) for (const [el, t] of land) { el.style.transition = 'none'; el.style.transform = t; }
      const moves = els.map((el) => {
        const f = first.get(el);
        if (!f) return [el, null];
        const l = center(el);
        return [el, { x: f.x - l.x, y: f.y - l.y }];
      });
      if (land) for (const [el] of land) { el.style.transition = ''; el.style.transform = ''; }
      for (const [el, d] of moves) {
        if (!d) {
          el.animate({ scale: [0.4, 1], opacity: [0, 1] }, { duration: SPRING.duration, easing: SPRING.easing, id: 'pl-flip' });
        } else if (Math.abs(d.x) + Math.abs(d.y) > 0.5) {
          el.animate({ translate: [`${d.x}px ${d.y}px`, '0px 0px'] }, { duration: SPRING.duration, easing: SPRING.easing, id: 'pl-flip' });
        }
      }
    }

    // model operations
    function mergeInto(target, dragged) {
      const ids = idsOf(dragged);
      entries = entries.filter((e) => e !== dragged);
      const i = entries.indexOf(target);
      if (target.kind === 'pile') {
        target.items = [...ids, ...target.items];
        return target;
      }
      entries[i] = newPile([...ids, target.id]);
      return entries[i];
    }
    function pileEntries(chosen) {
      chosen = entries.filter((e) => chosen.includes(e));
      if (chosen.length < 2) return null;
      const at = entries.indexOf(chosen[0]);
      const p = newPile(chosen.flatMap(idsOf));
      entries = entries.filter((e) => !chosen.includes(e));
      entries.splice(at, 0, p);
      return p;
    }
    function unpile(p) {
      entries.splice(entries.indexOf(p), 1, ...p.items.map((id) => ({ kind: 'note', id })));
    }
    function pullOut(id) {
      const p = pileOfNote(id);
      p.items = p.items.filter((x) => x !== id);
      const i = entries.indexOf(p);
      const row = { kind: 'note', id };
      entries.splice(i + 1, 0, row);
      if (p.items.length === 1) entries.splice(i, 1, { kind: 'note', id: p.items[0] });
      return row;
    }

    // hit test by layout (li boxes do not carry the FLIP offsets)
    function hitTest(y, dragged) {
      const slot = liOf(dragged).getBoundingClientRect();
      if (y >= slot.top - 3 && y <= slot.bottom + 3) return null;
      for (const e of entries) {
        if (e === dragged) continue;
        const r = liOf(e).getBoundingClientRect();
        if (y < r.top) return { type: 'before', entry: e };
        if (y <= r.bottom) {
          const edge = Math.min(r.height * 0.26, 16);
          if (y < r.top + edge) return { type: 'before', entry: e };
          if (y > r.bottom - edge) return { type: 'after', entry: e };
          return { type: 'into', entry: e };
        }
      }
      return { type: 'end' };
    }
    function entryNearY(y) {
      let best = null;
      let bestD = Infinity;
      for (const e of entries) {
        const li = liOf(e);
        const top = li.getBoundingClientRect().top - (parseFloat(li.style.translate?.split(' ')[1]) || 0);
        const d = y < top ? top - y : Math.max(0, y - (top + li.offsetHeight));
        if (d < bestD) { bestD = d; best = e; }
      }
      return best;
    }
    function rangeOf(a, b) {
      const i = entries.indexOf(a);
      const j = entries.indexOf(b);
      if (i < 0 || j < 0) return [];
      return entries.slice(Math.min(i, j), Math.max(i, j) + 1);
    }

    // drag one row or pile
    let press = null;
    let drag = null;
    let sweep = null;
    let pinch = null;
    const touches = new Map();

    function sourceAt(target) {
      const note = target.closest('.pl-note');
      const pileLi = target.closest('.pl-pile');
      if (pileLi && !pileLi.classList.contains('is-open')) return { key: pileLi.dataset.key };
      if (note && pileLi) return { key: note.dataset.id, inner: pileLi.dataset.key };
      if (note) return { key: note.dataset.id };
      if (pileLi) return { key: pileLi.dataset.key, head: true };
      return null;
    }

    function startDrag(p, x, y) {
      const srcEl = p.src.inner || !entryById(p.src.key) || entryById(p.src.key).kind === 'note'
        ? notes.get(p.src.key)
        : piles.get(p.src.key).li;
      const r = srcEl.getBoundingClientRect();
      const ghost = srcEl.cloneNode(true);
      let entry = entryById(p.src.key);
      if (p.src.inner) flip(() => { entry = pullOut(p.src.key); });
      if (!entry) return;
      ghost.classList.add('pl-ghost');
      ghost.classList.remove('is-target', 'is-flying');
      ghost.removeAttribute('data-depth');
      for (const n of [ghost, ...ghost.querySelectorAll('*')]) {
        n.removeAttribute('tabindex');
        n.removeAttribute('role');
        n.removeAttribute('aria-selected');
      }
      ghost.setAttribute('aria-hidden', 'true');
      ghost.inert = true;
      ghost.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;`;
      root.append(ghost);
      const li = liOf(entry);
      li.classList.add('is-lifted');
      drag = { pointer: p.id, entry, li, ghost, x0: p.x, y0: p.y, target: null };
      root.classList.add('is-dragging');
      moveDrag(x, y);
    }
    function setTarget(e) {
      if (drag.target === e) return;
      if (drag.target) liOf(drag.target)?.classList.remove('is-target');
      drag.target = e;
      if (e) liOf(e).classList.add('is-target');
      drag.ghost.classList.toggle('is-over', !!e);
    }
    function moveDrag(x, y) {
      const d = drag;
      d.ghost.style.translate = `${x - d.x0}px ${y - d.y0}px`;
      const hit = hitTest(y, d.entry);
      if (!hit || hit.type === 'into') { setTarget(hit ? hit.entry : null); return; }
      setTarget(null);
      const others = entries.filter((e) => e !== d.entry);
      const at = hit.type === 'end' ? others.length : others.indexOf(hit.entry) + (hit.type === 'after' ? 1 : 0);
      if (entries.indexOf(d.entry) === at) return;
      flip(() => { others.splice(at, 0, d.entry); entries = others; });
    }
    function endDrag(cancel) {
      const d = drag;
      drag = null;
      root.classList.remove('is-dragging');
      const from = new Map();
      const ghostNotes = d.ghost.classList.contains('pl-note') ? [d.ghost] : [...d.ghost.querySelectorAll('.pl-note')];
      for (const g of ghostNotes) from.set(notes.get(g.dataset.id), center(g));
      const gCount = d.ghost.querySelector('.pl-pile__count');
      if (gCount && d.entry.kind === 'pile') from.set(piles.get(d.entry.id).count, center(gCount));
      const tilt = d.entry.kind === 'note' ? getComputedStyle(d.ghost).transform : 'none';
      const target = cancel ? null : d.target;
      if (d.target) liOf(d.target)?.classList.remove('is-target');
      const landing = idsOf(d.entry).map((id) => notes.get(id));
      landing.forEach((n) => n.classList.add('is-flying'));
      setTimeout(() => landing.forEach((n) => n.classList.remove('is-flying')), SPRING.duration);
      let made = null;
      flip(() => {
        d.li.classList.remove('is-lifted');
        d.ghost.remove();
        if (target) made = mergeInto(target, d.entry);
      }, { from, land: tilt !== 'none' ? [[notes.get(d.entry.id), tilt]] : null });
      if (made) {
        focusId = made.id;
        updateTabStops();
        announce(`Piled. ${plural(made.items.length, 'note')} in this pile.`);
      }
    }

    // squeeze a range toward its middle (sweep and pinch preview)
    function squeeze(range, f) {
      const set = new Set(range);
      let c = 0;
      if (range.length > 1) {
        const a = liOf(range[0]);
        const b = liOf(range[range.length - 1]);
        c = (a.offsetTop + b.offsetTop + b.offsetHeight) / 2;
      }
      let top = Infinity;
      let bottom = -Infinity;
      for (const e of entries) {
        const li = liOf(e);
        if (!set.has(e) || range.length < 2) { li.style.translate = ''; continue; }
        const mid = li.offsetTop + li.offsetHeight / 2;
        const shift = (c - mid) * f;
        li.style.translate = `0 ${shift.toFixed(1)}px`;
        top = Math.min(top, li.offsetTop + shift);
        bottom = Math.max(bottom, li.offsetTop + li.offsetHeight + shift);
      }
      if (range.length > 1) {
        const y0 = list.offsetTop + top - 6;
        band.style.top = `${y0}px`;
        band.style.height = `${bottom - top + 12}px`;
        bandLabel.style.top = `${y0 - 11}px`;
      }
    }
    function clearSqueeze() {
      for (const e of entries) {
        const li = liOf(e);
        li.style.transition = 'none';
        li.style.translate = '';
      }
    }
    function restoreSqueezeTransition() {
      for (const e of entries) liOf(e).style.transition = '';
    }
    function commitRange(range) {
      let p = null;
      flip(() => { clearSqueeze(); p = pileEntries(range); });
      restoreSqueezeTransition();
      if (!p) return;
      focusId = p.id;
      updateTabStops();
      announce(`Piled ${plural(p.items.length, 'note')}.`);
    }

    function startSweep(p, y) {
      const e0 = entryById(p.src.inner || p.src.key) || pileOfNote(p.src.key);
      if (!e0) return;
      sweep = { pointer: p.id, from: e0, to: e0 };
      root.classList.add('is-sweeping');
      moveSweep(y);
    }
    function moveSweep(y) {
      const e = entryNearY(y);
      if (e) sweep.to = e;
      const range = rangeOf(sweep.from, sweep.to);
      root.classList.toggle('is-sweeping', range.length > 1);
      squeeze(range, 0.18);
      bandLabel.textContent = `${range.reduce((s, e2) => s + idsOf(e2).length, 0)} notes → 1 pile`;
    }
    function endSweep() {
      const range = rangeOf(sweep.from, sweep.to);
      sweep = null;
      root.classList.remove('is-sweeping');
      if (range.length < 2) { squeeze([], 0); return; }
      commitRange(range);
    }

    function startPinch() {
      const [a, b] = [...touches.keys()];
      const ya = touches.get(a).y;
      const yb = touches.get(b).y;
      pinch = { a, b, d0: Math.max(48, Math.abs(ya - yb)), from: entryNearY(ya), to: entryNearY(yb), s: 0 };
      press = null;
      root.classList.add('is-pinching');
    }
    function movePinch() {
      const pa = touches.get(pinch.a);
      const pb = touches.get(pinch.b);
      if (!pa || !pb) return;
      pinch.s = Math.min(1, Math.max(0, 1 - Math.abs(pa.y - pb.y) / pinch.d0));
      const range = rangeOf(pinch.from, pinch.to);
      if (range.length < 2) return;
      root.classList.add('is-sweeping');
      squeeze(range, pinch.s * 0.85);
      const n = range.reduce((s, e) => s + idsOf(e).length, 0);
      bandLabel.textContent = pinch.s >= PINCH_COMMIT ? 'Release to pile' : `${n} notes → 1 pile`;
    }
    function endPinch(cancel) {
      const range = rangeOf(pinch.from, pinch.to);
      const ok = !cancel && pinch.s >= PINCH_COMMIT && range.length > 1;
      pinch = null;
      root.classList.remove('is-sweeping', 'is-pinching');
      if (ok) commitRange(range);
      else squeeze([], 0);
    }

    function tap(p) {
      const e = entryById(p.src.key);
      focusId = p.src.key;
      if (p.sweep) {
        const top = e || pileOfNote(p.src.key);
        if (top) {
          if (selected.has(top.id)) selected.delete(top.id);
          else selected.add(top.id);
          focusId = top.id;
        }
        render();
        focusCurrent();
        return;
      }
      if (e && e.kind === 'pile') {
        flip(() => { e.open = !e.open; });
        announce(e.open ? `Pile opened, ${plural(e.items.length, 'note')}.` : 'Pile stacked.');
      }
      focusCurrent();
    }

    list.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target.closest('button')) return;
      if (e.pointerType === 'touch') {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        try { list.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
        if (touches.size === 2 && !drag && !sweep) { startPinch(); return; }
        if (touches.size > 2) return;
      }
      const src = sourceAt(e.target);
      if (!src) return;
      press = {
        id: e.pointerId, x: e.clientX, y: e.clientY, src,
        sweep: e.pointerType === 'mouse' && (e.ctrlKey || e.metaKey)
      };
      try { list.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    });
    list.addEventListener('pointermove', (e) => {
      if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch) { movePinch(); return; }
      if (drag && e.pointerId === drag.pointer) { moveDrag(e.clientX, e.clientY); return; }
      if (sweep && e.pointerId === sweep.pointer) { moveSweep(e.clientY); return; }
      if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > DRAG_START) {
        const p = press;
        press = null;
        if (p.sweep) startSweep(p, e.clientY);
        else startDrag(p, e.clientX, e.clientY);
      }
    });
    const up = (e) => {
      touches.delete(e.pointerId);
      if (pinch) { endPinch(e.type === 'pointercancel'); return; }
      if (drag && e.pointerId === drag.pointer) { endDrag(e.type === 'pointercancel'); return; }
      if (sweep && e.pointerId === sweep.pointer) { endSweep(); return; }
      if (press && e.pointerId === press.id && e.type === 'pointerup') tap(press);
      press = null;
    };
    list.addEventListener('pointerup', up);
    list.addEventListener('pointercancel', up);
    list.addEventListener('lostpointercapture', (e) => {
      if (drag && e.pointerId === drag.pointer) endDrag(false);
    });

    list.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const p = entryById(b.closest('.pl-pile').dataset.key);
      if (!p) return;
      focusId = p.id;
      if (b.dataset.act === 'stack') {
        flip(() => { p.open = false; });
        announce('Pile stacked.');
      } else {
        focusId = p.items[0];
        flip(() => unpile(p));
        announce(`Unpiled ${plural(p.items.length, 'note')}.`);
      }
      focusCurrent();
    });

    list.addEventListener('focusin', (e) => {
      const el = e.target.closest('.pl-note, .pl-pile');
      if (!el || e.target.closest('button')) return;
      focusId = keyOf(el);
      updateTabStops();
    });

    list.addEventListener('keydown', (e) => {
      const cur = document.activeElement;
      const all = focusables();
      const i = all.indexOf(cur);
      if (i < 0) return;
      const key = keyOf(cur);
      const inner = cur.classList.contains('pl-note') ? pileOfNote(key) : null;
      const top = inner || entryById(key);
      const pile = top && top.kind === 'pile' && !inner ? top : null;
      const go = (el) => {
        if (!el) return;
        focusId = keyOf(el);
        focusCurrent();
      };
      const k = e.key;
      if (e.altKey && (k === 'ArrowUp' || k === 'ArrowDown')) {
        e.preventDefault();
        const dir = k === 'ArrowUp' ? -1 : 1;
        if (inner) {
          const j = inner.items.indexOf(key);
          const to = j + dir;
          if (to < 0 || to >= inner.items.length) return;
          flip(() => { inner.items.splice(j, 1); inner.items.splice(to, 0, key); });
        } else {
          const j = entries.indexOf(top);
          const to = j + dir;
          if (to < 0 || to >= entries.length) return;
          flip(() => { entries.splice(j, 1); entries.splice(to, 0, top); });
        }
        announce(`Moved ${dir < 0 ? 'up' : 'down'}.`);
        return;
      }
      if (k === 'ArrowDown') { e.preventDefault(); go(all[i + 1]); }
      else if (k === 'ArrowUp') { e.preventDefault(); go(all[i - 1]); }
      else if (k === 'Home') { e.preventDefault(); go(all[0]); }
      else if (k === 'End') { e.preventDefault(); go(all[all.length - 1]); }
      else if (k === 'ArrowRight' && pile) {
        e.preventDefault();
        if (!pile.open) { flip(() => { pile.open = true; }); announce(`Pile opened, ${plural(pile.items.length, 'note')}.`); }
        else go(notes.get(pile.items[0]));
      } else if (k === 'ArrowLeft' && (pile || inner)) {
        e.preventDefault();
        const p = pile || inner;
        if (inner) go(piles.get(inner.id).li);
        else if (p.open) { flip(() => { p.open = false; }); announce('Pile stacked.'); }
      } else if (k === 'Enter' && pile) {
        e.preventDefault();
        flip(() => { pile.open = !pile.open; });
        announce(pile.open ? `Pile opened, ${plural(pile.items.length, 'note')}.` : 'Pile stacked.');
      } else if (k === ' ' && !inner) {
        e.preventDefault();
        if (selected.has(top.id)) selected.delete(top.id);
        else selected.add(top.id);
        render();
        announce(selected.has(top.id) ? `Selected. ${plural(selected.size, 'row')} selected, G piles them.` : 'Deselected.');
      } else if ((k === 'g' || k === 'G') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        let chosen = entries.filter((x) => selected.has(x.id));
        if (chosen.length < 2) {
          const j = entries.indexOf(top);
          const next = entries[j + 1] || entries[j - 1];
          if (!next) return;
          chosen = [top, next];
        }
        let p = null;
        flip(() => { p = pileEntries(chosen); selected.clear(); });
        if (p) {
          focusId = p.id;
          focusCurrent();
          announce(`Piled ${plural(p.items.length, 'note')}. Enter opens the pile.`);
        }
      } else if ((k === 'u' || k === 'U') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (inner) {
          flip(() => pullOut(key));
          announce('Taken out of the pile.');
        } else if (pile) {
          focusId = pile.items[0];
          flip(() => unpile(pile));
          announce(`Unpiled ${plural(pile.items.length, 'note')}.`);
        }
        focusCurrent();
      } else if (k === 'Escape' && selected.size) {
        selected.clear();
        render();
        announce('Selection cleared.');
      }
    });

    render();

    root.pileList = {
      // build piles without motion (demo states)
      pile(ids, open = false) {
        const chosen = ids.map((id) => entryById(id)).filter(Boolean);
        const p = pileEntries(chosen);
        if (p) p.open = open;
        render();
        return p?.id;
      },
      // freeze a drag for a poster: lift a row and hold it over another
      hold(id, overId, along = 0.5) {
        const n = notes.get(id);
        const c = center(n);
        startDrag({ id: -1, x: c.x, y: c.y, src: { key: id } }, c.x, c.y);
        const over = liOf(entryById(overId)).getBoundingClientRect();
        moveDrag(c.x + 18, over.top + over.height * along);
      }
    };
  }

  document.querySelectorAll('.pl').forEach(init);
})();
