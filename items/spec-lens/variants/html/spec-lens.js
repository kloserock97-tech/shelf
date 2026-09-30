// Spec Lens: a round lens over a live screen shows the same area as its spec: layout grid, box outlines,
// gaps in px, type size / line height / weight, colour tokens, and for the element under the cross its padding,
// size and radius. Everything is measured from the DOM. The pointer moves the lens, the wheel or a pinch
// resizes it, L pins it; on touch it floats above the finger.
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const R_MIN = 56, R_MAX = 280;
  const LIFT = 28;                 // px between a finger and the lens edge
  const FIELDS = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
  const FONT = '500 10px system-ui, -apple-system, "Segoe UI", sans-serif';
  const meter = document.createElement('canvas').getContext('2d');
  let seq = 0;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const num = (v) => (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1));
  const textW = (s) => { meter.font = FONT; return meter.measureText(s).width; };
  const hit = (a, b) => a.x < b.x + b.w + 2 && b.x < a.x + a.w + 2 && a.y < b.y + b.h + 2 && b.y < a.y + a.h + 2;
  const channels = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); return m ? m[1].split(/[\s,/]+/).filter(Boolean).map(Number) : null; };
  const alphaOf = (c) => { const p = channels(c); return !p ? 0 : p.length > 3 ? p[3] : 1; };
  const hex = (c) => { const p = channels(c); return p ? `#${p.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase() : c; };
  const px = (cs, p) => parseFloat(cs[p]) || 0;

  class SpecLens {
    constructor(root) {
      this.root = root;
      this.id = ++seq;
      this.r = Number(root.dataset.lensRadius) || 150;
      this.x = 0; this.y = 0;
      this.shown = false; this.pinned = false; this.over = false;
      this.recs = [];
      this.touches = new Map();
      this.build();
      this.bind();
      this.measure();
      root.specLens = this;
    }

    build() {
      const r = this.root;
      r.classList.add('sl-root');
      if (!r.hasAttribute('tabindex')) r.tabIndex = 0;
      // the lens is a round window; the spec drawing inside is shifted back so it lines up with the screen
      this.layer = document.createElement('div');
      this.layer.className = 'sl-lens';
      this.layer.setAttribute('aria-hidden', 'true');
      this.svg = document.createElementNS(NS, 'svg');
      this.layer.appendChild(this.svg);
      this.rim = document.createElement('div');
      this.rim.className = 'sl-rim';
      this.rim.setAttribute('aria-hidden', 'true');
      this.tag = document.createElement('span');
      this.tag.className = 'sl-tag';
      this.rim.appendChild(this.tag);
      this.live = document.createElement('div');
      this.live.className = 'sl-live';
      this.live.setAttribute('aria-live', 'polite');
      r.append(this.layer, this.rim, this.live);
    }

    own(node) { return this.layer.contains(node) || this.rim.contains(node) || this.live.contains(node); }

    bind() {
      const r = this.root;
      r.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch') return this.touchMove(e);
        this.over = true;
        if (!this.pinned) this.moveTo(e.clientX, e.clientY);
      });
      r.addEventListener('pointerleave', (e) => {
        if (e.pointerType === 'touch') return;
        this.over = false;
        if (!this.pinned) this.show(false);
      });
      r.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'touch') return;
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.touches.size === 2) this.pinch = { d: this.spread(), r: this.r };
        else if (!this.pinned) this.moveTo(e.clientX, e.clientY - this.r - LIFT);
      });
      const up = (e) => { this.touches.delete(e.pointerId); if (this.touches.size < 2) this.pinch = null; };
      r.addEventListener('pointerup', up);
      r.addEventListener('pointercancel', up);
      r.addEventListener('wheel', (e) => {
        if (!this.shown) return;
        e.preventDefault();
        this.resize(this.r * Math.exp(-e.deltaY * 0.0016));
      }, { passive: false });
      r.addEventListener('keydown', (e) => this.key(e));
      addEventListener('keydown', (e) => {
        // L also works with nothing focused while the pointer is over the screen
        if (this.over && e.target === document.body && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); this.togglePin(); }
      });
      new ResizeObserver(() => this.later()).observe(r);
      new MutationObserver((list) => { if (list.some((m) => !this.own(m.target) && m.target !== r)) this.later(); })
        .observe(r, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-checked', 'value'] });
      r.addEventListener('input', () => this.later());
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.later());
      document.fonts?.ready.then(() => this.later());
    }

    later() {
      clearTimeout(this.tMeasure);
      this.tMeasure = setTimeout(() => this.measure(), 60);
    }

    spread() {
      const [a, b] = [...this.touches.values()];
      return Math.hypot(a.x - b.x, a.y - b.y) || 1;
    }

    touchMove(e) {
      if (!this.touches.has(e.pointerId)) return;
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch && this.touches.size === 2) { this.resize(this.pinch.r * (this.spread() / this.pinch.d)); return; }
      if (!this.pinned && this.touches.size === 1) this.moveTo(e.clientX, e.clientY - this.r - LIFT);
    }

    key(e) {
      const isL = e.key === 'l' || e.key === 'L';
      if (e.target !== this.root) {
        if (isL && !e.target.closest(FIELDS)) { e.preventDefault(); this.togglePin(); }
        return;
      }
      const step = e.shiftKey ? 48 : 12;
      const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (moves[e.key]) {
        e.preventDefault();
        if (!this.shown) { const b = this.box(); this.x = b.w / 2; this.y = b.h / 2; }
        this.announce = true;
        this.place(this.x + moves[e.key][0], this.y + moves[e.key][1]);
        this.show(true);
      } else if (e.key === '+' || e.key === '=') { e.preventDefault(); this.resize(this.r * 1.15); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); this.resize(this.r / 1.15); }
      else if (isL) { e.preventDefault(); this.togglePin(); }
      else if (e.key === 'Escape') { this.pinned = false; this.root.classList.remove('sl-pinned'); this.show(false); }
    }

    box() { return { w: this.root.scrollWidth, h: this.root.scrollHeight }; }

    origin() {
      const b = this.root.getBoundingClientRect();
      return { x: b.left + this.root.clientLeft - this.root.scrollLeft, y: b.top + this.root.clientTop - this.root.scrollTop };
    }

    moveTo(cx, cy) {
      const o = this.origin();
      this.place(cx - o.x, cy - o.y);
      this.show(true);
    }

    place(x, y) {
      const b = this.box();
      this.x = Math.max(0, Math.min(b.w, x));
      this.y = Math.max(0, Math.min(b.h, y));
      const s = this.root.style;
      s.setProperty('--sl-x', `${this.x}px`);
      s.setProperty('--sl-y', `${this.y}px`);
      // the tag sits off the lower right of the rim; it flips left, or centres, when there's no room
      const d = this.r * 0.71, room = 190;
      const right = this.x + d + room < b.w, left = this.x - d - room > 0;
      this.rim.classList.toggle('sl-flip', !right && left);
      this.rim.classList.toggle('sl-mid', !right && !left);
      this.rim.classList.toggle('sl-up', this.y + (!right && !left ? this.r : d) + 36 > b.h);
      this.schedulePick();
    }

    show(on) {
      if (on === this.shown) return;
      this.shown = on;
      this.root.style.setProperty('--sl-r', on ? `${this.r}px` : '0px');
      this.root.classList.toggle('sl-on', on);
    }

    resize(r) {
      this.r = Math.max(R_MIN, Math.min(R_MAX, r));
      if (this.shown) this.root.style.setProperty('--sl-r', `${this.r}px`);
      this.place(this.x, this.y);
    }

    togglePin() {
      this.pinned = !this.pinned;
      this.root.classList.toggle('sl-pinned', this.pinned);
      if (this.pinned) this.show(true);
      else if (!this.over) this.show(false);
      this.pick();
    }

    // Pin the lens at a point of the screen (posters, tests).
    pinAt(x, y, r) {
      if (r) this.r = r;
      this.pinned = true;
      this.root.classList.add('sl-pinned');
      this.place(x, y);
      this.show(true);
      this.root.style.setProperty('--sl-r', `${this.r}px`);
      this.pick();
    }

    schedulePick() {
      if (this.pickRaf) return;
      this.pickRaf = requestAnimationFrame(() => { this.pickRaf = 0; this.pick(); });
    }

    // The smallest measured element under the cross: solid outline, padding strips with values, size badge.
    pick() {
      const sel = this.svg.querySelector('.sl-selg');
      if (!sel) return;
      let rec = null;
      for (const r of this.recs) {
        const b = r.hit;
        if (this.x >= b.x && this.x <= b.x + b.w && this.y >= b.y && this.y <= b.y + b.h && (!rec || b.w * b.h < rec.hit.w * rec.hit.h)) rec = r;
      }
      if (!rec) {
        sel.innerHTML = '';
        this.tag.textContent = this.pinned ? 'Pinned' : '';
        if (this.announce) { this.announce = false; this.live.textContent = 'Empty space'; }
        return;
      }
      const { x, y, w, h } = rec.rect;
      const [pt, pr, pb, pl] = rec.pad;
      const [bt, br, bb, bl] = rec.border;
      const ix = x + bl, iy = y + bt, iw = w - bl - br, ih = h - bt - bb;
      let s = '';
      const strips = [[ix, iy, iw, pt], [ix + iw - pr, iy, pr, ih], [ix, iy + ih - pb, iw, pb], [ix, iy, pl, ih]];
      strips.forEach(([sx, sy, sw, sh], i) => {
        if (sw < 1 || sh < 1 || !rec.showPad) return;
        s += `<rect class="sl-pad" x="${sx}" y="${sy}" width="${sw}" height="${sh}" fill="url(#sl${this.id}-h)"/>`;
        const v = rec.pad[i];
        if (v < 4) return;
        const t = num(v), lw = textW(t) + 8;
        const lx = i % 2 === 0 ? sx + sw / 2 - lw / 2 : sx + sw / 2 - lw / 2;
        const ly = i % 2 === 0 ? sy + sh / 2 - 7 : sy + sh / 2 - 7;
        s += `<rect class="sl-padpill" x="${lx}" y="${ly}" width="${lw}" height="14" rx="3.5"/><text class="sl-padpill-t" x="${lx + lw / 2}" y="${ly + 10.2}" text-anchor="middle">${t}</text>`;
      });
      const size = `${num(w)} × ${num(h)}${rec.radius ? ` · r${num(rec.radius)}` : ''}`;
      const bw = textW(size) + 10;
      s += `<rect class="sl-sel" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rec.radius}"/>` +
        `<rect class="sl-pill" x="${x + w / 2 - bw / 2}" y="${y + h + 4}" width="${bw}" height="15" rx="3.5"/>` +
        `<text class="sl-pill-t" x="${x + w / 2}" y="${y + h + 14.5}" text-anchor="middle">${size}</text>`;
      sel.innerHTML = s;
      this.tag.textContent = `${this.pinned ? 'Pinned · ' : ''}${rec.name}`;
      if (this.announce) {
        this.announce = false;
        this.live.textContent = `${rec.name}, ${num(w)} by ${num(h)}${rec.say ? `, ${rec.say}` : ''}`;
      }
    }

    readTokens() {
      const names = (this.root.dataset.specTokens || '').split(/\s+/).filter(Boolean);
      const probe = document.createElement('i');
      probe.hidden = true;
      this.live.appendChild(probe);
      const map = new Map();
      for (const n of names) {
        probe.style.color = `var(${n})`;
        const c = getComputedStyle(probe).color;
        map.set(c, [...(map.get(c) || []), n.replace(/^--/, '').replace('-', '/')]);
      }
      probe.remove();
      return map;
    }

    nameOf(el) {
      if (el.dataset.specName) return el.dataset.specName;
      if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
      const t = el.tagName.toLowerCase();
      if (t === 'input' || t === 'textarea') return 'Field';
      if (t === 'button') return 'Button';
      if (t === 'svg') return 'Icon';
      if (/^h[1-6]$/.test(t)) return 'Heading';
      return 'Text';
    }

    measure() {
      const root = this.root;
      const o = this.origin();
      const { w: W, h: H } = this.box();
      this.svg.setAttribute('width', W);
      this.svg.setAttribute('height', H);
      this.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const tokens = this.readTokens();
      // one colour can carry several tokens: text prefers text/ and on-, paint prefers surface/, accent, border/
      const tok = (c, text) => {
        const list = tokens.get(c);
        if (!list) return hex(c);
        return list.find((n) => (text ? /^(text|on)/ : /^(surface|accent|border)/).test(n)) || list[0];
      };
      const R = (b) => ({ x: b.left - o.x, y: b.top - o.y, w: b.width, h: b.height });
      const id = `sl${this.id}`;
      const grid = [], boxes = [], types = [], lines = [], labels = [];
      this.recs = [];

      const els = [...root.querySelectorAll('*')].filter((el) => !this.own(el) && !el.closest('[data-spec-skip]') &&
        !(el.ownerSVGElement && el.tagName.toLowerCase() !== 'svg'));
      for (const el of els) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.display === 'contents') continue;
        const b = el.getBoundingClientRect();
        if (b.width < 1 || b.height < 1) continue;
        const rect = R(b);
        const tag = el.tagName.toLowerCase();
        const isField = el.matches('input, textarea, select');
        const bg = cs.backgroundColor, bc = cs.borderTopColor;
        const border = [px(cs, 'borderTopWidth'), px(cs, 'borderRightWidth'), px(cs, 'borderBottomWidth'), px(cs, 'borderLeftWidth')];
        const hasBg = alphaOf(bg) > 0.01, hasBorder = border[0] > 0 && alphaOf(bc) > 0.01;
        const isIcon = tag === 'svg';
        const isBox = hasBg || hasBorder || isField || tag === 'button' || isIcon;
        const direct = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
        const isText = !isIcon && (direct.length > 0 || (isField && !!(el.value || el.placeholder)));
        const pad = [px(cs, 'paddingTop'), px(cs, 'paddingRight'), px(cs, 'paddingBottom'), px(cs, 'paddingLeft')];
        const radius = px(cs, 'borderTopLeftRadius');
        const says = [];

        // layout grid: one band per column track
        if (el.hasAttribute('data-spec-grid')) {
          const cols = cs.gridTemplateColumns.split(' ').map(parseFloat).filter((v) => v > 0);
          const gap = px(cs, 'columnGap');
          let cx = rect.x + pad[3] + border[3];
          for (const c of cols) { grid.push(`<rect class="sl-col" x="${cx}" y="${0}" width="${c}" height="${H}"/>`); cx += c + gap; }
          const t = `${cols.length} columns · ${num(gap)} gutter`;
          labels.push({ x: rect.x, y: rect.y - 19, w: textW(t) + 10, h: 15, kind: 'chip', text: t, prio: 0 });
        }

        if (isBox) {
          boxes.push(`<rect class="${isIcon ? 'sl-icon' : 'sl-box'}" x="${rect.x + 0.5}" y="${rect.y + 0.5}" width="${Math.max(0, rect.w - 1)}" height="${Math.max(0, rect.h - 1)}" rx="${radius}"/>`);
          // a colour chip where the box is painted differently from what's behind it
          const parentBg = el.parentElement ? getComputedStyle(el.parentElement).backgroundColor : '';
          const fill = hasBg && bg !== parentBg ? bg : hasBorder && !isField ? bc : null;
          if (!isIcon && fill) {
            const t = tok(fill), w = textW(t) + 20;
            labels.push({
              x: rect.x + rect.w - w - 5, y: rect.y + 5, w, h: 15, kind: 'swatch', text: t, color: fill, prio: 2,
              alt: [{ x: rect.x + rect.w - w - 5, y: rect.y + rect.h - 20 }]
            });
          }
          if (hasBg) says.push(tok(bg));
          if (hasBorder) says.push(`border ${tok(bc)}`);
          if (radius) says.push(`radius ${num(radius)}`);
          if (pad.some((p) => p > 0)) says.push(`padding ${[...new Set(pad.map(num))].join(' ')}`);
        }

        // spacing: a redline across each gap between neighbours in flex and grid containers
        if (/flex|grid/.test(cs.display)) {
          const kids = [...el.children].filter((k) => !this.own(k)).filter((k) => {
            const ks = getComputedStyle(k);
            return ks.display !== 'none' && ks.position !== 'absolute' && ks.position !== 'fixed';
          }).map((k) => R(k.getBoundingClientRect())).filter((k) => k.w >= 1 && k.h >= 1);
          const rowGap = px(cs, 'rowGap'), colGap = px(cs, 'columnGap');
          // show the spacing the layout declares; a distance made by space-between isn't a spec value
          const real = (g, declared) => (declared > 0 ? Math.abs(g - declared) < 0.6 : g <= 48);
          for (let i = 1; i < kids.length; i++) {
            const a = kids[i - 1], c = kids[i];
            const gy = c.y - (a.y + a.h), gx = c.x - (a.x + a.w);
            const ox = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x);
            const oy = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y);
            if (gy >= 2 && ox > 0 && real(gy, rowGap)) {
              const x0 = Math.max(a.x, c.x), lx = x0 + Math.min(ox / 2, 36);
              lines.push(`<path class="sl-red" d="M${lx} ${a.y + a.h}V${c.y}M${lx - 3} ${a.y + a.h + 0.5}h6M${lx - 3} ${c.y - 0.5}h6"/>`);
              const t = num(gy), lw = textW(t) + 8;
              labels.push({ x: lx + 5, y: a.y + a.h + gy / 2 - 7, w: lw, h: 14, kind: 'pill', text: t, prio: 1 });
            } else if (gx >= 2 && oy > 0 && real(gx, colGap)) {
              const y0 = Math.max(a.y, c.y), ly = y0 + Math.min(oy / 2, 20);
              lines.push(`<path class="sl-red" d="M${a.x + a.w} ${ly}H${c.x}M${a.x + a.w + 0.5} ${ly - 3}v6M${c.x - 0.5} ${ly - 3}v6"/>`);
              const t = num(gx), lw = textW(t) + 8;
              labels.push({ x: a.x + a.w + gx / 2 - lw / 2, y: ly + 5, w: lw, h: 14, kind: 'pill', text: t, prio: 1 });
            }
          }
        }

        // type: the tight box of the text, then size / line height · weight · colour token
        let tb = null;
        if (isText) {
          if (isField) tb = { x: rect.x + border[3] + pad[3], y: rect.y + border[0] + pad[0], w: rect.w - pad[1] - pad[3] - border[1] - border[3], h: rect.h - pad[0] - pad[2] - border[0] - border[2] };
          else {
            const range = document.createRange();
            range.setStartBefore(direct[0]);
            range.setEndAfter(direct[direct.length - 1]);
            tb = R(range.getBoundingClientRect());
          }
          if (tb.w > 0 && tb.h > 0) {
            types.push(`<rect class="sl-type" x="${tb.x}" y="${tb.y}" width="${tb.w}" height="${tb.h}"/>`);
            const fs = px(cs, 'fontSize'), lh = cs.lineHeight === 'normal' ? 'auto' : num(parseFloat(cs.lineHeight));
            const t = `${num(fs)}/${lh} · ${cs.fontWeight} · ${tok(cs.color, true)}`;
            const w = textW(t) + 10;
            labels.push({
              x: tb.x - 1, y: tb.y - 17, w, h: 15, kind: 'chip', text: t, prio: 3,
              alt: [{ x: tb.x - 1, y: tb.y + tb.h + 2 }, { x: tb.x + tb.w - w + 1, y: tb.y - 17 }, { x: tb.x + tb.w + 6, y: tb.y + tb.h / 2 - 7.5 }]
            });
            says.push(`type ${num(fs)} on ${lh}, weight ${cs.fontWeight}, ${tok(cs.color, true)}`);
          }
        }

        if (isBox || isText) {
          this.recs.push({
            el, rect, hit: !isBox && tb ? tb : rect, pad, border, radius, name: this.nameOf(el), say: says.join(', '),
            showPad: (hasBg || hasBorder || isField || tag === 'button') && !isIcon
          });
        }
      }

      // Labels: grid and numbers first, then colour chips, then type; one that would cover another tries its other spots.
      const placed = [];
      const out = [];
      labels.sort((a, b) => a.prio - b.prio);
      for (const L of labels) {
        const spots = [{ x: L.x, y: L.y }, ...(L.alt || [])];
        const spot = L.prio <= 1 ? spots[0] : spots.find((s) => !placed.some((p) => hit({ ...s, w: L.w, h: L.h }, p)));
        if (!spot) continue;
        const x = Math.max(2, Math.min(W - L.w - 2, spot.x)), y = Math.max(2, Math.min(H - L.h - 2, spot.y));
        placed.push({ x, y, w: L.w, h: L.h });
        if (L.kind === 'pill') {
          out.push(`<rect class="sl-pill" x="${x}" y="${y}" width="${L.w}" height="${L.h}" rx="3.5"/>` +
            `<text class="sl-pill-t" x="${x + L.w / 2}" y="${y + 10.2}" text-anchor="middle">${esc(L.text)}</text>`);
        } else {
          const sw = L.kind === 'swatch';
          out.push(`<rect class="sl-chip" x="${x}" y="${y}" width="${L.w}" height="${L.h}" rx="4"/>` +
            (sw ? `<rect class="sl-dot" x="${x + 4}" y="${y + 3.5}" width="8" height="8" rx="2" fill="${L.color}"/>` : '') +
            `<text class="sl-chip-t" x="${x + (sw ? 16 : 5)}" y="${y + 10.8}">${esc(L.text)}</text>`);
        }
      }

      this.svg.innerHTML =
        `<defs><pattern id="${id}-h" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path class="sl-hatch" d="M0 0V5"/></pattern></defs>` +
        grid.join('') + boxes.join('') + types.join('') + lines.join('') + out.join('') + '<g class="sl-selg"></g>';
      this.pick();
    }
  }

  window.SpecLens = SpecLens;
  document.querySelectorAll('[data-spec-lens]').forEach((el) => new SpecLens(el));
})();
