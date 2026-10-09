/* Unit Morph Chart — one record is one mark in every layout. A layout is a pure function
   (records, width, height) -> where each mark goes; switching layouts springs every mark to its new place,
   staggered by its rank inside its group. The record you hover or pin stays held through the morph. */

const STIFF = 180;                         // spring stiffness, 1/s²
const DAMP = 2 * Math.sqrt(STIFF) * 0.8;   // 0.8 of critical: one soft overshoot
const STAGGER = 420;                       // ms from the first mark of a group to its last
const SUB = 1 / 120;                       // integration substep, s

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * @param {HTMLElement} root   .um figure with .um__plot, .um__views, .um__legend, .um__note, .um__sr, .um__live inside
 * @param {object} o
 *   records  — array of anything
 *   color    — r => palette slot 0…k-1 (also the legend entry)
 *   legend   — labels for the palette slots
 *   layouts  — [{ id, label, note, icon?, build }] where build(records, w, h) returns
 *              { marks: [[x, y, radius, squareness 0…1]], order: [0…1 stagger rank], seq: [record indices in reading order],
 *                guides: [{ t: 'text'|'v'|'h', … }], groups: [{ label, items: [indices] }] }
 *   describe — r => one line for screen readers
 *   tip      — r => { title, rows: [[name, value]] }
 */
