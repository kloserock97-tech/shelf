/* Datamosh Transition — a screen change that behaves like a broken video codec. During the transition the picture
   is a feedback buffer: every frame is predicted from the previous one by moving 16×16 blocks along "motion vectors"
   (P-frames), so the old screen's pixels are dragged around by motion that belongs to the new one. A few blocks are
   refreshed from the new screen and a faint residual seeps in. When the keyframe (I-frame) arrives, the new screen
   is decoded block by block in raster order and the mess is gone.

     import { createDatamosh } from './datamosh.js';
     const mosh = createDatamosh(canvas, [paintInbox, paintTrip], { onChange: (i) => … });
     mosh.play();                 // automatic: ~0.65 s of P-frames, then the keyframe

   Screens are functions paint(ctx, width, height) drawn in CSS px. Dragging on the canvas drives the flow: the
   vectors follow the drag and the pixels keep melting while you hold; release sends the keyframe. A drag longer
   than 3.5 s gets a keyframe on its own, like the end of a group of pictures. Returns null without WebGL2. */

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uPrev;     // the last decoded frame (texel row 0 = top of the picture)
uniform sampler2D uNext;     // the screen we are moving to
uniform int uMode;           // 0 — P-frame, 1 — keyframe sweep, 2 — cross-fade, 3 — show uPrev
uniform ivec2 uRes;          // device px
uniform float uBlock;        // block size, device px
uniform vec2 uDrive;         // vector bias for this step, device px
uniform float uAmount;       // 0…1, how wild the vectors are
uniform float uSeed;         // changes every few steps: vectors stay coherent for a while, then jump
uniform float uSweep;        // keyframe progress 0…1 / fade 0…1
uniform bool uFlip;          // drawing to the screen (row 0 at the bottom)
out vec4 outColor;

// ---- hash from Hash Kit ----
const uint HASH_SALT = 0xb31c96c9u;
uint hashU(uint x) {
  x ^= x >> 16; x *= 0x3f9c86cbu;
  x ^= x >> 14; x *= 0x1ae9dacfu;
  x ^= x >> 15;
  return x;
}
uint hashU(uvec3 v) { return hashU(v.x + hashU(v.y + hashU(v.z + HASH_SALT))); }
float hashUnit(uint h) { return float(h >> 8) * (1.0 / 16777216.0); }
float hash3(vec3 p) { return hashUnit(hashU(uvec3(ivec3(floor(p))))); }

// our value noise over block coordinates
float vnoise(vec2 p, float z) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash3(vec3(i, z)), b = hash3(vec3(i + vec2(1.0, 0.0), z));
  float c = hash3(vec3(i + vec2(0.0, 1.0), z)), d = hash3(vec3(i + vec2(1.0, 1.0), z));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

