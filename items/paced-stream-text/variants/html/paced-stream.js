/* Paced Stream Text — shows a bursty text stream at a steady reading pace.
   Chunks go into a queue of whole words; words leave it at a rate that follows the average arrival rate and
   leans on the backlog, so the screen keeps a calm rhythm while the network stutters. No word waits more
   than about a second. Each word settles from a blur, the block grows smoothly, and the view follows the
   newest line only while the reader is at the bottom; otherwise a "Jump to latest" pill appears.

   const s = new PacedStream(el, { scroller, pill, mode: 'paced' });
   s.push(chunk); s.end(); s.reset(); s.setMode('raw');
   Text: blank lines split paragraphs, "- " starts a list item, "## " a heading. */
(function () {
  'use strict';

  const DEFAULTS = {
    targetLag: 0.6,   // s: how far behind the network the screen likes to be
    maxLag: 1.0,      // s: no word waits longer than this
    minRate: 4,       // words/s while there is anything to show
    maxRate: 80,      // words/s at most, even when catching up
    follow: 40        // px from the bottom that still counts as "at the bottom"
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function PacedStream(el, opts) {
    this.o = Object.assign({}, DEFAULTS, opts || {});
    this.el = el;
    this.el.classList.add('ps-grow');
    this.body = document.createElement('div');
    this.body.className = 'ps-body';
    this.el.append(this.body);
    this.scroller = this.o.scroller || null;
    this.pill = this.o.pill || null;
    this.mode = this.o.mode || 'paced';
    this.frame = this.frame.bind(this);
    this.raf = 0;
    this.reset();

    // the block grows to its content on a transition instead of jumping line by line
    this.ro = new ResizeObserver(() => {
      this.el.style.height = this.body.offsetHeight + 'px';
      this.growUntil = performance.now() + 260;
      this.kick();
    });
    this.ro.observe(this.body);

    if (this.scroller) {
      const s = this.scroller;
      s.addEventListener('scroll', () => {
        if (this.jumping) return;
        const dist = s.scrollHeight - s.clientHeight - s.scrollTop;
        if (dist > this.o.follow) this.pinned = false;
        else if (dist < 8) this.pinned = true;
        this.showPill();
      }, { passive: true });
      // any intent to read back up stops the follow at once, before the scroll lands
      s.addEventListener('wheel', (e) => { if (e.deltaY < 0) { this.pinned = false; this.jumping = false; this.showPill(); } }, { passive: true });
      s.addEventListener('touchstart', () => { this.jumping = false; }, { passive: true });
      s.addEventListener('keydown', (e) => { if (['ArrowUp', 'PageUp', 'Home'].includes(e.key)) { this.pinned = false; this.jumping = false; } });
    }
    if (this.pill) this.pill.addEventListener('click', () => this.jump());
  }

  PacedStream.prototype.reset = function () {
    this.body.replaceChildren();
    this.el.style.height = '0px';
    this.tail = '';          // text after the last whole word
    this.queue = [];         // [{ ws, word, t }] whole words waiting for their turn
    this.ended = false;
    this.block = null; this.line = null; this.first = true;
    this.arr = 0; this.rate = 0; this.acc = 0; this.arrived = 0;
    this.lastT = 0; this.growUntil = 0;
    this.pinned = true; this.jumping = false;
    this.showPill();
  };

  PacedStream.prototype.setMode = function (mode) {
    this.mode = mode;
    this.el.classList.toggle('ps-raw', mode === 'raw');
  };

  PacedStream.prototype.push = function (text, now) {
    now = now == null ? performance.now() : now;
    if (this.mode === 'raw') { this.rawAppend(text); return; }
    this.tail += text;
    // cut whole words (a word counts as whole once whitespace follows it)
    const re = /(\s*)(\S+)(?=\s)/y;
    let m, used = 0;
    re.lastIndex = 0;
    while ((m = re.exec(this.tail))) { this.queue.push({ ws: m[1], word: m[2], t: now }); this.arrived++; used = re.lastIndex; }
    this.tail = this.tail.slice(used);
    this.kick();
  };

  PacedStream.prototype.end = function (now) {
    now = now == null ? performance.now() : now;
    this.ended = true;
    if (this.mode === 'raw') { this.rawAppend('', true); return; }
    const m = /^(\s*)(\S+)\s*$/.exec(this.tail);
    if (m) { this.queue.push({ ws: m[1], word: m[2], t: now }); this.arrived++; }
    this.tail = '';
    this.kick();
  };

  // Raw mode: whatever arrived goes on screen now, half words included. Kept for comparison.
  PacedStream.prototype.rawAppend = function (text, final) {
    this.tail += text;
    const parts = this.tail.split(/(\s+)/);
    // keep a trailing partial word as plain text too: raw means raw
    let ws = '';
    for (const p of parts) {
      if (!p) continue;
      if (/^\s+$/.test(p)) { ws += p; continue; }
      this.place(ws, p, false, true);
      ws = '';
    }
    this.pendingWs = ws;
    this.tail = '';
    if (final) this.pendingWs = '';
    if (this.o.onRelease) this.o.onRelease(parts.filter((p) => p && !/^\s+$/.test(p)).length);
    this.kick();
  };

  // Put one token on screen, reading the markers from the whitespace in front of it.
  PacedStream.prototype.place = function (ws, word, animate, raw) {
    if (raw && this.pendingWs) { ws = this.pendingWs + ws; this.pendingWs = ''; }
    const para = !this.block || /\n\s*\n/.test(ws);
    const line = ws.includes('\n');
    const make = (tag, parent) => { const n = document.createElement(tag); (parent || this.body).append(n); return n; };
    if (word === '-' && (line || !this.block)) {
      if (!this.block || this.block.tagName !== 'UL' || para) this.block = make('ul');
      this.line = make('li', this.block); this.first = true;
      return false;
    }
    if (word === '##' && para) {
      this.block = make('h3'); this.line = this.block; this.first = true;
      return false;
    }
    if (para || (line && this.block.tagName !== 'P')) {
      this.block = make('p'); this.line = this.block; this.first = true;
    }
    // a raw chunk may end inside a word: glue the next piece on without a space
    const gap = this.first ? '' : (raw && !ws ? '' : ' ');
    if (gap) this.line.append(gap);
    if (animate) {
      const w = document.createElement('span');
      w.className = 'ps-w';
      w.textContent = word;
      this.line.append(w);
      this.lastWord = w;
    } else {
      this.line.append(word);
    }
    this.first = false;
    return true;
  };

  PacedStream.prototype.kick = function () {
    if (this.raf || this.o.manual) return;   // manual: the owner calls tick(now) itself
    const now = performance.now();
    // the loop slept: nothing arrived in that time, so the average arrival rate decays over it
    if (this.lastT) this.arr *= Math.exp(-Math.max(0, now - this.lastT) / 1500);
    this.lastT = now;
    this.raf = requestAnimationFrame(this.frame);
  };

  PacedStream.prototype.frame = function (now) {
    this.raf = 0;
    this.tick(now);
    const busy = this.queue.length > 0 || now < this.growUntil || this.jumping;
    if (busy) this.raf = requestAnimationFrame(this.frame);
  };

  // One step of the pacer. Separate from the frame loop so a still can be computed off the clock.
  PacedStream.prototype.tick = function (now) {
    const dt = clamp((now - this.lastT) / 1000, 0.001, 0.1);
    this.lastT = now;
    const o = this.o, q = this.queue;

    // average arrival rate over ~1.5 s: the pace the screen should settle into
    const got = this.arrived; this.arrived = 0;
    this.arr += (got / dt - this.arr) * (1 - Math.exp(-dt / 1.5));

    if (q.length) {
      // follow the average, lean on the backlog so it stays near targetLag worth of words
      let want = this.arr + (q.length - this.arr * o.targetLag) / 0.6;
      const oldest = (now - q[0].t) / 1000;
      if (oldest > o.maxLag * 0.8) want = Math.max(want, q.length / 0.25);   // about to be late: catch up
      if (this.ended) want = Math.max(want, q.length / o.targetLag, this.rate);   // nothing more is coming: finish at pace
      want = clamp(want, o.minRate, o.maxRate);
      this.rate += (want - this.rate) * (1 - Math.exp(-dt / 0.12));
      this.acc += this.rate * dt;
      while (this.acc >= 1 && q.length) {
        const tok = q.shift();
        if (this.place(tok.ws, tok.word, true)) {
          this.acc -= 1;
          if (o.stamp) this.lastWord.dataset.t = String(Math.round(now));
          if (o.onRelease) o.onRelease(1, now);
        }
      }
    } else {
      this.acc = Math.min(this.acc, 1);
      this.rate *= Math.exp(-dt / 0.3);
    }
    this.follow(dt);
  };

  PacedStream.prototype.follow = function (dt) {
    const s = this.scroller;
    if (!s || !this.pinned) { this.showPill(); return; }
    const max = s.scrollHeight - s.clientHeight;
    if (this.jumping && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      s.scrollTop += (max - s.scrollTop) * (1 - Math.exp(-dt / 0.09));
      if (max - s.scrollTop < 2) { s.scrollTop = max; this.jumping = false; }
    } else {
      s.scrollTop = max;
      this.jumping = false;
    }
    this.showPill();
  };

  PacedStream.prototype.jump = function () {
    this.pinned = true;
    this.jumping = true;
    this.showPill();
    this.kick();
  };

  PacedStream.prototype.showPill = function () {
    if (!this.pill || !this.scroller) return;
    const s = this.scroller, dist = s.scrollHeight - s.clientHeight - s.scrollTop;
    const show = !this.pinned && dist > this.o.follow;
    if (this.pill.classList.contains('ps-pill--on') !== show) {
      this.pill.classList.toggle('ps-pill--on', show);
      this.pill.tabIndex = show ? 0 : -1;
      this.pill.setAttribute('aria-hidden', String(!show));
    }
  };

  /** lag: seconds the oldest waiting word has waited; rate: words per second going on screen */
  PacedStream.prototype.stats = function (now) {
    now = now == null ? performance.now() : now;
    return { lag: this.queue.length ? (now - this.queue[0].t) / 1000 : 0, rate: this.rate, queued: this.queue.length };
  };

  window.PacedStream = PacedStream;
})();
