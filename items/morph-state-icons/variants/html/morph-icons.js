/* Morph State Icons: line icons whose states flow into each other. Every stroke of an icon is a short path of lines
   and arcs; all states of one stroke have the same number of segments, and the points are spread over the segments
   the same way in every state, so a corner always lands on a corner. A move between states is a spring on one
   number 0 → 1 that interpolates the points, the fill and the opacity of each stroke; the spring may overshoot a
   little. SVG on a 24 grid, line 1.5, currentColor. Frames run only while a spring moves. */

const N = 33; // points per stroke

/* ── geometry: a pen that draws lines and arcs (y down, angles in degrees, positive sweep = clockwise on screen) ── */

export function pen(x, y) {
  const shape = { start: [x, y], segs: [] };
  let cx = x, cy = y;
  const api = {
    shape,
    l(x2, y2) { shape.segs.push({ L: [x2, y2] }); cx = x2; cy = y2; return api; },
    /** arc around (ox, oy) from the current point by `sweep` degrees */
    arc(ox, oy, sweep) {
      const r = Math.hypot(cx - ox, cy - oy);
      const a0 = Math.atan2(cy - oy, cx - ox);
      const a1 = a0 + (sweep * Math.PI) / 180;
      shape.segs.push({ A: [ox, oy, r, a0, a1] });
      cx = ox + Math.cos(a1) * r; cy = oy + Math.sin(a1) * r;
      return api;
    },
    z() { if (Math.hypot(cx - x, cy - y) > 1e-6) api.l(x, y); return api; }
  };
  return api;
}

const segLength = (from, s) => (s.L ? Math.hypot(s.L[0] - from[0], s.L[1] - from[1]) : Math.abs(s.A[4] - s.A[3]) * s.A[2]);
const segEnd = (s) => (s.L ? s.L : [s.A[0] + Math.cos(s.A[4]) * s.A[2], s.A[1] + Math.sin(s.A[4]) * s.A[2]]);
const lengths = (shape) => {
  let p = shape.start;
  return shape.segs.map((s) => { const len = segLength(p, s); p = segEnd(s); return len; });
};

/** split n − 1 intervals between segments in proportion to their lengths, at least one each */
function allocate(lens, n = N) {
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  const free = n - 1 - lens.length;
  const raw = lens.map((l) => (l / total) * free);
  const out = raw.map((r) => 1 + Math.floor(r));
  let left = n - 1 - out.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { out[i]++; left--; } });
  return out;
}

/** n points along the shape: every segment end is one of them, so corners stay sharp */
function sample(shape, alloc) {
  const pts = new Float32Array(N * 2);
  let k = 0, p = shape.start;
  pts[k++] = p[0]; pts[k++] = p[1];
  shape.segs.forEach((s, j) => {
    const m = alloc[j];
    for (let i = 1; i <= m; i++) {
      const t = i / m;
      if (s.L) { pts[k++] = p[0] + (s.L[0] - p[0]) * t; pts[k++] = p[1] + (s.L[1] - p[1]) * t; }
      else {
        const a = s.A[3] + (s.A[4] - s.A[3]) * t;
        pts[k++] = s.A[0] + Math.cos(a) * s.A[2]; pts[k++] = s.A[1] + Math.sin(a) * s.A[2];
      }
    }
    p = segEnd(s);
  });
  return pts;
}

// shape helpers
const line = (x1, y1, x2, y2) => pen(x1, y1).l(x2, y2).shape;
const poly = (pts, closed) => { const p = pen(...pts[0]); pts.slice(1).forEach((q) => p.l(...q)); if (closed) p.z(); return p.shape; };
const rrect = (x, y, w, h, r) =>
  pen(x + r, y).l(x + w - r, y).arc(x + w - r, y + r, 90).l(x + w, y + h - r).arc(x + w - r, y + h - r, 90)
    .l(x + r, y + h).arc(x + r, y + h - r, 90).l(x, y + r).arc(x + r, y + r, 90).shape;
const ring3 = (cx, cy, r) => pen(cx, cy - r).arc(cx, cy, 120).arc(cx, cy, 120).arc(cx, cy, 120).shape;
const dot = (x, y, segs = 1) => { const p = pen(x, y); for (let i = 0; i < segs; i++) p.l(x, y); return p.shape; };

/** a tangent point on a circle seen from (tx, ty); side ±1 picks one of the two */
function tangent(tx, ty, cx, cy, r, side) {
  const dx = cx - tx, dy = cy - ty, L = Math.hypot(dx, dy);
  const a = Math.atan2(dy, dx) + side * Math.asin(r / L), t = Math.sqrt(L * L - r * r);
  return [tx + Math.cos(a) * t, ty + Math.sin(a) * t];
}
const sweepCW = (from, to) => { let s = ((to - from) * 180) / Math.PI; while (s <= 0) s += 360; return s; };