vec4 fetch(sampler2D t, ivec2 p) { return texelFetch(t, clamp(p, ivec2(0), uRes - 1), 0); }
float luma(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  if (uMode == 3) { outColor = fetch(uPrev, uFlip ? ivec2(p.x, uRes.y - 1 - p.y) : p); return; }
  vec4 prev = fetch(uPrev, p);
  vec4 next = fetch(uNext, p);
  if (uMode == 2) { outColor = mix(prev, next, uSweep); return; }

  vec2 blk = floor(vec2(p) / uBlock);
  vec2 blocks = ceil(vec2(uRes) / uBlock);
  if (uMode == 1) {
    // the keyframe lands in raster order, a row of blocks at a time
    float order = (blk.y * blocks.x + blk.x) / (blocks.x * blocks.y);
    outColor = order < uSweep ? next : prev;
    return;
  }

  // ---- P-frame: one vector per block ----
  float h = hash3(vec3(blk, uSeed));
  float h2 = hash3(vec3(blk + 31.0, uSeed));
  // structure of the new screen: its brightness slope around the block pulls the old pixels along its edges
  ivec2 c = ivec2((blk + 0.5) * uBlock);
  int r = int(uBlock * 1.5);
  vec2 grad = vec2(luma(fetch(uNext, c + ivec2(r, 0)).rgb) - luma(fetch(uNext, c - ivec2(r, 0)).rgb),
                   luma(fetch(uNext, c + ivec2(0, r)).rgb) - luma(fetch(uNext, c - ivec2(0, r)).rgb));
  // a slow swirl from noise, so neighbouring blocks move together like real motion
  vec2 swirl = vec2(vnoise(blk * 0.22, uSeed), vnoise(blk * 0.22 + 7.3, uSeed)) * 2.0 - 1.0;
  vec2 mv = uDrive * (0.55 + 0.9 * h) + swirl * uAmount * 5.0 + grad * uAmount * 9.0;
  mv *= step(0.18, h);                       // some blocks are coded as "no motion"
  ivec2 imv = ivec2(round(mv));              // whole pixels: the copy stays lossless, the smear stays sharp

  vec4 moved = fetch(uPrev, p - imv);
  // a faint residual of the new screen, and now and then a block refreshed from it outright
  float residual = uAmount * 0.015 * step(0.5, h2);
  vec4 col = mix(moved, next, residual);
  if (h2 > 1.0 - 0.012 * uAmount) col = next;
  outColor = col;
}`;

export function createDatamosh(canvas, screens, options = {}) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false });
  if (!gl) return null;
  const opt = { block: 16, flowSeconds: 0.65, sweepSeconds: 0.2, maxHold: 3.5, onChange: null, interactive: true, ...options };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let prog, loc = {}, lost = false;
  let W = 1, H = 1, dpr = 1;
  const screenTex = [], buf = [], fbo = [];
  let cur = 0;                 // which buffer holds the decoded frame
  let shown = 0, target = 1;   // screen indices
  let phase = 'idle', phaseTime = 0, steps = 0, seed = 0;
  const drive = { x: 0, y: 0, pendingX: 0, pendingY: 0, dirX: 1, dirY: 0.2 };
  let dragging = false, dragDist = 0, last = { x: 0, y: 0 }, auto = false;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function makeTex(source) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if (source) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return t;
  }
  function init() {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    for (const n of ['uPrev', 'uNext', 'uMode', 'uRes', 'uBlock', 'uDrive', 'uAmount', 'uSeed', 'uSweep', 'uFlip'])
      loc[n] = gl.getUniformLocation(prog, n);
    gl.bindVertexArray(gl.createVertexArray());
  }

  /* screens are painted into canvases at device resolution, the two feedback buffers match them */
  function build() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(1, canvas.clientWidth), ch = Math.max(1, canvas.clientHeight);
    W = Math.round(cw * dpr); H = Math.round(ch * dpr);
    canvas.width = W; canvas.height = H;
    screenTex.forEach((t) => gl.deleteTexture(t));
    buf.forEach((t) => gl.deleteTexture(t));
    fbo.forEach((f) => gl.deleteFramebuffer(f));
    screenTex.length = buf.length = fbo.length = 0;
    for (const paint of screens) {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      g.scale(dpr, dpr);
      paint(g, cw, ch);
      screenTex.push(makeTex(c));
    }
    for (let i = 0; i < 2; i++) {
      buf.push(makeTex(null));
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, buf[i], 0);
      fbo.push(f);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    load(shown);
  }

  function pass(mode, { prev, next = screenTex[target], to, sweep = 0, flip = false, amount = 1, driveX = 0, driveY = 0 }) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, to ?? null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, prev); gl.uniform1i(loc.uPrev, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, next); gl.uniform1i(loc.uNext, 1);
    gl.uniform1i(loc.uMode, mode);
    gl.uniform2i(loc.uRes, W, H);
    gl.uniform1f(loc.uBlock, Math.round(opt.block * dpr));
    gl.uniform2f(loc.uDrive, driveX, driveY);
    gl.uniform1f(loc.uAmount, amount);
    gl.uniform1f(loc.uSeed, seed);
    gl.uniform1f(loc.uSweep, sweep);
    gl.uniform1i(loc.uFlip, flip ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  /* copy a screen into the decoded-frame buffer */
  function load(index) {
    pass(3, { prev: screenTex[index], to: fbo[cur] });
  }
  function present() {
    if (lost) return;
    pass(3, { prev: buf[cur], to: null, flip: true });
  }
  function step(mode, params) {
    const nextBuf = 1 - cur;
    pass(mode, { prev: buf[cur], to: fbo[nextBuf], ...params });
    cur = nextBuf;
  }

  /* ---- phases ---- */
  function begin(to) {
    target = to ?? (shown + 1) % screens.length;
    phase = 'flow'; phaseTime = 0; steps = 0; tick = 1 / 60; seed = Math.floor(Math.random() * 1000);
    drive.pendingX = drive.pendingY = 0;
  }
  function keyframe() {
    if (phase !== 'flow') return;
    phase = reduced.matches ? 'fade' : 'sweep';
    phaseTime = 0;
    if (phase === 'fade') load(shown);
    wake();
  }
  function finish() {
    load(target);
    shown = target; phase = 'idle'; dragging = false; auto = false;
    present();
    opt.onChange?.(shown);
  }

  let raf = 0, lastT = 0, visible = true, tick = 0;
  function frame(now) {
    raf = 0;
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    phaseTime += dt;
    tick += dt;
    // P-frames go at a steady 60 per second whatever the display rate, so the smear grows at the same speed
    if (phase === 'flow' && tick >= 1 / 60) {
      tick = Math.min(tick - 1 / 60, 1 / 60);
      steps++;
      if (steps % 7 === 0) seed += 1;
      let dx, dy, amount;
      if (auto) {
        // automatic flow: a push along the chosen direction that swells and settles
        const k = Math.sin(Math.min(phaseTime / opt.flowSeconds, 1) * Math.PI);
        dx = drive.dirX * 9 * k * dpr; dy = drive.dirY * 9 * k * dpr; amount = 0.4 + 0.6 * k;
        if (phaseTime >= opt.flowSeconds) keyframe();
      } else {
        // dragged: the vectors follow the pointer; while it holds still the pixels keep melting slowly
        const vx = drive.pendingX, vy = drive.pendingY;
        drive.pendingX = drive.pendingY = 0;
        const len = Math.hypot(vx, vy), cap = 26 * dpr;
        const f = len > cap ? cap / len : 1;
        dx = vx * f + drive.dirX * 0.7 * dpr; dy = vy * f + drive.dirY * 0.7 * dpr;
        amount = Math.min(1, 0.45 + len / (14 * dpr));
        if (phaseTime >= opt.maxHold) keyframe();
      }
      if (phase === 'flow') step(0, { driveX: dx, driveY: dy, amount });
    }
    if (phase === 'sweep') {
      const s = Math.min(phaseTime / opt.sweepSeconds, 1);
      step(1, { sweep: s });
      if (s >= 1) { finish(); return; }
    } else if (phase === 'fade') {
      const s = Math.min(phaseTime / 0.25, 1);
      pass(2, { prev: screenTex[shown], to: fbo[1 - cur], sweep: s });
      cur = 1 - cur;
      if (s >= 1) { finish(); return; }
    }
    present();
    if (phase !== 'idle') raf = requestAnimationFrame(frame);
  }
  let held = false;            // a still frame from freeze(): nothing runs until play()
  function wake() {
    if (raf || !visible || lost || held) return;
    lastT = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function sleep() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  /* ---- pointer ---- */
  function onDown(e) {
    if (!opt.interactive || phase !== 'idle' || e.button > 0) return;
    dragging = true; dragDist = 0; auto = false;
    last = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('is-dragging');
  }
  function onMove(e) {
    if (!dragging) return;
    const mx = e.clientX - last.x, my = e.clientY - last.y;
    last = { x: e.clientX, y: e.clientY };
    dragDist += Math.hypot(mx, my);
    if (phase === 'idle' && dragDist > 6) {
      if (reduced.matches) return;     // with reduced motion a drag only switches on release
      begin();
    }
    if (phase !== 'flow') return;
    drive.pendingX += mx * dpr; drive.pendingY += my * dpr;
    const len = Math.hypot(mx, my);
    if (len > 0.5) { drive.dirX = mx / len; drive.dirY = my / len; }
    wake();
  }
  function onUp(e) {
    if (!dragging) return;
    dragging = false;
    canvas.classList.remove('is-dragging');
    if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (phase === 'flow') keyframe();
    else if (phase === 'idle' && e.type === 'pointerup') api.play();   // a tap or a drag with reduced motion
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  /* ---- lifecycle ---- */
  const ro = new ResizeObserver(() => {
    const d = Math.min(window.devicePixelRatio || 1, 2);
    if (Math.round(canvas.clientWidth * d) === W && Math.round(canvas.clientHeight * d) === H) return;
    // a new size: repaint the screens and show the current one (a running transition is dropped)
    sleep();
    phase = 'idle'; dragging = false; auto = false;
    build(); present();
  });
  ro.observe(canvas);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting && !document.hidden; visible ? phase !== 'idle' && wake() : sleep(); });
  io.observe(canvas);
  const onVisibility = () => { visible = !document.hidden; visible ? phase !== 'idle' && wake() : sleep(); };
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; sleep(); });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; init(); phase = 'idle'; build(); present(); });

  init();
  build();
  present();

  const api = {
    get index() { return shown; },
    get busy() { return phase !== 'idle'; },
    /** go to screen `to` (default: the next one) with an automatic flow and a keyframe */
    play(to, direction = [1, 0.25]) {
      if (held) { held = false; load(shown); phase = 'idle'; }
      if (phase !== 'idle') return;
      const len = Math.hypot(direction[0], direction[1]) || 1;
      drive.dirX = direction[0] / len; drive.dirY = direction[1] / len;
      begin(to);
      auto = true;
      if (reduced.matches) keyframe();
      wake();
    },
    /** for still frames: start a transition and run `count` P-frames along `direction` (CSS px per step), then draw */
    freeze(count, direction = [6, 2], to) {
      sleep();
      held = true;
      begin(to);
      for (let i = 0; i < count; i++) {
        if (i % 7 === 6) seed += 1;
        step(0, { driveX: direction[0] * dpr, driveY: direction[1] * dpr, amount: 1 });
      }
      present();
    },
    /** repaint the screens (after their content changed) */
    refresh() { sleep(); phase = 'idle'; build(); present(); },
    destroy() {
      sleep(); ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    }
  };
  return api;
}
