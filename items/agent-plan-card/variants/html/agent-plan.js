/* Agent Plan Card — AgentPlan.create(root, plan, options)
 * plan: { title, subtitle, steps: [{ id, text }] }
 * options.run: async (step, { signal }) => ({ ok: true|false, note: 'what happened' }) — your agent executes one step.
 * Before the run: drag to reorder (or Alt+↑/↓ on the handle), click the text to reword, Skip to strike a step out.
 * During the run the glyph goes ring → spinning arc → check or cross with a live timer; upcoming steps stay editable.
 * Every finished step offers "Rewind to here": later steps roll back to idle, bottom first;
 * options.onRewind(step, rolledBackIds) is where the host restores its own checkpoint. */
(function (global) {
  'use strict';

  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var SVG = {
    glyph: '<svg viewBox="0 0 22 22" aria-hidden="true"><circle class="g-ring" cx="11" cy="11" r="8.5"/><circle class="g-arc" cx="11" cy="11" r="8.5" pathLength="100"/><circle class="g-fill" cx="11" cy="11" r="9.5"/><path class="g-mark g-check" d="M7 11.3l2.7 2.7 5.3-5.6" pathLength="10"/><path class="g-mark g-cross" d="M8 8l6 6M14 8l-6 6" pathLength="10"/></svg>',
    grip: '<svg viewBox="0 0 14 14" aria-hidden="true"><g fill="currentColor"><circle cx="5" cy="3" r="1.2"/><circle cx="9" cy="3" r="1.2"/><circle cx="5" cy="7" r="1.2"/><circle cx="9" cy="7" r="1.2"/><circle cx="5" cy="11" r="1.2"/><circle cx="9" cy="11" r="1.2"/></g></svg>',
    skip: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    include: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7h9M7 2.5v9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    back: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M4.6 2.8L2.3 5.1l2.3 2.3M2.6 5.1h5.2a3.3 3.3 0 010 6.6H6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    play: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M4 2.6v8.8l7.2-4.4z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M4.2 3v8M9.8 3v8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
  };

  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function secs(ms) { return (ms / 1000).toFixed(1) + ' s'; }
  function clock(ms) { var s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  function create(root, plan, options) {
    var o = Object.assign({ run: null, onChange: null, onRewind: null }, options || {});
    var steps = plan.steps.map(function (s, i) {
      return { id: s.id || 's' + i, text: s.text, state: 'idle', skip: !!s.skip, note: '', ms: null, t0: 0 };
    });
    var mode = 'draft';          // draft · running · paused · failed · done
    var ctrl = null;             // AbortController of the step in flight
    var pauseAsked = false;
    var runStart = 0, runSpent = 0;
    var raf = 0;

    root.classList.add('ap');
    root.textContent = '';
    root.setAttribute('aria-label', plan.title ? 'Agent plan: ' + plan.title : 'Agent plan');

    // ---- header
    var status = node('p', 'ap-status');
    var title = node('h2', 'ap-title', plan.title || 'Plan');
    var sub = node('p', 'ap-sub', plan.subtitle || '');
    root.appendChild(status);
    root.appendChild(title);
    if (plan.subtitle) root.appendChild(sub);

    // ---- steps
    var list = node('ol', 'ap-steps');
    var rail = node('div', 'ap-rail');
    var railFill = node('div', 'ap-rail-fill');
    rail.setAttribute('aria-hidden', 'true');
    railFill.setAttribute('aria-hidden', 'true');
    list.appendChild(rail);
    list.appendChild(railFill);
    root.appendChild(list);

    steps.forEach(function (s) {
      var li = node('li', 'ap-step');
      li.dataset.id = s.id;
      var grip = node('button', 'ap-grip');
      grip.type = 'button';
      grip.innerHTML = SVG.grip;
      grip.setAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown');
      var glyph = node('span', 'ap-glyph');
      glyph.innerHTML = SVG.glyph;
      var body = node('div', 'ap-body');
      var text = node('span', 'ap-text', s.text);
      text.tabIndex = 0;
      text.setAttribute('role', 'button');
      var note = node('span', 'ap-note');
      body.appendChild(text);
      body.appendChild(note);
      var side = node('div', 'ap-side');
      var skip = node('button', 'ap-mini');
      skip.type = 'button';
      skip.innerHTML = SVG.skip;
      skip.appendChild(node('span', null, 'Skip'));
      var back = node('button', 'ap-mini');
      back.type = 'button';
      back.innerHTML = SVG.back;
      back.appendChild(node('span', null, 'Rewind to here'));
      var time = node('span', 'ap-time');
      var acts = node('span', 'ap-acts');
      acts.appendChild(skip);
      acts.appendChild(back);
      side.appendChild(acts);
      side.appendChild(time);
      li.appendChild(grip);
      li.appendChild(glyph);
      li.appendChild(body);
      li.appendChild(side);
      list.appendChild(li);
      s.el = { li: li, grip: grip, text: text, note: note, skip: skip, back: back, time: time };

      grip.addEventListener('pointerdown', function (e) { startDrag(s, e); });
      grip.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); moveBy(s, e.key === 'ArrowUp' ? -1 : 1); }
      });
      text.addEventListener('click', function () { edit(s); });
      text.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); edit(s); } });
      skip.addEventListener('click', function () { toggleSkip(s); });
      back.addEventListener('click', function () { rewind(s); });
    });

    // ---- footer
    var foot = node('div', 'ap-foot');
    var hint = node('span', 'ap-hint');
    var second = node('button', 'ap-btn');
    var main = node('button', 'ap-btn ap-btn--main');
    second.type = main.type = 'button';
    foot.appendChild(hint);
    foot.appendChild(second);
    foot.appendChild(main);
    root.appendChild(foot);
    var live = node('div', 'ap-sr');
    live.setAttribute('aria-live', 'polite');
    root.appendChild(live);
    main.addEventListener('click', function () { act(main.dataset.act); });
    second.addEventListener('click', function () { act(second.dataset.act); });

    // ---------- painting ----------
    function order() { return steps.slice().sort(function (a, b) { return idx(a) - idx(b); }); }
    function idx(s) { return Array.prototype.indexOf.call(list.children, s.el.li); }
    function position(s) { return order().indexOf(s) + 1; }

    function paintStep(s) {
      var e = s.el;
      e.li.dataset.state = s.state;
      if (s.skip) e.li.dataset.skip = ''; else delete e.li.dataset.skip;
      var n = position(s);
      e.grip.setAttribute('aria-label', 'Move step ' + n + ': ' + s.text);
      e.grip.disabled = s.state !== 'idle';
      e.text.textContent = s.text;
      e.text.setAttribute('aria-label', 'Step ' + n + ', ' + label(s) + ': ' + s.text + (s.state === 'idle' ? '. Enter to reword' : ''));
      if (s.note !== e.note.textContent) { e.note.textContent = s.note; delete e.note.dataset.fade; }
      e.time.textContent = s.state === 'done' || s.state === 'fail' ? secs(s.ms) : s.state === 'run' ? secs(performance.now() - s.t0) : '';
      e.skip.hidden = s.state !== 'idle';
      e.skip.setAttribute('aria-pressed', String(s.skip));
      if (e.skip.dataset.on !== String(s.skip)) {
        e.skip.dataset.on = String(s.skip);
        e.skip.innerHTML = s.skip ? SVG.include : SVG.skip;
        e.skip.appendChild(node('span', null, s.skip ? 'Include' : 'Skip'));
      }
      e.skip.setAttribute('aria-label', (s.skip ? 'Include step ' : 'Skip step ') + n);
      e.back.hidden = s.state !== 'done' || !laterRan(s);
      e.back.setAttribute('aria-label', 'Rewind to step ' + n + ', roll back the steps after it');
    }
    function label(s) {
      return s.skip && s.state === 'idle' ? 'skipped' : { idle: 'to do', run: 'running', done: 'done', fail: 'failed' }[s.state];
    }
    function laterRan(s) {
      var ord = order();
      return ord.slice(ord.indexOf(s) + 1).some(function (x) { return x.state !== 'idle'; });
    }
    function paintRail() {
      var lis = order().map(function (s) { return s.el.li; });
      if (!lis.length) return;
      var first = lis[0], last = lis[lis.length - 1];
      var top = first.offsetTop + 8 + 13, bottom = last.offsetTop + 8 + 13;
      rail.style.top = top + 'px';
      rail.style.height = Math.max(0, bottom - top) + 'px';
      railFill.style.top = top + 'px';
      var reach = null;
      order().forEach(function (s) { if (s.state === 'done' || s.state === 'fail' || s.state === 'run') reach = s; });
      railFill.style.height = reach ? Math.max(0, reach.el.li.offsetTop + 21 - top) + 'px' : '0px';
    }
    function counts() {
      var sk = steps.filter(function (s) { return s.skip && s.state === 'idle'; }).length;
      return steps.length + ' steps' + (sk ? ' · ' + sk + ' skipped' : '');
    }
    function nextStep() { return order().filter(function (s) { return s.state === 'idle' && !s.skip; })[0] || null; }
    function elapsed() { return runSpent + (mode === 'running' ? performance.now() - runStart : 0); }
    var statusKey = '';
    function paintStatus() {
      var word = { draft: 'Plan', running: 'Running', paused: 'Paused', failed: 'Stopped', done: 'Done' }[mode];
      var rest;
      if (mode === 'draft') rest = 'waiting for you · ' + counts();
      else if (mode === 'running') rest = clock(elapsed());
      else if (mode === 'paused') { var n = nextStep(); rest = n ? 'next: step ' + position(n) : 'nothing left to run'; }
      else if (mode === 'failed') rest = 'step ' + position(steps.filter(function (s) { return s.state === 'fail'; })[0]) + ' failed';
      else rest = 'in ' + clock(elapsed());
      if (statusKey === word + rest) return;
      statusKey = word + rest;
      status.textContent = '';
      status.appendChild(node('b', null, word));
      status.appendChild(document.createTextNode(' · ' + rest));
    }
    function setButtons(a, b) {
      main.hidden = !a;
      if (a) { main.innerHTML = a.icon || ''; main.appendChild(node('span', null, a.label)); main.dataset.act = a.act; }
      second.hidden = !b;
      if (b) { second.innerHTML = b.icon || ''; second.appendChild(node('span', null, b.label)); second.dataset.act = b.act; }
    }
    function paintFoot() {
      var n = nextStep();
      if (mode === 'draft') { hint.textContent = 'Drag to reorder · click a step to reword'; setButtons({ label: 'Run plan', icon: SVG.play, act: 'run' }); }
      else if (mode === 'running') { hint.textContent = 'Upcoming steps stay editable'; setButtons(null, { label: pauseAsked ? 'Pausing…' : 'Pause', icon: SVG.pause, act: 'pause' }); }
      else if (mode === 'paused') { hint.textContent = counts(); setButtons(n ? { label: 'Run from step ' + position(n), icon: SVG.play, act: 'run' } : { label: 'Finish', act: 'finish' }, { label: 'Start over', act: 'reset' }); }
      else if (mode === 'failed') { hint.textContent = 'Fix the step, skip it or retry'; setButtons({ label: 'Retry step', act: 'retry' }, { label: 'Skip and go on', act: 'skipfail' }); }
      else { hint.textContent = counts(); setButtons(null, { label: 'Start over', act: 'reset' }); }
    }
    function paint() {
      steps.forEach(paintStep);
      paintStatus();
      paintFoot();
      paintRail();
    }
    function say(msg) { live.textContent = msg; }
    function changed() {
      if (o.onChange) o.onChange({ mode: mode, steps: order().map(function (s) { return { id: s.id, text: s.text, skip: s.skip, state: s.state, note: s.note, ms: s.ms }; }) });
    }

    // ---------- clock: rAF only while a step runs ----------
    function tick() {
      raf = 0;
      if (mode !== 'running') return;
      var r = steps.filter(function (s) { return s.state === 'run'; })[0];
      if (r) { var t = secs(performance.now() - r.t0); if (r.el.time.textContent !== t) r.el.time.textContent = t; }
      paintStatus();
      raf = requestAnimationFrame(tick);
    }

    // ---------- running ----------
    function simulate(step, ctx) {
      // stand-in when no run() is given: waits a moment, always succeeds
      return new Promise(function (ok, fail) {
        var t = setTimeout(function () { ok({ ok: true, note: '' }); }, 700 + step.text.length * 12);
        ctx.signal.addEventListener('abort', function () { clearTimeout(t); fail(new DOMException('Aborted', 'AbortError')); });
      });
    }
    async function loop() {
      while (mode === 'running') {
        var s = nextStep();
        if (!s) { finish(); return; }
        if (pauseAsked) { pauseAsked = false; setMode('paused'); return; }
        s.state = 'run';
        s.note = '';
        s.t0 = performance.now();
        paint();
        say('Running step ' + position(s) + ': ' + s.text);
        if (!raf) raf = requestAnimationFrame(tick);
        var mine = ctrl = new AbortController();
        var res;
        try { res = await (o.run || simulate)({ id: s.id, text: s.text, index: position(s) - 1 }, { signal: mine.signal }); }
        catch (err) { if (mine.signal.aborted) return; res = { ok: false, note: String(err && err.message || err) }; }
        if (mine.signal.aborted) return;
        s.ms = performance.now() - s.t0;
        s.state = res && res.ok ? 'done' : 'fail';
        s.note = (res && res.note) || '';
        say('Step ' + position(s) + (s.state === 'done' ? ' done' : ' failed') + (s.note ? ': ' + s.note : ''));
        changed();
        if (s.state === 'fail') { setMode('failed'); return; }
      }
    }
    function setMode(m) {
      if (mode === 'running' && m !== 'running') runSpent += performance.now() - runStart;
      if (m === 'running' && mode !== 'running') runStart = performance.now();
      mode = m;
      paint();
      changed();
    }
    function start() {
      if (mode === 'running' || !nextStep()) return;
      pauseAsked = false;
      setMode('running');
      loop();
    }
    function finish() { setMode('done'); say('Plan finished in ' + clock(elapsed())); }
    function act(a) {
      if (a === 'run') start();
      else if (a === 'pause') { pauseAsked = true; paintFoot(); }
      else if (a === 'retry') { var f = steps.filter(function (s) { return s.state === 'fail'; })[0]; if (f) { f.state = 'idle'; f.note = ''; } start(); }
      else if (a === 'skipfail') { var g = steps.filter(function (s) { return s.state === 'fail'; })[0]; if (g) { g.state = 'idle'; g.skip = true; g.note = ''; } start(); }
      else if (a === 'finish') finish();
      else if (a === 'reset') reset();
    }
    function reset() {
      abort();
      runSpent = 0;
      var done = order().filter(function (s) { return s.state !== 'idle'; });
      done.forEach(function (s) { s._shown = s.state === 'run' ? 'idle' : s.state; });
      mode = 'draft';
      rollBack(done.reverse());
      paintStatus();
      paintFoot();
      changed();
      say('Plan reset');
    }
    function abort() { if (ctrl) { ctrl.abort(); ctrl = null; } pauseAsked = false; }

    // ---------- rewind ----------
    function rollBack(list_) {
      // bottom first, so the roll-back reads as the run playing backwards; returns how long it takes
      var gap = reduce.matches ? 0 : 80;
      var rolled = new Set(list_);
      steps.forEach(function (s) { if (!rolled.has(s)) paintStep(s); });
      list_.forEach(function (s, j) {
        s.state = 'idle';
        s.ms = null;
        var li = s.el.li;
        function go() {
          paintStep(s);
          delete li.dataset.rolled;
          void li.offsetWidth;
          li.dataset.rolled = '';
          s.el.note.textContent = 'Rolled back';
          s.el.note.dataset.fade = '';
          setTimeout(function () { if (s.state === 'idle' && s.el.note.textContent === 'Rolled back') { s.el.note.textContent = ''; } delete li.dataset.rolled; }, 2100);
        }
        s.note = '';
        if (gap) {
          // hold the finished look until this step's turn
          s.el.li.dataset.state = s._shown || 'done';
          setTimeout(go, j * gap);
        } else go();
      });
      // the rail retracts over the same time, so the line rolls up with the checks
      var total = Math.max(0, list_.length - 1) * gap;
      railFill.style.transitionDuration = (total + 360) + 'ms';
      paintRail();
      setTimeout(function () { railFill.style.transitionDuration = ''; }, total + 400);
      return total;
    }
    function rewind(target) {
      if (target.state !== 'done') return;
      abort();
      var later = order().slice(order().indexOf(target) + 1).filter(function (s) { return s.state !== 'idle'; });
      later.forEach(function (s) { s._shown = s.state === 'run' ? 'idle' : s.state; });
      var wasRunning = mode === 'running';
      if (wasRunning) runSpent += performance.now() - runStart;
      mode = 'paused';
      rollBack(later.reverse());
      paintStatus();
      paintFoot();
      say('Rewound to step ' + position(target) + '. ' + later.length + (later.length === 1 ? ' step' : ' steps') + ' rolled back.');
      if (o.onRewind) o.onRewind({ id: target.id, text: target.text }, later.map(function (s) { return s.id; }));
      changed();
    }

    // ---------- editing ----------
    function edit(s) {
      if (s.state !== 'idle' || s.el.input) return;
      var input = node('input', 'ap-input');
      input.value = s.text;
      input.setAttribute('aria-label', 'Reword step ' + position(s));
      s.el.input = input;
      s.el.text.replaceWith(input);
      input.focus();
      input.select();
      var done = false;
      function close(save, refocus) {
        if (done) return;
        done = true;
        var v = input.value.trim();
        if (save && v && v !== s.text) { s.text = v; say('Step ' + position(s) + ' reworded'); changed(); }
        input.replaceWith(s.el.text);
        s.el.input = null;
        paintStep(s);
        if (refocus) s.el.text.focus({ preventScroll: true });
      }
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); close(true, true); }
        else if (e.key === 'Escape') { e.preventDefault(); close(false, true); }
      });
      input.addEventListener('blur', function () { close(true, false); });
    }
    function toggleSkip(s) {
      if (s.state !== 'idle') return;
      s.skip = !s.skip;
      paint();
      say('Step ' + position(s) + (s.skip ? ' will be skipped' : ' included again'));
      changed();
    }

    // ---------- reordering ----------
    function firstMovable() {
      // steps already run stay where they are; idle ones move below them
      var ord = order(), k = 0;
      ord.forEach(function (s, i) { if (s.state !== 'idle') k = i + 1; });
      return k;
    }
    function place(s, to) {
      var ord = order();
      var from = ord.indexOf(s);
      to = Math.max(firstMovable(), Math.min(ord.length - 1, to));
      if (to === from) return false;
      var ref = ord.filter(function (x) { return x !== s; })[to];
      list.insertBefore(s.el.li, ref ? ref.el.li : null);
      return true;
    }
    function flip(fn) {
      var lis = steps.map(function (s) { return s.el.li; });
      var before = lis.map(function (li) { return li.getBoundingClientRect().top; });
      fn();
      if (reduce.matches) return;
      lis.forEach(function (li, i) {
        var dy = before[i] - li.getBoundingClientRect().top;
        if (!dy) return;
        li.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
      });
    }
    function moveBy(s, d) {
      if (s.state !== 'idle') return;
      var moved = false;
      flip(function () { moved = place(s, order().indexOf(s) + d); });
      if (!moved) return;
      paint();
      s.el.grip.focus();
      say('Moved to position ' + position(s) + ' of ' + steps.length);
      changed();
    }
    function startDrag(s, e) {
      if (s.state !== 'idle' || e.button > 0) return;
      e.preventDefault();
      var li = s.el.li;
      var ord = order();
      var from = ord.indexOf(s);
      var lo = firstMovable();
      var rects = ord.map(function (x) { return x.el.li.getBoundingClientRect(); });
      var h = rects[from].height;
      var y0 = e.clientY;
      var target = from;
      s.el.grip.setPointerCapture(e.pointerId);
      li.dataset.dragging = '';
      list.dataset.sorting = '';
      function move(ev) {
        var dy = ev.clientY - y0;
        var minDy = rects[lo].top - rects[from].top, maxDy = rects[rects.length - 1].bottom - rects[from].bottom;
        dy = Math.max(minDy - 6, Math.min(maxDy + 6, dy));
        li.style.transform = 'translateY(' + dy + 'px)';
        var mid = rects[from].top + h / 2 + dy;
        target = from;
        for (var k = lo; k < rects.length; k++) {
          if (k < from && mid < rects[k].top + rects[k].height / 2) { target = k; break; }
        }
        if (target === from) for (var j = rects.length - 1; j > from; j--) if (mid > rects[j].top + rects[j].height / 2) { target = j; break; }
        ord.forEach(function (x, k) {
          if (x === s) return;
          var shift = 0;
          if (target > from && k > from && k <= target) shift = -h;
          if (target < from && k >= target && k < from) shift = h;
          x.el.li.style.transform = shift ? 'translateY(' + shift + 'px)' : '';
        });
      }
      function up() {
        s.el.grip.removeEventListener('pointermove', move);
        s.el.grip.removeEventListener('pointerup', up);
        s.el.grip.removeEventListener('pointercancel', up);
        var lis = ord.map(function (x) { return x.el.li; });
        var before = lis.map(function (x) { return x.getBoundingClientRect().top; });
        list.dataset.still = '';
        lis.forEach(function (x) { x.style.transform = ''; });
        delete li.dataset.dragging;
        delete list.dataset.sorting;
        if (target !== from) place(s, target);
        void list.offsetWidth;
        delete list.dataset.still;
        if (!reduce.matches) lis.forEach(function (x, i) {
          var dy = before[i] - x.getBoundingClientRect().top;
          if (dy) x.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
        });
        paint();
        if (target !== from) { say('Moved to position ' + position(s) + ' of ' + steps.length); changed(); }
      }
      s.el.grip.addEventListener('pointermove', move);
      s.el.grip.addEventListener('pointerup', up);
      s.el.grip.addEventListener('pointercancel', up);
    }

    addEventListener('resize', paintRail);
    paint();

    return {
      run: start,
      rewind: function (i) { rewind(order()[i]); },
      // for stills and tests: set a step's look without running it
      mark: function (i, state, ms, note) {
        var s = order()[i];
        s.state = state; s.ms = ms == null ? null : ms; s.note = note || '';
        if (state === 'run') s.t0 = performance.now() - (ms || 0);
        paintStep(s);
        paintRail();
      },
      skip: function (i) { toggleSkip(order()[i]); },
      setMode: function (m, spentMs) { if (spentMs != null) runSpent = spentMs; mode = m; runStart = performance.now(); paint(); },
      getSteps: function () { return order().map(function (s) { return { id: s.id, text: s.text, skip: s.skip, state: s.state }; }); }
    };
  }

  global.AgentPlan = { create: create };
})(window);
