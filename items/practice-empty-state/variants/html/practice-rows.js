/* Practice Rows Empty State.
   An empty list shows example rows, one per move (finish, star, snooze). Trying a move on its row develops the row
   and fills a dot in the meter. The first real task scatters the examples and the list closes up around it.
   Markup: .pes > .pes__meter .pes-dot[data-move], form.pes__add, .pes__lead, ul.pes__list, ul.pes__practice > li.pes-row--practice[data-teach]
   Optional data-store="key" on .pes keeps which moves were tried and whether the examples are gone (localStorage). */
(() => {
  const MOVES = ['done', 'star', 'snooze'];
  const ARM = 72; // px of pull that commits a swipe
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  // Damped spring, sampled into a CSS linear() easing. bounce 0..1: 0 settles without overshoot.
  function spring(bounce = 0.3, n = 40) {
    const z = 1 - bounce, w0 = 4.6 / z, wd = w0 * Math.sqrt(Math.max(1e-4, 1 - z * z));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push(+(1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t))).toFixed(3));
    }
    pts[n] = 1;
    return `linear(${pts.join(', ')})`;
  }
  const SPRING = spring(0.3);

  const ICON = {
    done: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle class="pes-fill" cx="12" cy="12" r="9"/><path class="pes-tick" d="M8 12.4l2.7 2.7L16.2 9.6"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path class="pes-fill" d="M12 3.4l2.41 5.88 6.34.48-4.85 4.11 1.51 6.17L12 16.7l-5.41 3.34 1.51-6.17-4.85-4.11 6.34-.48z"/></svg>',
    snooze: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M19.5 14.6A7.8 7.8 0 1 1 9.4 4.5a6.2 6.2 0 0 0 10.1 10.1z"/></svg>'
  };

  const read = (key) => {
    if (!key) return null;
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
  };
  const write = (key, value) => {
    if (!key) return;
    try { value ? localStorage.setItem(key, JSON.stringify(value)) : localStorage.removeItem(key); } catch { /* private mode */ }
  };

  function init(root) {
    root.style.setProperty('--pes-spring', SPRING);
    const key = root.dataset.store || '';
    const form = root.querySelector('.pes__add');
    const input = root.querySelector('.pes__input');
    const meter = root.querySelector('.pes__meter');
    const meterText = root.querySelector('.pes__meter-text');
    const lead = root.querySelector('.pes__lead');
    const list = root.querySelector('.pes__list');
    const clear = root.querySelector('.pes__clear');
    let practice = root.querySelector('.pes__practice');
    const practiceTpl = practice.cloneNode(true);
    const leadText = lead.textContent;
    const status = root.querySelector('.pes__status') || root.appendChild(Object.assign(document.createElement('p'), { className: 'pes__status pes-sr' }));
    status.setAttribute('role', 'status');

    const state = { tried: new Set(), graduated: false };
    const saved = read(key);
    if (saved) {
      (saved.tried || []).forEach((m) => MOVES.includes(m) && state.tried.add(m));
      state.graduated = !!saved.graduated;
    }
    const save = () => write(key, { tried: [...state.tried], graduated: state.graduated });
    const say = (text) => { status.textContent = ''; requestAnimationFrame(() => { status.textContent = text; }); };

    const numberRows = () => {
      // fallback for sibling-index(): the cascade delay reads --pes-n
      [...practice.children].forEach((li, i) => li.style.setProperty('--pes-n', String(i + 1)));
    };

    function paintMeter() {
      root.querySelectorAll('.pes-dot').forEach((dot) => dot.classList.toggle('is-on', state.tried.has(dot.dataset.move)));
      meterText.textContent = `${state.tried.size}/${MOVES.length}`;
      meter.setAttribute('aria-label', `${state.tried.size} of ${MOVES.length} moves tried`);
      practice.querySelectorAll('.pes-row--practice').forEach((row) => {
        const on = state.tried.has(row.dataset.teach);
        row.classList.toggle('is-tried', on);
        const tag = row.querySelector('.pes-row__tag');
        if (tag) tag.textContent = on ? 'Tried' : 'Example';
      });
      const all = state.tried.size === MOVES.length;
      root.classList.toggle('is-ready', all && !state.graduated);
      if (!state.graduated) lead.textContent = all ? 'All three moves tried. Now add a real task above.' : leadText;
    }

    function tried(move) {
      if (state.graduated || state.tried.has(move)) return;
      state.tried.add(move);
      save();
      paintMeter();
      const left = MOVES.length - state.tried.size;
      say(left ? `Example done. ${state.tried.size} of ${MOVES.length} moves tried.` : 'All three moves tried. Add a real task to start.');
    }

    // --- real rows ---
    function makeRow(text) {
      const li = document.createElement('li');
      li.className = 'pes-row';
      li.innerHTML =
        `<div class="pes-row__under" aria-hidden="true">${ICON.snooze}<span>Snooze</span></div>` +
        `<div class="pes-row__face" tabindex="0" data-swipe aria-keyshortcuts="ArrowLeft">` +
        `<button class="pes-ctl pes-ctl--done" type="button" aria-pressed="false">${ICON.done}</button>` +
        '<span class="pes-row__text"></span>' +
        `<button class="pes-ctl pes-ctl--star" type="button" aria-pressed="false">${ICON.star}</button></div>`;
      li.querySelector('.pes-row__text').textContent = text;
      li.querySelector('.pes-ctl--done').setAttribute('aria-label', `Finish “${text}”`);
      li.querySelector('.pes-ctl--star').setAttribute('aria-label', `Star “${text}”`);
      li.querySelector('.pes-row__face').setAttribute('aria-label', `${text}. Press Left arrow or swipe left to snooze.`);
      return li;
    }

    // FLIP: rows that move because of `mutate` glide to their new place
    function flip(container, mutate) {
      const rows = [...container.children];
      const before = new Map(rows.map((r) => [r, r.getBoundingClientRect().top]));
      mutate();
      if (reduce.matches) return;
      for (const r of container.children) {
        const was = before.get(r);
        if (was == null) continue;
        const dy = was - r.getBoundingClientRect().top;
        if (Math.abs(dy) > 0.5) r.animate([{ translate: `0 ${dy}px` }, { translate: '0 0' }], { duration: 480, easing: SPRING });
      }
    }

    function sortStarred() {
      flip(list, () => {
        const rows = [...list.children];
        rows.sort((a, b) => (b.classList.contains('is-starred') - a.classList.contains('is-starred')) || (+a.dataset.order - +b.dataset.order));
        rows.forEach((r) => list.appendChild(r));
      });
    }

    let order = 0;
    function addReal(text) {
      const li = makeRow(text);
      li.dataset.order = String(order++);
      const insert = () => list.appendChild(li); // newest last; starred rows stay on top because they are sorted there

      if (state.graduated || !practice.isConnected || !practice.children.length) {
        flip(list, insert);
        clear.hidden = true;
        say(`Added “${text}”.`);
        return;
      }
      // first real task: the examples scatter in a cascade, then the list closes up around the new row
      state.graduated = true;
      save();
      root.classList.remove('is-ready');
      meter.hidden = true;
      practice.classList.add('is-leaving');
      const wait = reduce.matches ? 260 : 560 + 80 * (practice.children.length - 1);
      setTimeout(() => {
        const swap = () => {
          practice.remove();
          lead.hidden = true;
          insert();
        };
        if (document.startViewTransition && !reduce.matches) {
          form.style.viewTransitionName = 'pes-new';
          const vt = document.startViewTransition(() => {
            form.style.viewTransitionName = '';
            li.style.viewTransitionName = 'pes-new';
            swap();
          });
          vt.finished.finally(() => { li.style.viewTransitionName = ''; });
        } else {
          swap();
        }
      }, wait);
      say(`Added “${text}”. Examples removed.`);
    }

    // --- moves ---
    function toggle(btn, cls) {
      const on = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', String(on));
      btn.closest('.pes-row').classList.toggle(cls, on);
      return on;
    }

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('.pes-ctl');
      if (!btn || !root.contains(btn) || btn.classList.contains('pes-ctl--ghost')) return;
      const row = btn.closest('.pes-row');
      const isPractice = row.classList.contains('pes-row--practice');
      if (btn.classList.contains('pes-ctl--done')) {
        const on = toggle(btn, 'is-done');
        if (isPractice) { if (on) tried('done'); } else say(on ? 'Finished.' : 'Back on the list.');
      } else if (btn.classList.contains('pes-ctl--star')) {
        const on = toggle(btn, 'is-starred');
        if (isPractice) { if (on) tried('star'); } else { sortStarred(); say(on ? 'Starred, moved to the top.' : 'Unstarred.'); }
      }
    });

    // --- swipe left to snooze: pointer drag with a threshold, keyboard ArrowLeft as the same move ---
    let drag = null;
    const setPull = (row, face, x) => {
      face.style.translate = `${x}px 0`;
      row.classList.toggle('is-pulling', x < -1);
      row.classList.toggle('is-armed', x <= -ARM);
    };
    const settle = (row, face, from) => {
      const a = face.animate([{ translate: `${from}px 0` }, { translate: '0 0' }], { duration: reduce.matches ? 1 : 520, easing: SPRING });
      face.style.translate = '';
      a.finished.then(() => row.classList.remove('is-pulling', 'is-armed'), () => {});
    };
    function commit(row, face, from) {
      const isPractice = row.classList.contains('pes-row--practice');
      row.classList.add('is-pulling', 'is-armed');
      if (isPractice) {
        // the example is not removed: it slides to the action, holds, comes back developed
        const hold = Math.min(from, -ARM - 24);
        const a = face.animate([{ translate: `${from}px 0` }, { translate: `${hold}px 0`, offset: 0.25 }, { translate: `${hold}px 0`, offset: 0.55 }, { translate: '0 0' }],
          { duration: reduce.matches ? 1 : 900, easing: 'cubic-bezier(.3,.7,.2,1)' });
        face.style.translate = '';
        a.finished.then(() => row.classList.remove('is-pulling', 'is-armed'), () => {});
        tried('snooze');
        return;
      }
      const w = row.getBoundingClientRect().width;
      const out = face.animate([{ translate: `${from}px 0` }, { translate: `${-w - 16}px 0` }], { duration: reduce.matches ? 1 : 260, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
      const text = row.querySelector('.pes-row__text').textContent;
      out.finished.then(() => {
        const h = row.getBoundingClientRect().height;
        const next = row.nextElementSibling || row.previousElementSibling;
        const shut = row.animate([{ height: `${h}px`, marginBottom: '0px', opacity: 1 }, { height: '0px', marginBottom: '-8px', opacity: 0 }],
          { duration: reduce.matches ? 1 : 260, easing: 'cubic-bezier(.2,.7,.2,1)' });
        shut.finished.then(() => {
          row.remove();
          if (!list.children.length) clear.hidden = false;
          (next?.querySelector('.pes-row__face') || input).focus({ preventScroll: true });
        }, () => {});
      }, () => {});
      say(`Snoozed “${text}” till tomorrow.`);
    }

    root.addEventListener('pointerdown', (e) => {
      const face = e.target.closest('.pes-row__face[data-swipe]');
      if (!face || e.button !== 0 || e.target.closest('.pes-ctl')) return;
      drag = { face, row: face.closest('.pes-row'), x0: e.clientX, y0: e.clientY, id: e.pointerId, on: false, x: 0 };
    });
    root.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      if (!drag.on) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
        if (Math.abs(dx) < 6) return;
        drag.on = true;
        drag.face.setPointerCapture(drag.id);
        drag.face.getAnimations().forEach((a) => a.cancel());
      }
      const limit = drag.row.getBoundingClientRect().width * 0.55;
      let x = dx > 0 ? dx * 0.12 : dx;
      if (x < -limit) x = -limit + (x + limit) * 0.25; // rubber band past the limit
      drag.x = x;
      setPull(drag.row, drag.face, x);
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const { row, face, x, on } = drag;
      drag = null;
      if (!on) return;
      if (x <= -ARM && e.type === 'pointerup') commit(row, face, x);
      else settle(row, face, x);
    };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
    root.addEventListener('keydown', (e) => {
      const face = e.target.closest?.('.pes-row__face[data-swipe]');
      if (!face || e.target !== face || e.key !== 'ArrowLeft') return;
      e.preventDefault();
      commit(face.closest('.pes-row'), face, 0);
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim().replace(/\s+/g, ' ');
      if (!text) { input.focus(); return; }
      input.value = '';
      addReal(text);
    });

    function render() {
      if (state.graduated) {
        practice.remove();
        meter.hidden = true;
        lead.hidden = true;
        clear.hidden = list.children.length > 0;
      } else {
        numberRows();
        paintMeter();
      }
    }

    function reset() {
      write(key, null);
      state.tried.clear();
      state.graduated = false;
      list.replaceChildren();
      practice.remove();
      practice = practiceTpl.cloneNode(true);
      list.after(practice);
      meter.hidden = false;
      lead.hidden = false;
      clear.hidden = true;
      render();
    }

    // static poster frame: two moves tried, the third row half-swiped
    function shot() {
      state.tried = new Set(['done', 'star']);
      paintMeter();
      practice.querySelector('[data-teach="done"] .pes-ctl--done')?.setAttribute('aria-pressed', 'true');
      practice.querySelector('[data-teach="done"]')?.classList.add('is-done');
      practice.querySelector('[data-teach="star"] .pes-ctl--star')?.setAttribute('aria-pressed', 'true');
      root.querySelectorAll('.pes-row__face').forEach((f) => { f.style.animation = 'none'; });
      const row = practice.querySelector('[data-teach="snooze"]');
      if (row) setPull(row, row.querySelector('.pes-row__face'), -ARM - 6);
    }

    render();
    root.pes = { reset, shot, add: addReal };
  }

  const boot = () => document.querySelectorAll('.pes').forEach((el) => el.pes || init(el));
  boot();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
})();
