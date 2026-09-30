/* History Scrubber — HistoryBoard.create(root, board, options)
 * A small kanban whose every change is a node on a timeline. Drag the timeline to replay states with cards gliding
 * between them; edit from a past point and the timeline forks; Ctrl+Z / Ctrl+Y step; Alt+drag (or Compare) shows a
 * second state as dashed ghosts linked to where each card is now.
 * board: { title, columns: ['To do', 'Doing', 'Done'], cards: [{ id, text }], start: [[ids], [ids], [ids]],
 *          history: [{ card, col, index, from? }] }   // from: node number to branch from (0 = start) */
(function (global) {
  'use strict';

  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var ICON = {
    undo: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 3.5L2.8 6.2l2.7 2.7M3 6.2h6.2a3.6 3.6 0 010 7.2H7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    redo: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 3.5l2.7 2.7-2.7 2.7M13 6.2H6.8a3.6 3.6 0 000 7.2H9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  var NS = 'http://www.w3.org/2000/svg';

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function svg(tag, attrs) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function create(root, board, options) {
    var o = Object.assign({ onChange: null, hint: true }, options || {});
    var names = board.columns || ['To do', 'Doing', 'Done'];
    var byId = {};
    board.cards.forEach(function (c) { byId[c.id] = c; });

    // ---------- the history tree ----------
    var nodes = [];
    function makeNode(parent, state, label, cardId) {
      var n = { i: nodes.length, parent: parent, children: [], active: null, state: state, label: label, card: cardId || null,
        depth: parent ? parent.depth + 1 : 0, lane: 0 };
      if (parent) {
        n.lane = parent.children.length ? maxLane() + 1 : parent.lane;
        parent.children.push(n);
        parent.active = n;
      }
      nodes.push(n);
      return n;
    }
    function maxLane() { return nodes.reduce(function (m, n) { return Math.max(m, n.lane); }, 0); }
    function copy(state) { return state.map(function (c) { return c.slice(); }); }
    function where(state, id) {
      for (var c = 0; c < state.length; c++) { var i = state[c].indexOf(id); if (i >= 0) return { c: c, i: i }; }
      return null;
    }
    function apply(state, id, col, index) {
      var s = copy(state), at = where(s, id);
      s[at.c].splice(at.i, 1);
      s[col].splice(clamp(index, 0, s[col].length), 0, id);
      return s;
    }
    function labelFor(before, id, col) {
      var at = where(before, id);
      return (at.c === col ? 'Reordered “' : 'Moved “') + byId[id].text + (at.c === col ? '” in ' : '” to ') + names[col];
    }
    var rootNode = makeNode(null, copy(board.start), 'Sprint planned');
    (board.history || []).forEach(function (op) {
      var parent = op.from != null ? nodes[op.from] : nodes[nodes.length - 1];
      makeNode(parent, apply(parent.state, op.card, op.col, op.index), labelFor(parent.state, op.card, op.col), op.card);
    });
    // the latest node is the one you are on
    (function focusLatest() {
      var n = nodes[nodes.length - 1];
      while (n.parent) { n.parent.active = n; n = n.parent; }
    })();

    function path() {
      var p = [rootNode], n = rootNode;
      while (n.active) { n = n.active; p.push(n); }
      return p;
    }

    var P = path();
    var head = P.length - 1;       // fractional position along the active path
    var anim = null;               // { from: {id: {x, y}}, t } — cards gliding from where they were dropped
    var cmp = null;                // compare anchor node
    var hover = null;              // node under the pointer on the timeline

    // ---------- DOM ----------
    root.classList.add('hs');
    root.textContent = '';
    var headRow = node('div', 'hs-head');
    var title = node('span', 'hs-title', board.title || 'Board');
    var mode = node('span', 'hs-mode');
    headRow.appendChild(title);
    headRow.appendChild(mode);
    root.appendChild(headRow);

    var boardEl = node('div', 'hs-board');
    boardEl.setAttribute('role', 'group');
    boardEl.setAttribute('aria-label', (board.title || 'Board') + ', drag cards or use Shift and the arrow keys');
    root.appendChild(boardEl);
    var cols = names.map(function (name) {
      var col = node('div', 'hs-col');
      var h = node('div', 'hs-colhead');
      var count = node('span');
      h.appendChild(node('span', null, name));
      h.appendChild(count);
      col.appendChild(h);
      boardEl.appendChild(col);
      return { el: col, count: count };
    });
    // under the cards: compare links, then the dashed ghosts of the other state
    var links = svg('svg', { class: 'hs-links', 'aria-hidden': 'true' });
    boardEl.appendChild(links);
    var ghostBox = node('div');
    boardEl.appendChild(ghostBox);
    var cards = board.cards.map(function (c) {
      var el = node('div', 'hs-card');
      el.appendChild(node('span', null, c.text));
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-roledescription', 'card');
      el.dataset.id = c.id;
      boardEl.appendChild(el);
      return { id: c.id, el: el, x: 0, y: 0 };
    });

    var time = node('div', 'hs-time');
    var bar = node('div', 'hs-bar');
    var undoBtn = node('button', 'hs-ibtn');
    var redoBtn = node('button', 'hs-ibtn');
    undoBtn.type = redoBtn.type = 'button';
    undoBtn.innerHTML = ICON.undo;
    redoBtn.innerHTML = ICON.redo;
    undoBtn.setAttribute('aria-label', 'Undo');
    redoBtn.setAttribute('aria-label', 'Redo');
    undoBtn.title = 'Undo (Ctrl+Z)';
    redoBtn.title = 'Redo (Ctrl+Y)';
    var read = node('span', 'hs-read');
    var cmpBtn = node('button', 'hs-chip', 'Compare');
    cmpBtn.type = 'button';
    cmpBtn.setAttribute('aria-pressed', 'false');
    cmpBtn.title = 'Compare two points (Alt+drag, or C)';
    bar.appendChild(undoBtn);
    bar.appendChild(redoBtn);
    bar.appendChild(read);
    bar.appendChild(cmpBtn);
    var track = node('div', 'hs-track');
    track.tabIndex = 0;
    track.setAttribute('role', 'slider');
    track.setAttribute('aria-label', 'History');
    track.setAttribute('aria-valuemin', '0');
    var trackSvg = svg('svg', {});
    track.appendChild(trackSvg);
    time.appendChild(bar);
    time.appendChild(track);
    if (o.hint) {
      var hint = node('p', 'hs-hint');
      hint.innerHTML = '<span class="hs-hint-key">Drag the line to replay · <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> · <kbd>Alt</kbd>+drag to compare · change a past state to branch</span>' +
        '<span class="hs-hint-touch">Drag the line to replay · Compare pins this step · move a card in the past to branch</span>';
      time.appendChild(hint);
    }
    root.appendChild(time);
    var live = node('div', 'hs-sr');
    live.setAttribute('aria-live', 'polite');
    root.appendChild(live);

    // ---------- board geometry ----------
    var G = {};
    function measure() {
      var W = boardEl.clientWidth || 560;
      var narrow = W < 480;
      G.W = W;
      G.gap = narrow ? 6 : 10;
      G.pad = narrow ? 5 : 8;
      G.head = 34;
      G.cardH = narrow ? 52 : 48;
      G.row = G.cardH + 6;
      G.colW = (W - G.gap * (names.length - 1)) / names.length;
      G.cardW = G.colW - G.pad * 2;
      var longest = nodes.reduce(function (m, n) { return Math.max(m, Math.max.apply(null, n.state.map(function (c) { return c.length; }))); }, 0);
      G.rows = clamp(longest + 1, 4, board.cards.length);
      boardEl.style.height = G.head + G.rows * G.row + G.pad - 6 + 'px';
      cols.forEach(function (c, i) { c.el.style.left = i * (G.colW + G.gap) + 'px'; c.el.style.width = G.colW + 'px'; });
      cards.forEach(function (c) { c.el.style.width = G.cardW + 'px'; c.el.style.height = G.cardH + 'px'; });
    }
    function slot(c, i) { return { x: c * (G.colW + G.gap) + G.pad, y: G.head + i * G.row }; }
    function layout(state) {
      var pos = {};
      state.forEach(function (col, c) { col.forEach(function (id, i) { pos[id] = slot(c, i); }); });
      return pos;
    }

    // ---------- render ----------
    function stateAt() {
      var k = Math.floor(head + 1e-6), f = head - k;
      if (k >= P.length - 1) { k = P.length - 1; f = 0; }
      return { k: k, f: f, a: P[k], b: P[Math.min(k + 1, P.length - 1)] };
    }
    function render() {
      var s = stateAt();
      var A = layout(s.a.state), B = layout(s.b.state), e = smooth(s.f);
      var ae = anim ? easeOut(anim.t) : 1;
      cards.forEach(function (c) {
        if (c.dragging) return;
        var a = A[c.id], b = B[c.id];
        var x = a.x + (b.x - a.x) * e, y = a.y + (b.y - a.y) * e;
        if (anim && anim.from[c.id]) { x = anim.from[c.id].x + (x - anim.from[c.id].x) * ae; y = anim.from[c.id].y + (y - anim.from[c.id].y) * ae; }
        c.x = x; c.y = y;
        c.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
        var moving = (s.f > 0.001 && s.f < 0.999 && (a.x !== b.x || a.y !== b.y)) || (anim && anim.t < 1 && anim.from[c.id] && (Math.abs(anim.from[c.id].x - x) > 2 || Math.abs(anim.from[c.id].y - y) > 2));
        if (moving) c.el.dataset.moving = ''; else delete c.el.dataset.moving;
      });
      var shown = s.f < 0.5 ? s.a.state : s.b.state;
      cols.forEach(function (col, i) { col.count.textContent = shown[i].length; });
      cards.forEach(function (c) {
        var at = where(shown, c.id);
        c.el.setAttribute('aria-label', byId[c.id].text + ', ' + names[at.c] + ', ' + (at.i + 1) + ' of ' + shown[at.c].length + '. Shift and arrow keys move it');
      });
      if (!anim && s.f === 0) { var n = P[s.k]; cards.forEach(function (c) { if (n.card === c.id && s.k > 0 && !cmp) c.el.dataset.changed = ''; else delete c.el.dataset.changed; }); }
      else cards.forEach(function (c) { delete c.el.dataset.changed; });
      if (Math.abs(head - Math.round(head)) > 1e-3 || anim) boardEl.dataset.locked = ''; else delete boardEl.dataset.locked;
      renderCompare();
      paintTrack();
      paintRead();
    }

    function renderCompare() {
      ghostBox.textContent = '';
      links.textContent = '';
      if (!cmp) { mode.textContent = ''; return; }
      var A = layout(cmp.state);
      var n = 0;
      cards.forEach(function (c) {
        var a = A[c.id];
        if (Math.abs(a.x - c.x) < 1 && Math.abs(a.y - c.y) < 1) return;
        n++;
        var g = node('div', 'hs-ghost');
        g.style.width = G.cardW + 'px';
        g.style.height = G.cardH + 'px';
        g.style.transform = 'translate(' + a.x + 'px,' + a.y + 'px)';
        g.appendChild(node('span', null, byId[c.id].text));
        ghostBox.appendChild(g);
        // a shallow arc from where the card was to where it is, with a chevron at its middle pointing the way
        var x1 = a.x + G.cardW / 2, y1 = a.y + G.cardH / 2, x2 = c.x + G.cardW / 2, y2 = c.y + G.cardH / 2;
        var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
        var bow = Math.min(40, len * 0.18);
        var cx = (x1 + x2) / 2 + (dy / len) * bow, cy = (y1 + y2) / 2 - (dx / len) * bow;
        links.appendChild(svg('path', { d: 'M' + x1 + ' ' + y1 + 'Q' + cx + ' ' + cy + ' ' + x2 + ' ' + y2 }));
        var mx = 0.25 * x1 + 0.5 * cx + 0.25 * x2, my = 0.25 * y1 + 0.5 * cy + 0.25 * y2;
        var ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
        links.appendChild(svg('path', { class: 'hs-arrow', d: 'M-4 -4.5L4.5 0 -4 4.5z', transform: 'translate(' + mx.toFixed(1) + ' ' + my.toFixed(1) + ') rotate(' + ang.toFixed(1) + ')' }));
      });
      mode.textContent = '';
      mode.appendChild(document.createTextNode('A · step ' + cmp.depth + ' vs B · step ' + (Math.round(head)) + ' · '));
      mode.appendChild(node('b', null, n === 0 ? 'no difference' : n + (n === 1 ? ' card differs' : ' cards differ')));
    }

    // ---------- timeline ----------
    var T = {};
    function buildTrack() {
      var W = track.clientWidth || 560;
      var maxDepth = nodes.reduce(function (m, n) { return Math.max(m, n.depth); }, 1);
      var lanes = maxLane() + 1;
      T.padL = 14; T.padR = 14; T.top = 16; T.lane = 16;
      T.step = clamp((W - T.padL - T.padR) / maxDepth, 12, 120);
      T.w = Math.max(W, T.padL + T.padR + maxDepth * T.step);
      T.h = T.top * 2 + (lanes - 1) * T.lane;
      trackSvg.setAttribute('width', T.w);
      trackSvg.setAttribute('height', T.h);
      trackSvg.setAttribute('viewBox', '0 0 ' + T.w + ' ' + T.h);
      trackSvg.textContent = '';
      nodes.forEach(function (n) { n.x = T.padL + n.depth * T.step; n.y = T.top + n.lane * T.lane; });
      var edges = svg('g', {}), dots = svg('g', {});
      T.line = svg('line', { class: 'hs-line', y1: 0, y2: T.h });
      nodes.forEach(function (n) {
        if (n.parent) {
          var p = n.parent, mx = (p.x + n.x) / 2;
          n.edge = svg('path', { class: 'hs-e', d: p.y === n.y ? 'M' + p.x + ' ' + p.y + 'H' + n.x : 'M' + p.x + ' ' + p.y + 'C' + mx + ' ' + p.y + ' ' + mx + ' ' + n.y + ' ' + n.x + ' ' + n.y });
          edges.appendChild(n.edge);
        }
        n.dot = svg('circle', { class: 'hs-n', cx: n.x, cy: n.y, r: 3.5 });
        var hit = svg('circle', { class: 'hs-hit', cx: n.x, cy: n.y, r: 9 });
        hit.dataset.node = n.i;
        var t = svg('title', {});
        t.textContent = n.depth + ' · ' + n.label;
        hit.appendChild(t);
        dots.appendChild(n.dot);
        dots.appendChild(hit);
      });
      T.a = svg('g', { class: 'hs-a' });
      T.a.appendChild(svg('circle', { r: 7 }));
      var at = svg('text', {});
      at.textContent = 'A';
      T.a.appendChild(at);
      T.knob = svg('g', {});
      T.knob.appendChild(svg('circle', { class: 'hs-knob', r: 8 }));
      T.knob.appendChild(svg('circle', { class: 'hs-knob-dot', r: 3 }));
      trackSvg.appendChild(T.line);
      trackSvg.appendChild(edges);
      trackSvg.appendChild(dots);
      trackSvg.appendChild(T.a);
      trackSvg.appendChild(T.knob);
    }
    function paintTrack() {
      var on = new Set(P);
      nodes.forEach(function (n) {
        var inPath = on.has(n), past = inPath && n.depth <= head + 1e-6;
        if (n.edge) {
          if (inPath) n.edge.dataset.on = ''; else delete n.edge.dataset.on;
          if (inPath && head >= n.depth - 0.5) n.edge.dataset.past = ''; else delete n.edge.dataset.past;
        }
        if (inPath) n.dot.dataset.on = ''; else delete n.dot.dataset.on;
        if (past) n.dot.dataset.past = ''; else delete n.dot.dataset.past;
        if (hover === n) n.dot.dataset.hover = ''; else delete n.dot.dataset.hover;
      });
      var s = stateAt(), x0 = s.a.x, y0 = s.a.y, x1 = s.b.x, y1 = s.b.y;
      var x = x0 + (x1 - x0) * s.f, y = y0 + (y1 - y0) * smooth(s.f);
      T.knob.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')');
      T.line.setAttribute('x1', x.toFixed(1));
      T.line.setAttribute('x2', x.toFixed(1));
      if (cmp) { T.a.style.display = ''; T.a.setAttribute('transform', 'translate(' + cmp.x + ' ' + cmp.y + ')'); }
      else T.a.style.display = 'none';
      // keep the knob in view when the history is longer than the track
      if (T.w > track.clientWidth) {
        var l = track.scrollLeft;
        if (x < l + 24) track.scrollLeft = x - 24;
        else if (x > l + track.clientWidth - 24) track.scrollLeft = x - track.clientWidth + 24;
      }
      var tip = P.length - 1;
      track.setAttribute('aria-valuemax', String(tip));
      track.setAttribute('aria-valuenow', String(Math.round(head)));
      var cur = P[Math.round(head)];
      track.setAttribute('aria-valuetext', 'Step ' + cur.depth + ' of ' + tip + ': ' + cur.label + (cur.children.length > 1 ? '. ' + cur.children.length + ' branches here, Up and Down switch' : ''));
      undoBtn.disabled = head < 0.001;
      redoBtn.disabled = head > tip - 0.001;
    }
    function paintRead() {
      read.textContent = '';
      var n = hover || P[Math.round(head)];
      var s = stateAt();
      if (!hover && s.f > 0.001) n = s.b;
      read.appendChild(node('b', null, n.depth + (hover ? '' : ' / ' + (P.length - 1))));
      read.appendChild(document.createTextNode('  ' + n.label + (hover && P.indexOf(hover) < 0 ? ' · click to switch' : '')));
    }

    // ---------- tweens (rAF only while something moves) ----------
    var tweens = new Set(), raf = 0;
    function frame(now) {
      raf = 0;
      tweens.forEach(function (t) {
        var k = clamp((now - t.t0) / t.dur, 0, 1);
        t.step(k);
        if (k >= 1) { tweens.delete(t); if (t.done) t.done(); }
      });
      render();
      if (tweens.size) raf = requestAnimationFrame(frame);
    }
    function tween(dur, step, done) {
      var t = { t0: performance.now(), dur: dur, step: step, done: done };
      if (reduce.matches || dur <= 0) { step(1); if (done) done(); render(); return t; }
      tweens.add(t);
      if (!raf) raf = requestAnimationFrame(frame);
      return t;
    }
    var headTween = null;
    function stopHead() { if (headTween) { tweens.delete(headTween); headTween = null; } }
    function moveHead(to, dur, done) {
      stopHead();
      var from = head;
      if (Math.abs(to - from) < 1e-6) { head = to; render(); if (done) done(); return; }
      headTween = tween(dur == null ? clamp(Math.abs(to - from) * 160, 160, 700) : dur, function (k) { head = from + (to - from) * easeOut(k); }, function () { headTween = null; head = to; if (done) done(); });
    }
    function finishAll() {
      tweens.forEach(function (t) { t.step(1); if (t.done) t.done(); });
      tweens.clear();
      headTween = null;
      render();
    }

    // ---------- actions ----------
    function say(msg) { live.textContent = msg; }
    function changed() { if (o.onChange) o.onChange({ state: copy(P[Math.round(head)].state), step: Math.round(head), nodes: nodes.length }); }
    function undo() { var to = Math.ceil(head - 1e-6) - 1; if (to < 0) return; moveHead(to, 260); say('Undo: ' + P[to + 1].label); }
    function redo() { var to = Math.floor(head + 1e-6) + 1; if (to > P.length - 1) return; moveHead(to, 260); say('Redo: ' + P[to].label); }
    function goTo(n) {
      // back along the current path to where the two branches meet, then forward along the other one
      var cur = P[Math.round(head)];
      var anc = new Set(); for (var a = n; a; a = a.parent) anc.add(a);
      var fork = cur; while (!anc.has(fork)) fork = fork.parent;
      function second() {
        for (var x = n; x.parent; x = x.parent) x.parent.active = x;
        P = path();
        buildTrack();
        moveHead(n.depth, null, function () { say('Step ' + n.depth + ': ' + n.label); changed(); });
      }
      if (fork.depth < head - 1e-6 && P.indexOf(n) < 0) moveHead(fork.depth, null, second);
      else second();
    }
    function switchBranch(d) {
      // at the nearest fork at or before the knob, make the next sibling branch active
      var k = Math.round(head), f = P[k];
      while (f && f.children.length < 2) f = f.parent;
      if (!f) return;
      var i = f.children.indexOf(f.active);
      var nb = f.children[(i + d + f.children.length) % f.children.length];
      f.active = nb;
      P = path();
      buildTrack();
      head = Math.min(head, P.length - 1);
      render();
      say('Branch ' + (f.children.indexOf(nb) + 1) + ' of ' + f.children.length + ': ' + nb.label);
    }
    function commit(id, col, index, fromPos) {
      var k = Math.round(head), base = P[k];
      var at = where(base.state, id);
      var next = apply(base.state, id, col, index);
      var same = where(next, id);
      if (same.c === at.c && same.i === at.i) { settle(fromPos); return; }
      var branching = !!base.children.length;
      var n = makeNode(base, next, labelFor(base.state, id, col), id);
      P = path();
      measure();
      buildTrack();
      head = n.depth;
      settle(fromPos);
      say(n.label + (branching ? '. New branch from step ' + base.depth : ''));
      changed();
    }
    function settle(fromPos) {
      anim = { from: fromPos || {}, t: 0 };
      tween(300, function (k) { anim.t = k; }, function () { anim = null; });
      render();
    }
    function visual() { var m = {}; cards.forEach(function (c) { m[c.id] = { x: c.x, y: c.y }; }); return m; }
    function setCompare(n) {
      cmp = n;
      if (!n) pinned = false;
      cmpBtn.setAttribute('aria-pressed', String(!!n));
      render();
      if (n) say('Comparing with step ' + n.depth + '. Move along the timeline, Escape to stop.');
    }
    var pinned = false; // Compare pressed: scrubs keep comparing until it is pressed again

    // ---------- timeline input ----------
    function headFromX(clientX) {
      var r = track.getBoundingClientRect();
      var x = clientX - r.left + track.scrollLeft;
      return clamp((x - T.padL) / T.step, 0, P.length - 1);
    }
    var scrub = null;
    track.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      finishAll();
      var hitIdx = e.target.dataset && e.target.dataset.node;
      track.setPointerCapture(e.pointerId);
      scrub = { x: e.clientX, hit: hitIdx != null ? nodes[+hitIdx] : null, moved: false, id: e.pointerId };
      if (e.altKey) setCompare(P[Math.round(head)]);   // Alt+drag: compare against where you were
      else if (cmp && !pinned) setCompare(null);
      if (!scrub.hit) { head = headFromX(e.clientX); render(); }
    });
    track.addEventListener('pointermove', function (e) {
      if (!scrub) {
        if (e.pointerType !== 'mouse') return;
        var h = e.target.dataset && e.target.dataset.node != null ? nodes[+e.target.dataset.node] : null;
        if (h !== hover) { hover = h; paintTrack(); paintRead(); }
        return;
      }
      if (Math.abs(e.clientX - scrub.x) > 4) scrub.moved = true;
      if (scrub.hit && !scrub.moved) return;
      head = headFromX(e.clientX);
      render();
    });
    function endScrub() {
      if (!scrub) return;
      var s = scrub;
      scrub = null;
      if (s.hit && !s.moved) { hover = null; goTo(s.hit); return; }
      moveHead(Math.round(head), 200, function () { say('Step ' + Math.round(head) + ': ' + P[Math.round(head)].label); changed(); });
    }
    track.addEventListener('pointerup', endScrub);
    track.addEventListener('pointercancel', endScrub);
    track.addEventListener('pointerleave', function () { if (hover) { hover = null; paintTrack(); paintRead(); } });
    track.addEventListener('keydown', function (e) {
      var k = Math.round(head);
      if (e.key === 'ArrowLeft') { e.preventDefault(); if (k > 0) moveHead(k - 1, 200); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); if (k < P.length - 1) moveHead(k + 1, 200); }
      else if (e.key === 'Home') { e.preventDefault(); moveHead(0); }
      else if (e.key === 'End') { e.preventDefault(); moveHead(P.length - 1); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); switchBranch(e.key === 'ArrowUp' ? -1 : 1); }
    });
    undoBtn.addEventListener('click', undo);
    redoBtn.addEventListener('click', redo);
    function toggleCompare() {
      if (cmp) { setCompare(null); return; }
      setCompare(P[Math.round(head)]); // compare against here; the timeline now moves B
      pinned = true;
    }
    cmpBtn.addEventListener('click', toggleCompare);
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && cmp) { setCompare(null); e.preventDefault(); }
      else if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey && !e.altKey && document.activeElement === track) toggleCompare();
    });
    // Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z while the page has no other editor focused
    document.addEventListener('keydown', function (e) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      var a = document.activeElement;
      if (a && a !== document.body && !root.contains(a)) return;
      if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
      var key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); finishAll(); undo(); }
      else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); finishAll(); redo(); }
    });

    // ---------- board input: drag a card, or Shift+arrows ----------
    boardEl.addEventListener('pointerdown', function (e) {
      var el = e.target.closest('.hs-card');
      if (!el || e.button > 0) return;
      finishAll();
      if (Math.abs(head - Math.round(head)) > 1e-3) { head = Math.round(head); render(); }
      if (cmp) setCompare(null);
      var c = cards.filter(function (x) { return x.el === el; })[0];
      e.preventDefault();
      el.focus({ preventScroll: true });
      el.setPointerCapture(e.pointerId);
      var sx = e.clientX, sy = e.clientY, ox = c.x, oy = c.y, moved = false;
      var base = P[Math.round(head)].state;
      var target = where(base, c.id);
      function move(ev) {
        var dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!moved && Math.hypot(dx, dy) < 4) return;
        if (!moved) { moved = true; c.dragging = true; el.dataset.drag = ''; }
        var x = clamp(ox + dx, -8, G.W - G.cardW + 8), y = clamp(oy + dy, 0, G.head + G.rows * G.row);
        c.x = x; c.y = y;
        el.style.transform = 'translate(' + x + 'px,' + y + 'px)';
        var col = clamp(Math.floor((x + G.cardW / 2) / (G.colW + G.gap)), 0, names.length - 1);
        var rest = base[col].filter(function (id) { return id !== c.id; });
        var idx = clamp(Math.round((y - G.head) / G.row), 0, rest.length);
        target = { c: col, i: idx };
        // the other cards make room
        var preview = layout(apply(base, c.id, col, idx));
        cards.forEach(function (o2) {
          if (o2 === c) return;
          var p = preview[o2.id];
          o2.el.style.transition = reduce.matches ? 'none' : 'transform 200ms cubic-bezier(0.23, 1, 0.32, 1)';
          o2.x = p.x; o2.y = p.y;
          o2.el.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)';
        });
      }
      function up() {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        cards.forEach(function (o2) { o2.el.style.transition = ''; });
        if (!moved) return;
        c.dragging = false;
        delete el.dataset.drag;
        commit(c.id, target.c, target.i, visual());
      }
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
    boardEl.addEventListener('keydown', function (e) {
      var el = e.target.closest('.hs-card');
      if (!el || !e.shiftKey || !/^Arrow/.test(e.key)) return;
      e.preventDefault();
      finishAll();
      if (cmp) setCompare(null);
      head = Math.round(head);
      var id = el.dataset.id, st = P[head].state, at = where(st, id);
      var col = at.c, idx = at.i;
      if (e.key === 'ArrowLeft') { col = Math.max(0, col - 1); idx = Math.min(idx, st[col].length); }
      else if (e.key === 'ArrowRight') { col = Math.min(names.length - 1, col + 1); idx = Math.min(idx, st[col].length); }
      else if (e.key === 'ArrowUp') idx = Math.max(0, idx - 1);
      else if (e.key === 'ArrowDown') idx = idx + 1;
      commit(id, col, idx, visual());
      el.focus({ preventScroll: true });
    });

    var lastW = 0;
    function relayout() {
      var w = root.clientWidth;
      if (w === lastW) return;
      lastW = w;
      measure();
      buildTrack();
      render();
    }
    if (global.ResizeObserver) new ResizeObserver(relayout).observe(root);
    relayout();

    return {
      undo: undo,
      redo: redo,
      scrubTo: function (h) { finishAll(); head = clamp(h, 0, P.length - 1); render(); },
      compare: function (step) { setCompare(P[step]); pinned = true; },
      getState: function () { return copy(P[Math.round(head)].state); }
    };
  }

  global.HistoryBoard = { create: create };
})(window);