function heart() {
  const tip = [12, 19.6], r = 3.95, cl = [8.6, 9.3], cr = [15.4, 9.3];
  const pick = (c, dir) => [tangent(...tip, ...c, r, 1), tangent(...tip, ...c, r, -1)].sort((p, q) => dir * (p[0] - q[0]))[0];
  const tl = pick(cl, 1), tr = pick(cr, -1); // the outer tangents: leftmost on the left lobe, rightmost on the right
  const top = [12, cl[1] - Math.sqrt(r * r - (12 - cl[0]) ** 2)];
  const ang = (p, c) => Math.atan2(p[1] - c[1], p[0] - c[0]);
  return pen(...tip).l(...tl).arc(...cl, sweepCW(ang(tl, cl), ang(top, cl))).arc(...cr, sweepCW(ang(top, cr), ang(tr, cr))).z().shape;
}
const HEART = heart();

/* ── icons: states → strokes. A stroke is { d: shape, fill: 0…1, op: 0…1, knock: cuts a gap out of the others } ── */

const S = (d, o = {}) => ({ d, fill: 0, op: 1, tf: [0, 0, 0, 1], ...o });
// a stroke drawn around the origin and placed by tf = [x, y, degrees, scale]
const T = (d, tf, o = {}) => S(d, { tf: [tf[0], tf[1], tf[2] || 0, tf[3] ?? 1], ...o });
const BAR = line(-7, 0, 7, 0);

export const ICONS = {
  'play-pause': {
    play: [S(poly([[8, 5], [19, 11.95], [19, 12.05], [8, 19]], true)), S(poly([[8, 5], [19, 11.95], [19, 12.05], [8, 19]], true))],
    pause: [S(poly([[7, 5], [10.5, 5], [10.5, 19], [7, 19]], true)), S(poly([[13.5, 5], [17, 5], [17, 19], [13.5, 19]], true))]
  },
  'menu-close': {
    menu: [T(BAR, [12, 7]), T(BAR, [12, 12]), T(BAR, [12, 17])],
    close: [T(BAR, [12, 12, 45, 1.04]), T(BAR, [12, 12, 0, 0], { op: 0 }), T(BAR, [12, 12, -45, 1.04])]
  },
  'plus-check': {
    plus: [S(line(5, 12, 19, 12)), S(line(12, 19, 12, 5))],
    check: [S(line(5, 12.6, 9.8, 17.4)), S(line(9.8, 17.4, 19, 7.2))],
    pop: { check: 0.12 }
  },
  bell: {
    on: [
      S(pen(4.5, 17.5).l(6, 15.8).l(6, 11).arc(12, 11, 180).l(18, 15.8).l(19.5, 17.5).z().shape),
      S(pen(10.1, 20.3).arc(12, 19.6, -140).shape),
      S(line(3.5, 3.5, 3.5, 3.5), { op: 0, knock: true })
    ],
    off: [
      S(pen(4.5, 17.5).l(6, 15.8).l(6, 11).arc(12, 11, 180).l(18, 15.8).l(19.5, 17.5).z().shape),
      S(pen(10.1, 20.3).arc(12, 19.6, -140).shape),
      S(line(3.5, 3.5, 20.5, 20.5), { knock: true })
    ]
  },
  copy: {
    copy: [
      S(pen(5, 15).l(5, 7).arc(7, 7, 90).l(15, 5).shape),
      S(rrect(8, 8, 11, 11, 2)),
      S(dot(11, 13.8, 2), { op: 0 })
    ],
    copied: [
      S(pen(8, 17).l(8, 10).arc(10, 10, 90).l(17, 8).shape),
      S(rrect(8, 8, 11, 11, 2)),
      S(poly([[11, 13.8], [13, 15.8], [16.5, 11.6]]))
    ],
    pop: { copied: 0.08 }
  },
  'mic-stop': {
    mic: [S(rrect(9, 3, 6, 11, 3)), S(pen(6, 11).arc(12, 11, -180).shape), S(line(12, 17, 12, 20.5))],
    stop: [S(rrect(6.5, 6.5, 11, 11, 2.5), { fill: 1 }), S(pen(12.01, 12).arc(12, 12, -180).shape, { op: 0 }), S(line(12, 12, 12, 12), { op: 0 })]
  },
  heart: {
    off: [S(HEART)],
    on: [S(HEART, { fill: 1 })],
    pop: { on: 0.2 }
  },
  download: {
    download: [S(line(12, 4, 12, 14.5)), S(poly([[7.5, 10.5], [12, 15], [16.5, 10.5]])), S(poly([[5, 16.5], [5, 19.5], [19, 19.5], [19, 16.5]]))],
    // a state may be a function of a parameter: here the arc follows the progress 0…1
    progress: (p = 0) => [
      S(pen(12, 3.5).arc(12, 12, Math.max(0.015, Math.min(1, p)) * 360).shape),
      S(poly([[9.6, 11], [12, 13.4], [14.4, 11]])),
      S(ring3(12, 12, 8.5), { op: 0.22 })
    ],
    done: [S(pen(12, 3.5).arc(12, 12, 360).shape), S(poly([[8, 12.3], [10.9, 15.2], [16.3, 9.4]])), S(ring3(12, 12, 8.5), { op: 0 })],
    pop: { done: 0.1 }
  }
};

