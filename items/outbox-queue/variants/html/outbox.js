/* Offline Outbox Queue — actions made without a network wait in a visible outbox instead of failing.
   Each one has a status (waiting / sending / failed → retry or cancel), failed ones retry with exponential
   back-off and a ring timer, and when the network comes back they leave one by one and land in the list.

   const outbox = new Outbox({ send: (item, signal) => fetch(…, { signal }), storageKey: 'my-outbox' });
   outbox.enqueue('add', 'Add “Buy oat milk”', { ref: 't7', title: 'Buy oat milk' });
   Outbox.view(outbox, { chip, panel, status, land: (item) => elementWhereItLanded });

   Order is strict: the queue sends its head first and nothing overtakes a failed head, so an "add" always reaches
   the server before the "complete" made on the same thing. */
(() => {
  'use strict';

  // jitter for the back-off: our own 32-bit mixer through a Weyl sequence (items/hash-kit)
  const SALT = 0xb31c96c9;
  function hashU(x) {
    x ^= x >>> 16; x = Math.imul(x, 0x3f9c86cb);
    x ^= x >>> 14; x = Math.imul(x, 0x1ae9dacf);
    x ^= x >>> 15;
    return x >>> 0;
  }
  function makeRandom(seed = 1) {
    let s = seed >>> 0;
    return () => {
      s = (s + SALT) >>> 0;
      return hashU(s) / 4294967296;
    };
  }
  const random = makeRandom(Date.now() >>> 0);

  class Outbox extends EventTarget {
    constructor(opts = {}) {
      super();
      this.send = opts.send;
      this.baseDelay = opts.baseDelay ?? 2000;
      this.maxDelay = opts.maxDelay ?? 30000;
      this.maxAttempts = opts.maxAttempts ?? 5;
      this.timeout = opts.timeout ?? 15000;
      this.creates = opts.creates || ['add'];
      this.storageKey = opts.storageKey || null;
      this.items = [];
      this.forcedOffline = false;
      this.paused = false;
      this.busy = null;
      this.timer = 0;
      this.seq = 0;
      this._restore();
      const net = () => this._network();
      addEventListener('online', net);
      addEventListener('offline', net);
      queueMicrotask(() => this._pump());
    }

    get online() { return navigator.onLine !== false && !this.forcedOffline; }

    /** Pretend the network is gone (or back). The browser's own offline state still counts. */
    setOffline(off) {
      this.forcedOffline = !!off;
      this._network();
    }

    enqueue(kind, label, data = {}) {
      const item = { id: `ob${Date.now().toString(36)}${(this.seq++).toString(36)}`, kind, label, data, status: 'waiting', attempts: 0, nextAt: 0, delay: 0, error: '', at: Date.now() };
      this.items.push(item);
      this._changed();
      this._pump();
      return item;
    }

    /** Send now: skips the back-off timer, and gives a stuck item a fresh set of attempts. */
    retry(id) {
      const it = this.get(id);
      if (!it || it.status === 'sending') return;
      if (it.status === 'stuck') it.attempts = 0;
      it.status = 'waiting';
      it.nextAt = 0;
      this._changed();
      this._pump();
    }

    /** Drop an item. Dropping something that creates (an "add") drops what was queued on top of it. */
    cancel(id) {
      const it = this.get(id);
      if (!it) return;
      const gone = [it];
      if (this.creates.includes(it.kind) && it.data.ref != null) {
        for (const other of this.items) if (other !== it && other.at >= it.at && other.data.ref === it.data.ref) gone.push(other);
      }
      this.items = this.items.filter((x) => !gone.includes(x));
      if (this.busy && gone.includes(this.busy.it)) this.busy.ctrl.abort('cancel');
      for (const x of gone) this.dispatchEvent(new CustomEvent('cancel', { detail: { item: x } }));
      this._changed();
      this._pump();
    }

    get(id) { return this.items.find((x) => x.id === id); }

    /** Put items back (from storage, or a prepared state). Anything that was in flight waits again. */
    load(items) {
      this.items = items.map((x) => ({ ...x, status: x.status === 'sending' && !this.paused ? 'waiting' : x.status }));
      this._changed();
      this._pump();
    }

    _network() {
      if (!this.online && this.busy) this.busy.ctrl.abort('offline');
      this.dispatchEvent(new CustomEvent('network', { detail: { online: this.online } }));
      this._changed();
      this._pump();
    }

    _pump() {
      clearTimeout(this.timer);
      if (this.paused || this.busy || !this.online || !this.send) return;
      const it = this.items[0];
      if (!it || it.status === 'stuck') return;
      const wait = it.nextAt - Date.now();
      if (it.status === 'failed' && wait > 0) {
        this.timer = setTimeout(() => this._pump(), wait);
        return;
      }
      const ctrl = new AbortController();
      const limit = setTimeout(() => ctrl.abort('timeout'), this.timeout);
      this.busy = { it, ctrl };
      it.status = 'sending';
      it.error = '';
      this._changed();
      Promise.resolve()
        .then(() => this.send(it, ctrl.signal))
        .then(
          (result) => {
            if (!this.items.includes(it)) return;
            this.items = this.items.filter((x) => x !== it);
            this.dispatchEvent(new CustomEvent('sent', { detail: { item: it, result } }));
          },
          (err) => {
            if (!this.items.includes(it)) return;
            const why = ctrl.signal.aborted ? ctrl.signal.reason : null;
            if (why === 'offline') { it.status = 'waiting'; return; }
            it.attempts++;
            it.error = why === 'timeout' ? 'No answer' : (err && err.message) || 'Failed';
            if (it.attempts >= this.maxAttempts) {
              it.status = 'stuck';
              it.nextAt = 0;
            } else {
              // 2 s, 4 s, 8 s … capped, ±20 % so a crowd of clients does not retry in step
              it.delay = Math.round(Math.min(this.maxDelay, this.baseDelay * 2 ** (it.attempts - 1)) * (0.8 + 0.4 * random()));
              it.nextAt = Date.now() + it.delay;
              it.status = 'failed';
            }
            this.dispatchEvent(new CustomEvent('failed', { detail: { item: it } }));
          }
        )
        .finally(() => {
          clearTimeout(limit);
          if (this.busy && this.busy.it === it) this.busy = null;
          this._changed();
          this._pump();
        });
    }

    _changed() {
      this._save();
      this.dispatchEvent(new CustomEvent('change'));
    }

    _save() {
      if (!this.storageKey) return;
      try { localStorage.setItem(this.storageKey, JSON.stringify(this.items)); } catch { /* private mode, full storage */ }
    }

    _restore() {
      if (!this.storageKey) return;
      try {
        const saved = JSON.parse(localStorage.getItem(this.storageKey) || '[]');
        if (Array.isArray(saved)) this.items = saved.map((x) => ({ ...x, status: x.status === 'sending' ? 'waiting' : x.status }));
      } catch { /* nothing saved, or unreadable */ }
    }
  }

  /* ---------- the view: a chip with a count, a panel of rows, a status line ---------- */
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const svg = (d, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${d}</svg>`;
  const CLOUD = '<path d="M7.5 18.5h9.25a4 4 0 0 0 .55-7.96A5.75 5.75 0 0 0 6.2 9.6 4.5 4.5 0 0 0 7.5 18.5z"/>';
  const ICON = {
    outbox: CLOUD + '<path d="M12 16v-5.5M9.6 12.6L12 10.2l2.4 2.4"/>',
    offline: CLOUD + '<path d="M4 4l16 16"/>',
    waiting: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
    stuck: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5v5.5M12 16.2v.3"/>',
    retry: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.6h-4.6"/>',
    cancel: '<path d="M7 7l10 10M17 7L7 17"/>'
  };
  const RING = 2 * Math.PI * 8;

  Outbox.view = function view(outbox, opts) {
    const { chip, panel, status } = opts;
    const grace = opts.grace ?? 350;
    const verb = (n) => `${n} change${n === 1 ? '' : 's'}`;
    const rows = new Map();
    let userClosed = false;
    let lastCount = 0;
    let peak = 0; // the most changes waiting since the outbox was last empty
    let tick = 0;
    let holdTimer = 0;

    chip.classList.add('obx-chip');
    chip.type = 'button';
    chip.innerHTML = `<span class="obx-chip__icon"></span><span class="obx-chip__text">Outbox</span><span class="obx-chip__n" aria-hidden="true">0</span>`;
    chip.setAttribute('aria-controls', panel.id || (panel.id = `obx-panel-${Math.random().toString(36).slice(2, 8)}`));
    chip.setAttribute('aria-expanded', 'false');
    const chipIcon = chip.querySelector('.obx-chip__icon');
    const chipText = chip.querySelector('.obx-chip__text');
    const chipN = chip.querySelector('.obx-chip__n');
    panel.classList.add('obx-panel');
    panel.hidden = true;
    panel.innerHTML = '<ol class="obx-list" aria-label="Outbox"></ol>';
    const list = panel.querySelector('.obx-list');

    chip.addEventListener('click', () => {
      userClosed = !panel.hidden;
      setOpen(panel.hidden);
    });
    list.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const id = b.closest('.obx-row').dataset.id;
      if (b.dataset.act === 'retry') outbox.retry(id);
      else outbox.cancel(id);
    });

    function say(text) {
      if (!status) return;
      status.textContent = '';
      requestAnimationFrame(() => { status.textContent = text; });
    }

    function setOpen(open, animate = true) {
      if (open === !panel.hidden) return;
      chip.setAttribute('aria-expanded', String(open));
      if (open) {
        panel.hidden = false;
        if (animate && !reduce.matches) panel.animate([{ height: '0px', opacity: 0 }, { height: `${panel.scrollHeight}px`, opacity: 1 }], { duration: 280, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
      } else if (animate && !reduce.matches) {
        panel.animate([{ height: `${panel.offsetHeight}px`, opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 240, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' })
          .finished.then(() => { if (chip.getAttribute('aria-expanded') === 'false') panel.hidden = true; }, () => {});
      } else panel.hidden = true;
    }

    function subText(it, i) {
      if (it.status === 'sending') return 'Sending…';
      if (it.status === 'failed') {
        const s = Math.max(1, Math.ceil((it.nextAt - Date.now()) / 1000));
        return `${it.error}. Retry in ${s} s · try ${it.attempts + 1} of ${outbox.maxAttempts}`;
      }
      if (it.status === 'stuck') return `${it.error}. Stopped after ${outbox.maxAttempts} tries`;
      if (!outbox.online) return 'Waiting for network';
      return i > 0 && outbox.items[0].status !== 'sending' && outbox.items[0].status !== 'waiting' ? 'Queued behind a failed change' : 'Queued';
    }

    function iconFor(it, li) {
      if (it.status === 'failed') {
        // the ring empties until the next try; a new failure starts a new ring
        const key = String(it.nextAt);
        if (li.dataset.ring === key) return null;
        li.dataset.ring = key;
        const elapsed = Math.max(0, it.delay - (it.nextAt - Date.now()));
        return `<svg class="obx-ring${outbox.paused ? ' is-paused' : ''}" viewBox="0 0 20 20" aria-hidden="true" focusable="false" style="--obx-d:${it.delay}ms;--obx-t:-${elapsed}ms">
          <circle class="obx-ring__track" cx="10" cy="10" r="8"/><circle class="obx-ring__bar" cx="10" cy="10" r="8" stroke-dasharray="${RING.toFixed(2)}"/></svg>`;
      }
      li.dataset.ring = '';
      if (it.status === 'sending') return '<span class="obx-spin" aria-hidden="true"></span>';
      return svg(it.status === 'stuck' ? ICON.stuck : ICON.waiting);
    }

    function makeRow(it) {
      const li = document.createElement('li');
      li.className = 'obx-row';
      li.dataset.id = it.id;
      li.innerHTML = `<span class="obx-row__icon"></span>
        <span class="obx-row__text"><span class="obx-row__label">${esc(it.label)}</span><span class="obx-row__sub"></span></span>
        <span class="obx-row__acts">
          <button type="button" class="obx-btn" data-act="retry" aria-label="Send ${esc(it.label)} now">${svg(ICON.retry)}</button>
          <button type="button" class="obx-btn" data-act="cancel" aria-label="Cancel ${esc(it.label)}">${svg(ICON.cancel)}</button>
        </span>`;
      return li;
    }

    function removeRow(li, flyTo) {
      rows.delete(li.dataset.id);
      if (!li.isConnected) return;
      const from = li.getBoundingClientRect();
      if (reduce.matches) {
        li.remove();
        if (flyTo) flyTo.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
        return;
      }
      if (flyTo) {
        // the row leaves the outbox and its landing spot takes off from where the row stood
        const to = flyTo.getBoundingClientRect();
        const s = Math.min(1.2, from.width / Math.max(1, to.width));
        flyTo.animate([
          { transformOrigin: '0 0', transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${s})`, opacity: 0.6 },
          { transformOrigin: '0 0', transform: 'none', opacity: 1 }
        ], { duration: 520, easing: 'cubic-bezier(0.25, 1, 0.3, 1)' });
        flyTo.classList.remove('obx-landed');
        void flyTo.offsetWidth;
        flyTo.classList.add('obx-landed');
      }
      li.style.pointerEvents = 'none';
      li.animate([{ height: `${from.height}px`, opacity: flyTo ? 0 : 1 }, { height: '0px', opacity: 0, paddingTop: '0px', paddingBottom: '0px' }],
        { duration: 300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }).finished.then(() => li.remove(), () => li.remove());
    }

    function render() {
      const now = Date.now();
      const shown = outbox.items.filter((it) => it.status !== 'sending' || it.attempts > 0 || now - it.at >= grace || !outbox.online);
      // rows that left without being sent (cancelled) fold away
      for (const [id, li] of rows) if (!outbox.get(id)) removeRow(li, null);
      let fresh = 0;
      shown.forEach((it, i) => {
        let li = rows.get(it.id);
        if (!li) {
          li = makeRow(it);
          rows.set(it.id, li);
          li.style.setProperty('--i', String(fresh++));
          li.classList.add('is-new');
          li.addEventListener('animationend', () => li.classList.remove('is-new'), { once: true });
        }
        if (list.children[i] !== li) list.insertBefore(li, list.children[i] || null);
        li.dataset.status = it.status;
        const icon = iconFor(it, li);
        if (icon !== null) li.querySelector('.obx-row__icon').innerHTML = icon;
        li.querySelector('.obx-row__sub').textContent = subText(it, outbox.items.indexOf(it));
        li.querySelector('[data-act="retry"]').hidden = !(it.status === 'failed' || it.status === 'stuck');
        li.querySelector('[data-act="cancel"]').hidden = it.status === 'sending';
      });

      const n = outbox.items.length;
      const online = outbox.online;
      chip.classList.toggle('is-offline', !online);
      chip.classList.toggle('is-trouble', outbox.items.some((x) => x.status === 'failed' || x.status === 'stuck'));
      chip.classList.toggle('is-sending', outbox.items.some((x) => x.status === 'sending'));
      chipIcon.innerHTML = svg(online ? ICON.outbox : ICON.offline);
      chipText.textContent = online ? 'Outbox' : 'Offline';
      if (String(n) !== chipN.textContent) {
        chipN.textContent = String(n);
        if (n && lastCount && !reduce.matches) chipN.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(0.3, 1.4, 0.6, 1)' });
      }
      chip.setAttribute('aria-label', `${online ? 'Outbox' : 'Offline, outbox'}: ${n ? `${verb(n)} waiting` : 'empty'}`);
      // the chip inflates with the first item and deflates when the last one leaves; offline it stays as a sign
      const visible = n > 0 || !online;
      chip.classList.toggle('is-gone', !visible);
      chip.toggleAttribute('inert', !visible);
      if (shown.length && !userClosed) setOpen(true);
      if (!n) { setOpen(false); userClosed = false; }
      lastCount = n;
      peak = Math.max(peak, n);

      // a once-a-second tick only while a retry countdown is on screen
      const counting = outbox.items.some((x) => x.status === 'failed') && !outbox.paused;
      if (counting && !tick) tick = setInterval(render, 1000);
      if (!counting && tick) { clearInterval(tick); tick = 0; }
      // a row held back by the grace period shows up when the period ends
      const held = outbox.items.find((it) => !shown.includes(it));
      clearTimeout(holdTimer);
      if (held) holdTimer = setTimeout(render, Math.max(0, grace - (now - held.at)) + 10);
    }

    outbox.addEventListener('change', render);
    outbox.addEventListener('sent', (e) => {
      const { item } = e.detail;
      const li = rows.get(item.id);
      const target = opts.land ? opts.land(item) : null;
      if (li) removeRow(li, target || null);
      else if (target && !reduce.matches) target.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
      if (!outbox.items.length) {
        if (peak > 1) say('All changes sent.');
        peak = 0;
      }
    });
    outbox.addEventListener('failed', (e) => {
      const it = e.detail.item;
      say(it.status === 'stuck' ? `${it.label} could not be sent. Retry or cancel it.` : `${it.label} failed. Retrying in ${Math.ceil(it.delay / 1000)} seconds.`);
    });
    outbox.addEventListener('network', (e) => {
      const n = outbox.items.length;
      say(e.detail.online ? (n ? `Back online. Sending ${verb(n)}.` : 'Back online.') : 'Offline. Changes will wait in the outbox.');
    });
    render();
    return { render, setOpen };
  };

  Outbox.random = random;
  window.Outbox = Outbox;
})();
