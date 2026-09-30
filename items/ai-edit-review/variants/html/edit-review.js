/* AI Edit Review — EditReview.create(root, input, options)
 * input: { segments: ['plain text', { from, to, why }, …] } or { original, edited } (diffed word by word here).
 * Each hunk is accepted or rejected on its own (buttons, or Y / N on a focused hunk, U to undo).
 * The scrubber under the paragraph runs Original ← Markup → Edited: every pending hunk morphs letter by letter,
 * in reading order, so any point between the two versions can be read and kept. */
(function (global) {
  'use strict';

  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  var ICON = {
    yes: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.4l3 3 6-6.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    no: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    undo: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 3.5L2.8 6.2l2.7 2.7M3 6.2h6.2a3.6 3.6 0 010 7.2H7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // ---------- word diff: longest common subsequence over words, spaces and punctuation ----------
  function tokens(s) { return s.match(/\s+|[\p{L}\p{N}€$£%’'-]+|[^\s\p{L}\p{N}]/gu) || []; }
  function diff(a, b) {
    var A = tokens(a), B = tokens(b), n = A.length, m = B.length, i, j;
    var L = [];
    for (i = 0; i <= n; i++) L.push(new Uint16Array(m + 1));
    for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    var ops = [];
    i = 0; j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { ops.push(['=', A[i]]); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) ops.push(['-', A[i++]]);
      else ops.push(['+', B[j++]]);
    }
    while (i < n) ops.push(['-', A[i++]]);
    while (j < m) ops.push(['+', B[j++]]);

    var segs = [], same = '', h = null, k = 0;
    while (k < ops.length) {
      var op = ops[k];
      if (op[0] !== '=') {
        if (!h) { if (same) segs.push(same); same = ''; h = { from: '', to: '' }; }
        if (op[0] === '-') h.from += op[1]; else h.to += op[1];
        k++;
        continue;
      }
      // a run of unchanged tokens; a short one between two changes (a space, "the", a comma) joins the hunk
      var run = '', e = k;
      while (e < ops.length && ops[e][0] === '=') run += ops[e++][1];
      var words = run.trim() ? run.trim().split(/\s+/).length : 0;
      if (h && e < ops.length && words <= 1 && run.trim().length <= 4) { h.from += run; h.to += run; }
      else { if (h) { segs.push(h); h = null; } same += run; }
      k = e;
    }
    if (h) segs.push(h);
    if (same) segs.push(same);
    return segs;
  }

  // ---------- one small tween loop, idle when nothing moves ----------
  function Tweens() {
    var set = new Set(), raf = 0;
    function frame(now) {
      raf = 0;
      set.forEach(function (tw) {
        var k = clamp01((now - tw.t0) / tw.dur);
        tw.step(tw.ease(k));
        if (k >= 1) { set.delete(tw); if (tw.done) tw.done(); }
      });
      if (set.size) raf = requestAnimationFrame(frame);
    }
    return {
      run: function (dur, step, done, ease) {
        var tw = { t0: performance.now(), dur: dur, step: step, done: done, ease: ease || easeOut };
        if (dur <= 0 || reduce.matches) { step(1); if (done) done(); return tw; }
        set.add(tw);
        if (!raf) raf = requestAnimationFrame(frame);
        return tw;
      },
      stop: function (tw, finish) {
        if (!tw || !set.has(tw)) return;
        set.delete(tw);
        if (finish) { tw.step(1); if (tw.done) tw.done(); }
      }
    };
  }

  function create(root, input, options) {
    var o = Object.assign({ onChange: null }, options || {});
    var segs = Array.isArray(input) ? input : input.segments || diff(input.original, input.edited);
    var tw = Tweens();

    root.classList.add('er');
    root.textContent = '';

    // ---- paragraph
    var text = node('p', 'er-text');
    var hunks = [];
    segs.forEach(function (s) {
      if (typeof s === 'string') { text.appendChild(document.createTextNode(s)); return; }
      var h = { i: hunks.length, from: s.from || '', to: s.to || '', why: s.why || '', state: 'pending', q: 0.5, busy: null };
      h.el = node('span', 'er-h');
      h.el.tabIndex = 0;
      h.el.setAttribute('role', 'group');
      h.el.setAttribute('aria-roledescription', 'suggestion');
      h.el.setAttribute('aria-keyshortcuts', 'Y N U');
      h.el.dataset.i = h.i;
      h.del = node('del', 'er-del');
      h.ins = node('ins', 'er-ins');
      h.el.appendChild(h.del);
      h.el.appendChild(h.ins);
      text.appendChild(h.el);
      hunks.push(h);
    });
    root.appendChild(text);

    // ---- scrubber
    var scrub = node('div', 'er-scrub');
    var read = node('div', 'er-read');
    var readState = node('span');
    var readActs = node('span');
    var keepBtn = node('button', 'er-btn', 'Keep this version');
    var backBtn = node('button', 'er-btn', 'Back to markup');
    keepBtn.type = backBtn.type = 'button';
    keepBtn.style.height = backBtn.style.height = '28px';
    readActs.className = 'er-read-acts';
    readActs.appendChild(backBtn);
    readActs.appendChild(keepBtn);
    read.appendChild(readState);
    read.appendChild(readActs);
    var slider = node('div', 'er-slider');
    slider.tabIndex = 0;
    slider.setAttribute('role', 'slider');
    slider.setAttribute('aria-label', 'Original to edited');
    slider.setAttribute('aria-valuemin', '-100');
    slider.setAttribute('aria-valuemax', '100');
    var rail = node('div', 'er-rail');
    var run = node('div', 'er-run');
    var ticksBox = node('div');
    var knob = node('div', 'er-knob');
    slider.appendChild(rail);
    slider.appendChild(run);
    slider.appendChild(ticksBox);
    slider.appendChild(knob);
    var ends = node('div', 'er-ends');
    ['Original', 'Markup', 'Edited'].forEach(function (t) { ends.appendChild(node('span', null, t)); });
    ends.setAttribute('aria-hidden', 'true');
    scrub.appendChild(read);
    scrub.appendChild(slider);
    scrub.appendChild(ends);
    root.appendChild(scrub);

    // ---- footer
    var foot = node('div', 'er-foot');
    var left = node('span', 'er-left');
    var acts = node('span', 'er-acts');
    var resetBtn = node('button', 'er-btn', 'Reset');
    var noAllBtn = node('button', 'er-btn', 'Reject all');
    var yesAllBtn = node('button', 'er-btn er-btn--main', 'Accept all');
    [resetBtn, noAllBtn, yesAllBtn].forEach(function (b) { b.type = 'button'; });
    foot.appendChild(left);
    acts.appendChild(resetBtn);
    acts.appendChild(noAllBtn);
    acts.appendChild(yesAllBtn);
    foot.appendChild(acts);
    root.appendChild(foot);

    // ---- toolbar and live region
    var tools = node('div', 'er-tools');
    tools.setAttribute('role', 'toolbar');
    tools.setAttribute('aria-label', 'Suggestion');
    root.appendChild(tools);
    var live = node('div', 'er-sr');
    live.setAttribute('aria-live', 'polite');
    root.appendChild(live);

    // ---------- drawing a hunk at morph q: 0 original, 0.5 markup, 1 edited ----------
    function setChars(el, str, shown, caret) {
      var n = Math.max(0, Math.min(str.length, shown));
      var k = Math.floor(n + 1e-6), f = n - k;
      var key = k + '|' + (f > 0.02 ? 1 : 0) + '|' + (caret ? 1 : 0);
      if (el._key !== key) {
        el.textContent = str.slice(0, k);
        el._edge = null;
        if (f > 0.02 && k < str.length) { el._edge = node('span', 'er-edge', str[k]); el.appendChild(el._edge); }
        if (caret) el.appendChild(node('span', 'er-caret'));
        el._key = key;
      }
      if (el._edge) el._edge.style.setProperty('--er-edge', f.toFixed(2));
    }
    function render(h) {
      var q = h.q, nd = h.from.length, ni = h.to.length, delN, insN, strike, ghost, t, caret = null;
      if (q >= 0.5) {
        t = (q - 0.5) * 2;
        var a = nd ? clamp01(t / 0.72) : 1;
        delN = nd * (1 - a);
        insN = ni;
        strike = 1;
        ghost = 1 - smooth(clamp01((t - (nd ? 0.3 : 0)) / (nd ? 0.7 : 1)));
        if (a > 0 && a < 1) caret = 'del';
      } else {
        t = (0.5 - q) * 2;
        var r = ni ? clamp01(t / 0.72) : 1;
        insN = ni * (1 - r);
        delN = nd;
        ghost = 1;
        strike = 1 - smooth(clamp01((t - (ni ? 0.3 : 0)) / (ni ? 0.7 : 1)));
        if (r > 0 && r < 1) caret = 'ins';
      }
      setChars(h.del, h.from, delN, caret === 'del');
      setChars(h.ins, h.to, insN, caret === 'ins');
      h.el.style.setProperty('--er-strike', strike.toFixed(3));
      h.el.style.setProperty('--er-ghost', ghost.toFixed(3));
      // a small gap between the struck and the ghost text; on the deletion, because the insertion's
      // box-decoration-break: clone would repeat a margin at the start of every wrapped line
      h.del.style.marginRight = delN > 0.5 && insN > 0.5 ? '0.25em' : '0';
    }

    // ---------- scrubber ----------
    var v = 0;          // -1 original … 0 markup … 1 edited (pending hunks only)
    var vTween = null;
    var dragging = false;

    function pending() { return hunks.filter(function (h) { return h.state === 'pending' && !h.busy; }); }
    function applyScrub() {
      var P = pending(), N = P.length;
      P.forEach(function (h, i) {
        var t = clamp01(Math.abs(v) * N - i);
        h.q = v >= 0 ? 0.5 + t / 2 : 0.5 - t / 2;
        render(h);
      });
      paintScrub(P);
    }
    function buildTicks() {
      ticksBox.textContent = '';
      var N = pending().length;
      var mid = node('i', 'er-tick');
      mid.dataset.mid = '';
      mid.style.left = '50%';
      ticksBox.appendChild(mid);
      for (var k = 1; k <= N; k++) {
        [-1, 1].forEach(function (side) {
          var t = node('i', 'er-tick');
          t.dataset.k = k;
          t.style.left = (50 + side * (k / N) * 50) + '%';
          ticksBox.appendChild(t);
        });
      }
    }
    function paintScrub(P) {
      var N = P.length;
      var pos = (v + 1) * 50;
      knob.style.left = pos + '%';
      run.style.left = Math.min(50, pos) + '%';
      run.style.width = Math.abs(pos - 50) + '%';
      if (v < 0) run.dataset.back = ''; else delete run.dataset.back;
      var done = Math.round(Math.abs(v) * N * 100) / 100;
      var whole = Math.floor(done + 1e-6);
      var label;
      if (!N) label = 'Nothing left to review';
      else if (Math.abs(v) < 1e-6) label = 'Markup · ' + N + (N === 1 ? ' suggestion' : ' suggestions');
      else if (v > 0) label = whole >= N ? 'Edited · all ' + N + ' applied' : 'Edited · ' + whole + ' of ' + N + ' applied';
      else label = whole >= N ? 'Original · all ' + N + ' undone' : 'Original · ' + whole + ' of ' + N + ' undone';
      readState.innerHTML = '';
      var parts = label.split(' · ');
      readState.appendChild(node('b', null, parts[0]));
      if (parts[1]) readState.appendChild(document.createTextNode(' · ' + parts[1]));
      slider.setAttribute('aria-valuenow', String(Math.round(v * 100)));
      slider.setAttribute('aria-valuetext', label);
      var off = Math.abs(v) > 1e-6;
      readActs.hidden = !(off && !dragging);
      slider.setAttribute('aria-disabled', String(!N));
      if (off) hideTools(true);
    }
    function setV(x) { v = Math.max(-1, Math.min(1, x)); applyScrub(); }
    function animateV(to, dur, done) {
      tw.stop(vTween);
      var from = v;
      vTween = tw.run(dur, function (k) { setV(from + (to - from) * k); }, function () { vTween = null; if (done) done(); });
    }
    function stepOf() { var N = pending().length; return N ? 1 / N : 1; }
    function snap() {
      var s = stepOf();
      var to = Math.round(v / s) * s;
      if (Math.abs(to) < 1e-6) to = 0;
      animateV(to, 200);
    }

    // commit what the scrubber shows: fully applied hunks are accepted, fully reverted ones rejected
    function keep() {
      if (Math.abs(v) < 1e-6) return;
      var n = 0;
      pending().forEach(function (h) {
        if (h.q >= 0.999) { h.state = 'accepted'; h.q = 1; n++; }
        else if (h.q <= 0.001) { h.state = 'rejected'; h.q = 0; n++; }
      });
      v = 0;
      buildTicks();
      applyScrub();
      paintAll();
      say(n ? 'Kept this version: ' + n + (n === 1 ? ' change' : ' changes') + ' settled' : 'Nothing to keep');
      changed();
    }

    // ---------- deciding a hunk ----------
    function settleScrub() { tw.stop(vTween, false); vTween = null; if (Math.abs(v) > 1e-6) { v = 0; applyScrub(); } }
    function decide(h, state) {
      if (h.state === state) return;
      settleScrub();
      tw.stop(h.busy, true);
      var from = h.q;
      var target = state === 'accepted' ? 1 : state === 'rejected' ? 0 : 0.5;
      h.state = state;
      var dur = Math.min(900, Math.max(360, 240 + (h.from.length + h.to.length) * 4));
      h.busy = tw.run(dur, function (k) { h.q = from + (target - from) * k; render(h); }, function () {
        h.busy = null;
        h.q = target;
        render(h);
        if (state === 'pending') { buildTicks(); applyScrub(); }
      }, smooth);
      buildTicks();
      applyScrub();
      paintAll();
      say(state === 'accepted' ? 'Accepted: “' + h.to + '”' : state === 'rejected' ? 'Rejected, kept “' + h.from + '”' : 'Back to suggestion');
      changed();
    }
    function nextPending(after) {
      var P = hunks.filter(function (h) { return h.state === 'pending'; });
      return P.filter(function (h) { return h.i > after; })[0] || P[0] || null;
    }
    function acceptOrRejectAll(accept) {
      if (!pending().length) return;
      hideTools(true);
      var N = pending().length;
      var to = accept ? 1 : -1;
      animateV(to, Math.min(1400, Math.abs(to - v) * N * 150), keep);
    }
    function reset() {
      settleScrub();
      hunks.forEach(function (h) { if (h.state !== 'pending') decide(h, 'pending'); });
    }

    function paintAll() {
      var P = hunks.filter(function (h) { return h.state === 'pending'; });
      var acc = hunks.filter(function (h) { return h.state === 'accepted'; }).length;
      var rej = hunks.filter(function (h) { return h.state === 'rejected'; }).length;
      left.textContent = P.length
        ? P.length + ' of ' + hunks.length + ' left' + (acc || rej ? ' · ' + acc + ' accepted, ' + rej + ' rejected' : '')
        : 'All ' + hunks.length + ' reviewed · ' + acc + ' accepted, ' + rej + ' rejected';
      noAllBtn.hidden = yesAllBtn.hidden = !P.length;
      resetBtn.hidden = !(acc || rej);
      hunks.forEach(function (h) {
        h.el.dataset.state = h.state;
        var n = hunks.length;
        h.el.setAttribute('aria-label', h.state === 'pending'
          ? 'Suggestion ' + (h.i + 1) + ' of ' + n + ': ' + (h.from ? 'replace “' + h.from + '”' : 'insert') + (h.to ? ' with “' + h.to + '”' : ' (delete)') + (h.why ? '. ' + h.why : '') + '. Y to accept, N to reject.'
          : (h.state === 'accepted' ? 'Accepted: “' + h.to + '”' : 'Rejected, kept “' + h.from + '”') + '. U to undo.');
      });
      if (activeHunk) fillTools(activeHunk);
    }
    function changed() {
      if (o.onChange) o.onChange({ text: getText(), hunks: hunks.map(function (h) { return { from: h.from, to: h.to, why: h.why, state: h.state }; }) });
    }
    function getText() {
      var out = '';
      text.childNodes.forEach(function (n) {
        if (n.nodeType === 3) out += n.nodeValue;
        else { var h = hunks[+n.dataset.i]; out += h.state === 'accepted' ? h.to : h.from; }
      });
      return out;
    }
    function say(msg) { live.textContent = msg; }

    // ---------- the floating toolbar ----------
    var activeHunk = null, tHide = 0, pinned = null, lastHide = 0; // pinned: 'pointer' | 'focus' | null
    function toolButton(cls, icon, label, key, fn) {
      var b = node('button', 'er-tb ' + cls);
      b.type = 'button';
      b.tabIndex = -1;
      b.innerHTML = icon;
      b.appendChild(node('span', null, label));
      if (key) { var k = node('kbd', null, key); k.setAttribute('aria-hidden', 'true'); b.appendChild(k); }
      b.addEventListener('click', fn);
      return b;
    }
    function fillTools(h) {
      tools.textContent = '';
      if (h.state === 'pending') {
        if (h.why) tools.appendChild(node('span', 'er-why', h.why));
        tools.appendChild(toolButton('er-tb--yes', ICON.yes, 'Accept', 'Y', function () { act(h, 'accepted'); }));
        tools.appendChild(toolButton('', ICON.no, 'Reject', 'N', function () { act(h, 'rejected'); }));
      } else {
        tools.appendChild(node('span', 'er-why', h.state === 'accepted' ? 'Accepted' : 'Rejected'));
        tools.appendChild(toolButton('', ICON.undo, 'Undo', 'U', function () { act(h, 'pending'); }));
      }
    }
    function placeTools(h) {
      var rects = h.el.getClientRects();
      if (!rects.length) return;
      var r = rects[0];
      var host = root.getBoundingClientRect();
      var tw_ = tools.offsetWidth, th = tools.offsetHeight;
      var x = Math.max(0, Math.min(host.width - tw_, r.left - host.left - 4));
      var below = r.top - th - 8 < 4;
      var last = rects[rects.length - 1];
      var y = below ? last.bottom - host.top + 6 : r.top - host.top - th - 6;
      tools.style.left = Math.round(x) + 'px';
      tools.style.top = Math.round(y) + 'px';
    }
    function showTools(h, pin) {
      if (Math.abs(v) > 1e-6 || dragging) return;
      clearTimeout(tHide);
      var was = !!activeHunk;
      if (activeHunk && activeHunk !== h) { delete activeHunk.el.dataset.active; markTicks(null); }
      activeHunk = h;
      if (pin) pinned = pin;
      h.el.dataset.active = '';
      markTicks(h);
      fillTools(h);
      if (was || performance.now() - lastHide < 600 || reduce.matches) tools.dataset.instant = ''; else delete tools.dataset.instant;
      placeTools(h);
      tools.dataset.open = '';
    }
    function hideTools(now) {
      clearTimeout(tHide);
      function go() {
        if (!activeHunk) return;
        delete activeHunk.el.dataset.active;
        markTicks(null);
        activeHunk = null;
        pinned = null;
        delete tools.dataset.open;
        lastHide = performance.now();
      }
      if (now) go(); else tHide = setTimeout(go, 220);
    }
    function markTicks(h) {
      ticksBox.querySelectorAll('[data-hot]').forEach(function (t) { delete t.dataset.hot; });
      if (!h || h.state !== 'pending') return;
      var k = pending().indexOf(h) + 1;
      ticksBox.querySelectorAll('[data-k="' + k + '"]').forEach(function (t) { t.dataset.hot = ''; });
    }
    function act(h, state, fromKey) {
      var focusWasHere = document.activeElement === h.el;
      decide(h, state);
      if (state !== 'pending' && focusWasHere && fromKey) {
        var n = nextPending(h.i);
        if (n && n !== h) { n.el.focus({ preventScroll: true }); return; }
      }
      if (activeHunk === h) { fillTools(h); placeTools(h); }
      requestAnimationFrame(function () { if (activeHunk === h) placeTools(h); });
    }

    // ---------- events ----------
    function hunkOf(t) { var e = t && t.closest ? t.closest('.er-h') : null; return e && text.contains(e) ? hunks[+e.dataset.i] : null; }

    text.addEventListener('pointerover', function (e) {
      if (e.pointerType !== 'mouse' || pinned) return;
      var h = hunkOf(e.target);
      if (h) showTools(h);
    });
    text.addEventListener('pointerout', function (e) {
      if (e.pointerType !== 'mouse' || pinned) return;
      var h = hunkOf(e.target);
      if (!h || h.el.contains(e.relatedTarget) || tools.contains(e.relatedTarget)) return;
      hideTools(false);
    });
    tools.addEventListener('pointerenter', function () { clearTimeout(tHide); });
    tools.addEventListener('pointerleave', function (e) {
      if (e.pointerType !== 'mouse' || pinned) return;
      if (activeHunk && activeHunk.el.contains(e.relatedTarget)) return;
      hideTools(false);
    });
    tools.addEventListener('pointerdown', function (e) { e.preventDefault(); }); // keep focus on the hunk
    text.addEventListener('click', function (e) {
      var h = hunkOf(e.target);
      if (!h) return;
      if (Math.abs(v) > 1e-6) { animateV(0, 220, function () { showTools(h, 'pointer'); }); return; }
      showTools(h, 'pointer');
    });
    text.addEventListener('focusin', function (e) {
      var h = hunkOf(e.target);
      if (h && e.target.matches(':focus-visible')) showTools(h, 'focus');
    });
    root.addEventListener('focusout', function (e) {
      if (!activeHunk) return;
      var to = e.relatedTarget;
      if (to && (hunkOf(to) || tools.contains(to))) return;
      if (!to && pinned === 'pointer') return; // an outside click closes it (pointerdown below)
      hideTools(true);
    });
    document.addEventListener('pointerdown', function (e) {
      if (activeHunk && !tools.contains(e.target) && !hunkOf(e.target)) hideTools(true);
    });
    function keyFor(h, e) {
      var k = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey || e.altKey) return false;
      if (k === 'y' && h.state === 'pending') { act(h, 'accepted', true); return true; }
      if (k === 'n' && h.state === 'pending') { act(h, 'rejected', true); return true; }
      if ((k === 'u' || k === 'backspace') && h.state !== 'pending') { act(h, 'pending', true); return true; }
      if (k === 'escape') { hideTools(true); return true; }
      return false;
    }
    text.addEventListener('keydown', function (e) {
      var h = hunkOf(e.target);
      if (h && keyFor(h, e)) e.preventDefault();
    });
    // hover a hunk and press Y / N without focusing it first
    document.addEventListener('keydown', function (e) {
      if (!activeHunk || hunkOf(document.activeElement)) return;
      var a = document.activeElement;
      if (a && a !== document.body && !root.contains(a)) return;
      if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
      if (keyFor(activeHunk, e)) e.preventDefault();
    });

    function vFromX(x) {
      var r = slider.getBoundingClientRect();
      var val = ((x - r.left) / r.width) * 2 - 1;
      return Math.abs(val) < 0.025 ? 0 : val;
    }
    slider.addEventListener('pointerdown', function (e) {
      if (!pending().length || e.button > 0) return;
      slider.setPointerCapture(e.pointerId);
      dragging = true;
      slider.dataset.drag = '';
      tw.stop(vTween);
      hunks.forEach(function (h) { tw.stop(h.busy, true); });
      hideTools(true);
      setV(vFromX(e.clientX));
    });
    slider.addEventListener('pointermove', function (e) { if (dragging) setV(vFromX(e.clientX)); });
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      delete slider.dataset.drag;
      snap();
    }
    slider.addEventListener('pointerup', endDrag);
    slider.addEventListener('pointercancel', endDrag);
    slider.addEventListener('keydown', function (e) {
      var s = stepOf(), cur = Math.round(v / s);
      var to = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'PageUp') to = (cur + 1) * s;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'PageDown') to = (cur - 1) * s;
      else if (e.key === 'Home') to = -1;
      else if (e.key === 'End') to = 1;
      else if (e.key === 'Escape' || e.key === '0') to = 0;
      else if (e.key === 'Enter') { e.preventDefault(); keep(); return; }
      if (to == null || !pending().length) return;
      e.preventDefault();
      animateV(Math.max(-1, Math.min(1, to)), 180);
    });
    keepBtn.addEventListener('click', keep);
    backBtn.addEventListener('click', function () { animateV(0, 240); });
    yesAllBtn.addEventListener('click', function () { acceptOrRejectAll(true); });
    noAllBtn.addEventListener('click', function () { acceptOrRejectAll(false); });
    resetBtn.addEventListener('click', reset);
    addEventListener('resize', function () { if (activeHunk) placeTools(activeHunk); });

    hunks.forEach(render);
    buildTicks();
    applyScrub();
    paintAll();

    return {
      hunks: hunks,
      accept: function (i) { decide(hunks[i], 'accepted'); },
      reject: function (i) { decide(hunks[i], 'rejected'); },
      acceptAll: function () { acceptOrRejectAll(true); },
      scrub: function (x) { tw.stop(vTween); setV(x); },
      keep: keep,
      show: function (i) { showTools(hunks[i], 'pointer'); },
      getText: getText
    };
  }

  global.EditReview = { create: create, diff: diff };
})(window);