/* ── the morph ── */

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const SVGNS = 'http://www.w3.org/2000/svg';
let uid = 0;

/** shared point allocation per stroke, from the mean segment lengths over all states (dynamic ones at p = 0.6) */
function prepare(def) {
  if (def._alloc) return def;
  const names = Object.keys(def).filter((k) => k !== 'pop' && !k.startsWith('_'));
  const strokesOf = (n) => (typeof def[n] === 'function' ? def[n](0.6) : def[n]);
  const count = strokesOf(names[0]).length;
  def._alloc = [];
  for (let k = 0; k < count; k++) {
    const all = names.map((n) => lengths(strokesOf(n)[k].d));
    const same = all.every((l) => l.length === all[0].length);
    def._alloc[k] = same ? allocate(all[0].map((_, j) => all.reduce((a, l) => a + l[j], 0) / all.length)) : null;
  }
  def._names = names;
  return def;
}

const fmt = (v) => Math.round(v * 100) / 100;
function toD(pts) {
  let s = `M${fmt(pts[0])} ${fmt(pts[1])}`;
  for (let i = 2; i < pts.length; i += 2) s += `L${fmt(pts[i])} ${fmt(pts[i + 1])}`;
  return s;
}

/**
 * Puts a morphing <svg> into `host`. name — a key of ICONS (or pass a definition object). Returns
 * { svg, state, set(state, { param, at }), param(v), on(fn) }: set() springs to a state, `param` feeds a state that is
 * a function (download progress), `at` freezes the move at 0…1 (posters).
 */
