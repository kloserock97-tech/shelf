/* Streaming Generative Widget — GenUIWidget.create(root, options)
 * The model answers with a JSON description of a small interface: { title, children: [{ type, ...props }] }.
 * The text streams in chunks; after every chunk a tolerant parser reads the unfinished JSON (open strings, arrays and
 * objects are taken as they are, an unfinished number or key waits for the next chunk), and the widget catches up:
 * a block whose type is known shows a skeleton of its shape, and turns into the real control from the registry once
 * its required props have arrived. Finished controls work while the rest is still streaming.
 * Registry: text, slider, choice, stat, chart, button. Unknown types are skipped with a note.
 * options.compute(state, blocks) → values for stat and chart (blocks: latest props by id, state: control values by id).
 * options.onAction(name, state, computed) → text shown on the button after a click.
 * Methods: push(chunk), end(), cut(), reset(), play(text, { seed }), seek(fraction) — play streams a whole answer on timers. */
(function (global) {
  'use strict';

  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var SCOPED = typeof Element !== 'undefined' && typeof Element.prototype.startViewTransition === 'function';
  var S = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
  var ICON = {
    mark: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.2c.4 2.6 2.2 4.4 4.8 4.8C8.2 6.4 6.4 8.2 6 10.8 5.6 8.2 3.8 6.4 1.2 6 3.8 5.6 5.6 3.8 6 1.2z" fill="currentColor"/></svg>',
    replay: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.6 7a4.4 4.4 0 101.3-3.1M2.4 1.8v2.6H5" ' + S + ' stroke-width="1.5"/></svg>',
    cut: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3L3 11" ' + S + ' stroke-width="1.5"/></svg>',
    code: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M5 4L2 7l3 3M9 4l3 3-3 3" ' + S + ' stroke-width="1.5"/></svg>',
    check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.6 8.4l2.9 2.9 5.9-6.4" ' + S + ' stroke-width="2"/></svg>'
  };

  // ---------- seeded random numbers: Hash Kit (items/hash-kit) ----------
  var SALT = 0xb31c96c9;
  function hashU(x) {
    x ^= x >>> 16; x = Math.imul(x, 0x3f9c86cb);
    x ^= x >>> 14; x = Math.imul(x, 0x1ae9dacf);
    x ^= x >>> 15;
    return x >>> 0;
  }
  function makeRandom(seed) {
    var s = (seed == null ? 1 : seed) >>> 0;
    return function () { s = (s + SALT) >>> 0; return hashU(s) / 4294967296; };
  }

  // ---------- tolerant parser for an unfinished JSON text ----------
  // Returns what is readable so far. META tells, per object or array, whether it was closed and which key is still
  // being written (its value is a partial string, object or array).
  var META = new WeakMap();
  var NONE = {};
  var ESC = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' };
  var LIT = /^(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/;

  function parsePartial(src) {
    var i = 0, n = src.length;
    function ws() { while (i < n && (src[i] === ' ' || src[i] === '\n' || src[i] === '\r' || src[i] === '\t')) i++; }
    function value() {
      ws();
      if (i >= n) return NONE;
      var c = src[i];
      if (c === '{') return object();
      if (c === '[') return array();
      if (c === '"') return string();
      return literal();
    }
    function string() {
      i++;
      var out = '';
      while (i < n) {
        var c = src[i];
        if (c === '"') { i++; return { v: out, done: true }; }
        if (c === '\\') {
          if (i + 1 >= n) { i = n; break; }
          var e = src[i + 1];
          if (e === 'u') {
            if (i + 6 > n) { i = n; break; }
            out += String.fromCharCode(parseInt(src.substr(i + 2, 4), 16) || 0x3f);
            i += 6;
            continue;
          }
          out += ESC[e] || e;
          i += 2;
          continue;
        }
        out += c;
        i++;
      }
      return { v: out, done: false };
    }
    function literal() {
      var m = LIT.exec(src.slice(i, i + 32));
      if (!m || i + m[0].length >= n) { i = n; return NONE; } // unknown, or it may still grow: wait
      i += m[0].length;
      return { v: JSON.parse(m[0]), done: true };
    }
    function object() {
      i++;
      var o = {}, done = false, open = null;
      for (;;) {
        ws();
        if (i >= n) break;
        var c = src[i];
        if (c === '}') { i++; done = true; break; }
        if (c === ',') { i++; continue; }
        if (c !== '"') { i = n; break; }
        var k = string();
        if (!k.done) break;
        ws();
        if (i >= n) break;
        if (src[i] !== ':') { i = n; break; }
        i++;
        var v = value();
        if (v === NONE) break;
        o[k.v] = v.v;
        if (!v.done) { open = k.v; break; }
      }
      META.set(o, { done: done, open: open });
      return { v: o, done: done };
    }
    function array() {
      i++;
      var a = [], done = false, open = false;
      for (;;) {
        ws();
        if (i >= n) break;
        var c = src[i];
        if (c === ']') { i++; done = true; break; }
        if (c === ',') { i++; continue; }
        var v = value();
        if (v === NONE) break;
        a.push(v.v);
        if (!v.done) { open = true; break; }
      }
      META.set(a, { done: done, open: open });
      return { v: a, done: done };
    }
    var r = value();
    return r === NONE ? null : r.v;
  }
  function closed(v) { var m = v && META.get(v); return !!(m && m.done); }
  // a prop is settled when it's there and nothing more is being written into it
  function has(o, key) { var m = META.get(o); return o[key] !== undefined && !(m && m.open === key && !m.done); }
  function num(x) { return typeof x === 'number' && isFinite(x); }

  function node(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function bars(rows) { var d = node('div', 'gw-skel'); d.setAttribute('aria-hidden', 'true'); d.innerHTML = rows; return d; }
  function sk(w, h, extra) { return '<i class="gw-sk" style="width:' + w + ';height:' + (h || 12) + 'px' + (extra ? ';' + extra : '') + '"></i>'; }
  var gid = 0;

  // ---------- the registry: six components the model can ask for ----------
  var REGISTRY = {
    text: {
      skeleton: function () { return bars(sk('94%') + sk('62%')); },
      ready: function (p) { return typeof p.text === 'string' && p.text.length > 0; },
      mount: function () {
        var el = node('p', 'gw-text');
        return { el: el, update: function (p) { if (el.textContent !== p.text) el.textContent = p.text; } };
      }
    },

    slider: {
      skeleton: function () { return bars('<div class="gw-skrow">' + sk('34%', 11) + sk('22%', 13) + '</div>' + sk('100%', 6, 'margin-top:6px')); },
      ready: function (p) { return has(p, 'label') && num(p.min) && num(p.max) && num(p.value); },
      mount: function (p, ctx) {
        var id = 'gw' + (++gid);
        var el = node('div', 'gw-field');
        var row = node('div', 'gw-lrow');
        var lab = node('label', 'gw-label');
        lab.htmlFor = id;
        var out = node('output', 'gw-out');
        out.htmlFor = id;
        row.appendChild(lab);
        row.appendChild(out);
        var input = node('input', 'gw-range');
        input.type = 'range';
        input.id = id;
        var ends = node('div', 'gw-ends');
        ends.setAttribute('aria-hidden', 'true');
        var lo = node('span'), hi = node('span');
        ends.appendChild(lo);
        ends.appendChild(hi);
        el.appendChild(row);
        el.appendChild(input);
        el.appendChild(ends);
        var cur = p;
        function fmt(v) { return (cur.prefix || '') + Number(v).toLocaleString('en-GB') + (cur.suffix || ''); }
        function paint() {
          var v = Number(input.value), a = Number(input.min), b = Number(input.max);
          input.style.setProperty('--p', ((v - a) / (b - a || 1) * 100).toFixed(1) + '%');
          out.textContent = fmt(v);
          input.setAttribute('aria-valuetext', fmt(v) + (ctx.say ? ctx.say(cur.id) : ''));
        }
        input.addEventListener('input', function () { ctx.set(cur.id, Number(input.value)); paint(); });
        return {
          el: el,
          update: function (q) {
            cur = q;
            lab.textContent = q.label;
            if (num(q.step)) input.step = q.step;
            input.min = q.min;
            input.max = q.max;
            lo.textContent = (q.prefix || '') + q.min.toLocaleString('en-GB');
            hi.textContent = (q.prefix || '') + q.max.toLocaleString('en-GB');
            if (!ctx.touched(q.id)) { input.value = q.value; ctx.init(q.id, Number(input.value)); }
            paint();
          },
          refresh: paint
        };
      }
    },

    choice: {
      skeleton: function () { return bars(sk('26%', 11) + '<div class="gw-skpills">' + sk('100%', 44) + sk('100%', 44) + sk('100%', 44) + '</div>'); },
      ready: function (p) { return has(p, 'label') && Array.isArray(p.options) && p.options.some(function (o) { return o && closed(o); }); },
      mount: function (p, ctx) {
        var name = 'gw' + (++gid);
        var el = node('fieldset', 'gw-choice');
        var legend = node('legend');
        el.appendChild(legend);
        var made = {};
        var cur = p;
        function pick(v) { [].forEach.call(el.querySelectorAll('input'), function (r) { r.checked = r.value === v; }); }
        return {
          el: el,
          update: function (q) {
            cur = q;
            legend.textContent = q.label;
            (q.options || []).forEach(function (o) {
              if (!o || !closed(o) || o.value == null || made[o.value]) return;
              var lab = node('label', 'gw-opt');
              var r = node('input');
              r.type = 'radio';
              r.name = name;
              r.value = o.value;
              r.addEventListener('change', function () { if (r.checked) ctx.set(cur.id, o.value); });
              lab.appendChild(r);
              lab.appendChild(node('b', null, o.label || String(o.value)));
              if (o.hint) lab.appendChild(node('span', null, o.hint));
              el.appendChild(lab);
              made[o.value] = true;
            });
            if (!ctx.touched(q.id)) {
              var v = q.value != null && made[q.value] ? q.value : ctx.get(q.id) != null && made[ctx.get(q.id)] ? ctx.get(q.id) : Object.keys(made)[0];
              if (v != null && ctx.get(q.id) !== v) ctx.init(q.id, v);
              pick(ctx.get(q.id));
            }
          }
        };
      }
    },

    stat: {
      skeleton: function () { return bars('<div class="gw-skrow" style="padding:12px 14px;border-radius:12px;background:var(--gw-card)">' + sk('30%', 11, 'align-self:center') + sk('34%', 22) + '</div>'); },
      ready: function (p) { return has(p, 'label') && has(p, 'value'); },
      mount: function (p, ctx) {
        var el = node('div', 'gw-stat');
        var lab = node('span', 'gw-label');
        var val = node('span', 'gw-sval');
        var note = node('span', 'gw-snote');
        el.appendChild(lab);
        el.appendChild(val);
        el.appendChild(note);
        var cur = p;
        function paint() {
          var c = ctx.computed();
          val.textContent = c[cur.value] != null ? c[cur.value] : '—';
          note.textContent = c[cur.value + 'Note'] || cur.note || '';
        }
        return { el: el, update: function (q) { cur = q; lab.textContent = q.label; paint(); }, refresh: paint };
      }
    },

    chart: {
      skeleton: function () {
        var h = '';
        for (var k = 0; k < 14; k++) h += sk('auto', 18 + k * 5, 'flex:1');
        return bars(sk('32%', 11) + '<div class="gw-skbars">' + h + '</div>');
      },
      ready: function (p) { return has(p, 'label') && has(p, 'data'); },
      mount: function (p, ctx) {
        var W = 300, H = 112, T = 14, B = 16, inner = H - T - B;
        var el = node('figure', 'gw-chart');
        el.style.margin = '0';
        var cap = node('figcaption', 'gw-label');
        var svgNS = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
        svg.setAttribute('role', 'img');
        var gBars = document.createElementNS(svgNS, 'g');
        var goal = document.createElementNS(svgNS, 'g');
        goal.setAttribute('class', 'gw-goal');
        var gl = document.createElementNS(svgNS, 'line');
        gl.setAttribute('x1', 0); gl.setAttribute('x2', W); gl.setAttribute('y1', 0); gl.setAttribute('y2', 0);
        var gt = document.createElementNS(svgNS, 'text');
        gt.setAttribute('x', W); gt.setAttribute('y', -4); gt.setAttribute('text-anchor', 'end');
        goal.appendChild(gl);
        goal.appendChild(gt);
        var ax0 = document.createElementNS(svgNS, 'text');
        var ax1 = document.createElementNS(svgNS, 'text');
        ax0.setAttribute('class', 'gw-axis'); ax1.setAttribute('class', 'gw-axis');
        ax0.setAttribute('x', 0); ax0.setAttribute('y', H - 3);
        ax1.setAttribute('x', W); ax1.setAttribute('y', H - 3); ax1.setAttribute('text-anchor', 'end');
        svg.appendChild(gBars);
        svg.appendChild(goal);
        svg.appendChild(ax0);
        svg.appendChild(ax1);
        el.appendChild(cap);
        el.appendChild(svg);
        var rects = [];
        var cur = p;
        function paint() {
          var d = ctx.computed()[cur.data];
          if (!d || !d.values || !d.values.length) return;
          var vals = d.values, goalV = num(cur.goal) ? cur.goal : d.goal || 0;
          var max = Math.max(goalV * 1.18, Math.max.apply(null, vals)) || 1;
          var bw = W / vals.length;
          while (rects.length < vals.length) {
            var r = document.createElementNS(svgNS, 'rect');
            r.setAttribute('class', 'gw-bar');
            r.setAttribute('rx', 1.5);
            gBars.appendChild(r);
            rects.push(r);
          }
          var eta = -1;
          vals.forEach(function (v, k) {
            var r = rects[k];
            r.setAttribute('x', (k * bw + bw * 0.14).toFixed(2));
            r.setAttribute('width', (bw * 0.72).toFixed(2));
            r.setAttribute('y', T);
            r.setAttribute('height', inner);
            r.style.transform = 'scaleY(' + Math.max(0.01, v / max).toFixed(4) + ')';
            var hit = goalV && v >= goalV;
            if (hit && eta < 0) eta = k;
            if (hit) r.dataset.hit = ''; else delete r.dataset.hit;
            if (k === eta) r.dataset.eta = ''; else delete r.dataset.eta;
          });
          goal.style.transform = 'translateY(' + (T + inner * (1 - goalV / max)).toFixed(2) + 'px)';
          goal.style.display = goalV ? '' : 'none';
          gt.textContent = (cur.prefix || '') + goalV.toLocaleString('en-GB') + ' goal';
          ax0.textContent = d.labels ? d.labels[0] : '';
          ax1.textContent = d.labels ? d.labels[d.labels.length - 1] : '';
          svg.setAttribute('aria-label', cur.label + ': ' + (eta >= 0 ? 'reaches ' + gt.textContent.replace(' goal', '') + ' in ' + (d.labels ? d.labels[eta] : 'month ' + (eta + 1)) : 'stays under the goal') + ', ' + (cur.prefix || '') + vals[vals.length - 1].toLocaleString('en-GB') + ' at the end');
        }
        return { el: el, update: function (q) { cur = q; cap.textContent = q.label; paint(); }, refresh: paint };
      }
    },

    button: {
      skeleton: function () { return bars(sk('100%', 40, 'border-radius:999px')); },
      ready: function (p) { return has(p, 'label'); },
      mount: function (p, ctx) {
        var b = node('button', 'gw-go');
        b.type = 'button';
        var cur = p;
        var done = false;
        b.addEventListener('click', function () {
          if (done) return;
          var msg = ctx.action(cur.action || cur.id || 'action');
          if (!msg) return;
          done = true;
          b.dataset.done = '';
          b.setAttribute('aria-disabled', 'true');
          b.innerHTML = ICON.check;
          b.appendChild(document.createTextNode(msg));
        });
        return { el: b, update: function (q) { cur = q; if (!done) b.textContent = q.label; } };
      }
    }
  };

  function create(root, options) {
    var o = Object.assign({ compute: null, onAction: null, controls: true, registry: null, label: 'Assistant' }, options || {});
    var REG = Object.assign({}, REGISTRY, o.registry || {});
    var buf = '';
    var state = 'idle';          // idle · streaming · done · cut
    var slots = [];              // one per child: { el, type, stage, inst, props }
    var values = {}, touched = {}, blocks = {}, computedV = {};
    var timer = 0, rq = 0;
    var full = null, pos = 0, rand = null;
    var still = false;

    root.classList.add('gw');
    root.textContent = '';

    var head = node('div', 'gw-head');
    var mark = node('span', 'gw-mark');
    mark.innerHTML = ICON.mark;
    mark.setAttribute('aria-hidden', 'true');
    var stateEl = node('span', 'gw-state');
    head.appendChild(mark);
    head.appendChild(node('span', 'gw-who', o.label));
    head.appendChild(stateEl);
    root.appendChild(head);

    var surface = node('div', 'gw-surface');
    surface.setAttribute('role', 'group');
    var title = node('h3', 'gw-title');
    title.id = 'gwt' + (++gid);
    surface.setAttribute('aria-labelledby', title.id);
    surface.appendChild(title);
    var more = node('div', 'gw-slot gw-more');
    more.appendChild(bars(sk('100%', 40)));
    surface.appendChild(more);
    root.appendChild(surface);

    var foot = node('div', 'gw-foot');
    var meta = node('span', 'gw-meta');
    var bSrc = node('button', 'gw-btn');
    bSrc.type = 'button';
    bSrc.innerHTML = ICON.code;
    bSrc.appendChild(document.createTextNode('JSON'));
    bSrc.setAttribute('aria-pressed', 'false');
    var bCut = node('button', 'gw-btn');
    bCut.type = 'button';
    bCut.innerHTML = ICON.cut;
    bCut.appendChild(document.createTextNode('Cut stream'));
    var bReplay = node('button', 'gw-btn');
    bReplay.type = 'button';
    bReplay.innerHTML = ICON.replay;
    bReplay.appendChild(document.createTextNode('Replay'));
    foot.appendChild(meta);
    foot.appendChild(bSrc);
    if (o.controls) { foot.appendChild(bCut); foot.appendChild(bReplay); }
    root.appendChild(foot);
    var src = node('pre', 'gw-src');
    src.hidden = true;
    bSrc.setAttribute('aria-controls', src.id = 'gws' + gid);
    root.appendChild(src);
    var live = node('div', 'gw-sr');
    live.setAttribute('aria-live', 'polite');
    root.appendChild(live);
    function say(t) { live.textContent = ''; setTimeout(function () { live.textContent = t; }, 30); }

    bSrc.addEventListener('click', function () {
      src.hidden = !src.hidden;
      bSrc.setAttribute('aria-pressed', String(!src.hidden));
      paintSource();
    });
    bCut.addEventListener('click', function () { cut(); });
    bReplay.addEventListener('click', function () { if (full != null) play(full, { seed: (Date.now() & 0xffff) }); });

    // ---------- shared state the controls write and stat/chart read ----------
    var ctx = {
      get: function (id) { return values[id]; },
      init: function (id, v) { values[id] = v; recompute(); },
      set: function (id, v) { values[id] = v; touched[id] = true; recompute(); },
      touched: function (id) { return !!touched[id]; },
      computed: function () { return computedV; },
      action: function (name) { return o.onAction ? o.onAction(name, Object.assign({}, values), computedV) : null; },
      say: function () { var c = computedV; return c.hint ? ', ' + c.hint : ''; }
    };
    var refreshing = false;
    function recompute() {
      computedV = o.compute ? (o.compute(Object.assign({}, values), blocks) || {}) : {};
      if (refreshing) return;
      refreshing = true;
      slots.forEach(function (s) { if (s.inst && s.inst.refresh) s.inst.refresh(); });
      refreshing = false;
    }

    // ---------- reconcile the parsed tree with the widget ----------
    function render() {
      var tree = parsePartial(buf);
      var streaming = state === 'streaming';
      if (tree && typeof tree === 'object' && !Array.isArray(tree)) {
        if (typeof tree.title === 'string') {
          if (title.textContent !== tree.title) title.textContent = tree.title;
          if (has(tree, 'title')) delete title.dataset.partial; else title.dataset.partial = '';
        }
        var list = Array.isArray(tree.children) ? tree.children : [];
        list.forEach(function (p, k) { if (p && typeof p === 'object') renderChild(p, k); });
        var lastLive = !slots.length || slots[slots.length - 1].stage === 'live' || slots[slots.length - 1].stage === 'unknown';
        more.hidden = !(streaming && !closed(tree.children) && lastLive);
      } else more.hidden = !streaming;
      paintMeta();
      paintSource();
    }
    function renderChild(p, k) {
      var s = slots[k];
      if (!s) {
        s = { el: node('div', 'gw-slot'), type: null, stage: 'wait', inst: null, props: p };
        s.el.dataset.stage = 'wait';
        s.el.appendChild(bars(sk('100%', 40)));
        surface.insertBefore(s.el, more);
        slots[k] = s;
      }
      s.props = p;
      if (closed(p)) delete s.el.dataset.partial; else s.el.dataset.partial = '';
      if (!has(p, 'type')) return;
      if (p.id != null) blocks[p.id] = p;
      var R = REG[p.type];
      if (s.type !== p.type) {
        s.type = p.type;
        s.el.dataset.type = p.type;
        s.el.textContent = '';
        if (!R) { s.stage = 'unknown'; s.el.appendChild(node('p', 'gw-unknown', 'Skipped a “' + p.type + '” block: there is no such component here.')); }
        else { s.stage = 'skeleton'; s.el.appendChild(R.skeleton()); }
        s.el.dataset.stage = s.stage;
      }
      if (!R) return;
      if (s.stage === 'skeleton' && R.ready(p, closed(p))) upgrade(s, R, p);
      else if (s.stage === 'live') { s.inst.update(p, closed(p)); if (p.id != null) recompute(); }
    }
    function upgrade(s, R, p) {
      var inst = R.mount(p, ctx);
      s.inst = inst;
      s.stage = 'live';
      var badge = node('span', 'gw-cut', 'cut off');
      badge.setAttribute('aria-hidden', 'true');
      var swap = function () {
        s.el.textContent = '';
        inst.el.classList.add('gw-live');
        s.el.appendChild(inst.el);
        s.el.appendChild(badge);
        s.el.dataset.stage = 'live';
      };
      inst.update(p, closed(p));
      // the skeleton morphs into the control inside its own slot; the rest of the widget stays live
      if (SCOPED && !still && !reduce.matches) {
        try { s.el.startViewTransition(swap); } catch (e) { swap(); }
      } else swap();
      recompute();
    }

    function paintMeta() {
      var kb = (new Blob([buf]).size / 1024).toFixed(1) + ' kB';
      var live = slots.filter(function (s) { return s.stage === 'live'; }).length;
      var pct = full ? Math.round(Math.min(1, pos / full.length) * 100) : null;
      var st;
      if (state === 'streaming') st = 'Streaming' + (pct != null ? ' · ' + pct + '%' : '');
      else if (state === 'done') st = 'Done';
      else if (state === 'cut') st = 'Cut off' + (pct != null ? ' at ' + pct + '%' : '');
      else st = 'Waiting';
      if (stateEl.textContent !== st) stateEl.textContent = st;
      var missing = slots.filter(function (s) { return s.stage === 'missing'; }).length;
      meta.textContent = kb + ' · ' + live + (live === 1 ? ' block' : ' blocks') + (missing ? ', ' + missing + ' missing' : '');
      root.dataset.state = state;
      surface.setAttribute('aria-busy', String(state === 'streaming'));
      bCut.disabled = state !== 'streaming';
      bReplay.disabled = full == null || state === 'streaming' && !still;
    }
    function paintSource() {
      if (src.hidden) return;
      if (src.textContent.length !== buf.length) {
        src.textContent = buf;
        src.scrollTop = src.scrollHeight;
      }
    }

    function schedule() {
      if (still) { render(); return; }
      if (!rq) rq = requestAnimationFrame(function () { rq = 0; render(); });
    }
    function finalize() {
      if (rq) { cancelAnimationFrame(rq); rq = 0; }
      render();
      slots.forEach(function (s) {
        if (s.stage === 'wait' || s.stage === 'skeleton') {
          s.stage = 'missing';
          s.el.dataset.stage = 'missing';
          s.el.textContent = (s.type ? 'The ' + s.type : 'This block') + ' didn’t arrive.';
        }
      });
      more.hidden = true;
      paintMeta();
    }

    // ---------- the stream ----------
    function push(chunk) {
      if (state === 'done' || state === 'cut') return;
      state = 'streaming';
      buf += chunk;
      schedule();
    }
    function end() {
      clearTimeout(timer);
      if (state !== 'streaming' && state !== 'idle') return;
      state = 'done';
      finalize();
      var live = slots.filter(function (s) { return s.stage === 'live'; }).length;
      say('Widget ready: ' + live + ' blocks.');
    }
    function cut() {
      if (state !== 'streaming') return;
      clearTimeout(timer);
      state = 'cut';
      finalize();
      var live = slots.filter(function (s) { return s.stage === 'live'; }).length;
      var missing = slots.filter(function (s) { return s.stage === 'missing'; }).length;
      say('Stream cut. ' + live + ' blocks work' + (missing ? ', ' + missing + ' didn’t arrive.' : '.'));
    }
    function reset() {
      clearTimeout(timer);
      if (rq) cancelAnimationFrame(rq);
      rq = 0;
      buf = '';
      state = 'idle';
      pos = 0;
      slots.forEach(function (s) { s.el.remove(); });
      slots = [];
      values = {}; touched = {}; blocks = {}; computedV = {};
      title.textContent = '';
      delete title.dataset.partial;
      more.hidden = false;
      paintMeta();
      paintSource();
    }
    // a scripted model: the same answer in uneven chunks with short stalls
    function play(text, opts) {
      reset();
      full = text;
      rand = makeRandom((opts && opts.seed) || 7);
      state = 'streaming';
      paintMeta();
      timer = setTimeout(next, 260);
      say('Answer streaming.');
    }
    function next() {
      if (state !== 'streaming') return;
      if (pos >= full.length) { end(); return; }
      var size = 4 + Math.floor(rand() * 19);
      push(full.slice(pos, pos + size));
      pos += size;
      var delay = 24 + rand() * 40 + (rand() < 0.05 ? 360 : 0);
      timer = setTimeout(next, delay);
    }
    // jump to a point of the stream and hold there (stills and tests)
    function seek(fraction) {
      if (full == null) return;
      clearTimeout(timer);
      reset();
      still = true;
      state = 'streaming';
      pos = Math.round(full.length * Math.max(0, Math.min(1, fraction)));
      buf = full.slice(0, pos);
      render();
      still = false;
      if (pos >= full.length) end();
    }

    reset();
    return {
      push: push, end: end, cut: cut, reset: reset, play: play, seek: seek,
      setSource: function (text) { full = text; paintMeta(); },
      getState: function () { return { state: state, values: Object.assign({}, values), computed: computedV, bytes: buf.length }; }
    };
  }

  global.GenUIWidget = { create: create, registry: REGISTRY, parsePartial: parsePartial };
})(window);
