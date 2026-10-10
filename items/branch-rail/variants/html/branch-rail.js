/* Conversation Branch Rail.
   Data: a flat list of messages with parent ids (JSON in <script type="application/json" class="br-data">).
   Siblings are branches: a second user message under the same parent is an edit, a second answer a regeneration.
   The rail lays the tree out in lanes, peeks at a branch on hover or focus, switches the visible branch on click
   (element-scoped view transition on the message list), and detaches a branch into a placeholder link. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const NS = 'http://www.w3.org/2000/svg';
  let instances = 0;

  // the opening sentence, or two when the first is a bare "Good."
  const firstPhrase = (s, max = 64) => {
    const parts = s.match(/[^.!?]+[.!?]*(\s+|$)/g) || [s];
    let p = '';
    for (const part of parts) { p += part; if (p.trim().length >= 24) break; }
    p = p.trim();
    if (p.length > max) p = p.slice(0, max - 1).replace(/[\s,;:]+\S*$/, '') + '…';
    return p;
  };
  const px = (v, fallback) => { const n = parseFloat(v); return Number.isFinite(n) ? n : fallback; };

  function init(root) {
    if (root.br) return root.br;
    const n = ++instances;
    const $ = (s) => root.querySelector(s);
    const log = $('.br-log');
    const tree = $('.br-tree');
    const tip = $('.br-tip');
    const where = $('.br-where');
    const count = $('.br-rail__count');
    const detachBtn = $('.br-detach');
    const status = $('[data-br="status"]');
    const data = JSON.parse($('.br-data')?.textContent || '{"messages":[]}');

    /* ---------- the tree ---------- */
    const byId = new Map();
    let rootNode = null;
    for (const m of data.messages) byId.set(m.id, { ...m, children: [], pick: 0 });
    for (const node of byId.values()) {
      if (node.parent && byId.has(node.parent)) byId.get(node.parent).children.push(node);
      else if (!rootNode) rootNode = node;
    }
    let stubs = 0;
    let lanes = 1;
    let depthMax = 0;
    let focusId = null;

    function pathTo(node) { const p = []; for (let x = node; x; x = byId.get(x.parent)) p.unshift(x); return p; }
    function activePath() {
      const p = [];
      for (let x = rootNode; x; ) {
        p.push(x);
        const live = x.children.filter((c) => !c.stub);
        if (!live.length) break;
        x = x.children[x.pick]?.stub ? live[0] : x.children[x.pick] || live[0];
      }
      return p;
    }
    function leafUnder(node) {
      let x = node;
      while (x && !x.stub) {
        const live = x.children.filter((c) => !c.stub);
        if (!live.length) break;
        const next = x.children[x.pick];
        x = next && !next.stub ? next : live[0];
      }
      return x;
    }
    function pickPathTo(node) {
      const p = pathTo(node);
      for (let i = 0; i < p.length - 1; i++) p[i].pick = p[i].children.indexOf(p[i + 1]);
    }
    function layout() {
      let lane = 0;
      depthMax = 0;
      (function walk(x, l, d) {
        x.lane = l; x.depth = d; depthMax = Math.max(depthMax, d);
        x.children.forEach((c, i) => walk(c, i === 0 ? l : ++lane, d + 1));
      })(rootNode, 0, 0);
      lanes = lane + 1;
    }
    const leaves = () => [...byId.values()].filter((x) => !x.stub && !x.children.some((c) => !c.stub)).sort((a, b) => a.lane - b.lane);
    const kindOf = (x) => {
      if (x.stub) return 'moved';
      const sib = byId.get(x.parent)?.children.filter((c) => !c.stub) ?? [x];
      if (sib.length < 2) return x.role === 'user' ? 'message' : 'answer';
      if (sib.indexOf(x) === 0) return 'original';
      return x.role === 'user' ? 'edited' : 'regenerated';
    };

    /* ---------- the rail ---------- */
    let geo = { lane: 16, row: 26, pad: 12 };
    function drawRail() {
      const cs = getComputedStyle(root);
      geo = { lane: px(cs.getPropertyValue('--br-lane'), 16), row: px(cs.getPropertyValue('--br-row'), 26), pad: 12 };
      const X = (x) => geo.pad + x.lane * geo.lane;
      const Y = (x) => geo.pad + x.depth * geo.row;
      const w = geo.pad * 2 + (lanes - 1) * geo.lane;
      const h = geo.pad * 2 + depthMax * geo.row;
      tree.style.width = `${w}px`;
      tree.style.height = `${h}px`;
      const on = new Set(activePath().map((x) => x.id));
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('width', w); svg.setAttribute('height', h); svg.setAttribute('aria-hidden', 'true');
      for (const p of byId.values()) {
        for (const c of p.children) {
          const x1 = X(p), y1 = Y(p), x2 = X(c), y2 = Y(c);
          const path = document.createElementNS(NS, 'path');
          path.setAttribute('d', x1 === x2 ? `M${x1} ${y1}V${y2}` : `M${x1} ${y1}C${x1} ${y1 + geo.row * 0.55} ${x2} ${y1 + geo.row * 0.2} ${x2} ${y2}`);
          path.setAttribute('class', `br-edge${on.has(c.id) ? ' is-on' : ''}${c.stub ? ' is-stub' : ''}`);
          svg.append(path);
        }
      }
      // keep the focused button: replace only the svg, update buttons in place
      tree.querySelector('svg')?.remove();
      tree.prepend(svg);
      const seen = new Set();
      const leaf = activePath().at(-1);
      for (const x of byId.values()) {
        seen.add(x.id);
        let b = tree.querySelector(`[data-id="${CSS.escape(x.id)}"]`);
        if (!b) {
          b = document.createElement(x.stub ? 'a' : 'button');
          b.dataset.id = x.id;
          if (x.stub) {
            b.href = x.href; b.className = 'br-node br-node--stub';
            b.innerHTML = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2.5h5.5V8"/><path d="M9.5 2.5L3 9"/></svg>';
          } else { b.type = 'button'; b.className = 'br-node'; b.dataset.role = x.role; }
          tree.append(b);
        }
        b.style.left = `${X(x)}px`;
        b.style.top = `${Y(x)}px`;
        b.classList.toggle('is-leaf', x === leaf);
        if (on.has(x.id)) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
        b.setAttribute('aria-label', labelOf(x, on.has(x.id)));
        b.tabIndex = x.id === focusId ? 0 : -1;
      }
      for (const b of tree.querySelectorAll('.br-node')) if (!seen.has(b.dataset.id)) b.remove();
      if (!focusId || !byId.has(focusId)) { focusId = leaf.id; tree.querySelector(`[data-id="${CSS.escape(focusId)}"]`).tabIndex = 0; }
      const ls = leaves();
      count.textContent = `${ls.length} branches`;
      where.textContent = `Branch ${ls.indexOf(leaf) + 1} of ${ls.length} · ${activePath().length} messages`;
      const start = branchStart();
      detachBtn.disabled = !start;
      detachBtn.title = start ? `Open “${firstPhrase(start.text, 40)}” as a new chat` : 'The main line stays here';
    }
    function branchSize(x) { return pathTo(leafUnder(x)).length - pathTo(x).length + 1; }
    function labelOf(x, on) {
      if (x.stub) return `Moved to a new chat: ${x.title}`;
      const who = x.role === 'user' ? 'You' : 'Answer';
      const k = kindOf(x);
      const kind = k === 'edited' ? ', edited' : k === 'regenerated' ? ', regenerated' : '';
      return `${who}, message ${x.depth + 1}${kind}: ${firstPhrase(x.text)}${on ? ' (shown)' : ''}`;
    }

    /* ---------- peek ---------- */
    let tipFor = null;
    function peek(x) {
      if (!x) { tip.classList.remove('is-on'); tree.querySelector('.is-peek')?.classList.remove('is-peek'); tipFor = null; return; }
      tipFor = x.id;
      const k = kindOf(x);
      const kindText = { moved: 'Moved to a new chat', edited: 'Edited message', regenerated: 'Regenerated answer', original: x.role === 'user' ? 'Original message' : 'Original answer', message: 'Your message', answer: 'Answer' }[k];
      tip.querySelector('.br-tip__kind').textContent = kindText;
      tip.querySelector('.br-tip__text').textContent = `“${x.stub ? x.title : firstPhrase(x.text)}”`;
      const size = x.stub ? 0 : branchSize(x);
      tip.querySelector('.br-tip__meta').textContent = x.stub ? 'Opens the new chat' : `${size} message${size === 1 ? '' : 's'} from here${k === 'edited' || k === 'regenerated' ? ' in this branch' : ''}`;
      const b = tree.querySelector(`[data-id="${CSS.escape(x.id)}"]`);
      tree.querySelector('.is-peek')?.classList.remove('is-peek');
      b?.classList.add('is-peek');
      const railTop = tree.offsetTop;
      tip.style.top = `${railTop + geo.pad + x.depth * geo.row}px`;
      tip.classList.add('is-on');
    }

    /* ---------- messages ---------- */
    function renderLog() {
      const path = activePath();
      const want = [];
      for (const x of path) {
        want.push(x);
        for (const c of x.children) if (c.stub) want.push(c);
      }
      const keep = new Map([...log.children].map((li) => [li.dataset.id, li]));
      let firstNew = null;
      want.forEach((x, i) => {
        let li = keep.get(x.id);
        keep.delete(x.id);
        if (!li) {
          li = x.stub ? movedItem(x) : msgItem(x);
          firstNew ??= li;
        } else if (!x.stub) {
          li.querySelector('.br-fork')?.remove();
          const f = forkChip(x);
          if (f) li.prepend(f);
        }
        if (log.children[i] !== li) log.insertBefore(li, log.children[i] || null);
      });
      for (const li of keep.values()) li.remove();
      return firstNew;
    }
    function forkChip(x) {
      const sib = byId.get(x.parent)?.children.filter((c) => !c.stub) ?? [];
      if (sib.length < 2) return null;
      const s = document.createElement('span');
      s.className = 'br-fork';
      const k = kindOf(x);
      s.textContent = `${k} · ${sib.indexOf(x) + 1} of ${sib.length}`;
      return s;
    }
    function msgItem(x) {
      const li = document.createElement('li');
      li.className = `br-msg br-msg--${x.role}`;
      li.dataset.id = x.id;
      const p = document.createElement('p');
      p.className = 'br-msg__text';
      p.textContent = x.text;
      const who = document.createElement('span');
      who.className = 'br-sr';
      who.textContent = x.role === 'user' ? 'You: ' : 'Answer: ';
      p.prepend(who);
      const f = forkChip(x);
      if (f) li.append(f);
      li.append(p);
      return li;
    }
    function movedItem(x) {
      const li = document.createElement('li');
      li.className = 'br-moved';
      li.dataset.id = x.id;
      const a = Object.assign(document.createElement('a'), { href: x.href, textContent: `“${x.title}” ↗` });
      const undo = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Undo' });
      undo.addEventListener('click', () => reattach(x));
      li.append('Branch moved to a new chat:', a, undo);
      return li;
    }

    function swap(update, focusAfter) {
      const scoped = typeof log.startViewTransition === 'function';
      const docVT = typeof document.startViewTransition === 'function';
      const name = (on) => {
        for (const li of log.children) {
          li.style.viewTransitionName = on ? `br-${n}-${li.dataset.id}` : '';
          li.style.viewTransitionClass = on ? 'br-msg' : '';
        }
      };
      const run = () => { const first = update(); name(true); if (first) scrollInto(first); return first; };
      if (reduce.matches || (!scoped && !docVT)) {
        const first = update();
        if (first) {
          scrollInto(first);
          for (let li = first; li; li = li.nextElementSibling) li.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: reduce.matches ? 160 : 280, easing: 'ease-out' });
        }
        focusAfter?.();
        return;
      }
      name(true);
      let vt;
      try { vt = scoped ? log.startViewTransition(run) : document.startViewTransition(run); } catch { name(false); update(); focusAfter?.(); return; }
      vt.ready.catch(() => {});
      vt.finished.catch(() => {}).finally(() => { name(false); focusAfter?.(); });
    }
    function scrollInto(li) {
      const top = li.offsetTop - log.offsetTop;
      if (top < log.scrollTop || top > log.scrollTop + log.clientHeight - 40) log.scrollTop = Math.max(0, top - 12);
    }

    function show(x, { announce = true } = {}) {
      if (!x || x.stub) return;
      const target = leafUnder(x);
      pickPathTo(target);
      // the clicked node remembers its own choice below it
      swap(() => { const first = renderLog(); drawRail(); return first; });
      if (announce) {
        const ls = leaves();
        status.textContent = `Showing branch ${ls.indexOf(target) + 1} of ${ls.length}: ${firstPhrase(x.text)}`;
      }
      root.dispatchEvent(new CustomEvent('branch', { bubbles: true, detail: { id: x.id, leaf: target.id } }));
    }

    /* the deepest node on the shown path that is not its parent's first child */
    function branchStart() {
      const p = activePath();
      for (let i = p.length - 1; i > 0; i--) {
        const live = p[i - 1].children.filter((c) => !c.stub);
        if (live.indexOf(p[i]) > 0) return p[i];
      }
      return null;
    }
    const detached = new Map();
    function detach() {
      const x = branchStart();
      if (!x) return;
      const parent = byId.get(x.parent);
      const i = parent.children.indexOf(x);
      const stub = { id: `stub-${n}-${++stubs}`, parent: parent.id, stub: true, role: x.role, title: firstPhrase(x.text, 48), href: `#chat-${stubs + 1}`, children: [], pick: 0, text: '' };
      const removed = [];
      (function drop(y) { removed.push(y); byId.delete(y.id); y.children.forEach(drop); })(x);
      detached.set(stub.id, { node: x, removed, index: i });
      byId.set(stub.id, stub);
      parent.children[i] = stub;
      parent.pick = 0;
      layout();
      focusId = stub.id;
      swap(() => { const first = renderLog(); drawRail(); return first; }, () => log.querySelector(`[data-id="${CSS.escape(stub.id)}"] a`)?.focus({ preventScroll: true }));
      status.textContent = `Branch “${stub.title}” moved to a new chat. Undo is next to the link.`;
      root.dispatchEvent(new CustomEvent('detach', { bubbles: true, detail: { id: x.id, href: stub.href } }));
    }
    function reattach(stub) {
      const saved = detached.get(stub.id);
      if (!saved) return;
      const parent = byId.get(stub.parent);
      const i = parent.children.indexOf(stub);
      byId.delete(stub.id);
      for (const y of saved.removed) byId.set(y.id, y);
      parent.children[i] = saved.node;
      detached.delete(stub.id);
      layout();
      focusId = saved.node.id;
      pickPathTo(leafUnder(saved.node));
      swap(() => { const first = renderLog(); drawRail(); return first; }, () => focusNode(saved.node));
      status.textContent = 'Branch is back in this chat.';
    }

    /* ---------- input ---------- */
    const nodeOf = (el) => byId.get(el?.closest?.('.br-node')?.dataset.id);
    function focusNode(x) {
      if (!x) return;
      focusId = x.id;
      for (const b of tree.querySelectorAll('.br-node')) b.tabIndex = b.dataset.id === x.id ? 0 : -1;
      tree.querySelector(`[data-id="${CSS.escape(x.id)}"]`)?.focus();
    }
    let hoverTimer = 0;
    tree.addEventListener('pointerover', (e) => {
      const x = nodeOf(e.target);
      if (!x || e.pointerType === 'touch') return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => peek(x), tipFor ? 0 : 120);
    });
    tree.addEventListener('pointerout', (e) => {
      if (e.pointerType === 'touch') return;
      if (nodeOf(e.relatedTarget)) return;
      clearTimeout(hoverTimer);
      const f = nodeOf(document.activeElement);
      hoverTimer = setTimeout(() => peek(f && f.id !== tipFor && tree.contains(document.activeElement) ? f : null), 80);
    });
    tree.addEventListener('focusin', (e) => { const x = nodeOf(e.target); if (x) { focusId = x.id; if (e.target.matches(':focus-visible')) peek(x); } });
    tree.addEventListener('focusout', (e) => { if (!tree.contains(e.relatedTarget)) peek(null); });
    let touchTip = 0;
    tree.addEventListener('click', (e) => {
      const x = nodeOf(e.target);
      if (!x || x.stub) return;
      focusId = x.id;
      show(x);
      if (e.pointerType === 'touch' || (e.detail && matchMedia('(hover: none)').matches)) {
        peek(x);
        clearTimeout(touchTip);
        touchTip = setTimeout(() => peek(null), 1600);
      }
    });
    tree.addEventListener('keydown', (e) => {
      const x = nodeOf(e.target);
      if (!x) return;
      const parent = byId.get(x.parent);
      const sib = parent ? parent.children : [x];
      let to = null;
      switch (e.key) {
        case 'ArrowUp': to = parent; break;
        case 'ArrowDown': to = x.children[x.pick] || x.children[0]; break;
        case 'ArrowLeft': to = sib[sib.indexOf(x) - 1]; break;
        case 'ArrowRight': to = sib[sib.indexOf(x) + 1]; break;
        case 'Home': to = rootNode; break;
        case 'End': to = leafUnder(x); break;
        case 'Escape': peek(null); e.preventDefault(); return;
        default: return;
      }
      e.preventDefault();
      if (to) { focusNode(to); peek(to); }
    });
    detachBtn.addEventListener('click', detach);
    const ro = new ResizeObserver(() => { const g = geo; drawRail(); if (tipFor && (g.lane !== geo.lane || g.row !== geo.row)) peek(byId.get(tipFor)); });

    /* ---------- start ---------- */
    layout();
    if (data.active && byId.has(data.active)) pickPathTo(byId.get(data.active));
    renderLog();
    drawRail();
    ro.observe(root);

    const api = {
      show: (id) => show(byId.get(id), { announce: false }),
      peek: (id) => peek(id ? byId.get(id) : null),
      detach,
      tree: () => rootNode
    };
    root.br = api;
    return api;
  }

  const boot = () => document.querySelectorAll('.br').forEach(init);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  window.BranchRail = { init };
})();
