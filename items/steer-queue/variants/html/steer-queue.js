/* Steer-While-Running Queue — SteerQueue.create(root, run, options)
 * run: { title, steps: [{ id, text, ms, note }] } — a simulated agent run, one step after another (ms per step).
 * Notes typed during the run wait in a queue: "After this step" joins at the next step boundary,
 * "Interrupt now" stops the current step, joins the run before it and restarts it. While paused, every note waits.
 * The queue reorders by its grip (drag, or ↑/↓ on the grip); × cancels a note until the agent takes it.
 * A taken note moves into the run with moveBefore() (insertBefore where missing) inside a view transition.
 * The dial pauses and resumes the run (Invoker Commands, --toggle-run); paused, its arc freezes.
 * options.onTake(note, { before, steps }) may return { rewrite: [{ id, text }] } to reword upcoming steps.
 * options.onChange(state), options.suggestions: one-tap notes under the field. */
(function (global) {
  'use strict';

  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var INVOKERS = typeof HTMLButtonElement !== 'undefined' && 'command' in HTMLButtonElement.prototype;
  var MOVE = typeof Element !== 'undefined' && typeof Element.prototype.moveBefore === 'function';
  var S = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
  var SVG = {
    glyph: '<svg viewBox="0 0 22 22" aria-hidden="true"><circle class="g-ring" cx="11" cy="11" r="8.5"/><circle class="g-arc" cx="11" cy="11" r="8.5" pathLength="100"/><circle class="g-fill" cx="11" cy="11" r="9.5"/><path class="g-check" d="M7 11.3l2.7 2.7 5.3-5.6" pathLength="10"/></svg>',
    grip: '<svg viewBox="0 0 14 14" aria-hidden="true"><g fill="currentColor"><circle cx="5" cy="3" r="1.2"/><circle cx="9" cy="3" r="1.2"/><circle cx="5" cy="7" r="1.2"/><circle cx="9" cy="7" r="1.2"/><circle cx="5" cy="11" r="1.2"/><circle cx="9" cy="11" r="1.2"/></g></svg>',
    x: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3L3 9" ' + S + ' stroke-width="1.6"/></svg>',
    you: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.4 3.2h7.2v4.6H6.2L3.8 9.8V7.8H2.4z" ' + S + ' stroke-width="1.3"/></svg>',
    pause: '<svg class="sq-i-pause" viewBox="0 0 14 14" aria-hidden="true"><path d="M4.6 3v8M9.4 3v8" ' + S + ' stroke-width="2.2"/></svg>',
    play: '<svg class="sq-i-play" viewBox="0 0 14 14" aria-hidden="true"><path d="M4.4 2.6v8.8l7-4.4z" fill="currentColor"/></svg>',
    done: '<svg class="sq-i-done" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7.4l2.6 2.6L11 4.4" ' + S + ' stroke-width="2"/></svg>',
    send: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3.4M3.8 7.4L8 3.2l4.2 4.2" ' + S + ' stroke-width="2"/></svg>'
  };
  var uid = 0;

  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function secs(ms) { return (ms / 1000).toFixed(1) + ' s'; }
  function clockText(ms) { var s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  function create(root, run, options) {
    var o = Object.assign({ onTake: null, onChange: null, suggestions: [], autostart: true }, options || {});
    var n = ++uid;
    if (!root.id) root.id = 'sq' + n;
    var source = run.steps.map(function (s, i) { return { id: s.id || 's' + i, text: s.text, ms: s.ms || 2000, note: s.note || '' }; });
    var steps = [];
    var queue = [];            // notes not taken yet, in order
    var taken = 0;
    var mode = 'idle';         // idle · running · paused · done
    var cur = 0;               // index of the step running or next
    var hold = 0;              // ms left of "reading your note" before the next step starts
    var clock = 0;             // ms the run has been running, pauses excluded
    var raf = 0, last = 0;
    var still = false;         // jumping (seek): no animation, no reading pause
    var qdrag = null;
    var waitDrop = false;      // a boundary came while a note was being dragged
    var noteId = 0;

    root.classList.add('sq');
    root.textContent = '';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Agent run: ' + (run.title || 'task'));

    // ---- header
    var head = node('div', 'sq-head');
    var dial = node('button', 'sq-dial');
    dial.type = 'button';
    dial.innerHTML = '<svg viewBox="0 0 44 44" aria-hidden="true"><circle class="sq-dtrack" cx="22" cy="22" r="18" pathLength="100"/><circle class="sq-darc" cx="22" cy="22" r="18" pathLength="100" stroke-dasharray="0 100"/></svg>';
    var dicon = node('span', 'sq-dicon');
    dicon.innerHTML = SVG.pause + SVG.play + SVG.done;
    dial.appendChild(dicon);
    var arc = dial.querySelector('.sq-darc');
    var htext = node('div');
    var status = node('p', 'sq-status');
    var title = node('h2', 'sq-title', run.title || 'Agent run');
    htext.appendChild(status);
    htext.appendChild(title);
    head.appendChild(dial);
    head.appendChild(htext);
    root.appendChild(head);

    // ---- the run
    var list = node('ol', 'sq-steps');
    list.setAttribute('aria-label', 'Steps');
    root.appendChild(list);

    // ---- queue
    var qwrap = node('section', 'sq-queue');
    var qhead = node('div', 'sq-qhead');
    var qh = node('h3', null, 'Queued');
    qh.id = root.id + '-qh';
    var qhint = node('span', 'sq-qhint', 'Taken in order at the next step');
    qhead.appendChild(qh);
    qhead.appendChild(qhint);
    var qlist = node('ul', 'sq-qlist');
    qlist.setAttribute('aria-labelledby', qh.id);
    var qempty = node('p', 'sq-qempty', 'Nothing queued. Notes you add wait here until the agent can take them.');
    qwrap.appendChild(qhead);
    qwrap.appendChild(qlist);
    qwrap.appendChild(qempty);
    root.appendChild(qwrap);

    // ---- composer
    var form = node('form', 'sq-form');
    var row = node('div', 'sq-row');
    var input = node('input', 'sq-input');
    input.type = 'text';
    input.placeholder = 'Add a note for the agent…';
    input.setAttribute('aria-label', 'Note for the agent');
    input.setAttribute('aria-keyshortcuts', 'Control+Enter Meta+Enter');
    input.autocomplete = 'off';
    var send = node('button', 'sq-send');
    send.type = 'submit';
    send.setAttribute('aria-label', 'Queue note');
    send.innerHTML = SVG.send;
    row.appendChild(input);
    row.appendChild(send);
    var modes = node('div', 'sq-modes');
    var seg = node('fieldset', 'sq-seg');
    seg.appendChild(node('legend', null, 'When the agent takes it'));
    [['after', 'After this step'], ['interrupt', 'Interrupt now']].forEach(function (m, i) {
      var lab = node('label');
      var r = node('input');
      r.type = 'radio';
      r.name = root.id + '-mode';
      r.value = m[0];
      if (!i) r.checked = true;
      lab.appendChild(r);
      lab.appendChild(document.createTextNode(m[1]));
      seg.appendChild(lab);
    });
    modes.appendChild(seg);
    modes.appendChild(node('span', 'sq-kbd', '⌘/Ctrl+Enter interrupts'));
    form.appendChild(row);
    form.appendChild(modes);
    root.appendChild(form);
    var sugg = node('div', 'sq-sugg');
    root.appendChild(sugg);
    var again = node('button', 'sq-pill sq-again', 'Run again');
    again.type = 'button';
    root.appendChild(again);
    var live = node('div', 'sq-sr');
    live.setAttribute('aria-live', 'polite');
    root.appendChild(live);
    function say(t) { live.textContent = ''; setTimeout(function () { live.textContent = t; }, 30); }

    // Invoker Commands drive the dial and Run again; plain clicks where they are missing
    dial.setAttribute('commandfor', root.id);
    dial.setAttribute('command', '--toggle-run');
    again.setAttribute('commandfor', root.id);
    again.setAttribute('command', '--restart');
    function command(c) { if (c === '--toggle-run') toggleRun(); else if (c === '--restart') restart(); }
    if (INVOKERS) root.addEventListener('command', function (e) { command(e.command); });
    else {
      dial.addEventListener('click', function () { command('--toggle-run'); });
      again.addEventListener('click', function () { command('--restart'); });
    }

    // ---------- steps ----------
    function buildSteps() {
      list.textContent = '';
      steps = source.map(function (s) { return makeStep(s); });
      steps.forEach(function (s) { list.appendChild(s.el.li); });
    }
    function makeStep(s) {
      var st = { id: s.id, text: s.text, ms: s.ms, note: s.note, state: 'idle', spent: 0, el: null };
      var li = node('li', 'sq-step');
      var glyph = node('span', 'sq-glyph');
      glyph.innerHTML = SVG.glyph;
      var body = node('div', 'sq-body');
      var text = node('span', 'sq-text', s.text);
      var note = node('span', 'sq-note');
      body.appendChild(text);
      body.appendChild(note);
      var time = node('span', 'sq-time');
      li.appendChild(glyph);
      li.appendChild(body);
      li.appendChild(time);
      st.el = { li: li, text: text, note: note, time: time };
      paintStep(st);
      return st;
    }
    function paintStep(s) {
      s.el.li.dataset.state = s.state;
      s.el.note.textContent = s.state === 'done' ? s.note : s.restarted && s.state === 'run' ? 'Restarted with your note' : '';
      s.el.time.textContent = s.state === 'done' ? secs(s.ms) : s.state === 'run' ? secs(s.spent) : '';
      if (s.el.text.textContent !== s.text) s.el.text.textContent = s.text;
    }

    // ---------- notes ----------
    function makeNote(text, m) {
      var c = { id: 'n' + (++noteId), text: text, mode: m, li: null };
      var li = node('li', 'sq-chip');
      li.dataset.mode = m;
      var grip = node('button', 'sq-grip');
      grip.type = 'button';
      grip.innerHTML = SVG.grip;
      grip.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown');
      var you = node('span', 'sq-you');
      you.innerHTML = SVG.you;
      you.setAttribute('aria-hidden', 'true');
      var body = node('div', 'sq-ctext');
      var badge = node('span', 'sq-badge', m === 'interrupt' ? 'Interrupt' : 'After this step');
      var t = node('span', null, text);
      var tk = node('span', 'sq-taken');
      body.appendChild(badge);
      body.appendChild(t);
      body.appendChild(tk);
      var x = node('button', 'sq-x');
      x.type = 'button';
      x.innerHTML = SVG.x;
      x.setAttribute('aria-label', 'Cancel note: ' + text);
      li.appendChild(grip);
      li.appendChild(you);
      li.appendChild(body);
      li.appendChild(x);
      c.li = li;
      c.el = { grip: grip, taken: tk };
      x.addEventListener('click', function () { cancel(c); });
      grip.addEventListener('pointerdown', function (e) { dragStart(c, e); });
      grip.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); moveBy(c, e.key === 'ArrowUp' ? -1 : 1); }
      });
      return c;
    }
    function paintQueue() {
      queue.forEach(function (c, i) {
        c.el.grip.setAttribute('aria-label', 'Move note ' + (i + 1) + ' of ' + queue.length + ': ' + c.text);
      });
      qh.textContent = queue.length ? 'Queued · ' + queue.length : 'Queued';
      if (queue.length) delete qwrap.dataset.empty; else qwrap.dataset.empty = '';
    }

    function addNote(text, m) {
      text = String(text || '').trim();
      if (!text || mode === 'done') return null;
      var c = makeNote(text, m === 'interrupt' ? 'interrupt' : 'after');
      queue.push(c);
      qlist.appendChild(c.li);
      if (!still && !reduce.matches) c.li.animate([{ opacity: 0, transform: 'translateY(8px) scale(0.98)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
      paintQueue();
      say('Queued: ' + text + (c.mode === 'interrupt' ? (mode === 'running' ? '. Interrupting.' : '. Interrupts when the run resumes.') : '. Taken after the current step.'));
      if (c.mode === 'interrupt' && mode === 'running') {
        if (still) interrupt(c);
        else setTimeout(function () { if (mode === 'running' && queue.indexOf(c) >= 0 && qdrag == null) interrupt(c); }, reduce.matches ? 0 : 260);
      }
      emit();
      return c;
    }
    function cancel(c) {
      var i = queue.indexOf(c);
      if (i < 0) return;
      queue.splice(i, 1);
      var next = queue[i] || queue[i - 1];
      var done = function () { c.li.remove(); paintQueue(); };
      if (reduce.matches) done();
      else {
        var h = c.li.offsetHeight;
        c.li.style.overflow = 'hidden';
        c.li.animate([{ opacity: 1, height: h + 'px' }, { opacity: 0, height: '0px', marginTop: '0px', paddingTop: '0px', paddingBottom: '0px' }], { duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' }).onfinish = done;
      }
      (next ? next.li.querySelector('.sq-x') : input).focus({ preventScroll: true });
      say('Cancelled: ' + c.text);
      paintQueue();
      emit();
    }

    // move a note out of the queue into the run, before the step that runs next
    function take(c, label) {
      var i = queue.indexOf(c);
      if (i >= 0) queue.splice(i, 1);
      taken++;
      var before = steps[cur] ? steps[cur].el.li : null;
      var res = o.onTake ? o.onTake({ text: c.text, mode: c.mode }, { before: cur, steps: steps.map(function (s) { return { id: s.id, text: s.text, state: s.state }; }) }) : null;
      var changed = [];
      if (res && res.rewrite) res.rewrite.forEach(function (r) {
        steps.forEach(function (s, k) { if (s.id === r.id && s.state !== 'done' && r.text) { s.text = r.text; changed.push(k + 1); } });
      });
      c.el.taken.textContent = label + (changed.length ? ' · reworded step ' + changed.join(', ') : '');
      c.li.removeAttribute('aria-label');
      morph(function () {
        if (MOVE && c.li.isConnected) { try { list.moveBefore(c.li, before); } catch (e) { list.insertBefore(c.li, before); } }
        else list.insertBefore(c.li, before);
        changed.forEach(function (k) {
          var s = steps[k - 1];
          paintStep(s);
          s.el.text.dataset.changed = '';
          setTimeout(function () { delete s.el.text.dataset.changed; }, 1600);
        });
        paintQueue();
      });
      say('Agent took your note: ' + c.text + '. ' + c.el.taken.textContent);
      emit();
    }
    function interrupt(c) {
      var s = steps[cur];
      var label;
      if (s && s.state === 'run') {
        label = 'Interrupted step ' + (cur + 1) + ' at ' + Math.round(s.spent / s.ms * 100) + '%';
        s.state = 'idle';
        s.spent = 0;
        s.restarted = true;
        paintStep(s);
      } else label = 'Before step ' + (cur + 1);
      take(c, label);
      hold = still ? 0 : 700;
      if (still) startStep();
    }

    // view transition: the note glides from the queue into the run; FLIP where transitions are missing
    function morph(apply) {
      if (still || reduce.matches) { apply(); return; }
      var els = [].slice.call(root.querySelectorAll('.sq-steps > li, .sq-qlist > li'));
      var scoped = typeof root.startViewTransition === 'function';
      if (!scoped && typeof document.startViewTransition !== 'function') { flip(els, apply); return; }
      els.forEach(function (el, i) { el.style.viewTransitionName = 'sq' + n + '-' + i; });
      var clear = function () { els.forEach(function (el) { el.style.viewTransitionName = ''; }); };
      var vt;
      try { vt = scoped ? root.startViewTransition(apply) : document.startViewTransition(apply); }
      catch (e) { clear(); apply(); return; }
      vt.finished.then(clear, clear);
    }
    function flip(els, apply) {
      var first = els.map(function (el) { return el.getBoundingClientRect(); });
      apply();
      els.forEach(function (el, i) {
        var r = el.getBoundingClientRect();
        var dx = first[i].left - r.left, dy = first[i].top - r.top;
        if (Math.abs(dx) + Math.abs(dy) < 1) return;
        el.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
      });
    }

    // ---------- the run ----------
    function startStep() {
      if (cur >= steps.length) { finish(); return; }
      var s = steps[cur];
      s.state = 'run';
      s.spent = 0;
      paintStep(s);
      paint();
    }
    function finishStep(s) {
      s.state = 'done';
      s.spent = s.ms;
      s.restarted = false;
      paintStep(s);
      cur++;
      boundary();
    }
    // between steps: the head of the queue joins the run
    function boundary() {
      if (qdrag) { waitDrop = true; paint(); return; }
      if (queue.length) {
        var c = queue[0];
        if (cur >= steps.length) {
          var extra = makeStep({ id: 'follow' + c.id, text: 'Follow up: ' + c.text, ms: 1800, note: 'Done' });
          steps.push(extra);
          list.appendChild(extra.el.li);
        }
        take(c, cur ? 'After step ' + cur : 'Before step 1');
        hold = still ? 0 : 700;
        if (still) startStep();
      } else if (cur >= steps.length) finish();
      else startStep();
      paint();
    }
    function finish() {
      mode = 'done';
      stop();
      paint();
      say('Run finished. ' + steps.length + ' steps, ' + taken + ' notes taken.');
      emit();
    }

    function tick(t) {
      raf = 0;
      if (mode !== 'running') return;
      var dt = Math.min(t - last, 100);
      last = t;
      clock += dt;
      if (hold > 0) {
        hold -= dt;
        if (hold <= 0) { hold = 0; startStep(); }
      } else {
        var s = steps[cur];
        if (s && s.state === 'run') {
          s.spent += dt;
          if (s.spent >= s.ms) finishStep(s);
          else s.el.time.textContent = secs(s.spent);
        }
      }
      paint();
      if (mode === 'running') raf = requestAnimationFrame(tick);
    }
    function loop() {
      if (raf || mode !== 'running') return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

    function start() {
      if (mode !== 'idle') return;
      mode = 'running';
      cur = 0;
      if (queue.length) boundary(); else startStep();
      loop();
      paint();
      emit();
    }
    function pause() {
      if (mode !== 'running') return;
      mode = 'paused';
      stop();
      paint();
      say('Paused at step ' + (cur + 1) + '. Notes wait in the queue.');
      emit();
    }
    function resume() {
      if (mode !== 'paused') return;
      mode = 'running';
      paint();
      if (queue.length && queue[0].mode === 'interrupt' && !qdrag) interrupt(queue[0]);
      loop();
      say('Resumed.');
      emit();
    }
    function toggleRun() {
      if (mode === 'idle') start();
      else if (mode === 'running') pause();
      else if (mode === 'paused') resume();
    }
    function restart() {
      stop();
      mode = 'idle';
      cur = 0; hold = 0; clock = 0; taken = 0;
      queue.forEach(function (c) { c.li.remove(); });
      queue = [];
      buildSteps();
      paintQueue();
      [].forEach.call(sugg.children, function (b) { b.disabled = false; });
      paint();
      start();
      dial.focus({ preventScroll: true });
    }

    // ---------- painting ----------
    var lastStatus = '';
    function paint() {
      root.dataset.mode = mode;
      var total = 0, doneMs = 0;
      steps.forEach(function (s) { total += s.ms; doneMs += s.state === 'done' ? s.ms : s.state === 'run' ? Math.min(s.spent, s.ms) : 0; });
      var p = mode === 'done' ? 1 : total ? doneMs / total : 0;
      arc.setAttribute('stroke-dasharray', (p * 100).toFixed(2) + ' 100');
      var html;
      var t = clockText(clock);
      var at = Math.min(cur + 1, steps.length) + ' of ' + steps.length;
      if (mode === 'idle') html = '<b>Ready</b> · ' + steps.length + ' steps';
      else if (mode === 'done') html = '<b>Done</b> · ' + steps.length + ' steps · ' + taken + (taken === 1 ? ' note' : ' notes') + ' · ' + t;
      else if (mode === 'paused') html = '<b>Paused</b> · step ' + at + ' · ' + t;
      else if (waitDrop) html = '<b>Waiting for the queue</b> · step ' + at + ' · ' + t;
      else if (hold > 0) html = '<b>Reading your note</b> · step ' + at + ' · ' + t;
      else html = '<b>Running</b> · step ' + at + ' · ' + t;
      if (html !== lastStatus) { status.innerHTML = html; lastStatus = html; }
      var label = mode === 'running' ? 'Pause run' : mode === 'paused' ? 'Resume run' : mode === 'idle' ? 'Start run' : 'Run finished';
      if (dial.getAttribute('aria-label') !== label) dial.setAttribute('aria-label', label);
      dial.disabled = mode === 'done';
      input.disabled = send.disabled = mode === 'done';
    }
    function emit() {
      if (!o.onChange) return;
      o.onChange({
        mode: mode, step: cur,
        steps: steps.map(function (s) { return { id: s.id, text: s.text, state: s.state }; }),
        queue: queue.map(function (c) { return { text: c.text, mode: c.mode }; })
      });
    }

    // ---------- queue drag ----------
    function dragStart(c, e) {
      if (e.button !== 0 || qdrag) return;
      e.preventDefault();
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* gone */ }
      qdrag = { c: c, id: e.pointerId, y0: e.clientY, top0: c.li.offsetTop, grip: e.currentTarget };
      c.li.dataset.dragging = '';
      qdrag.grip.addEventListener('pointermove', dragMove);
      qdrag.grip.addEventListener('pointerup', dragEnd);
      qdrag.grip.addEventListener('pointercancel', dragEnd);
    }
    function dragMove(e) {
      if (!qdrag || e.pointerId !== qdrag.id) return;
      var li = qdrag.c.li;
      var dy = e.clientY - qdrag.y0;
      var center = qdrag.top0 + dy + li.offsetHeight / 2;
      var prev = li.previousElementSibling, next = li.nextElementSibling;
      if (prev && center < prev.offsetTop + prev.offsetHeight / 2) flipQueue(function () { qlist.insertBefore(li, prev); });
      else if (next && center > next.offsetTop + next.offsetHeight / 2) flipQueue(function () { qlist.insertBefore(next, li); });
      li.style.transform = 'translateY(' + (qdrag.top0 + dy - li.offsetTop) + 'px)';
    }
    function dragEnd(e) {
      if (!qdrag || e.pointerId !== qdrag.id) return;
      var d = qdrag;
      qdrag = null;
      d.grip.removeEventListener('pointermove', dragMove);
      d.grip.removeEventListener('pointerup', dragEnd);
      d.grip.removeEventListener('pointercancel', dragEnd);
      var li = d.c.li;
      var from = li.style.transform;
      li.style.transform = '';
      delete li.dataset.dragging;
      if (from && !reduce.matches) li.animate([{ transform: from }, { transform: 'none' }], { duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
      syncQueue();
      if (waitDrop) { waitDrop = false; boundary(); }
      else if (mode === 'running' && queue[0] && queue[0].mode === 'interrupt') interrupt(queue[0]);
    }
    function flipQueue(mutate) {
      var lis = [].slice.call(qlist.children).filter(function (li) { return !qdrag || li !== qdrag.c.li; });
      var first = lis.map(function (li) { return li.offsetTop; });
      mutate();
      if (reduce.matches) return;
      lis.forEach(function (li, i) {
        var dy = first[i] - li.offsetTop;
        if (dy) li.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
      });
    }
    function syncQueue() {
      var order = [].map.call(qlist.children, function (li) { return li; });
      queue.sort(function (a, b) { return order.indexOf(a.li) - order.indexOf(b.li); });
      paintQueue();
      emit();
    }
    function moveBy(c, dir) {
      var i = queue.indexOf(c), j = i + dir;
      if (i < 0 || j < 0 || j >= queue.length) return;
      flipQueue(function () { qlist.insertBefore(c.li, dir < 0 ? queue[j].li : queue[j].li.nextElementSibling); });
      syncQueue();
      c.el.grip.focus();
      say(c.text + ', ' + (queue.indexOf(c) + 1) + ' of ' + queue.length);
      if (mode === 'running' && queue[0] && queue[0].mode === 'interrupt') interrupt(queue[0]);
    }

    // ---------- composer ----------
    function currentMode() { var r = form.querySelector('input[type="radio"]:checked'); return r ? r.value : 'after'; }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (addNote(input.value, currentMode())) {
        input.value = '';
        form.querySelector('input[value="after"]').checked = true;
      }
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (addNote(input.value, 'interrupt')) input.value = '';
      }
    });
    (o.suggestions || []).forEach(function (s) {
      var b = node('button', 'sq-pill', s.text || s);
      b.type = 'button';
      b.addEventListener('click', function () {
        if (addNote(s.text || s, s.mode || 'after')) b.disabled = true;
      });
      sugg.appendChild(b);
    });

    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else loop(); });

    buildSteps();
    paintQueue();
    paint();
    if (o.autostart) start();

    return {
      start: start, pause: pause, resume: resume, restart: restart,
      queue: function (text, m) { return !!addNote(text, m); },
      // jump: finish steps up to index instantly, then run `fraction` of it (for stills and tests)
      seek: function (index, fraction) {
        still = true;
        if (mode === 'idle') { mode = 'running'; if (queue.length) boundary(); else startStep(); }
        while (cur < Math.min(index, steps.length) && mode !== 'done') {
          var s = steps[cur];
          if (s.state !== 'run') startStep();
          clock += s.ms - s.spent;
          finishStep(s);
        }
        if (steps[cur] && steps[cur].state === 'run') {
          steps[cur].spent = steps[cur].ms * (fraction || 0);
          clock += steps[cur].spent;
          paintStep(steps[cur]);
        }
        still = false;
        paint();
        loop();
      },
      getState: function () { return { mode: mode, step: cur, queue: queue.map(function (c) { return { text: c.text, mode: c.mode }; }) }; }
    };
  }

  global.SteerQueue = { create: create };
})(window);
