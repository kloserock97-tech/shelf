/* Agent Context Tray — ContextTray.create(root, { budget, items }, options)
 * items: [{ id, name, kind, tokens, role: 'always' | 'task' | 'background', on, pinned, preview }]
 * kind picks the icon: profile, rules, file, link, sheet, mail, note, calendar.
 * A chip click turns the item on or off; the chevron opens a preview anchored to the chip (pin, turn off, move).
 * Chips drag between groups (mouse at once, touch after a 260 ms hold); Alt+↑/↓ on a chip moves it a group up or down,
 * P pins it. Files dropped from the desktop land in the group under the pointer.
 * The bar under the prompt adds up what is on; from 85% of the budget the heaviest unpinned item pulses.
 * options.onChange(state), options.onSend({ text, items, tokens }). */
(function (global) {
  'use strict';

  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var ANCHOR = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('anchor-name: --a');
  var FIELD = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('field-sizing: content');
  var ROLES = [
    { id: 'always', name: 'Always', hint: 'Sent with every task' },
    { id: 'task', name: 'This task', hint: 'Only for this request' },
    { id: 'background', name: 'Background', hint: 'Skimmed when it matters' }
  ];
  var KIND = { profile: 'Profile', rules: 'Rules', file: 'File', link: 'Link', sheet: 'Table', mail: 'Mail', note: 'Notes', calendar: 'Calendar' };
  var S = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
  var ICON = {
    profile: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="5.6" r="2.6" ' + S + '/><path d="M3 13.6c.7-2.4 2.6-3.7 5-3.7s4.3 1.3 5 3.7" ' + S + '/></svg>',
    rules: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 4.2h6.5M6.5 8h6.5M6.5 11.8h6.5" ' + S + '/><path d="M3 4.2h.6M3 8h.6M3 11.8h.6" ' + S + ' stroke-width="2"/></svg>',
    file: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.2h5l3 3v8.6H4z" ' + S + '/><path d="M9 2.2v3h3M6 8.6h4M6 11h3" ' + S + '/></svg>',
    link: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.8 9.2a2.6 2.6 0 003.7 0l2-2a2.6 2.6 0 00-3.7-3.7l-.7.7M9.2 6.8a2.6 2.6 0 00-3.7 0l-2 2a2.6 2.6 0 003.7 3.7l.7-.7" ' + S + '/></svg>',
    sheet: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3" width="11" height="10" rx="1.6" ' + S + '/><path d="M2.5 6.6h11M2.5 9.8h11M6.4 3v10" ' + S + '/></svg>',
    mail: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.2" y="3.6" width="11.6" height="8.8" rx="1.6" ' + S + '/><path d="M2.8 4.6L8 8.4l5.2-3.8" ' + S + '/></svg>',
    note: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.4 2.6h9.2v7.2l-3.2 3.6H3.4z" ' + S + '/><path d="M9.4 13.4V9.8h3.2M5.6 5.6h4.8M5.6 8h3" ' + S + '/></svg>',
    calendar: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.4" y="3.4" width="11.2" height="10" rx="1.8" ' + S + '/><path d="M2.4 6.6h11.2M5.4 2v2.6M10.6 2v2.6" ' + S + '/></svg>',
    pin: '<svg class="ct-pinmark" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2.4h4l-.6 3.6 2.4 2.4H4.2l2.4-2.4zM8 8.4v5.2" ' + S + '/></svg>',
    more: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.6L6 7.6l3-3" ' + S + ' stroke-width="1.6"/></svg>',
    up: '<svg class="ct-up" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3.4M3.8 7.4L8 3.2l4.2 4.2" ' + S + ' stroke-width="2"/></svg>',
    ok: '<svg class="ct-ok" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.6 8.4l2.9 2.9 5.9-6.4" ' + S + ' stroke-width="2"/></svg>'
  };
  var uid = 0;

  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function fmt(n) {
    if (n < 1000) return String(Math.round(n));
    return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  function kindOf(name, type) {
    var ext = (name.split('.').pop() || '').toLowerCase();
    if (/^(csv|tsv|xlsx?|numbers)$/.test(ext)) return 'sheet';
    if (/^(eml|msg)$/.test(ext)) return 'mail';
    if (/^(ics)$/.test(ext)) return 'calendar';
    if (/^(url|webloc)$/.test(ext)) return 'link';
    return 'file';
  }

  function create(root, data, options) {
    var o = Object.assign({ onChange: null, onSend: null }, options || {});
    var budget = data.budget || 8000;
    var id = 'ct' + (++uid);
    var items = (data.items || []).map(function (it, i) {
      return {
        id: String(it.id || 'item' + i), name: it.name, kind: KIND[it.kind] ? it.kind : 'file', tokens: Math.max(1, it.tokens | 0),
        role: ROLES.some(function (r) { return r.id === it.role; }) ? it.role : 'task',
        on: it.on !== false, pinned: !!it.pinned, preview: it.preview || ''
      };
    });
    var byId = {};
    var els = {};

    root.classList.add('ct');
    root.textContent = '';

    // ---- tray
    var tray = node('div', 'ct-tray');
    tray.setAttribute('role', 'region');
    tray.setAttribute('aria-label', 'Context the agent will use');
    var groups = {};
    ROLES.forEach(function (r) {
      var sec = node('section', 'ct-group');
      sec.dataset.role = r.id;
      sec.setAttribute('aria-labelledby', id + '-' + r.id);
      var head = node('div', 'ct-ghead');
      var dot = node('span', 'ct-dot');
      dot.setAttribute('aria-hidden', 'true');
      var h = node('h3', 'ct-gname', r.name);
      h.id = id + '-' + r.id;
      var count = node('span', 'ct-gcount');
      head.appendChild(dot);
      head.appendChild(h);
      head.appendChild(node('span', 'ct-ghint', r.hint));
      head.appendChild(count);
      var list = node('ul', 'ct-chips');
      list.setAttribute('role', 'list');
      var empty = node('p', 'ct-empty', 'Drop items here');
      sec.appendChild(head);
      sec.appendChild(list);
      sec.appendChild(empty);
      tray.appendChild(sec);
      groups[r.id] = { el: sec, list: list, count: count };
    });
    root.appendChild(tray);

    // ---- composer
    var composer = node('div', 'ct-composer');
    var ta = node('textarea', 'ct-input');
    ta.rows = 1;
    ta.placeholder = data.placeholder || 'Ask the agent…';
    ta.setAttribute('aria-label', 'Prompt');
    var bar = node('div', 'ct-bar');
    var meter = node('div', 'ct-budget');
    meter.setAttribute('role', 'meter');
    meter.setAttribute('aria-label', 'Context budget');
    meter.setAttribute('aria-valuemin', '0');
    var blabel = node('span', 'ct-blabel');
    var btotal = node('b');
    var bstate = node('span', 'ct-bstate');
    blabel.appendChild(btotal);
    blabel.appendChild(bstate);
    var track = node('div', 'ct-track');
    track.setAttribute('aria-hidden', 'true');
    ROLES.forEach(function (r) { var seg = node('i', 'ct-seg'); seg.dataset.role = r.id; track.appendChild(seg); });
    track.appendChild(node('i', 'ct-limit'));
    meter.appendChild(blabel);
    meter.appendChild(track);
    var send = node('button', 'ct-send');
    send.type = 'button';
    send.setAttribute('aria-label', 'Send');
    send.innerHTML = ICON.up + ICON.ok;
    bar.appendChild(meter);
    bar.appendChild(send);
    composer.appendChild(ta);
    composer.appendChild(bar);
    root.appendChild(composer);

    // ---- preview popover (one for the tray, re-anchored per chip)
    var pop = node('div', 'ct-pop');
    pop.id = id + '-pop';
    pop.setAttribute('popover', '');
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-labelledby', id + '-pop-title');
    var anchorName = '--' + id + '-peek';
    if (ANCHOR) { pop.dataset.anchored = ''; pop.style.setProperty('position-anchor', anchorName); }
    root.appendChild(pop);
    var popFor = null;
    var downOpenFor = null;

    var live = node('div', 'ct-sr');
    live.setAttribute('aria-live', 'polite');
    root.appendChild(live);
    function say(t) { live.textContent = ''; setTimeout(function () { live.textContent = t; }, 30); }

    // ---------- chips ----------
    function chip(it, fresh) {
      var li = node('li', 'ct-chip');
      li.dataset.id = it.id;
      var main = node('button', 'ct-main');
      main.type = 'button';
      main.setAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown P');
      main.innerHTML = ICON[it.kind];
      var name = node('span', 'ct-name', it.name);
      var tok = node('span', 'ct-tok');
      main.appendChild(name);
      main.insertAdjacentHTML('beforeend', ICON.pin);
      main.appendChild(tok);
      var more = node('button', 'ct-more');
      more.type = 'button';
      more.setAttribute('aria-haspopup', 'dialog');
      more.setAttribute('aria-expanded', 'false');
      more.setAttribute('aria-controls', pop.id);
      more.innerHTML = ICON.more;
      li.appendChild(main);
      li.appendChild(more);
      if (fresh) {
        li.dataset.new = '';
        setTimeout(function () { delete li.dataset.new; }, 420);
      }
      els[it.id] = { li: li, main: main, more: more, tok: tok };
      byId[it.id] = it;

      main.addEventListener('click', function () {
        if (suppressClick) { suppressClick = false; return; }
        toggle(it);
      });
      main.addEventListener('keydown', function (e) {
        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault();
          var i = roleIndex(it.role) + (e.key === 'ArrowUp' ? -1 : 1);
          if (i >= 0 && i < ROLES.length) { moveTo(it, ROLES[i].id, null); main.focus(); }
        } else if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          pin(it);
        }
      });
      main.addEventListener('pointerdown', function (e) { pressStart(it, e); });
      more.addEventListener('pointerdown', function () { downOpenFor = popOpen() ? popFor : null; });
      more.addEventListener('click', function () {
        var was = downOpenFor;
        downOpenFor = null;
        if (was === it || (popFor === it && popOpen())) { closePop(); return; }
        openPop(it);
      });
      paint(it);
      return li;
    }
    function paint(it) {
      var e = els[it.id];
      if (it.on) delete e.li.dataset.off; else e.li.dataset.off = '';
      if (it.pinned) e.li.dataset.pinned = ''; else delete e.li.dataset.pinned;
      e.tok.textContent = fmt(it.tokens);
      e.main.setAttribute('aria-pressed', String(it.on));
      e.main.setAttribute('aria-label', it.name + ', ' + fmt(it.tokens) + ' tokens' + (it.pinned ? ', pinned' : ''));
      e.more.setAttribute('aria-label', 'Preview ' + it.name);
    }
    function roleIndex(role) { for (var i = 0; i < ROLES.length; i++) if (ROLES[i].id === role) return i; return 1; }
    function roleName(role) { return ROLES[roleIndex(role)].name; }

    items.forEach(function (it) { groups[it.role].list.appendChild(chip(it)); });

    // keep the items array in DOM order, the groups are the truth after a drag
    function syncOrder() {
      var next = [];
      ROLES.forEach(function (r) {
        [].forEach.call(groups[r.id].list.children, function (li) {
          var it = byId[li.dataset.id];
          if (it) { it.role = r.id; next.push(it); }
        });
      });
      items = next;
    }

    // ---------- state ----------
    var level = 'ok';
    function update() {
      var sum = { always: 0, task: 0, background: 0 };
      var n = { always: 0, task: 0, background: 0 };
      var total = 0;
      items.forEach(function (it) { n[it.role]++; if (it.on) { sum[it.role] += it.tokens; total += it.tokens; } });
      var denom = Math.max(total, budget);
      root.style.setProperty('--ct-wa', (sum.always / denom * 100).toFixed(2));
      root.style.setProperty('--ct-wt', (sum.task / denom * 100).toFixed(2));
      root.style.setProperty('--ct-wb', (sum.background / denom * 100).toFixed(2));
      root.style.setProperty('--ct-mark', (budget / denom * 100).toFixed(2));
      level = total > budget ? 'over' : total >= budget * 0.85 ? 'near' : 'ok';
      root.dataset.level = level;

      var heavy = null;
      if (level !== 'ok') {
        items.forEach(function (it) { if (it.on && !it.pinned && (!heavy || it.tokens > heavy.tokens)) heavy = it; });
      }
      items.forEach(function (it) {
        if (it === heavy) els[it.id].li.dataset.heavy = ''; else delete els[it.id].li.dataset.heavy;
      });

      btotal.textContent = fmt(total) + ' / ' + fmt(budget);
      var state = level === 'over' ? 'Over by ' + fmt(total - budget) : level === 'near' ? 'Near the limit' : fmt(budget - total) + ' left';
      if (heavy) state += ' · heaviest: ' + heavy.name;
      bstate.textContent = state;
      meter.setAttribute('aria-valuemax', String(budget));
      meter.setAttribute('aria-valuenow', String(Math.min(total, budget)));
      meter.setAttribute('aria-valuetext', fmt(total) + ' of ' + fmt(budget) + ' tokens. ' + state);

      ROLES.forEach(function (r) {
        groups[r.id].count.textContent = n[r.id] + ' · ' + fmt(sum[r.id]);
        if (n[r.id]) delete groups[r.id].el.dataset.empty; else groups[r.id].el.dataset.empty = '';
      });
      send.disabled = !ta.value.trim() || level === 'over';
      send.title = level === 'over' ? 'Over the context budget — turn something off' : '';
      if (popFor && popOpen()) fillPop(popFor);
      if (o.onChange) o.onChange(getState(total));
    }
    function getState(total) {
      if (total == null) total = items.reduce(function (s, it) { return s + (it.on ? it.tokens : 0); }, 0);
      return {
        budget: budget, tokens: total, level: level,
        items: items.map(function (it) { return { id: it.id, name: it.name, role: it.role, on: it.on, pinned: it.pinned, tokens: it.tokens }; })
      };
    }

    function toggle(it) {
      it.on = !it.on;
      paint(it);
      update();
      say(it.name + (it.on ? ' included' : ' turned off') + '. ' + bstate.textContent);
    }
    function pin(it) {
      it.pinned = !it.pinned;
      paint(it);
      update();
      say(it.name + (it.pinned ? ' pinned' : ' unpinned'));
    }
    function moveTo(it, role, before) {
      if (it.role === role && !before) return;
      flip(function () { groups[role].list.insertBefore(els[it.id].li, before); });
      syncOrder();
      update();
      say(it.name + ' moved to ' + roleName(role));
    }

    // FLIP: chips glide to their new places instead of jumping
    function flip(mutate) {
      var lis = [].slice.call(tray.querySelectorAll('.ct-chip'));
      var first = lis.map(function (li) { return li.getBoundingClientRect(); });
      mutate();
      if (reduce.matches) return;
      lis.forEach(function (li, i) {
        li.getAnimations().forEach(function (a) { if (a.id === 'ct-flip') a.cancel(); });
        var r = li.getBoundingClientRect();
        var dx = first[i].left - r.left, dy = first[i].top - r.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
        var a = li.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: 280, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
        a.id = 'ct-flip';
      });
    }

    // ---------- preview popover ----------
    function popOpen() { try { return pop.matches(':popover-open'); } catch (e) { return false; } }
    function fillPop(it) {
      pop.textContent = '';
      pop.style.setProperty('--c', 'var(--ct-' + it.role + ')');
      var head = node('div', 'ct-pop-head');
      head.innerHTML = ICON[it.kind];
      var t = node('p', 'ct-pop-title', it.name);
      t.id = id + '-pop-title';
      head.appendChild(t);
      head.appendChild(node('span', 'ct-pop-meta', fmt(it.tokens) + ' tokens · ' + KIND[it.kind] + ' · ' + roleName(it.role)));
      pop.appendChild(head);
      var body = node('div', 'ct-pop-body');
      body.appendChild(node('p', null, it.preview || 'No preview.'));
      pop.appendChild(body);
      var warn = node('p', 'ct-pop-warn');
      if (els[it.id].li.dataset.heavy != null) warn.textContent = 'Heaviest item. Turning it off frees ' + fmt(it.tokens) + '.';
      pop.appendChild(warn);
      var acts = node('div', 'ct-pop-acts');
      var bOn = node('button', 'ct-btn', it.on ? 'Turn off' : 'Include');
      bOn.type = 'button';
      bOn.dataset.act = 'toggle';
      var bPin = node('button', 'ct-btn');
      bPin.type = 'button';
      bPin.dataset.act = 'pin';
      bPin.setAttribute('aria-pressed', String(it.pinned));
      bPin.innerHTML = ICON.pin.replace('ct-pinmark', '');
      bPin.appendChild(document.createTextNode(it.pinned ? 'Pinned' : 'Pin'));
      acts.appendChild(bOn);
      acts.appendChild(bPin);
      pop.appendChild(acts);
      var mv = node('div', 'ct-pop-move');
      mv.setAttribute('role', 'group');
      mv.setAttribute('aria-label', 'Move to');
      mv.appendChild(node('span', null, 'Move to'));
      var seg = node('div', 'ct-seg3');
      mv.appendChild(seg);
      ROLES.forEach(function (r) {
        var b = node('button', 'ct-btn', r.name);
        b.type = 'button';
        b.dataset.act = 'move';
        b.dataset.to = r.id;
        if (r.id === it.role) b.setAttribute('aria-current', 'true');
        seg.appendChild(b);
      });
      pop.appendChild(mv);
    }
    function openPop(it) {
      if (popFor && els[popFor.id]) { els[popFor.id].li.style.removeProperty('anchor-name'); els[popFor.id].more.setAttribute('aria-expanded', 'false'); }
      popFor = it;
      fillPop(it);
      var e = els[it.id];
      if (ANCHOR) e.li.style.setProperty('anchor-name', anchorName);
      e.more.setAttribute('aria-expanded', 'true');
      if (!popOpen()) pop.showPopover();
      if (!ANCHOR) place();
      var first = pop.querySelector('.ct-btn');
      if (first) first.focus({ preventScroll: true });
    }
    function closePop() { if (popOpen()) pop.hidePopover(); }
    function place() {
      if (!popFor || !popOpen()) return;
      var a = els[popFor.id].li.getBoundingClientRect();
      var w = pop.offsetWidth, h = pop.offsetHeight;
      var left = Math.min(Math.max(12, a.left), innerWidth - w - 12);
      var top = a.bottom + 6;
      if (top + h > innerHeight - 12 && a.top - h - 6 > 12) top = a.top - h - 6;
      pop.style.left = left + 'px';
      pop.style.top = top + 'px';
    }
    if (!ANCHOR) { addEventListener('resize', place); addEventListener('scroll', place, true); }
    pop.addEventListener('toggle', function (e) {
      if (e.newState !== 'closed' || !popFor) return;
      var it = popFor;
      var el = els[it.id];
      popFor = null;
      if (!el) return;
      el.more.setAttribute('aria-expanded', 'false');
      el.li.style.removeProperty('anchor-name');
      var a = document.activeElement;
      if (!a || a === document.body || pop.contains(a)) el.more.focus({ preventScroll: true });
    });
    pop.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b || !popFor) return;
      var it = popFor;
      if (b.dataset.act === 'toggle') { toggle(it); pop.querySelector('[data-act="toggle"]').focus(); }
      else if (b.dataset.act === 'pin') { pin(it); pop.querySelector('[data-act="pin"]').focus(); }
      else if (b.dataset.act === 'move' && b.dataset.to !== it.role) {
        closePop();
        moveTo(it, b.dataset.to, null);
        els[it.id].main.focus({ preventScroll: true });
      }
    });

    // ---------- drag between groups ----------
    var press = null;          // pointer down on a chip, not dragging yet
    var drag = null;           // { it, li, ghost, x0, y0, rect, from, fromNext }
    var suppressClick = false;

    function pressStart(it, e) {
      if (e.button !== 0 || drag) return;
      press = { it: it, id: e.pointerId, x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse', armed: e.pointerType === 'mouse', hold: 0, el: e.currentTarget };
      if (press.touch) {
        press.hold = setTimeout(function () {
          if (!press) return;
          press.armed = true;
          if (navigator.vibrate) { try { navigator.vibrate(8); } catch (err) { /* not allowed */ } }
          beginDrag(press.x, press.y);
        }, 260);
      }
      addEventListener('pointermove', onMove);
      addEventListener('pointerup', onUp);
      addEventListener('pointercancel', onCancel);
    }
    function onMove(e) {
      if (!press || e.pointerId !== press.id) return;
      if (!drag) {
        var d = Math.hypot(e.clientX - press.x, e.clientY - press.y);
        if (press.touch && !press.armed) { if (d > 8) endPress(); return; }
        if (press.armed && d > 5) beginDrag(e.clientX, e.clientY);
        else return;
      }
      press.x = e.clientX;
      press.y = e.clientY;
      dragTo(e.clientX, e.clientY);
    }
    function beginDrag(x, y) {
      var it = press.it;
      var li = els[it.id].li;
      closePop();
      var rect = li.getBoundingClientRect();
      var ghost = li.cloneNode(true);
      ghost.classList.add('ct-ghost');
      ghost.removeAttribute('data-heavy');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.inert = true;
      ghost.style.left = rect.left + 'px';
      ghost.style.top = rect.top + 'px';
      ghost.style.width = rect.width + 'px';
      ghost.style.setProperty('--c', getComputedStyle(li).getPropertyValue('--c'));
      root.appendChild(ghost);
      drag = { it: it, li: li, ghost: ghost, x0: press.x, y0: press.y, rect: rect, from: li.parentNode, fromNext: li.nextElementSibling, lastX: x, lastY: y };
      li.dataset.slot = '';
      root.dataset.dragging = '';
      try { press.el.setPointerCapture(press.id); } catch (err) { /* released */ }
      ghost.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }], { duration: reduce.matches ? 1 : 140, fill: 'forwards' });
      dragTo(x, y);
    }
    function dragTo(x, y) {
      var g = drag.ghost;
      g.getAnimations().forEach(function (a) { a.cancel(); });
      g.style.transform = 'translate(' + (x - drag.x0) + 'px,' + (y - drag.y0) + 'px) scale(1.05)';
      if (Math.hypot(x - drag.lastX, y - drag.lastY) < 4 && drag.target) return;
      drag.lastX = x;
      drag.lastY = y;
      var t = targetAt(x, y);
      drag.target = t || drag.target || { role: drag.it.role, before: drag.li.nextElementSibling };
      ROLES.forEach(function (r) { if (t && t.role === r.id) groups[r.id].el.dataset.over = ''; else delete groups[r.id].el.dataset.over; });
      if (!t) return;
      var list = groups[t.role].list;
      if (drag.li.parentNode === list && (drag.li.nextElementSibling === t.before || drag.li === t.before)) return;
      flip(function () { list.insertBefore(drag.li, t.before); });
      ROLES.forEach(function (r) { if (groups[r.id].list.children.length) delete groups[r.id].el.dataset.empty; });
    }
    function targetAt(x, y) {
      var role = null;
      ROLES.forEach(function (r) {
        var rc = groups[r.id].el.getBoundingClientRect();
        if (y >= rc.top - 4 && y <= rc.bottom + 4 && x >= rc.left - 16 && x <= rc.right + 16) role = r.id;
      });
      if (!role) return null;
      var before = null;
      var lis = [].filter.call(groups[role].list.children, function (li) { return li !== drag.li; });
      for (var i = 0; i < lis.length; i++) {
        var rc = lis[i].getBoundingClientRect();
        if (y < rc.top) { before = lis[i]; break; }
        if (y <= rc.bottom && x < rc.left + rc.width / 2) { before = lis[i]; break; }
      }
      return { role: role, before: before };
    }
    function finishDrag(cancel) {
      var d = drag;
      drag = null;
      ROLES.forEach(function (r) { delete groups[r.id].el.dataset.over; });
      delete root.dataset.dragging;
      if (cancel) flip(function () { d.from.insertBefore(d.li, d.fromNext && d.fromNext.parentNode === d.from ? d.fromNext : null); });
      d.li.getAnimations().forEach(function (a) { a.cancel(); });
      var to = d.li.getBoundingClientRect();
      var land = function () {
        d.ghost.remove();
        delete d.li.dataset.slot;
      };
      if (reduce.matches) land();
      else {
        var dx = to.left - d.rect.left, dy = to.top - d.rect.top;
        var a = d.ghost.animate([{ transform: d.ghost.style.transform }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(1)' }], { duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' });
        a.onfinish = land;
      }
      var was = d.it.role;
      syncOrder();
      update();
      if (d.it.role !== was) say(d.it.name + ' moved to ' + roleName(d.it.role));
      suppressClick = true;
      setTimeout(function () { suppressClick = false; }, 0);
    }
    function onUp(e) {
      if (!press || e.pointerId !== press.id) return;
      var dragging = !!drag;
      endPress();
      if (dragging) finishDrag(false);
    }
    function onCancel(e) {
      if (!press || e.pointerId !== press.id) return;
      var dragging = !!drag;
      endPress();
      if (dragging) finishDrag(true);
    }
    function endPress() {
      if (press) clearTimeout(press.hold);
      press = null;
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', onUp);
      removeEventListener('pointercancel', onCancel);
    }
    // a touch hold turns into a drag: keep the page from scrolling under it, and no long-press menu
    root.addEventListener('touchmove', function (e) { if (drag || (press && press.armed)) e.preventDefault(); }, { passive: false });
    root.addEventListener('contextmenu', function (e) { if (press && press.touch) e.preventDefault(); });
    addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drag) { var p = press; endPress(); finishDrag(true); if (p) p.el.focus(); }
    });

    // ---------- files from the desktop ----------
    function hasFiles(e) { return e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], 'Files') >= 0; }
    var fileRole = null;
    tray.addEventListener('dragover', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      var role = 'task';
      ROLES.forEach(function (r) {
        var rc = groups[r.id].el.getBoundingClientRect();
        if (e.clientY >= rc.top && e.clientY <= rc.bottom) role = r.id;
      });
      if (role !== fileRole) {
        fileRole = role;
        ROLES.forEach(function (r) { if (r.id === role) groups[r.id].el.dataset.over = ''; else delete groups[r.id].el.dataset.over; });
      }
    });
    tray.addEventListener('dragleave', function (e) {
      if (e.relatedTarget && tray.contains(e.relatedTarget)) return;
      fileRole = null;
      ROLES.forEach(function (r) { delete groups[r.id].el.dataset.over; });
    });
    tray.addEventListener('drop', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      var role = fileRole || 'task';
      fileRole = null;
      ROLES.forEach(function (r) { delete groups[r.id].el.dataset.over; });
      [].forEach.call(e.dataTransfer.files, function (f) {
        var it = add({ name: f.name, kind: kindOf(f.name, f.type), tokens: Math.max(40, Math.round(f.size / 4)), role: role, preview: 'Reading…' });
        var texty = /^text\/|json|xml|csv|markdown/.test(f.type) || /\.(md|txt|csv|json|ya?ml|html?|css|js|ts)$/i.test(f.name);
        if (texty && f.slice) {
          f.slice(0, 600).text().then(function (s) { it.preview = s; if (popFor === it) fillPop(it); });
        } else {
          it.preview = (f.type || 'Binary file') + ' · ' + Math.max(1, Math.round(f.size / 1024)) + ' KB';
        }
      });
    });

    function add(spec) {
      var n = 1;
      var base = String(spec.id || spec.name || 'item').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      var key = base;
      while (byId[key]) key = base + '-' + (++n);
      var it = {
        id: key, name: spec.name, kind: KIND[spec.kind] ? spec.kind : 'file', tokens: Math.max(1, spec.tokens | 0),
        role: ROLES.some(function (r) { return r.id === spec.role; }) ? spec.role : 'task',
        on: spec.on !== false, pinned: !!spec.pinned, preview: spec.preview || ''
      };
      groups[it.role].list.appendChild(chip(it, true));
      syncOrder();
      update();
      say(it.name + ' added to ' + roleName(it.role) + ', ' + fmt(it.tokens) + ' tokens');
      return it;
    }

    // ---------- prompt ----------
    function fit() {
      if (FIELD) return;
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 168) + 'px';
    }
    ta.addEventListener('input', function () { fit(); send.disabled = !ta.value.trim() || level === 'over'; });
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
    });
    send.addEventListener('click', submit);
    var sentTimer = 0;
    function submit() {
      var text = ta.value.trim();
      if (!text || level === 'over') return;
      var on = items.filter(function (it) { return it.on; });
      var tokens = on.reduce(function (s, it) { return s + it.tokens; }, 0);
      if (o.onSend) o.onSend({ text: text, tokens: tokens, items: on.map(function (it) { return { id: it.id, name: it.name, role: it.role, tokens: it.tokens }; }) });
      ta.value = '';
      fit();
      send.dataset.sent = '';
      clearTimeout(sentTimer);
      sentTimer = setTimeout(function () { delete send.dataset.sent; }, 1100);
      update();
      say('Sent with ' + on.length + ' items, ' + fmt(tokens) + ' tokens');
    }

    fit();
    update();

    return {
      getState: function () { return getState(); },
      add: add,
      preview: function (itemId) { if (byId[itemId]) openPop(byId[itemId]); },
      setText: function (t) { ta.value = t; fit(); update(); },
      setBudget: function (b) { budget = Math.max(1, b | 0); update(); }
    };
  }

  global.ContextTray = { create: create };
})(window);
