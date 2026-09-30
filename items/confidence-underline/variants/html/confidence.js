/* Confidence Underline — ConfidenceText.create(root, spans, options)
 * spans: [{ text, p, alts: [{ text, p } | "text"], source: { label, quote } }], p is 0..1.
 * Phrases below `threshold` get a dotted underline: the lower p, the denser, bigger and warmer the dots.
 * Hover, tap or focus one to see other readings and the source; one click swaps the wording. */
(function (global) {
  'use strict';

  var DEFAULTS = {
    threshold: 0.85,   // at or above this the phrase reads as plain text
    floor: 0.25,       // at or below this the underline is at full strength
    heat: false,       // start in heat-map mode
    toolbar: true,
    onChange: null,    // (spans) => void, after a swap or a check
    labels: {
      sure: 'sure',
      readings: 'Readings',
      source: 'Source',
      check: 'Mark as checked',
      checked: 'Checked · Undo',
      map: 'Certainty map',
      sureKey: 'Sure',
      unsureKey: 'Unsure',
      left: function (n) { return n === 0 ? 'Nothing left to check' : n + (n === 1 ? ' phrase' : ' phrases') + ' to check'; }
    }
  };
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  var CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.4l3 3 6-6.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function pct(p) { return Math.round(p * 100) + '%'; }
  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function create(root, input, options) {
    var o = Object.assign({}, DEFAULTS, options || {});
    o.labels = Object.assign({}, DEFAULTS.labels, (options && options.labels) || {});
    var uid = 'cu' + Math.round(performance.now() * 1000 % 1e6).toString(36);

    var spans = input.map(function (s, i) {
      var p = s.p == null ? 1 : s.p;
      return {
        i: i,
        text: s.text,
        p: p,
        alts: (s.alts || []).map(function (a) { return typeof a === 'string' ? { text: a, p: null } : { text: a.text, p: a.p == null ? null : a.p }; }),
        source: s.source || null,
        checked: false,
        flagged: p < o.threshold
      };
    });

    function doubtOf(s) { return s.checked ? 0 : clamp01((o.threshold - s.p) / (o.threshold - o.floor)); }
    function heatOf(s) { return s.checked ? 0 : clamp01((0.97 - s.p) / 0.72); }

    root.classList.add('cu');
    root.dataset.heat = String(!!o.heat);
    root.textContent = '';

    // ---- text
    var text = node('p', 'cu-text');
    var els = spans.map(function (s) {
      var e = node('span', 'cu-s', s.text);
      e.style.setProperty('--cu-i', s.i);
      if (s.flagged) {
        e.classList.add('cu-doubt');
        e.tabIndex = 0;
        e.setAttribute('role', 'button');
        e.setAttribute('aria-haspopup', 'dialog');
        e.setAttribute('aria-expanded', 'false');
        e.setAttribute('aria-controls', uid + '-pop');
      }
      e.dataset.i = s.i;
      text.appendChild(e);
      return e;
    });
    root.appendChild(text);

    // ---- toolbar
    var sw, count;
    if (o.toolbar) {
      var bar = node('div', 'cu-bar');
      sw = node('button', 'cu-switch');
      sw.type = 'button';
      sw.setAttribute('role', 'switch');
      sw.setAttribute('aria-checked', String(!!o.heat));
      sw.appendChild(node('span', 'cu-track'));
      sw.appendChild(node('span', null, o.labels.map));
      sw.addEventListener('click', function () { setHeat(root.dataset.heat !== 'true'); });
      var key = node('span', 'cu-key');
      key.setAttribute('aria-hidden', 'true');
      key.appendChild(node('span', null, o.labels.sureKey));
      [0.08, 0.35, 0.65, 1].forEach(function (d) {
        var i = node('i');
        i.style.setProperty('--cu-d', d);
        i.style.setProperty('--cu-h', Math.max(0.12, d));
        key.appendChild(i);
      });
      key.appendChild(node('span', null, o.labels.unsureKey));
      count = node('span', 'cu-count');
      bar.appendChild(sw);
      bar.appendChild(key);
      bar.appendChild(count);
      root.appendChild(bar);
    }

    // ---- popover
    var pop = node('div', 'cu-pop');
    pop.id = uid + '-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Phrase details');
    root.appendChild(pop);
    var live = node('div', 'cu-sr');
    live.setAttribute('aria-live', 'polite');
    root.appendChild(live);

    function paint(s) {
      var e = els[s.i];
      var d = doubtOf(s);
      e.style.setProperty('--cu-d', d.toFixed(3));
      e.style.setProperty('--cu-h', heatOf(s).toFixed(3));
      if (d === 0) e.dataset.sure = ''; else delete e.dataset.sure;
      if (s.flagged) {
        e.setAttribute('aria-label', s.text + ', ' + (s.checked ? 'checked' : pct(s.p) + ' ' + o.labels.sure) +
          (s.alts.length ? ', ' + s.alts.length + ' other ' + (s.alts.length === 1 ? 'reading' : 'readings') : ''));
      }
    }
    function paintCount() {
      if (!count) return;
      var left = spans.filter(function (s) { return s.flagged && !s.checked && s.p < o.threshold; });
      var low = left.reduce(function (m, s) { return Math.min(m, s.p); }, 1);
      count.textContent = o.labels.left(left.length) + (left.length ? ' · lowest ' + pct(low) : '');
    }
    spans.forEach(paint);
    paintCount();

    // ---- popover content and placement
    var openIdx = -1;
    var pinned = false;
    var tOpen = 0, tClose = 0, lastClose = 0;
    var quiet = false; // focus handed back by Esc must not reopen the popover

    function renderPop(s) {
      pop.textContent = '';
      var d = doubtOf(s);
      var head = node('div', 'cu-head');
      head.appendChild(node('span', 'cu-pct', s.checked ? '—' : pct(s.p)));
      head.appendChild(node('span', 'cu-pct-note', s.checked ? 'You checked this phrase' : o.labels.sure));
      pop.appendChild(head);
      var meter = node('div', 'cu-meter');
      var fill = node('b');
      fill.style.width = (s.checked ? 100 : Math.round(s.p * 100)) + '%';
      fill.style.setProperty('--cu-d', d.toFixed(3));
      meter.appendChild(fill);
      pop.appendChild(meter);

      if (s.alts.length) {
        pop.appendChild(node('p', 'cu-sec', o.labels.readings));
        var list = node('ul', 'cu-opts');
        var all = [{ text: s.text, p: s.p, current: true }].concat(s.alts.map(function (a, k) { return { text: a.text, p: a.p, k: k }; }));
        all.sort(function (a, b) { return (b.p == null ? -1 : b.p) - (a.p == null ? -1 : a.p); });
        all.forEach(function (a) {
          var li = node('li');
          var b = node('button', 'cu-opt');
          b.type = 'button';
          b.innerHTML = CHECK;
          b.appendChild(node('span', 'cu-opt-t', a.text));
          b.appendChild(node('span', 'cu-opt-p', a.p == null ? '' : pct(a.p)));
          if (a.current) b.setAttribute('aria-current', 'true');
          else b.addEventListener('click', function () { swap(s, a.k); });
          li.appendChild(b);
          list.appendChild(li);
        });
        pop.appendChild(list);
      }

      if (s.source) {
        var fig = node('figure', 'cu-src');
        fig.appendChild(node('figcaption', null, s.source.label || o.labels.source));
        var q = node('blockquote');
        var quote = s.source.quote || '';
        var at = quote.toLowerCase().indexOf(s.text.toLowerCase());
        if (at >= 0 && s.text.length > 2) {
          q.appendChild(document.createTextNode(quote.slice(0, at)));
          q.appendChild(node('mark', null, quote.slice(at, at + s.text.length)));
          q.appendChild(document.createTextNode(quote.slice(at + s.text.length)));
        } else q.textContent = quote;
        fig.appendChild(q);
        pop.appendChild(fig);
      }

      var foot = node('div', 'cu-foot');
      var ok = node('button', 'cu-link', s.checked ? o.labels.checked : o.labels.check);
      ok.type = 'button';
      ok.addEventListener('click', function () { toggleCheck(s); });
      foot.appendChild(ok);
      if (finePointer.matches) foot.appendChild(node('span', 'cu-hint', 'Esc to close'));
      pop.appendChild(foot);
    }

    function place(e, pointY) {
      var rects = e.getClientRects();
      var r = rects[0];
      if (pointY != null) for (var k = 0; k < rects.length; k++) if (pointY >= rects[k].top && pointY <= rects[k].bottom) r = rects[k];
      var host = root.getBoundingClientRect();
      var pw = pop.offsetWidth, ph = pop.offsetHeight;
      var x = r.left + r.width / 2 - host.left - pw / 2;
      x = Math.max(0, Math.min(host.width - pw, x));
      var roomBelow = innerHeight - r.bottom;
      var up = roomBelow < ph + 16 && r.top > ph + 16;
      var y = up ? r.top - host.top - ph - 8 : r.bottom - host.top + 8;
      pop.style.left = Math.round(x) + 'px';
      pop.style.top = Math.round(y) + 'px';
      pop.dataset.side = up ? 'top' : 'bottom';
    }

    function open(i, pointY) {
      clearTimeout(tOpen); clearTimeout(tClose);
      var wasOpen = openIdx >= 0;
      if (wasOpen && openIdx !== i) els[openIdx].setAttribute('aria-expanded', 'false');
      openIdx = i;
      renderPop(spans[i]);
      els[i].setAttribute('aria-expanded', 'true');
      // a second popover within 600 ms appears in place, without motion
      if (wasOpen || performance.now() - lastClose < 600 || reduce.matches) pop.dataset.instant = '';
      else delete pop.dataset.instant;
      place(els[i], pointY);
      pop.dataset.open = '';
    }
    function close(focusBack) {
      clearTimeout(tOpen); clearTimeout(tClose);
      if (openIdx < 0) return;
      var e = els[openIdx];
      e.setAttribute('aria-expanded', 'false');
      delete pop.dataset.instant;
      delete pop.dataset.open;
      openIdx = -1;
      pinned = false;
      lastClose = performance.now();
      if (focusBack) { quiet = true; e.focus({ preventScroll: true }); quiet = false; }
    }

    function swapText(e, next) {
      if (reduce.matches || !e.animate) { e.textContent = next; return; }
      var out = e.animate([{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(2px)' }], { duration: 110, easing: 'ease-out' });
      out.onfinish = function () {
        e.textContent = next;
        e.animate([{ opacity: 0, filter: 'blur(2px)', transform: 'translateY(2px)' }, { opacity: 1, filter: 'blur(0)', transform: 'none' }],
          { duration: 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
      };
    }

    function swap(s, k) {
      var alt = s.alts[k];
      var old = { text: s.text, p: s.p };
      s.text = alt.text;
      if (alt.p != null) s.p = alt.p;
      s.alts.splice(k, 1, old);
      s.checked = false;
      var hadFocus = pop.contains(document.activeElement);
      swapText(els[s.i], s.text);
      paint(s);
      paintCount();
      renderPop(s);
      var cur = pop.querySelector('.cu-opt[aria-current]');
      if (hadFocus && cur) cur.focus({ preventScroll: true });
      requestAnimationFrame(function () { if (openIdx === s.i) place(els[s.i]); });
      live.textContent = 'Replaced with “' + s.text + '”';
      if (o.onChange) o.onChange(snapshot());
    }
    function toggleCheck(s) {
      s.checked = !s.checked;
      var hadFocus = pop.contains(document.activeElement);
      paint(s);
      paintCount();
      renderPop(s);
      var btn = pop.querySelector('.cu-link');
      if (hadFocus && btn) btn.focus({ preventScroll: true });
      live.textContent = s.checked ? 'Marked “' + s.text + '” as checked' : 'Unchecked';
      if (o.onChange) o.onChange(snapshot());
    }

    function setHeat(on) {
      root.dataset.heat = String(!!on);
      if (sw) sw.setAttribute('aria-checked', String(!!on));
    }
    function snapshot() {
      return spans.map(function (s) { return { text: s.text, p: s.p, checked: s.checked, alts: s.alts.slice(), source: s.source }; });
    }

    // ---- events
    function spanOf(t) { var e = t && t.closest ? t.closest('.cu-doubt') : null; return e && text.contains(e) ? e : null; }

    text.addEventListener('pointerover', function (ev) {
      if (ev.pointerType !== 'mouse' || pinned) return;
      var e = spanOf(ev.target);
      if (!e) return;
      clearTimeout(tClose);
      var i = +e.dataset.i;
      if (openIdx === i) return;
      var quick = openIdx >= 0 || performance.now() - lastClose < 600;
      clearTimeout(tOpen);
      var y = ev.clientY;
      tOpen = setTimeout(function () { open(i, y); }, quick ? 0 : 120);
    });
    text.addEventListener('pointerout', function (ev) {
      if (ev.pointerType !== 'mouse' || pinned) return;
      var e = spanOf(ev.target);
      if (!e || e.contains(ev.relatedTarget) || pop.contains(ev.relatedTarget)) return;
      clearTimeout(tOpen);
      tClose = setTimeout(function () { close(false); }, 200);
    });
    pop.addEventListener('pointerenter', function () { clearTimeout(tClose); });
    pop.addEventListener('pointerdown', function () { pinned = true; clearTimeout(tClose); });
    pop.addEventListener('pointerleave', function (ev) {
      if (ev.pointerType !== 'mouse' || pinned) return;
      if (openIdx >= 0 && els[openIdx].contains(ev.relatedTarget)) return;
      tClose = setTimeout(function () { close(false); }, 200);
    });
    text.addEventListener('click', function (ev) {
      var e = spanOf(ev.target);
      if (!e) return;
      var i = +e.dataset.i;
      if (openIdx === i && pinned) { close(false); return; }
      open(i, ev.clientY);
      pinned = true; // a click keeps it open until Esc, a click outside or another phrase
    });
    text.addEventListener('focusin', function (ev) {
      var e = spanOf(ev.target);
      if (e && !quiet && e.matches(':focus-visible') && openIdx !== +e.dataset.i) open(+e.dataset.i);
    });
    text.addEventListener('keydown', function (ev) {
      var e = spanOf(ev.target);
      if (!e) return;
      var i = +e.dataset.i;
      if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'ArrowDown') {
        ev.preventDefault();
        if (openIdx !== i) open(i);
        pinned = true;
        var first = pop.querySelector('.cu-opt:not([aria-current])') || pop.querySelector('button');
        if (first) first.focus({ preventScroll: true });
      } else if (ev.key === 'Escape' && openIdx >= 0) {
        ev.preventDefault();
        close(false);
      }
    });
    pop.addEventListener('keydown', function (ev) {
      var btns = Array.prototype.slice.call(pop.querySelectorAll('button'));
      var at = btns.indexOf(document.activeElement);
      if (ev.key === 'Escape') { ev.preventDefault(); close(true); }
      else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        var n = btns[(at + (ev.key === 'ArrowDown' ? 1 : btns.length - 1)) % btns.length];
        if (n) n.focus();
      } else if (ev.key === 'Tab' && openIdx >= 0) {
        // the popover sits after the paragraph in the DOM: Tab walks on to the next phrase, Shift+Tab back to this one
        if (ev.shiftKey && at === 0) { ev.preventDefault(); close(true); }
        else if (!ev.shiftKey && at === btns.length - 1) {
          ev.preventDefault();
          var from = openIdx;
          close(false);
          var next = els.filter(function (x, k) { return k > from && spans[k].flagged; })[0];
          (next || sw || els[from]).focus();
        }
      }
    });
    root.addEventListener('focusout', function (ev) {
      if (openIdx < 0) return;
      var to = ev.relatedTarget;
      if (to && (pop.contains(to) || (spanOf(to)))) return;
      if (!to && pinned) return;
      close(false);
    });
    document.addEventListener('pointerdown', function (ev) {
      if (openIdx >= 0 && !pop.contains(ev.target) && !spanOf(ev.target)) close(false);
    });
    addEventListener('resize', function () { if (openIdx >= 0) place(els[openIdx]); });

    return {
      setHeat: setHeat,
      open: function (i) { if (spans[i] && spans[i].flagged) { open(i); pinned = true; } },
      close: function () { close(false); },
      getText: function () { return spans.map(function (s) { return s.text; }).join(''); },
      getSpans: snapshot
    };
  }

  global.ConfidenceText = { create: create };
})(window);