export function createMorphIcon(host, name, { state, param = 0, stiffness = 380, damping = 26 } = {}) {
  const def = prepare(typeof name === 'string' ? ICONS[name] : name);
  const strokesFor = (st, p) => {
    const raw = typeof def[st] === 'function' ? def[st](p) : def[st];
    return raw.map((s, k) => ({ ...s, pts: sample(s.d, def._alloc[k] || allocate(lengths(s.d))) }));
  };

  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'msi');
  const g = document.createElementNS(SVGNS, 'g');
  svg.append(g);
  let cur = state || def._names[0];
  let curParam = param;
  let target = strokesFor(cur, curParam);
  const paths = target.map(() => document.createElementNS(SVGNS, 'path'));
  const knockIdx = target.findIndex((s) => s.knock);
  let maskPath = null;
  if (knockIdx >= 0) {
    // the knocking stroke cuts a gap out of the others through a mask, so it works on any background
    const id = `msi-knock-${++uid}`;
    const mask = document.createElementNS(SVGNS, 'mask');
    mask.setAttribute('id', id);
    mask.setAttribute('maskUnits', 'userSpaceOnUse');
    const bg = document.createElementNS(SVGNS, 'rect');
    Object.entries({ x: -2, y: -2, width: 28, height: 28, fill: 'white' }).forEach(([k, v]) => bg.setAttribute(k, v));
    maskPath = document.createElementNS(SVGNS, 'path');
    maskPath.setAttribute('class', 'msi__knock');
    mask.append(bg, maskPath);
    const defs = document.createElementNS(SVGNS, 'defs');
    defs.append(mask);
    svg.prepend(defs);
    const masked = document.createElementNS(SVGNS, 'g');
    masked.setAttribute('mask', `url(#${id})`);
    paths.forEach((p, k) => (k === knockIdx ? g : masked).append(p));
    g.prepend(masked);
  } else {
    paths.forEach((p) => g.append(p));
  }
  host.append(svg);

  let from = target.map((s) => ({ pts: s.pts.slice(), tf: s.tf, fill: s.fill, op: s.op }));
  let x = 1, v = 0, raf = 0, last = 0, frozen = null;
  const listeners = [];

  // stroke k between where it started (from) and its target, at xt
  function mix(s, k, xt) {
    const a = from[k], pts = new Float32Array(N * 2);
    for (let i = 0; i < pts.length; i++) pts[i] = a.pts[i] + (s.pts[i] - a.pts[i]) * xt;
    const tf = a.tf.map((t, j) => t + (s.tf[j] - t) * xt);
    return { pts, tf, fill: a.fill + (s.fill - a.fill) * xt, op: a.op + (s.op - a.op) * xt };
  }

  function draw() {
    const live = typeof def[cur] === 'function' ? strokesFor(cur, curParam) : target;
    const xt = frozen ?? x;
    const buf = new Float32Array(N * 2);
    live.forEach((s, k) => {
      const m = mix(s, k, xt);
      // the stroke's own move, turn and scale: lets a bar swing rigidly instead of bending
      const [tx, ty, deg, sc] = m.tf, c = Math.cos((deg * Math.PI) / 180) * sc, sn = Math.sin((deg * Math.PI) / 180) * sc;
      for (let i = 0; i < buf.length; i += 2) {
        buf[i] = tx + m.pts[i] * c - m.pts[i + 1] * sn;
        buf[i + 1] = ty + m.pts[i] * sn + m.pts[i + 1] * c;
      }
      const d = toD(buf);
      const op = Math.max(0, Math.min(1, m.op));
      const fill = Math.max(0, Math.min(1, m.fill));
      const p = paths[k];
      p.setAttribute('d', d);
      p.setAttribute('stroke-opacity', fmt(op));
      p.setAttribute('fill', fill > 0.005 ? 'currentColor' : 'none');
      p.setAttribute('fill-opacity', fmt(fill * op));
      if (k === knockIdx && maskPath) { maskPath.setAttribute('d', d); maskPath.setAttribute('stroke-opacity', fmt(op)); }
    });
    const pop = def.pop?.[cur] || 0;
    const sc = 1 + pop * Math.sin(Math.PI * Math.max(0, Math.min(1, xt)));
    if (sc === 1) g.removeAttribute('transform');
    else g.setAttribute('transform', `translate(12 12) scale(${Math.round(sc * 1000) / 1000}) translate(-12 -12)`);
    return live;
  }

  function step(now) {
    raf = 0;
    const dt = Math.min(1 / 30, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    // a spring on x towards 1, semi-implicit Euler in two half steps
    for (let h = 0; h < 2; h++) {
      v += (-stiffness * (x - 1) - damping * v) * (dt / 2);
      x += v * (dt / 2);
    }
    if (Math.abs(x - 1) < 0.0015 && Math.abs(v) < 0.02) { x = 1; v = 0; }
    draw();
    if (x !== 1) raf = requestAnimationFrame(step); else last = 0;
  }

  function snapshot() {
    // what is on screen right now becomes the start of the next move
    const live = typeof def[cur] === 'function' ? strokesFor(cur, curParam) : target;
    return live.map((s, k) => mix(s, k, frozen ?? x));
  }

  const api = {
    svg,
    get state() { return cur; },
    set(next, { param: p, at } = {}) {
      if (p != null) curParam = p;
      if (next === cur && at == null) { draw(); return api; }
      from = snapshot();
      cur = next;
      target = strokesFor(cur, curParam);
      frozen = at ?? null;
      x = 0; v = 0;
      listeners.forEach((f) => f(cur));
      if (at != null || reduceMotion.matches) { x = 1; draw(); return api; }
      if (!raf) raf = requestAnimationFrame(step);
      return api;
    },
    /** feeds the parameter of a function state (e.g. progress) and redraws */
    param(p) {
      curParam = p;
      if (typeof def[cur] === 'function') { target = strokesFor(cur, curParam); if (!raf) draw(); }
      return api;
    },
    on(fn) { listeners.push(fn); return api; },
    destroy() { cancelAnimationFrame(raf); svg.remove(); }
  };
  draw();
  return api;
}

/**
 * Wires a button to a two-state icon and keeps its accessibility in step with the shape:
 * mode 'pressed' — aria-pressed, the name stays; 'expanded' — aria-expanded (menus); 'label' — the name itself
 * changes (play / pause). labels: { [state]: name }, captions: { [state]: visible text } for [data-msi-caption].
 */
export function bindToggle(button, icon, { states, mode = 'pressed', labels = {}, captions = {}, onChange } = {}) {
  const [a, b] = states;
  const caption = button.closest('[data-msi-tile]')?.querySelector('[data-msi-caption]') || button.querySelector('[data-msi-caption]');
  const apply = (st) => {
    const on = st === b;
    if (mode === 'pressed') button.setAttribute('aria-pressed', String(on));
    if (mode === 'expanded') button.setAttribute('aria-expanded', String(on));
    if (labels[st]) button.setAttribute('aria-label', labels[st]);
    if (caption && captions[st]) caption.textContent = captions[st];
    button.dataset.state = st;
  };
  const set = (st, opts) => { icon.set(st, opts); apply(st); };
  apply(icon.state);
  button.addEventListener('click', () => {
    const next = icon.state === a ? b : a;
    set(next);
    onChange?.(next);
  });
  return { set };
}