export function unitMorph(root, o) {
  const { records, layouts } = o;
  const n = records.length;
  const plot = root.querySelector('.um__plot');
  const live = root.querySelector('.um__live');
  const note = root.querySelector('.um__note');
  const sr = root.querySelector('.um__sr');
  const canvas = el('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const tip = el('div', 'um__tip');
  tip.setAttribute('aria-hidden', 'true');
  plot.append(canvas, tip);
  const ctx = canvas.getContext('2d');

  const slot = Int8Array.from(records, (r) => o.color(r));
  const F = () => new Float32Array(n);
  const x = F(), y = F(), r = F(), q = F(), vx = F(), vy = F(), vr = F(), vq = F();
  const tx = F(), ty = F(), tr = F(), tq = F(), t0 = new Float64Array(n);
  let W = 0, H = 0, dpr = 1, cur = -1, built = null, raf = 0, last = 0;
  let held = -1, pinned = false, solo = -1, soloLocked = -1, ready = false;
  let palette = [], ink = '#000', surface = '#fff';

  // ---- colors come from CSS custom properties, so both themes live in the stylesheet
  function readColors() {
    const cs = getComputedStyle(root);
    palette = o.legend.map((_, i) => cs.getPropertyValue(`--um-c${i + 1}`).trim() || '#888');
    ink = cs.getPropertyValue('--um-ink').trim() || '#000';
    surface = cs.getPropertyValue('--um-surface').trim() || '#fff';
  }

  // ---- layout switch: a radio group
  const views = root.querySelector('.um__views');
  const thumb = el('span', 'um__thumb');
  views.setAttribute('role', 'radiogroup');
  views.append(thumb);
  const viewBtns = layouts.map((L, i) => {
    const b = el('button', 'um__view', `${L.icon ?? ''}<span>${esc(L.label)}</span>`);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.addEventListener('click', () => show(i));
    b.addEventListener('keydown', (e) => {
      const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!k) return;
      e.preventDefault();
      const j = (i + k + layouts.length) % layouts.length;
      show(j);
      viewBtns[j].focus();
    });
    views.append(b);
    return b;
  });
  function moveThumb() {
    const b = viewBtns[cur];
    if (!b) return;
    thumb.style.width = `${b.offsetWidth}px`;
    thumb.style.transform = `translateX(${b.offsetLeft - 3}px)`;
  }

  // ---- legend: hover previews one group, click keeps it
  const legend = root.querySelector('.um__legend');
  const counts = o.legend.map((_, i) => slot.filter((s) => s === i).length);
  const legendBtns = o.legend.map((label, i) => {
    const li = el('li');
    const b = el('button', null, `<i style="background:var(--um-c${i + 1})"></i>${esc(label)} <b>${counts[i]}</b>`);
    b.type = 'button';
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('pointerenter', () => { solo = i; draw(); });
    b.addEventListener('pointerleave', () => { solo = soloLocked; draw(); });
    b.addEventListener('focus', () => { solo = i; draw(); });
    b.addEventListener('blur', () => { solo = soloLocked; draw(); });
    b.addEventListener('click', () => {
      soloLocked = soloLocked === i ? -1 : i;
      solo = soloLocked === -1 && b.matches(':hover') ? i : soloLocked;
      legendBtns.forEach((x, j) => x.setAttribute('aria-pressed', String(j === soloLocked)));
      draw();
    });
    li.append(b);
    legend?.append(li);
    return b;
  });

  // ---- switching layouts
  function show(i, animate = ready && !reduced()) {
    if (i === cur && built) return;
    cur = i;
    viewBtns.forEach((b, j) => {
      b.setAttribute('aria-checked', String(j === i));
      b.tabIndex = j === i ? 0 : -1;
    });
    moveThumb();
    const L = layouts[i];
    if (note) note.textContent = L.note ?? '';
    build(animate);
    renderList();
    const h = held >= 0 ? ` Holding ${o.describe(records[held])}.` : '';
    if (ready) say(`${L.label}. ${L.note ?? ''}${h}`);
  }

  function build(animate) {
    if (!W || !H) return;
    built = layouts[cur].build(records, W, H);
    const now = performance.now();
    for (let i = 0; i < n; i++) {
      const [mx, my, mr, mq] = built.marks[i];
      tx[i] = mx; ty[i] = my; tr[i] = mr; tq[i] = mq;
      t0[i] = now + (built.order[i] ?? 0) * STAGGER;
      if (!animate) {
        x[i] = mx; y[i] = my; r[i] = mr; q[i] = mq;
        vx[i] = vy[i] = vr[i] = vq[i] = 0;
      }
    }
    if (!animate && ready && reduced()) { // crossfade instead of motion
      plot.classList.remove('is-fading');
      void plot.offsetWidth;
      plot.classList.add('is-fading');
    }
    swapGuides(built.guides ?? []);
    if (animate) kick(); else { draw(); placeTip(); }
  }

  // guides are DOM: crisp text at any zoom, fades handled by CSS
  let guideLayer = null;
  function swapGuides(list) {
    const old = guideLayer;
    if (old) { old.classList.add('is-out'); setTimeout(() => old.remove(), 180); }
    const layer = el('div', 'um__guides is-in');
    layer.setAttribute('aria-hidden', 'true');
    for (const g of list) {
      let e;
      if (g.t === 'v') {
        e = el('i', `um__gv${g.cls ? ` um__gv--${g.cls}` : ''}`);
        e.style.cssText = `transform:translate(${g.x}px,${g.y1}px);height:${g.y2 - g.y1}px`;
      } else if (g.t === 'h') {
        e = el('i', `um__gh${g.cls ? ` um__gh--${g.cls}` : ''}`);
        e.style.cssText = `transform:translate(${g.x1}px,${g.y}px);width:${g.x2 - g.x1}px`;
      } else {
        const cls = ['um__g', g.align && g.align !== 'start' ? `um__g--${g.align}` : '', ...(g.cls ?? '').split(' ').filter(Boolean).map((c) => `um__g--${c}`)];
        e = el('span', cls.join(' '), g.html ?? esc(g.text));
        e.style.transform = `translate(${g.x}px,${g.y}px)`;
      }
      layer.append(e);
    }
    plot.insertBefore(layer, tip);
    guideLayer = layer;
    requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.remove('is-in')));
  }

  // hidden list: the same records, grouped the way the current layout groups them
  function renderList() {
    if (!sr || !built) return;
    const L = layouts[cur];
    const parts = (built.groups ?? []).map((g) =>
      `<li>${esc(g.label)}, ${g.items.length}<ul>${g.items.map((i) => `<li>${esc(o.describe(records[i]))}</li>`).join('')}</ul></li>`);
    sr.innerHTML = `<p>${esc(L.label)}: ${esc(L.note ?? '')}</p><ul>${parts.join('')}</ul>`;
  }

  // ---- springs
  function kick() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function frame(now) {
    raf = 0;
    const dt = Math.min(0.034, Math.max(0, (now - last) / 1000));
    last = now;
    const steps = Math.max(1, Math.ceil(dt / SUB));
    const h = dt / steps;
    let moving = false;
    for (let i = 0; i < n; i++) {
      if (now < t0[i]) { moving = true; continue; }
      for (let s = 0; s < steps; s++) {
        vx[i] += (STIFF * (tx[i] - x[i]) - DAMP * vx[i]) * h; x[i] += vx[i] * h;
        vy[i] += (STIFF * (ty[i] - y[i]) - DAMP * vy[i]) * h; y[i] += vy[i] * h;
        vr[i] += (STIFF * (tr[i] - r[i]) - DAMP * vr[i]) * h; r[i] += vr[i] * h;
        vq[i] += (STIFF * (tq[i] - q[i]) - DAMP * vq[i]) * h; q[i] += vq[i] * h;
      }
      if (Math.abs(tx[i] - x[i]) + Math.abs(ty[i] - y[i]) > 0.06 || Math.abs(vx[i]) + Math.abs(vy[i]) > 0.6 ||
          Math.abs(tr[i] - r[i]) > 0.02 || Math.abs(tq[i] - q[i]) > 0.005) moving = true;
      else { x[i] = tx[i]; y[i] = ty[i]; r[i] = tr[i]; q[i] = tq[i]; vx[i] = vy[i] = vr[i] = vq[i] = 0; }
    }
    draw();
    placeTip();
    if (moving) raf = requestAnimationFrame(frame);
  }

  // ---- drawing
  const hasRR = typeof CanvasRenderingContext2D !== 'undefined' && 'roundRect' in CanvasRenderingContext2D.prototype;
  function mark(i, grow = 0) {
    const s = Math.max(0, r[i]) + grow;
    if (s < 0.3) return;
    const qq = Math.min(1, Math.max(0, q[i]));
    if (hasRR) ctx.roundRect(x[i] - s, y[i] - s, 2 * s, 2 * s, s * (1 - 0.7 * qq));
    else if (qq < 0.5) { ctx.moveTo(x[i] + s, y[i]); ctx.arc(x[i], y[i], s, 0, Math.PI * 2); }
    else ctx.rect(x[i] - s, y[i] - s, 2 * s, 2 * s);
  }
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (let c = 0; c < palette.length; c++) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) if (slot[i] === c) mark(i);
      ctx.globalAlpha = solo >= 0 && solo !== c ? 0.14 : 1;
      ctx.fillStyle = palette[c];
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (held >= 0) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = surface; ctx.beginPath(); mark(held, 1); ctx.stroke();
      ctx.strokeStyle = ink; ctx.beginPath(); mark(held, 3); ctx.stroke();
    }
  }

  // ---- the held record
  function fillTip() {
    if (held < 0) return;
    const t = o.tip(records[held]);
    tip.innerHTML = `<div class="um__tip-head"><span><i class="um__sw" style="background:var(--um-c${slot[held] + 1})"></i>${esc(t.title)}</span>` +
      `${pinned ? '<span class="um__tip-pin">Pinned</span>' : ''}</div><dl>${t.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
  }
  function placeTip() {
    if (held < 0) { tip.classList.remove('is-on'); return; }
    const tw = tip.offsetWidth, th = tip.offsetHeight, gap = Math.max(r[held], 3) + 10;
    let left = Math.min(Math.max(x[held] - tw / 2, 0), Math.max(0, W - tw));
    let top = y[held] - gap - th;
    if (top < 0) top = y[held] + gap;
    tip.style.transform = `translate(${Math.round(left)}px,${Math.round(top)}px)`;
    tip.classList.add('is-on');
  }
  function hold(i, pin = false, speak = false) {
    if (i === held && pin === pinned) return;
    held = i;
    pinned = i >= 0 && pin;
    fillTip();
    draw();
    placeTip();
    if (speak && i >= 0) say(`${o.describe(records[i])}${pinned ? ', pinned' : ''}`);
  }
  function say(text) { if (live) live.textContent = text; }

  // ---- pointer: hover holds, click or tap pins; leaving the plot keeps the record held
  function hit(e) {
    const b = plot.getBoundingClientRect();
    const px = e.clientX - b.left, py = e.clientY - b.top;
    let best = -1, bd = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(px - x[i], py - y[i]);
      const reach = Math.max(r[i] + 4, 9);
      if (d < reach && d < bd) { bd = d; best = i; }
    }
    return best;
  }
  plot.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const i = hit(e);
    plot.style.cursor = i >= 0 ? 'pointer' : '';
    if (i >= 0) { if (i !== held) hold(i, pinned && i === held); }
    else if (!pinned && held >= 0) hold(-1);
  });
  plot.addEventListener('click', (e) => {
    const i = hit(e);
    if (i < 0) hold(-1);
    else if (pinned && i === held) hold(i, false);
    else hold(i, true);
  });

  // ---- keyboard on the plot: ←/→ walk records in reading order, Enter pins, Esc lets go, 1…n switch layouts
  plot.addEventListener('keydown', (e) => {
    const seq = built?.seq ?? [];
    const at = Math.max(0, seq.indexOf(held));
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = held < 0 ? seq[0] : seq[Math.min(seq.length - 1, at + 1)];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = held < 0 ? seq[0] : seq[Math.max(0, at - 1)];
    else if (e.key === 'Home') next = seq[0];
    else if (e.key === 'End') next = seq[seq.length - 1];
    else if ((e.key === 'Enter' || e.key === ' ') && held >= 0) { e.preventDefault(); hold(held, !pinned, true); return; }
    else if (e.key === 'Escape') { hold(-1); say('Nothing held'); return; }
    if (next != null) { e.preventDefault(); hold(next, pinned, true); }
  });
  root.addEventListener('keydown', (e) => {
    const k = Number(e.key);
    if (k >= 1 && k <= layouts.length && !e.altKey && !e.ctrlKey && !e.metaKey && e.target.tagName !== 'INPUT') show(k - 1);
  });

  // ---- size and theme
  function resize() {
    const b = plot.getBoundingClientRect();
    const w = Math.round(b.width), h = Math.round(b.height);
    if (!w || !h || (w === W && h === H)) return;
    W = w; H = h;
    dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    if (cur >= 0) build(false);
    moveThumb();
  }
  new ResizeObserver(resize).observe(plot);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); draw(); });

  readColors();
  resize();
  show(o.initial ?? 0, false);
  ready = true;

  return {
    show,
    hold: (i, pin = true) => hold(i, pin),
    get layout() { return cur; },
    get held() { return held; }
  };
}

// ======================================================================================================
// Layouts. Each returns build(records, W, H). `group` gives a record's bucket index, `labels` name buckets.
// ======================================================================================================

function bucketize(records, group, k, sortBy) {
  const b = Array.from({ length: k }, () => []);
  records.forEach((r, i) => b[group(r)].push(i));
  if (sortBy) for (const list of b) list.sort((a, c) => sortBy(records[a]) - sortBy(records[c]));
  return b;
}

/** Unit columns: a bar per bucket, cut into exactly as many dots as it has records. */
export function columns({ group, labels, sortBy }) {
  return (records, W, H) => {
    const G = labels.length;
    const bk = bucketize(records, group, G, sortBy);
    const top = 30, bottom = 30, ah = H - top - bottom, cw = W / G;
    const max = Math.max(...bk.map((b) => b.length));
    let u = 0, c = 1;
    for (let k = 2; k <= 18; k++) {
      const uk = Math.min(ah / Math.ceil(max / k), (cw * 0.7) / k);
      if (uk > u) { u = uk; c = k; }
    }
    const marks = [], order = [], guides = [];
    guides.push({ t: 'h', y: top + ah + 4, x1: 0, x2: W, cls: 'axis' });
    bk.forEach((b, g) => {
      const cx = cw * (g + 0.5), x0 = cx - (c * u) / 2;
      b.forEach((i, k) => {
        marks[i] = [x0 + ((k % c) + 0.5) * u, top + ah - (Math.floor(k / c) + 0.5) * u, u * 0.4, 0];
        order[i] = (k / max) * 0.9 + g * 0.025;
      });
      const rows = Math.ceil(b.length / c);
      guides.push({ t: 'text', x: cx, y: top + ah - rows * u - 22, text: String(b.length), align: 'middle', cls: 'num' });
      guides.push({ t: 'text', x: cx, y: top + ah + 11, text: labels[g], align: 'middle' });
    });
    return { marks, order, seq: bk.flat(), guides, groups: bk.map((items, g) => ({ label: labels[g], items })) };
  };
}

/** Waffle: every record a square, buckets fill whole columns in turn, so the parts read as shares of one block. */
export function waffle({ group, labels, sortBy }) {
  return (records, W, H) => {
    const N = records.length;
    const bk = bucketize(records, group, labels.length, sortBy);
    const top = 6, foot = 46, ah = H - top - foot;
    let u = 0, rows = 1;
    for (let rws = 4; rws <= 40; rws++) {
      const cols = Math.ceil(N / rws);
      const uk = Math.min((W - 8) / cols, ah / rws);
      if (uk > u) { u = uk; rows = rws; }
    }
    u = Math.min(u, 26);
    const cols = Math.ceil(N / rows), x0 = (W - cols * u) / 2, y0 = top + (ah - rows * u) / 2;
    const marks = [], order = [], guides = [];
    let k = 0, lastRight = -Infinity;
    bk.forEach((b, g) => {
      const start = k;
      for (const i of b) {
        const col = Math.floor(k / rows), row = k % rows;
        marks[i] = [x0 + (col + 0.5) * u, y0 + (row + 0.5) * u, u * 0.42, 1];
        order[i] = (col / cols) * 0.95;
        k++;
      }
      const gx = x0 + Math.floor(start / rows) * u + 1;
      const width = (Math.ceil(k / rows) - Math.floor(start / rows)) * u;
      const pct = `${Math.round((b.length / N) * 100)}%`;
      const gy = y0 + rows * u + 10;
      if (gx < lastRight + 4) return;
      const html = width > 64 ? `<b>${pct}</b><br>${esc(labels[g])}` : `<b>${pct}</b>`;
      guides.push({ t: 'text', x: gx, y: gy, html });
      guides.push({ t: 'v', x: gx - 1, y1: gy - 6, y2: gy + (width > 64 ? 30 : 15), cls: 'axis' });
      lastRight = gx + (width > 64 ? Math.max(4, labels[g].length) * 6.6 : 30);
    });
    return { marks, order, seq: bk.flat(), guides, groups: bk.map((items, g) => ({ label: labels[g], items })) };
  };
}

/** Beeswarm on a log or linear axis: each dot sits at its value, pushed up or down just enough not to overlap. */
export function swarm({ value, domain, ticks = [], format = String, log = true, title = '', marker = null, bins = null }) {
  return (records, W, H) => {
    const left = 18, right = 18, top = 26, bottom = 32, ah = H - top - bottom, cy = top + ah / 2;
    const f = log ? Math.log : (v) => v;
    const [d0, d1] = [f(domain[0]), f(domain[1])];
    const sx = (v) => left + ((f(Math.min(Math.max(v, domain[0]), domain[1])) - d0) / (d1 - d0)) * (W - left - right);
    const idx = records.map((_, i) => i).sort((a, b) => value(records[a]) - value(records[b]));
    const xs = records.map((rec) => sx(value(rec)));
    let rad = Math.min(9, Math.max(3, Math.min(W, H) / 56)), ys;
    for (let tries = 0; tries < 12; tries++) {
      ys = dodge(idx, xs, rad);
      const span = Math.max(...ys.map(Math.abs)) + rad;
      if (span <= ah / 2 || rad < 2) break;
      rad *= Math.max(0.8, Math.sqrt((ah / 2) / span));
    }
    const marks = [], order = [];
    idx.forEach((i) => {
      marks[i] = [xs[i], cy + ys[i], rad, 0];
      order[i] = ((xs[i] - left) / (W - left - right)) * 0.9;
    });
    const guides = [];
    for (const t of ticks) {
      const gx = sx(t);
      guides.push({ t: 'v', x: Math.round(gx), y1: top - 4, y2: top + ah + 4 });
      guides.push({ t: 'text', x: gx, y: top + ah + 10, text: format(t), align: 'middle', cls: 'muted' });
    }
    if (title) guides.push({ t: 'text', x: left - 4, y: 0, text: title, cls: 'title' });
    if (marker) {
      const mx = sx(marker.value);
      guides.push({ t: 'v', x: Math.round(mx), y1: top - 6, y2: top + ah + 4, cls: 'mark' });
      guides.push({ t: 'text', x: mx + 6, y: top - 8, html: marker.html, cls: '' });
    }
    let groups = [{ label: 'All, from fastest to slowest', items: idx }];
    if (bins) groups = bins.map((b) => ({ label: b.label, items: idx.filter((i) => value(records[i]) >= b.from && value(records[i]) < b.to) }));
    return { marks, order, seq: idx, guides, groups };
  };
}

// place dots left to right; each takes the free y closest to the axis
function dodge(idx, xs, rad) {
  const D = 2 * rad + 1, ys = new Array(xs.length).fill(0), placed = [];
  for (const i of idx) {
    const near = [];
    for (let p = placed.length - 1; p >= 0; p--) {
      const j = placed[p], dx = xs[i] - xs[j];
      if (dx >= D) break;
      const h = Math.sqrt(D * D - dx * dx);
      near.push([ys[j] - h, ys[j] + h]);
    }
    const cand = [0];
    for (const [a, b] of near) cand.push(a, b);
    cand.sort((a, b) => Math.abs(a) - Math.abs(b));
    ys[i] = cand.find((c) => near.every(([a, b]) => c <= a + 1e-6 || c >= b - 1e-6)) ?? 0;
    placed.push(i);
  }
  return ys;
}

/** Tile map: a square block per bucket at a rough geographic spot; one mark per record, same mark size everywhere. */
export function tiles({ group, labels, at: atWide, cols: colsWide = 3, rows: rowsWide = 2, sortBy, narrow = null }) {
  return (records, W, H) => {
    const n = narrow && W < narrow.below;
    const at = n ? narrow.at : atWide, cols = n ? narrow.cols : colsWide, rows = n ? narrow.rows : rowsWide;
    const bk = bucketize(records, group, labels.length, sortBy);
    const cw = W / cols, ch = H / rows, head = 34;
    const shape = bk.map((b) => { const c = Math.max(1, Math.ceil(Math.sqrt(b.length))); return [c, Math.ceil(b.length / c)]; });
    const u = Math.min(22, ...shape.map(([c, rr]) => Math.min((cw * 0.8) / c, ((ch - head) * 0.86) / rr)));
    const marks = [], order = [], guides = [];
    bk.forEach((b, g) => {
      const [c, rr] = shape[g];
      const [ac, ar] = at[g];
      const cx = (ac + 0.5) * cw, top = ar * ch + head + ((ch - head) - rr * u) / 2;
      const x0 = cx - (c * u) / 2;
      b.forEach((i, k) => {
        marks[i] = [x0 + ((k % c) + 0.5) * u, top + (Math.floor(k / c) + 0.5) * u, u * 0.42, 1];
        order[i] = g * 0.05 + (k / b.length) * 0.6;
      });
      guides.push({ t: 'text', x: x0, y: top - 22, html: `<b>${esc(labels[g])}</b>&nbsp;&nbsp;<span class="um__g--muted">${b.length}</span>` });
    });
    return { marks, order, seq: bk.flat(), guides, groups: bk.map((items, g) => ({ label: labels[g], items })) };
  };
}
