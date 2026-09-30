/* Tone Pad — TonePad.create(root, draft, options)
 * draft: { meta, original: { x, y }, slots: [{ block, fs, fl, cs, cl, x?, y? }] }
 *   Each slot is one sentence (or a greeting / sign-off) written four ways: formal-short, formal-long,
 *   casual-short, casual-long. An empty string leaves the slot out at that corner.
 *   x: where this sentence turns casual (0..1); y: where it switches to its long wording or appears (0..1).
 *   Different thresholds per slot make the text change one sentence at a time as the puck moves.
 * options.generate: async ({ x, y, text, signal }) => string — optional; after the puck settles, a model can
 *   rewrite the local blend for that exact spot. Moving again cancels it. */
(function (global) {
  'use strict';

  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var ICON = {
    save: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M4 2.2h6a.8.8 0 01.8.8v9l-3.8-2.4L3.2 12V3a.8.8 0 01.8-.8z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    back: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M4.6 2.8L2.3 5.1l2.3 2.3M2.6 5.1h5.2a3.3 3.3 0 010 6.6H6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  var NS = 'http://www.w3.org/2000/svg';

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function words(s) { var m = s.trim().match(/\S+/g); return m ? m.length : 0; }
  function pct(v) { return Math.round(v * 100) + '%'; }

  function create(root, draft, options) {
    var o = Object.assign({ generate: null, onChange: null, maxPins: 5 }, options || {});
    var original = draft.original || { x: 0.5, y: 0.5 };
    var n = draft.slots.length;
    var slots = draft.slots.map(function (s, i) {
      var optional = !s.fs && !s.cs;
      return {
        block: s.block || 'body', fs: s.fs || '', fl: s.fl || '', cs: s.cs || '', cl: s.cl || '',
        // default thresholds: spread across the middle so sentences flip one by one
        tx: s.x != null ? s.x : 0.36 + (((i * 5) % n) / Math.max(1, n - 1)) * 0.28,
        ty: s.y != null ? s.y : optional ? 0.3 + (i / n) * 0.5 : 0.5,
        shown: null, target: null, fading: false
      };
    });
    function pick(s, x, y) {
      var casual = x >= s.tx, long = y >= s.ty;
      return casual ? (long ? s.cl : s.cs) : (long ? s.fl : s.fs);
    }
    function compose(x, y) { return slots.map(function (s) { return pick(s, x, y); }); }

    var pos = { x: original.x, y: original.y };
    var pins = [];
    var pending = null;     // AbortController of a model call
    var modelText = null;   // text returned by the model for the current spot

    // ---------- DOM ----------
    root.classList.add('tp');
    root.textContent = '';
    var side = node('div', 'tp-side');
    var pad = node('div', 'tp-pad');
    var map = document.createElementNS(NS, 'svg');
    map.setAttribute('class', 'tp-map');
    map.setAttribute('aria-hidden', 'true');
    pad.appendChild(map);
    [['l', 'Formal'], ['r', 'Casual'], ['t', 'Detailed'], ['b', 'Short']].forEach(function (a) {
      var e = node('span', 'tp-axis tp-axis--' + a[0], a[1]);
      e.setAttribute('aria-hidden', 'true');
      pad.appendChild(e);
    });
    var crossV = node('div', 'tp-cross tp-cross--v');
    var crossH = node('div', 'tp-cross tp-cross--h');
    pad.appendChild(crossV);
    pad.appendChild(crossH);
    var origin = node('div', 'tp-origin');
    origin.appendChild(node('span', null, 'Original'));
    origin.setAttribute('aria-hidden', 'true');
    pad.appendChild(origin);
    var pinBox = node('div');
    pad.appendChild(pinBox);
    var puck = node('div', 'tp-puck');
    puck.tabIndex = 0;
    puck.setAttribute('role', 'slider');
    puck.setAttribute('aria-roledescription', 'tone pad');
    puck.setAttribute('aria-label', 'Tone: left formal, right casual, up detailed, down short');
    puck.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown S Home');
    pad.appendChild(puck);
    side.appendChild(pad);
    var tools = node('div', 'tp-tools');
    var saveBtn = node('button', 'tp-chip');
    saveBtn.type = 'button';
    saveBtn.innerHTML = ICON.save;
    saveBtn.appendChild(node('span', null, 'Save spot'));
    var backBtn = node('button', 'tp-chip');
    backBtn.type = 'button';
    backBtn.innerHTML = ICON.back;
    backBtn.appendChild(node('span', null, 'Original'));
    var clearBtn = node('button', 'tp-link', 'Clear spots');
    clearBtn.type = 'button';
    tools.appendChild(saveBtn);
    tools.appendChild(backBtn);
    tools.appendChild(clearBtn);
    side.appendChild(tools);
    root.appendChild(side);

    var doc = node('div', 'tp-doc');
    if (draft.meta) {
      var meta = node('p', 'tp-meta');
      meta.innerHTML = draft.meta;
      doc.appendChild(meta);
    }
    var text = node('div', 'tp-text');
    text.setAttribute('aria-live', 'off');
    var paras = {};
    slots.forEach(function (s) {
      if (!paras[s.block]) { paras[s.block] = node('p'); text.appendChild(paras[s.block]); }
      s.el = node('span', 'tp-s');
      s.el.addEventListener('animationend', function () { delete s.el.dataset.flash; });
      paras[s.block].appendChild(s.el);
      paras[s.block].appendChild(document.createTextNode(' '));
    });
    doc.appendChild(text);
    var foot = node('div', 'tp-foot');
    var count = node('span');
    var busy = node('span', 'tp-busy');
    busy.appendChild(node('i'));
    busy.appendChild(node('span', null, 'Refining with the model'));
    busy.hidden = true;
    var tone = node('span');
    foot.appendChild(count);
    foot.appendChild(busy);
    foot.appendChild(tone);
    doc.appendChild(foot);
    root.appendChild(doc);
    var live = node('div', 'tp-sr');
    live.setAttribute('aria-live', 'polite');
    root.appendChild(live);

    // ---------- the length map: dot size = word count at that spot ----------
    function drawMap() {
      var w = pad.clientWidth, h = pad.clientHeight;
      if (!w || !h) return;
      map.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      map.textContent = '';
      var cols = 11, rows = Math.max(5, Math.round(11 * h / w));
      // keep the axis labels and the Original mark readable: no dots under them
      var host = pad.getBoundingClientRect();
      var keepOut = Array.prototype.map.call(pad.querySelectorAll('.tp-axis, .tp-origin, .tp-origin span'), function (e) {
        var r = e.getBoundingClientRect();
        return { l: r.left - host.left - 6, t: r.top - host.top - 6, r: r.right - host.left + 6, b: r.bottom - host.top + 6 };
      });
      var counts = [], lo = Infinity, hi = 0;
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
        var x = (c + 0.5) / cols, y = 1 - (r + 0.5) / rows;
        var wc = words(compose(x, y).join(' '));
        counts.push([c, r, wc]);
        lo = Math.min(lo, wc); hi = Math.max(hi, wc);
      }
      counts.forEach(function (k) {
        var t = hi > lo ? (k[2] - lo) / (hi - lo) : 0.5;
        var cx = (k[0] + 0.5) / cols * w, cy = (k[1] + 0.5) / rows * h;
        if (keepOut.some(function (b) { return cx > b.l && cx < b.r && cy > b.t && cy < b.b; })) return;
        var dot = document.createElementNS(NS, 'circle');
        dot.setAttribute('cx', cx.toFixed(1));
        dot.setAttribute('cy', cy.toFixed(1));
        dot.setAttribute('r', (1 + t * 2.6).toFixed(2));
        map.appendChild(dot);
      });
    }

    // ---------- painting ----------
    function place(el, x, y) { el.style.left = (x * 100) + '%'; el.style.top = ((1 - y) * 100) + '%'; }
    function describe(x, y) {
      var f = x < 0.5 ? 'formal ' + pct(1 - x) : 'casual ' + pct(x);
      var d = y < 0.5 ? 'short ' + pct(1 - y) : 'detailed ' + pct(y);
      return f.charAt(0).toUpperCase() + f.slice(1) + ', ' + d;
    }
    function setSlot(s, next, animate) {
      if (s.target === next) return;
      s.target = next;
      var el = s.el;
      function swapIn() {
        el.textContent = s.target;
        el.hidden = !s.target;
        s.shown = s.target;
        if (!s.target || !animate || reduce.matches) return;
        el.animate([{ opacity: 0, filter: 'blur(2px)' }, { opacity: 1, filter: 'blur(0)' }], { duration: 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
        delete el.dataset.flash;
        void el.offsetWidth;
        el.dataset.flash = '';
      }
      if (!animate || reduce.matches || !s.shown || !el.animate) { swapIn(); return; }
      if (s.fading) return; // the fade-out in flight will pick up the newest wording
      s.fading = true;
      var out = el.animate([{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(2px)' }], { duration: 90, easing: 'ease-out', fill: 'forwards' });
      out.onfinish = function () { s.fading = false; out.cancel(); swapIn(); };
    }
    function paint(animate) {
      place(puck, pos.x, pos.y);
      crossV.style.left = (pos.x * 100) + '%';
      crossH.style.top = ((1 - pos.y) * 100) + '%';
      var parts = compose(pos.x, pos.y);
      if (modelText == null) slots.forEach(function (s, i) { setSlot(s, parts[i], animate); });
      var all = modelText != null ? modelText : parts.filter(Boolean).join(' ');
      var wc = words(all);
      count.textContent = wc + ' words · ' + Math.max(5, Math.round(wc / 3.8 / 5) * 5) + ' s read';
      tone.textContent = describe(pos.x, pos.y);
      puck.setAttribute('aria-valuetext', describe(pos.x, pos.y) + ', ' + wc + ' words');
      backBtn.disabled = Math.abs(pos.x - original.x) < 0.005 && Math.abs(pos.y - original.y) < 0.005;
    }
    function paintPins() {
      pinBox.textContent = '';
      pins.forEach(function (p, i) {
        var b = node('button', 'tp-pin', String(i + 1));
        b.type = 'button';
        b.setAttribute('aria-label', 'Saved spot ' + (i + 1) + ': ' + describe(p.x, p.y));
        place(b, p.x, p.y);
        b.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        b.addEventListener('click', function () { glide(p.x, p.y); puck.focus({ preventScroll: true }); });
        pinBox.appendChild(b);
      });
      clearBtn.hidden = !pins.length;
      saveBtn.disabled = pins.length >= o.maxPins;
    }

    // ---------- model hook ----------
    var settleT = 0;
    function cancelModel() {
      clearTimeout(settleT);
      if (pending) { pending.abort(); pending = null; }
      busy.hidden = true;
      if (modelText != null) {
        modelText = null;
        // back to the local blend, whole text at once
        slots.forEach(function (s) { s.target = null; s.shown = null; });
        paras.__model && paras.__model.remove();
        delete paras.__model;
        Object.keys(paras).forEach(function (k) { if (k !== '__model') paras[k].hidden = false; });
      }
    }
    function settle() {
      if (o.onChange) o.onChange({ x: pos.x, y: pos.y, text: currentText() });
      if (!o.generate) return;
      clearTimeout(settleT);
      settleT = setTimeout(function () {
        var ctrl = pending = new AbortController();
        busy.hidden = false;
        var spot = { x: pos.x, y: pos.y };
        Promise.resolve(o.generate({ x: spot.x, y: spot.y, formality: 1 - spot.x, detail: spot.y, text: currentText(), signal: ctrl.signal }))
          .then(function (out) {
            if (ctrl.signal.aborted || typeof out !== 'string') return;
            pending = null;
            busy.hidden = true;
            modelText = out;
            Object.keys(paras).forEach(function (k) { paras[k].hidden = true; });
            var p = node('p');
            p.style.whiteSpace = 'pre-line';
            p.textContent = out;
            text.appendChild(p);
            paras.__model = p;
            if (!reduce.matches && p.animate) p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240 });
            paint(false);
            live.textContent = 'Model draft ready';
          })
          .catch(function () { if (!ctrl.signal.aborted) { pending = null; busy.hidden = true; } });
      }, 350);
    }
    function currentText() {
      if (modelText != null) return modelText;
      var blocks = [];
      Object.keys(paras).forEach(function (k) {
        var t = slots.filter(function (s) { return s.block === k && s.target; }).map(function (s) { return s.target; }).join(' ');
        if (t) blocks.push(t);
      });
      return blocks.join('\n\n');
    }

    // ---------- moving the puck ----------
    var raf = 0;
    function moveTo(x, y, quiet) {
      cancelModel();
      pos.x = clamp01(x);
      pos.y = clamp01(y);
      paint(!quiet);
    }
    function glide(x, y) {
      cancelModel();
      cancelAnimationFrame(raf);
      var fx = pos.x, fy = pos.y, t0 = performance.now(), dur = reduce.matches ? 0 : 420;
      function step(now) {
        var k = dur ? Math.min(1, (now - t0) / dur) : 1;
        var e = 1 - Math.pow(1 - k, 3);
        pos.x = fx + (x - fx) * e;
        pos.y = fy + (y - fy) * e;
        paint(true);
        if (k < 1) raf = requestAnimationFrame(step);
        else { raf = 0; settle(); }
      }
      raf = requestAnimationFrame(step);
    }
    function fromEvent(e) {
      var r = pad.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height };
    }
    var dragging = false;
    pad.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      e.preventDefault();
      cancelAnimationFrame(raf);
      pad.setPointerCapture(e.pointerId);
      dragging = true;
      pad.dataset.drag = '';
      puck.focus({ preventScroll: true });
      var p = fromEvent(e);
      moveTo(p.x, p.y);
    });
    pad.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var p = fromEvent(e);
      moveTo(p.x, p.y);
    });
    function end() {
      if (!dragging) return;
      dragging = false;
      delete pad.dataset.drag;
      live.textContent = describe(pos.x, pos.y);
      settle();
    }
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
    pad.addEventListener('dblclick', function () { glide(original.x, original.y); live.textContent = 'Back to the original'; });
    var keyT = 0;
    puck.addEventListener('keydown', function (e) {
      var d = e.shiftKey ? 0.2 : 0.05, x = pos.x, y = pos.y;
      if (e.key === 'ArrowLeft') x -= d;
      else if (e.key === 'ArrowRight') x += d;
      else if (e.key === 'ArrowUp') y += d;
      else if (e.key === 'ArrowDown') y -= d;
      else if (e.key === 'Home') { e.preventDefault(); glide(original.x, original.y); return; }
      else if (e.key === 's' || e.key === 'S') { e.preventDefault(); save(); return; }
      else return;
      e.preventDefault();
      moveTo(x, y);
      clearTimeout(keyT);
      keyT = setTimeout(settle, 250);
    });
    function save() {
      if (pins.length >= o.maxPins) return;
      pins.push({ x: pos.x, y: pos.y });
      paintPins();
      live.textContent = 'Saved spot ' + pins.length + ': ' + describe(pos.x, pos.y);
    }
    saveBtn.addEventListener('click', save);
    backBtn.addEventListener('click', function () { glide(original.x, original.y); });
    clearBtn.addEventListener('click', function () { pins = []; paintPins(); saveBtn.focus(); });

    place(origin, original.x, original.y);
    paint(false);
    paintPins();
    if (global.ResizeObserver) new ResizeObserver(drawMap).observe(pad); else drawMap();

    return {
      moveTo: function (x, y, quiet) { cancelAnimationFrame(raf); moveTo(x, y, quiet); },
      glide: glide,
      save: save,
      getText: currentText,
      getPosition: function () { return { x: pos.x, y: pos.y }; }
    };
  }

  global.TonePad = { create: create };
})(window);
