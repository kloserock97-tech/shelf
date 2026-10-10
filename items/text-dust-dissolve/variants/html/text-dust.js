/* Text to Dust — a deleted list row crumbles into dust along a noisy front, specks leave the edges of the letters
   first, and Undo gathers them back. A share of the dust settles on the floor of the list and stays there.

   TextDust.mount(root) wires up the parts by class:
     .tdd-list   the rows' container (its bottom is the floor)      .tdd-row   a row, with a .tdd-del button inside
     .tdd-toast  "Deleted … · Undo" bar with a .tdd-undo button       .tdd-empty shown when no rows are left (.tdd-restore inside)
     .tdd-status role="status" line
   Text inside a row is drawn into a Canvas 2D (single-line text; [data-dust-shape] elements are drawn as filled
   rounded boxes, [data-dust-skip] is left out), turned into a mask, an inside distance and a birth time per pixel,
   and handed to WebGL2: one quad for what is left of the text, one point per speck. Every speck's path is a closed
   formula of its age, so playing time backwards is the Undo, and nothing is simulated on the CPU. */
(() => {
  'use strict';

  /* ---- our hash and seeded random numbers (items/hash-kit) ---- */
  const SALT = 0xb31c96c9;
  function hashU(x) {
    x ^= x >>> 16; x = Math.imul(x, 0x3f9c86cb);
    x ^= x >>> 14; x = Math.imul(x, 0x1ae9dacf);
    x ^= x >>> 15;
    return x >>> 0;
  }
  const hash2U = (x, y) => hashU((x + hashU((y + SALT) >>> 0)) >>> 0);
  const hashUnit = (h) => (h >>> 8) / 16777216;
  function makeRandom(seed = 1) {
    let s = seed >>> 0;
    return () => {
      s = (s + SALT) >>> 0;
      return hashU(s) / 4294967296;
    };
  }
  // value noise: hashed corners, smoothstep blend; two octaves
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const c = (i, j) => hashUnit(hash2U((xi + i) >>> 0, (yi + j) >>> 0));
    const a = c(0, 0) + (c(1, 0) - c(0, 0)) * sx;
    const b = c(0, 1) + (c(1, 1) - c(0, 1)) * sx;
    return a + (b - a) * sy;
  }
  const noise2 = (x, y) => 0.66 * vnoise(x, y) + 0.34 * vnoise(x * 2.07 + 13.7, y * 2.07 + 4.1);

  /* ---- timing (seconds) ---- */
  const FRONT = 1.0;           // the front crosses a row
  const TAIL = FRONT + 2.1;     // by now every speck has faded or landed
  const SETTLE_SHARE = 0.22;    // share of specks that fall to the floor and stay
  const HEAP_MAX = 14;          // css px of dust a floor spot can hold
  const SPREAD = [0.22, 0.5, 1, 0.5, 0.22]; // a landing speck raises its 2 px floor cell and the neighbours

  /* ---- shaders ---- */
  const QUAD_VS = `#version 300 es
layout(location = 0) in vec2 aUnit;
uniform vec2 uOrigin, uSize, uView;
out vec2 vUv;
void main() {
  vec2 p = (uOrigin + aUnit * uSize) / uView * 2.0 - 1.0;
  gl_Position = vec4(p.x, -p.y, 0.0, 1.0);
  vUv = aUnit;
}`;
  const QUAD_FS = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D uColor, uBirth;
uniform float uTime;
uniform vec3 uGlow;
out vec4 outColor;
void main() {
  vec4 c = texture(uColor, vUv);
  float left = texture(uBirth, vUv).r * ${FRONT.toFixed(2)} - uTime;
  if (left <= 0.0 || c.a < 0.004) discard;
  float edge = 1.0 - smoothstep(0.0, 0.09, left);
  outColor = vec4(mix(c.rgb, uGlow * c.a, edge * 0.85), c.a);
}`;
  const DUST_VS = `#version 300 es
layout(location = 0) in vec2 aLocal;
layout(location = 1) in float aBirth;
layout(location = 2) in vec4 aSeed;
layout(location = 3) in vec4 aColor;
layout(location = 4) in vec3 aSettle;
uniform float uTime, uDpr;
uniform vec2 uOrigin, uView;
uniform vec3 uGlow;
out vec4 vColor;
const float TAU = 6.2831853;
void main() {
  float age = uTime - aBirth;
  vec2 p = uOrigin + aLocal;
  float alpha = 1.0, size = 1.7, heat = 0.0;
  bool hidden = age <= 0.0;
  if (!hidden && aSettle.x > 0.5) {
    // lifted a little, then down to its spot on the heap
    float u = clamp(age / (1.1 + 0.8 * aSeed.z), 0.0, 1.0);
    float ease = 1.0 - (1.0 - u) * (1.0 - u);
    p.x = mix(p.x, aSettle.y, ease) + sin(age * 5.0 + aSeed.w * TAU) * 4.0 * (1.0 - u);
    p.y = mix(p.y, aSettle.z, u * u) - (12.0 + 26.0 * aSeed.y) * 4.0 * u * (1.0 - u);
    alpha = mix(1.0, 0.72, u);
    size = mix(2.0, 1.7, u);
    heat = 1.0 - smoothstep(0.0, 0.35, age);
  } else if (!hidden) {
    // carried up and to the right by a steady wind, with a wobble
    float life = 0.9 + 1.0 * aSeed.z;
    hidden = age >= life;
    vec2 v = vec2(24.0 + 70.0 * aSeed.x, -22.0 - 55.0 * aSeed.y);
    float w = 3.0 + 4.0 * aSeed.w;
    p += v * age + vec2(28.0, -10.0) * age * age;
    p += vec2(sin(age * w + aSeed.z * TAU), cos(age * w * 0.8 + aSeed.x * TAU)) * 5.0 * age;
    alpha = 1.0 - smoothstep(0.25 * life, life, age);
    size = mix(2.1, 1.0, clamp(age / life, 0.0, 1.0));
    heat = 1.0 - smoothstep(0.0, 0.3, age);
  }
  vec2 clip = p / uView * 2.0 - 1.0;
  gl_Position = hidden ? vec4(2.0, 2.0, 2.0, 1.0) : vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = hidden ? 0.0 : size * uDpr;
  vec3 rgb = aColor.a > 0.0 ? aColor.rgb / aColor.a : vec3(0.0);
  rgb = mix(rgb, uGlow, heat * 0.6);
  vColor = vec4(rgb * aColor.a, aColor.a) * alpha;
}`;
  const DUST_FS = `#version 300 es
precision mediump float;
in vec4 vColor;
out vec4 outColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d);
  if (r > 0.25) discard;
  outColor = vColor * (1.0 - smoothstep(0.14, 0.25, r));
}`;

  /* ---- the row as pixels: colour, coverage, inside distance, birth time ---- */
  function rasterize(row, dpr) {
    const r = row.getBoundingClientRect();
    const W = Math.max(1, Math.ceil(r.width * dpr));
    const H = Math.max(1, Math.ceil(r.height * dpr));
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    g.scale(dpr, dpr);
    for (const el of row.querySelectorAll('[data-dust-shape]')) {
      const s = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      g.fillStyle = s.backgroundColor;
      g.beginPath();
      if (g.roundRect) g.roundRect(b.left - r.left, b.top - r.top, b.width, b.height, parseFloat(s.borderTopLeftRadius) || 0);
      else g.rect(b.left - r.left, b.top - r.top, b.width, b.height);
      g.fill();
    }
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeValue.trim() && !n.parentElement.closest('button, [data-dust-skip], .tdd-sr') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)
    });
    const range = document.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const s = getComputedStyle(n.parentElement);
      range.selectNodeContents(n);
      const box = range.getClientRects()[0];
      if (!box) continue;
      const text = n.nodeValue.replace(/\s+/g, ' ').trim();
      g.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
      g.fillStyle = s.color;
      if ('letterSpacing' in g) g.letterSpacing = s.letterSpacing === 'normal' ? '0px' : s.letterSpacing;
      g.textBaseline = 'alphabetic';
      const m = g.measureText(text);
      const asc = m.fontBoundingBoxAscent ?? parseFloat(s.fontSize) * 0.9;
      const desc = m.fontBoundingBoxDescent ?? parseFloat(s.fontSize) * 0.25;
      g.fillText(text, box.left - r.left, box.top - r.top + (box.height - asc - desc) / 2 + asc);
    }
    return { canvas, img: g.getImageData(0, 0, W, H).data, W, H, w: r.width, h: r.height, rect: r };
  }

  // distance from each covered pixel to the nearest empty one: two chamfer passes (steps 3 and 4 ≈ 1 and √2)
  function insideDistance(mask, W, H) {
    const d = new Float32Array(W * H);
    for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 1e6 : 0;
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : d[y * W + x]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
    }
    for (let i = 0; i < d.length; i++) d[i] /= 3;
    return d;
  }

  function build(ras, dpr, rnd, origin, floorY, heap, viewW) {
    const { img, W, H } = ras;
    const mask = new Uint8Array(W * H);
    for (let i = 0; i < mask.length; i++) mask[i] = img[i * 4 + 3] > 24 ? 1 : 0;
    const dist = insideDistance(mask, W, H);
    // birth: mostly left → right, bent by noise, and later deep inside a stroke, so letters erode from the outline
    const f = new Float32Array(W * H);
    const cell = 1 / (22 * dpr);
    let lo = Infinity, hi = -Infinity;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const depth = Math.min(1, dist[i] / (2.2 * dpr));
      const v = 0.64 * (x / W) + 0.28 * noise2(x * cell, y * cell * 1.7) + 0.1 * depth;
      f[i] = v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const birth = new Uint8Array(W * H);
    for (let i = 0; i < f.length; i++) birth[i] = Math.round(((f[i] - lo) / (hi - lo || 1)) * 255);

    // one speck per css pixel of ink; edge pixels always, the inside of a stroke every other time
    const step = Math.max(1, Math.round(dpr));
    const specks = [];
    for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
      const i = y * W + x;
      const a = img[i * 4 + 3];
      if (a < 40) continue;
      if (dist[i] > 1.6 * dpr && rnd() > 0.5) continue;
      specks.push(i);
    }
    while (specks.length > 7000) specks.splice(Math.floor(rnd() * specks.length), 1);

    const STRIDE = 14;
    const data = new Float32Array(specks.length * STRIDE);
    const landed = [];
    specks.forEach((i, k) => {
      const x = i % W, y = (i - x) / W;
      const o = k * STRIDE;
      const lx = (x + rnd() * step) / dpr, ly = (y + rnd() * step) / dpr;
      const a = img[i * 4 + 3] / 255;
      data[o] = lx;
      data[o + 1] = ly;
      data[o + 2] = (birth[i] / 255) * FRONT;
      data[o + 3] = rnd(); data[o + 4] = rnd(); data[o + 5] = rnd(); data[o + 6] = rnd();
      data[o + 7] = (img[i * 4] / 255) * a; data[o + 8] = (img[i * 4 + 1] / 255) * a; data[o + 9] = (img[i * 4 + 2] / 255) * a; data[o + 10] = a;
      if (rnd() < SETTLE_SHARE) {
        // carried a little downwind, most land near the middle of that spread: small mounds, not a carpet
        const sx = Math.min(viewW - 4, Math.max(4, origin.x + lx + 26 + (rnd() + rnd() - 1) * 26));
        const b = Math.floor(sx / 2);
        const h = heap.get(b) || 0;
        data[o + 11] = 1;
        data[o + 12] = sx;
        data[o + 13] = floorY - h - rnd() * 0.8;
        const add = h < HEAP_MAX ? 1.1 : 0.12;
        for (let k = -2; k <= 2; k++) heap.set(b + k, (heap.get(b + k) || 0) + add * SPREAD[k + 2]);
        landed.push(b, add);
      }
    });
    return { data, count: specks.length, birth, landed };
  }

  /* ---- GL ---- */
  function compile(gl, vs, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) {
      const name = gl.getActiveUniform(p, i).name;
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p, u };
  }

  function mount(root) {
    if (root.tdd) return root.tdd;
    const list = root.querySelector('.tdd-list');
    const toast = root.querySelector('.tdd-toast');
    const toastText = toast && toast.querySelector('.tdd-toast__text');
    const undoBtn = toast && toast.querySelector('.tdd-undo');
    const empty = root.querySelector('.tdd-empty');
    const status = root.querySelector('.tdd-status');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const rnd = makeRandom(0x5eed);
    const heap = new Map();
    const deleted = [];        // { row, order, title, burst }
    let lastDeleted = null;
    let toastTimer = 0;

    [...list.querySelectorAll('.tdd-row')].forEach((row, i) => { row.dataset.order = String(i); });
    // the list keeps its height as rows go, and its bottom is the floor the dust settles on
    if (!list.style.minHeight) list.style.minHeight = `${list.offsetHeight + (Number(root.dataset.floor) || 44)}px`;

    /* GL state */
    const canvas = document.createElement('canvas');
    canvas.className = 'tdd-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    root.prepend(canvas);
    let gl = null, quad = null, dust = null, quadVao = null;
    let viewW = 1, viewH = 1, dpr = 1;
    const bursts = [];
    let raf = 0, last = 0, frozen = false, onScreen = true;

    function initGL() {
      try {
        gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
        if (!gl) return false;
        quad = compile(gl, QUAD_VS, QUAD_FS);
        dust = compile(gl, DUST_VS, DUST_FS);
        quadVao = gl.createVertexArray();
        gl.bindVertexArray(quadVao);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        return true;
      } catch (err) {
        gl = null;
        return false;
      }
    }
    const hasGL = initGL();
    canvas.addEventListener('webglcontextlost', (e) => {
      // the dust is decoration: drop it, the rows themselves are in the DOM
      e.preventDefault();
      for (const b of bursts.splice(0)) if (b.dir < 0) showRow(b.rec);
      gl = null;
    });

    const glow = () => (matchMedia('(prefers-color-scheme: dark)').matches ? [1.0, 0.7, 0.36] : [0.93, 0.5, 0.12]);

    function resize() {
      const r = root.getBoundingClientRect();
      dpr = Math.min(2, devicePixelRatio || 1);
      viewW = Math.max(1, r.width);
      viewH = Math.max(1, r.height);
      const w = Math.round(viewW * dpr), h = Math.round(viewH * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      draw();
    }
    const floorY = () => {
      const r = root.getBoundingClientRect(), l = list.getBoundingClientRect();
      return l.bottom - r.top - 6;
    };

    function makeBurst(rec) {
      const row = rec.row;
      const ras = rasterize(row, dpr);
      const r = root.getBoundingClientRect();
      const origin = { x: ras.rect.left - r.left, y: ras.rect.top - r.top };
      const built = build(ras, dpr, rnd, origin, floorY(), heap, viewW);
      const b = { rec, origin, size: [ras.w, ras.h], t: 0, dir: 1, speed: 1, count: built.count, landed: built.landed, collapsed: false };
      b.color = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, b.color);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, ras.canvas);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      b.birth = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, b.birth);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, ras.W, ras.H, 0, gl.RED, gl.UNSIGNED_BYTE, built.birth);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      b.vao = gl.createVertexArray();
      gl.bindVertexArray(b.vao);
      b.buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b.buf);
      gl.bufferData(gl.ARRAY_BUFFER, built.data, gl.STATIC_DRAW);
      const F = 4, S = 14 * F;
      [[0, 2, 0], [1, 1, 2], [2, 4, 3], [3, 4, 7], [4, 3, 11]].forEach(([loc, n, off]) => {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, n, gl.FLOAT, false, S, off * F);
      });
      gl.bindVertexArray(null);
      return b;
    }

    function freeBurst(b) {
      if (!gl) return;
      gl.deleteTexture(b.color);
      gl.deleteTexture(b.birth);
      gl.deleteBuffer(b.buf);
      gl.deleteVertexArray(b.vao);
      for (let i = 0; i < b.landed.length; i += 2) {
        const k = b.landed[i], add = b.landed[i + 1];
        for (let j = -2; j <= 2; j++) heap.set(k + j, Math.max(0, (heap.get(k + j) || 0) - add * SPREAD[j + 2]));
      }
    }

    function draw() {
      if (!gl) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!bursts.length) return;
      const [gr, gg, gb] = glow();
      gl.useProgram(quad.p);
      gl.uniform2f(quad.u.uView, viewW, viewH);
      gl.uniform3f(quad.u.uGlow, gr, gg, gb);
      gl.uniform1i(quad.u.uColor, 0);
      gl.uniform1i(quad.u.uBirth, 1);
      gl.bindVertexArray(quadVao);
      for (const b of bursts) {
        if (b.t > FRONT + 0.02) continue;
        gl.uniform2f(quad.u.uOrigin, b.origin.x, b.origin.y);
        gl.uniform2f(quad.u.uSize, b.size[0], b.size[1]);
        gl.uniform1f(quad.u.uTime, b.t);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, b.color);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, b.birth);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.useProgram(dust.p);
      gl.uniform2f(dust.u.uView, viewW, viewH);
      gl.uniform1f(dust.u.uDpr, dpr);
      gl.uniform3f(dust.u.uGlow, gr, gg, gb);
      for (const b of bursts) {
        gl.bindVertexArray(b.vao);
        gl.uniform2f(dust.u.uOrigin, b.origin.x, b.origin.y);
        gl.uniform1f(dust.u.uTime, b.t);
        gl.drawArrays(gl.POINTS, 0, b.count);
      }
      gl.bindVertexArray(null);
    }

    function frame(now) {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      let busy = false;
      for (const b of [...bursts]) {
        if (b.dir > 0) {
          if (b.t < TAIL) b.t = Math.min(TAIL, b.t + dt);
          if (!b.collapsed && b.t >= FRONT + 0.06) collapse(b.rec);
          if (b.t < TAIL) busy = true;
        } else {
          b.t = Math.max(0, b.t - dt * b.speed);
          if (b.t <= 0) finishRestore(b);
          else busy = true;
        }
      }
      draw();
      if (busy) kick();
    }
    function kick() {
      if (raf || frozen || !onScreen || document.hidden || !gl) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
    document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else kick(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => {
        onScreen = e.isIntersecting;
        if (onScreen) kick();
        else { cancelAnimationFrame(raf); raf = 0; }
      }).observe(root);
    }
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(root);
    resize();

    /* ---- the list side ---- */
    const titleOf = (row) => (row.querySelector('[data-dust-title]') || row).textContent.trim();
    const rows = () => [...list.querySelectorAll('.tdd-row')];
    const say = (text) => { if (status) { status.textContent = ''; requestAnimationFrame(() => { status.textContent = text; }); } };

    function collapse(rec, instant = false) {
      const b = rec.burst;
      if (b) b.collapsed = true;
      if (rec.collapsed) return;
      rec.collapsed = true;
      const row = rec.row;
      const done = () => {
        if (!rec.collapsed) return; // restored meanwhile
        row.remove();
        row.style.height = '';
        if (!rows().length) showEmpty(true);
      };
      if (instant || reduce.matches) return done();
      row.animate([{ height: `${row.offsetHeight}px` }, { height: '0px' }], { duration: 300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' })
        .finished.then(() => { row.getAnimations().forEach((a) => a.cancel()); done(); }, done);
    }

    function remove(row) {
      if (!row || row.classList.contains('is-dust')) return;
      const rec = { row, order: Number(row.dataset.order), title: titleOf(row), burst: null, collapsed: false };
      // keep the keyboard nearby: the next row, or the one before, or the toast
      const all = rows();
      const at = all.indexOf(row);
      const next = all[at + 1] || all[at - 1];
      const hadFocus = row.contains(document.activeElement);
      deleted.push(rec);
      row.classList.add('is-dust');
      row.inert = true;
      if (gl && !reduce.matches) {
        rec.burst = makeBurst(rec);
        row.classList.add('is-dusting');
        bursts.push(rec.burst);
        kick();
      } else {
        row.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-out', fill: 'forwards' })
          .finished.then(() => { row.getAnimations().forEach((a) => a.cancel()); collapse(rec); }, () => collapse(rec));
      }
      showToast(rec);
      if (hadFocus) (next ? next.querySelector('.tdd-del') : undoBtn)?.focus({ preventScroll: true });
      say(`Deleted ${rec.title}. Undo is available.`);
      return rec;
    }

    function place(rec) {
      const later = rows().find((r) => Number(r.dataset.order) > rec.order);
      // rows below make room by sliding down from where they are now
      const below = rows().filter((r) => Number(r.dataset.order) > rec.order);
      const before = below.map((r) => r.getBoundingClientRect().top);
      rec.collapsed = false;
      rec.row.getAnimations().forEach((a) => a.cancel());
      list.insertBefore(rec.row, later || null);
      if (!reduce.matches) below.forEach((r, i) => {
        const dy = before[i] - r.getBoundingClientRect().top;
        if (dy) r.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 300, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
      });
    }

    function restore(rec) {
      const i = deleted.indexOf(rec);
      if (i < 0) return;
      deleted.splice(i, 1);
      if (lastDeleted === rec) hideToast();
      showEmpty(false);
      const b = rec.burst;
      if (rec.collapsed) place(rec);
      if (b && gl && bursts.includes(b)) {
        const r = root.getBoundingClientRect(), rr = rec.row.getBoundingClientRect();
        b.origin = { x: rr.left - r.left, y: rr.top - r.top };
        b.dir = -1;
        b.speed = Math.max(1, b.t / 1.1);
        b.collapsed = true;
        kick();
      } else {
        if (b) { bursts.splice(bursts.indexOf(b), 1); freeBurst(b); rec.burst = null; }
        showRow(rec);
        rec.row.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
      }
      say(`Restored ${rec.title}.`);
    }

    function finishRestore(b) {
      bursts.splice(bursts.indexOf(b), 1);
      freeBurst(b);
      b.rec.burst = null;
      showRow(b.rec);
    }
    function showRow(rec) {
      rec.row.classList.remove('is-dust', 'is-dusting');
      rec.row.inert = false;
      rec.row.getAnimations().forEach((a) => a.cancel());
    }

    function showToast(rec) {
      if (!toast) return;
      lastDeleted = rec;
      toastText.textContent = `Deleted “${rec.title}”`;
      toast.hidden = false;
      toast.classList.remove('is-out');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(hideToast, 6000);
    }
    function hideToast() {
      if (!toast || toast.hidden) return;
      clearTimeout(toastTimer);
      lastDeleted = null;
      const wasFocused = toast.contains(document.activeElement);
      toast.classList.add('is-out');
      const done = () => { if (toast.classList.contains('is-out')) toast.hidden = true; };
      if (reduce.matches) done(); else setTimeout(done, 200);
      if (wasFocused) (rows()[0]?.querySelector('.tdd-del') || empty?.querySelector('.tdd-restore'))?.focus({ preventScroll: true });
    }

    function showEmpty(on) {
      if (!empty) return;
      if (on === !empty.hidden) return;
      empty.hidden = !on;
      if (on) {
        if (!reduce.matches) empty.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 120, easing: 'ease-out', fill: 'backwards' });
        if (!toast || toast.hidden) empty.querySelector('.tdd-restore')?.focus({ preventScroll: true });
      }
    }

    list.addEventListener('click', (e) => {
      const del = e.target.closest('.tdd-del');
      if (del) remove(del.closest('.tdd-row'));
    });
    list.addEventListener('keydown', (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && e.target.closest('.tdd-row')) {
        e.preventDefault();
        remove(e.target.closest('.tdd-row'));
      }
    });
    undoBtn?.addEventListener('click', () => { if (lastDeleted) restore(lastDeleted); });
    root.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && lastDeleted) {
        e.preventDefault();
        restore(lastDeleted);
      }
    });
    empty?.querySelector('.tdd-restore')?.addEventListener('click', () => {
      [...deleted].sort((a, b) => a.order - b.order).forEach((rec, i) => setTimeout(() => restore(rec), i * 110));
    });

    root.tdd = {
      remove,
      undo: () => lastDeleted && restore(lastDeleted),
      restoreAll: () => empty?.querySelector('.tdd-restore')?.click(),
      hasGL,
      /** Freeze time and show a set of rows at given moments: [[row, seconds], …]; seconds ≥ TAIL means settled. */
      pose(list) {
        frozen = true;
        cancelAnimationFrame(raf);
        raf = 0;
        for (const [row, t] of list) {
          const rec = remove(row);
          if (rec && rec.burst) {
            rec.burst.t = Math.min(TAIL, t);
            if (t >= FRONT + 0.06) collapse(rec, true);
          }
        }
        draw();
      },
      TAIL
    };
    return root.tdd;
  }

  window.TextDust = { mount };
})();
