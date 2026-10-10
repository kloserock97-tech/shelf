/* Cloth Banner — a hanging cloth banner with a printed message, simulated live with XPBD on the CPU and drawn in WebGL2.
   The cloth is a 40×60 particle grid hung from a rod by nine rings. Distance constraints (structure, shear, bend) are
   solved in 12 substeps per frame, one pass each (small-steps XPBD); tethers to the nearest ring stop the long cloth
   from stretching. Wind pushes along vertex normals, so the cloth billows instead of sliding. You can grab and pull
   it with a mouse or a finger. The message is drawn with Canvas 2D into a texture. The loop stops when the cloth
   has settled and there is no wind, off-screen and on a hidden tab.

     import { createClothBanner } from './cloth-banner.js';
     const banner = createClothBanner(canvas, { lines: ['Nothing', 'here', 'yet.'] });
     banner.gust();          // a puff of wind
     banner.setWind(0.6);    // steady breeze 0…1, 0 — calm

   Returns null without WebGL2. */

/* ---------- hash (from Hash Kit) and our own value noise ---------- */
const SALT = 0xb31c96c9;
function hashU(x) {
  x ^= x >>> 16; x = Math.imul(x, 0x3f9c86cb);
  x ^= x >>> 14; x = Math.imul(x, 0x1ae9dacf);
  x ^= x >>> 15;
  return x >>> 0;
}
const hash3U = (x, y, z) => hashU((x + hashU((y + hashU((z + SALT) >>> 0)) >>> 0)) >>> 0);
const lattice = (x, y, z) => (hash3U(x >>> 0, y >>> 0, z >>> 0) >>> 8) / 8388608 - 1; // −1…1

/** Smooth value noise in 3D, −1…1 (cubic fade, trilinear blend of lattice values). */
function noise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  const c00 = l(lattice(ix, iy, iz), lattice(ix + 1, iy, iz), fx);
  const c10 = l(lattice(ix, iy + 1, iz), lattice(ix + 1, iy + 1, iz), fx);
  const c01 = l(lattice(ix, iy, iz + 1), lattice(ix + 1, iy, iz + 1), fx);
  const c11 = l(lattice(ix, iy + 1, iz + 1), lattice(ix + 1, iy + 1, iz + 1), fx);
  return l(l(c00, c10, fy), l(c01, c11, fy), fz);
}

/* ---------- shaders ---------- */
const VERT = `#version 300 es
in vec3 aPos;
in vec3 aNormal;
in vec2 aUv;
uniform mat4 uViewProj;
out vec3 vPos;
out vec3 vNormal;
out vec2 vUv;
void main() {
  vPos = aPos; vNormal = aNormal; vUv = aUv;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 vPos;
in vec3 vNormal;
in vec2 vUv;
uniform sampler2D uTex;
uniform int uMode;          // 0 — cloth, 1 — rod and rings
uniform vec3 uSolid;        // rod colour (linear)
uniform vec3 uCam;
uniform vec3 uSky;          // ambient from above (linear)
uniform vec3 uGround;       // ambient from below
uniform vec3 uKey;          // key light colour
uniform float uTip;         // depth of the pointed hem, in v
uniform vec2 uGrid;         // threads across, along
out vec4 outColor;

vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }

void main() {
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 V = normalize(uCam - vPos);
  vec3 L = normalize(vec3(-0.62, 0.55, 0.56));
  float alpha = 1.0;
  vec3 albedo = uSolid;
  float sheen = 0.0;

  if (uMode == 0) {
    // the pointed hem: v grows downwards, the tip sits at the middle of the bottom edge
    float edge = vUv.y - (1.0 - uTip * abs(vUv.x * 2.0 - 1.0));
    float px = max(fwidth(edge), 1e-5);
    alpha = 1.0 - smoothstep(-0.5 * px, 0.5 * px, edge);
    if (alpha < 0.01) discard;
    albedo = toLinear(texture(uTex, vUv).rgb);
    // woven threads: two faint perpendicular ripples, fading out when they get smaller than a pixel
    vec2 t = vUv * uGrid;
    vec2 tw = fwidth(t);
    float weave = sin(t.x * 6.2832) * (1.0 - smoothstep(0.25, 0.5, tw.x)) + sin(t.y * 6.2832) * (1.0 - smoothstep(0.25, 0.5, tw.y));
    albedo *= 1.0 + weave * 0.025;
    if (!gl_FrontFacing) albedo *= 0.8;   // the back of a printed cloth is duller
    sheen = 1.0;
  }

  float ndl = dot(n, L);
  float wrap = max((ndl + 0.25) / 1.25, 0.0);                // soft key: the light wraps around folds
  vec3 ambient = mix(uGround, uSky, n.y * 0.5 + 0.5);
  float facing = max(dot(n, V), 0.0);
  vec3 col = albedo * (ambient + uKey * wrap);
  col += albedo * uKey * max(-ndl, 0.0) * 0.18 * sheen;     // light coming through the cloth
  col += vec3(1.0, 0.97, 0.92) * pow(1.0 - facing, 4.0) * 0.16 * sheen; // fabric sheen at grazing angles
  if (uMode == 1) {
    vec3 H = normalize(L + V);
    col += uKey * pow(max(dot(n, H), 0.0), 60.0) * 0.5;      // a narrow highlight on the rod
  }
  col = pow(col, vec3(1.0 / 2.2));
  outColor = vec4(col * alpha, alpha);
}`;

/* ---------- the printed side ---------- */
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const THEMES = {
  light: { cloth: '#c65d3c', ink: '#fbf2e4', soft: 'rgba(251,242,228,0.62)', rod: [0.07, 0.045, 0.03],
    sky: [0.5, 0.5, 0.52], ground: [0.2, 0.17, 0.16], key: [0.95, 0.9, 0.82] },
  dark: { cloth: '#b9563a', ink: '#fbf0df', soft: 'rgba(251,240,223,0.6)', rod: [0.46, 0.36, 0.22],
    sky: [0.36, 0.38, 0.46], ground: [0.1, 0.08, 0.08], key: [0.95, 0.87, 0.78] }
};

/** Default print: an eyebrow, a drawn empty tray, three big lines and a stitched border that follows the hem. */
export function paintBanner(g, w, h, { eyebrow, lines, colors, tip }) {
  g.fillStyle = colors.cloth;
  g.fillRect(0, 0, w, h);
  // stitched border
  const m = w * 0.07;
  g.save();
  g.strokeStyle = colors.soft;
  g.lineWidth = w * 0.006;
  g.setLineDash([w * 0.022, w * 0.016]);
  g.beginPath();
  g.moveTo(m, m);
  g.lineTo(w - m, m);
  g.lineTo(w - m, h * (1 - tip) - m * 0.9);
  g.lineTo(w / 2, h - m * 1.9);
  g.lineTo(m, h * (1 - tip) - m * 0.9);
  g.closePath();
  g.stroke();
  g.restore();

  g.fillStyle = colors.soft;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.font = `650 ${Math.round(w * 0.046)}px ${FONT}`;
  if ('letterSpacing' in g) g.letterSpacing = `${(w * 0.012).toFixed(1)}px`;
  g.fillText(eyebrow, w / 2, h * 0.14);
  if ('letterSpacing' in g) g.letterSpacing = '0px';

  // an empty tray: open box drawn with strokes
  const cx = w / 2, cy = h * 0.27, s = w * 0.15;
  g.strokeStyle = colors.ink;
  g.lineWidth = w * 0.014;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx - s, cy - s * 0.15);
  g.lineTo(cx - s * 0.62, cy - s * 0.62);
  g.lineTo(cx + s * 0.62, cy - s * 0.62);
  g.lineTo(cx + s, cy - s * 0.15);
  g.lineTo(cx + s, cy + s * 0.5);
  g.lineTo(cx - s, cy + s * 0.5);
  g.closePath();
  g.moveTo(cx - s, cy - s * 0.15);
  g.lineTo(cx - s * 0.36, cy - s * 0.15);
  g.lineTo(cx - s * 0.24, cy + s * 0.08);
  g.lineTo(cx + s * 0.24, cy + s * 0.08);
  g.lineTo(cx + s * 0.36, cy - s * 0.15);
  g.lineTo(cx + s, cy - s * 0.15);
  g.stroke();

  // the message: the longest line fills 78% of the width
  g.fillStyle = colors.ink;
  let size = w * 0.3;
  g.font = `800 ${size}px ${FONT}`;
  const widest = Math.max(...lines.map((l) => g.measureText(l).width));
  size = Math.min(size, (size * w * 0.78) / widest);
  g.font = `800 ${Math.round(size)}px ${FONT}`;
  if ('letterSpacing' in g) g.letterSpacing = `${(-size * 0.03).toFixed(1)}px`;
  const top = h * 0.47;
  lines.forEach((l, i) => g.fillText(l, w / 2, top + i * size * 0.98));
  if ('letterSpacing' in g) g.letterSpacing = '0px';
}

/* ---------- geometry helpers for the rod and rings (non-indexed triangles: position, normal) ---------- */
function pushQuadStrip(out, ring, segments, steps, at) {
  for (let i = 0; i < steps; i++)
    for (let j = 0; j < segments; j++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
      for (const p of [a, b, c, a, c, d]) out.push(...p[0], ...p[1]);
    }
}
function cylinderX(out, x0, x1, y, z, r, seg = 18) {
  pushQuadStrip(out, 0, seg, 1, (i, j) => {
    const a = (j / seg) * Math.PI * 2, cy = Math.cos(a), cz = Math.sin(a);
    return [[i ? x1 : x0, y + cy * r, z + cz * r], [0, cy, cz]];
  });
}
function sphere(out, cx, cy, cz, r, seg = 16) {
  pushQuadStrip(out, 0, seg, seg / 2, (i, j) => {
    const t = (i / (seg / 2)) * Math.PI, p = (j / seg) * Math.PI * 2;
    const n = [Math.sin(t) * Math.cos(p), Math.cos(t), Math.sin(t) * Math.sin(p)];
    return [[cx + n[0] * r, cy + n[1] * r, cz + n[2] * r], n];
  });
}
function ringYZ(out, cx, cy, cz, R, r, seg = 20, tube = 8) {
  pushQuadStrip(out, 0, tube, seg, (i, j) => {
    const a = (i / seg) * Math.PI * 2, b = (j / tube) * Math.PI * 2;
    const ny = Math.cos(a) * Math.cos(b), nz = Math.sin(a) * Math.cos(b), nx = Math.sin(b);
    return [[cx + nx * r, cy + Math.cos(a) * R + ny * r, cz + Math.sin(a) * R + nz * r], [nx, ny, nz]];
  });
}

export const CLOTH_DEFAULTS = {
  cols: 40, rows: 60, width: 1.4, height: 2.0, rings: 9, tip: 0.12, substeps: 12,
  eyebrow: 'SAVED ITEMS', lines: ['Nothing', 'here', 'yet.'],
  wind: 0, intro: true, interactive: true
};

export function createClothBanner(canvas, options = {}) {
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true });
  if (!gl) return null;
  const opt = { ...CLOTH_DEFAULTS, ...options };
  const { cols, rows, width: W, height: H, tip } = opt;
  const N = cols * rows;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const darkQuery = matchMedia('(prefers-color-scheme: dark)');

  /* ---- particles ---- */
  const X = new Float32Array(N * 3), P = new Float32Array(N * 3), Vel = new Float32Array(N * 3);
  const F = new Float32Array(N * 3), Nrm = new Float32Array(N * 3), Wt = new Float32Array(N), R0 = new Float32Array(N * 3);
  const UV = new Float32Array(N * 2);
  const dx = W / (cols - 1), dy = H / (rows - 1);
  const ringR = 0.036, rodY = H / 2 + ringR * 1.32;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      R0[k * 3] = -W / 2 + i * dx;
      R0[k * 3 + 1] = H / 2 - j * dy;
      R0[k * 3 + 2] = (lattice(i, j, 7) * 0.5) * 0.002;   // a hair of depth noise breaks the symmetry
      UV[k * 2] = i / (cols - 1); UV[k * 2 + 1] = j / (rows - 1);
      Wt[k] = 1;
    }
  const pins = [];
  for (let r = 0; r < opt.rings; r++) pins.push(Math.round((r * (cols - 1)) / (opt.rings - 1)));
  pins.forEach((i) => (Wt[i] = 0));
  const inside = (k) => UV[k * 2 + 1] <= 1 - tip * Math.abs(UV[k * 2] * 2 - 1) + 0.01;

  /* ---- constraints: structure, shear and bend, ordered top to bottom so one pass carries the weight down ---- */
  const cons = [];
  const add = (a, b, compliance) => cons.push([a, b, compliance]);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      if (i + 1 < cols) add(k, k + 1, 0);
      if (j + 1 < rows) add(k, k + cols, 0);
      if (i + 1 < cols && j + 1 < rows) { add(k, k + cols + 1, 1e-5); add(k + 1, k + cols, 1e-5); }
      if (i + 2 < cols) add(k, k + 2, 2.5e-5);
      if (j + 2 < rows) add(k, k + 2 * cols, 2.5e-5);
    }
  const CA = new Int32Array(cons.length), CB = new Int32Array(cons.length);
  const CR = new Float32Array(cons.length), CK = new Float32Array(cons.length);
  cons.forEach(([a, b, c], n) => {
    CA[n] = a; CB[n] = b; CK[n] = c;
    CR[n] = Math.hypot(R0[a * 3] - R0[b * 3], R0[a * 3 + 1] - R0[b * 3 + 1], R0[a * 3 + 2] - R0[b * 3 + 2]);
  });
  // tethers: every particle stays within its rest distance of the nearest ring
  const TA = new Int32Array(N), TR = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    let best = 0, bd = Infinity;
    for (const p of pins) {
      const d = Math.hypot(R0[k * 3] - R0[p * 3], R0[k * 3 + 1] - R0[p * 3 + 1]);
      if (d < bd) { bd = d; best = p; }
    }
    TA[k] = best; TR[k] = bd * 1.04;
  }

  function reset() {
    X.set(R0); P.set(R0); Vel.fill(0);
  }
  reset();

  /* ---- state ---- */
  let wind = opt.wind, windNow = 0, gust = 0, simTime = 0;
  let grab = -1, grabTarget = [0, 0, 0], grabZ = 0;
  const GRAVITY = 9.8, DAMP = 0.9;

  function computeNormals() {
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i;
        const l = j * cols + Math.max(i - 1, 0), r = j * cols + Math.min(i + 1, cols - 1);
        const u = Math.max(j - 1, 0) * cols + i, d = Math.min(j + 1, rows - 1) * cols + i;
        const ax = X[r * 3] - X[l * 3], ay = X[r * 3 + 1] - X[l * 3 + 1], az = X[r * 3 + 2] - X[l * 3 + 2];
        const bx = X[u * 3] - X[d * 3], by = X[u * 3 + 1] - X[d * 3 + 1], bz = X[u * 3 + 2] - X[d * 3 + 2];
        let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        const len = Math.hypot(nx, ny, nz) || 1;
        Nrm[k * 3] = nx / len; Nrm[k * 3 + 1] = ny / len; Nrm[k * 3 + 2] = nz / len;
      }
  }

  /* one frame of 1/60 s: wind forces once, then substeps */
  function simulate(dt) {
    simTime += dt;
    windNow += (wind - windNow) * (1 - Math.exp(-dt / 0.8));
    gust *= Math.exp(-dt / 1.1);
    const strength = windNow + gust;
    computeNormals();
    F.fill(0);
    if (strength > 0.001) {
      // wind blows mostly towards the viewer and a bit to the right; noise in space and time makes the gusts
      const t = simTime * 0.9;
      for (let k = 0; k < N; k++) {
        const x = R0[k * 3], y = R0[k * 3 + 1];
        const g = 0.45 + 0.3 * noise3(x * 2.3 + t * 1.1, y * 1.7, t) + 0.55 * noise3(x * 6.2 - t * 2.2, y * 4.6, t * 1.6 + 3);
        const wx = 3.2 * strength * (0.4 + g), wz = 5.2 * strength * (g * 1.25 - 0.22), wy = 0.4 * strength * noise3(x, y, t + 9);
        const rx = wx - Vel[k * 3], ry = wy - Vel[k * 3 + 1], rz = wz - Vel[k * 3 + 2];
        const nx = Nrm[k * 3], ny = Nrm[k * 3 + 1], nz = Nrm[k * 3 + 2];
        // pressure along the normal plus a little skin drag along the cloth, which sweeps it sideways into folds
        const rn = rx * nx + ry * ny + rz * nz, push = rn * 2.2, drag = 0.45;
        F[k * 3] = nx * push + (rx - nx * rn) * drag; F[k * 3 + 1] = ny * push + (ry - ny * rn) * drag; F[k * 3 + 2] = nz * push + (rz - nz * rn) * drag;
      }
    }
    const steps = opt.substeps, h = dt / steps, h2 = h * h;
    const damp = Math.exp(-DAMP * h);
    let gx = X[grab * 3], gy = X[grab * 3 + 1], gz = X[grab * 3 + 2];
    for (let s = 0; s < steps; s++) {
      // integrate
      for (let k = 0; k < N; k++) {
        const i = k * 3;
        P[i] = X[i]; P[i + 1] = X[i + 1]; P[i + 2] = X[i + 2];
        if (k === grab) {
          const f = (s + 1) / steps;
          X[i] = gx + (grabTarget[0] - gx) * f; X[i + 1] = gy + (grabTarget[1] - gy) * f; X[i + 2] = gz + (grabTarget[2] - gz) * f;
          continue;
        }
        if (Wt[k] === 0) continue;
        Vel[i] += F[i] * h; Vel[i + 1] += (F[i + 1] - GRAVITY) * h; Vel[i + 2] += F[i + 2] * h;
        X[i] += Vel[i] * h; X[i + 1] += Vel[i + 1] * h; X[i + 2] += Vel[i + 2] * h;
      }
      // distance constraints, one Gauss–Seidel pass (λ starts at 0 every substep)
      for (let c = 0; c < CA.length; c++) {
        const a = CA[c], b = CB[c];
        const wa = a === grab ? 0 : Wt[a], wb = b === grab ? 0 : Wt[b];
        const ws = wa + wb;
        if (ws === 0) continue;
        const ia = a * 3, ib = b * 3;
        const ex = X[ib] - X[ia], ey = X[ib + 1] - X[ia + 1], ez = X[ib + 2] - X[ia + 2];
        const d = Math.sqrt(ex * ex + ey * ey + ez * ez);
        if (d < 1e-9) continue;
        const dl = -(d - CR[c]) / (ws + CK[c] / h2) / d;
        X[ia] -= wa * dl * ex; X[ia + 1] -= wa * dl * ey; X[ia + 2] -= wa * dl * ez;
        X[ib] += wb * dl * ex; X[ib + 1] += wb * dl * ey; X[ib + 2] += wb * dl * ez;
      }
      // tethers
      for (let k = 0; k < N; k++) {
        if (Wt[k] === 0 || k === grab) continue;
        const i = k * 3, a = TA[k] * 3;
        const ex = X[i] - X[a], ey = X[i + 1] - X[a + 1], ez = X[i + 2] - X[a + 2];
        const d = Math.sqrt(ex * ex + ey * ey + ez * ez);
        if (d > TR[k]) {
          const f = TR[k] / d;
          X[i] = X[a] + ex * f; X[i + 1] = X[a + 1] + ey * f; X[i + 2] = X[a + 2] + ez * f;
        }
      }
      // velocities from positions
      for (let k = 0; k < N; k++) {
        const i = k * 3;
        Vel[i] = ((X[i] - P[i]) / h) * damp; Vel[i + 1] = ((X[i + 1] - P[i + 1]) / h) * damp; Vel[i + 2] = ((X[i + 2] - P[i + 2]) / h) * damp;
      }
    }
    let vmax = 0;
    for (let k = 0; k < N * 3; k++) vmax = Math.max(vmax, Math.abs(Vel[k]));
    return vmax;
  }

  /* ---- GL setup ---- */
  let prog, loc = {}, clothVao, rodVao, posBuf, nrmBuf, rodCount = 0, tex, indexCount = 0, lost = false;
  const viewProj = new Float32Array(16), cam = [0, 0, 5];
  const FOV = (26 * Math.PI) / 180;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function init() {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.bindAttribLocation(prog, 1, 'aNormal');
    gl.bindAttribLocation(prog, 2, 'aUv');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    for (const n of ['uViewProj', 'uTex', 'uMode', 'uSolid', 'uCam', 'uSky', 'uGround', 'uKey', 'uTip', 'uGrid'])
      loc[n] = gl.getUniformLocation(prog, n);

    // cloth: dynamic positions and normals, static uvs and indices
    clothVao = gl.createVertexArray();
    gl.bindVertexArray(clothVao);
    posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, X.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    nrmBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nrmBuf);
    gl.bufferData(gl.ARRAY_BUFFER, Nrm.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    const uvBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, UV, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
    const idx = [];
    for (let j = 0; j < rows - 1; j++)
      for (let i = 0; i < cols - 1; i++) {
        const k = j * cols + i;
        idx.push(k, k + cols, k + 1, k + 1, k + cols, k + cols + 1);
      }
    indexCount = idx.length;
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);

    // rod, end knobs and rings
    const solid = [];
    cylinderX(solid, -W / 2 - 0.14, W / 2 + 0.14, rodY, 0, 0.021);
    sphere(solid, -W / 2 - 0.16, rodY, 0, 0.04);
    sphere(solid, W / 2 + 0.16, rodY, 0, 0.04);
    for (const p of pins) ringYZ(solid, R0[p * 3], rodY - ringR + 0.021, 0, ringR, 0.0065);
    const arr = new Float32Array(solid);
    rodCount = arr.length / 6;
    rodVao = gl.createVertexArray();
    gl.bindVertexArray(rodVao);
    const rb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, rb);
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.vertexAttrib2f(2, 0, 0);
    gl.bindVertexArray(null);

    tex = gl.createTexture();
    paintTexture();
  }

  let theme = null;
  function paintTexture() {
    theme = THEMES[darkQuery.matches ? 'dark' : 'light'];
    const c = document.createElement('canvas');
    c.width = 1024; c.height = Math.round(1024 * (H / W));
    const g = c.getContext('2d');
    (opt.paint || paintBanner)(g, c.width, c.height, { eyebrow: opt.eyebrow, lines: opt.lines, colors: theme, tip });
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  }

  /* ---- camera: straight on, far enough to fit the rod and the hem with a margin ---- */
  let aspect = 1;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    aspect = w / h;
    const top = rodY + 0.06, bottom = -H / 2 - 0.04;
    const halfH = ((top - bottom) / 2) * 1.08, halfW = (W / 2 + 0.22) * 1.08;
    const t = Math.tan(FOV / 2);
    cam[0] = 0; cam[1] = (top + bottom) / 2; cam[2] = Math.max(halfH / t, halfW / (t * aspect)) + 0.1;
    const f = 1 / t, near = 0.1, far = 30, A = (far + near) / (near - far), B = (2 * far * near) / (near - far);
    viewProj.fill(0);
    viewProj[0] = f / aspect; viewProj[5] = f; viewProj[10] = A; viewProj[11] = -1;
    viewProj[12] = (-f / aspect) * cam[0]; viewProj[13] = -f * cam[1]; viewProj[14] = -A * cam[2] + B; viewProj[15] = cam[2];
  }

  function render() {
    if (lost) return;
    computeNormals();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(prog);
    gl.uniformMatrix4fv(loc.uViewProj, false, viewProj);
    gl.uniform3fv(loc.uCam, cam);
    gl.uniform3fv(loc.uSky, theme.sky);
    gl.uniform3fv(loc.uGround, theme.ground);
    gl.uniform3fv(loc.uKey, theme.key);
    gl.uniform1f(loc.uTip, tip);
    gl.uniform2f(loc.uGrid, 180, 180 * (H / W));
    gl.uniform3fv(loc.uSolid, theme.rod);
    gl.uniform1i(loc.uMode, 1);
    gl.bindVertexArray(rodVao);
    gl.drawArrays(gl.TRIANGLES, 0, rodCount);
    gl.uniform1i(loc.uMode, 0);
    gl.uniform1i(loc.uTex, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.bindVertexArray(clothVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, X);
    gl.bindBuffer(gl.ARRAY_BUFFER, nrmBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, Nrm);
    gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
  }

  /* ---- loop: runs only while something moves ---- */
  let raf = 0, last = 0, acc = 0, calm = 0, visible = true, destroyed = false;
  const still = () => reduced.matches || opt.frozen;
  function frame(now) {
    raf = 0;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    acc += dt;
    let vmax = 0, n = 0;
    while (acc >= 1 / 60 && n < 3) { vmax = Math.max(vmax, simulate(1 / 60)); acc -= 1 / 60; n++; }
    if (n === 3) acc = 0;
    render();
    const quiet = grab < 0 && wind < 0.001 && windNow < 0.003 && gust < 0.003 && vmax < 0.012;
    calm = quiet ? calm + 1 : 0;
    if (calm < 45) raf = requestAnimationFrame(frame);
  }
  function wake() {
    if (raf || !visible || destroyed || lost || still()) return;
    calm = 0; acc = 0;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function sleep() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  /* ---- pointer: grab the nearest visible particle, pull it on a plane parallel to the screen ---- */
  function toNdc(e) {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2, r];
  }
  function onPlane(nx, ny, z) {
    const t = Math.tan(FOV / 2), dist = cam[2] - z;
    return [cam[0] + nx * t * aspect * dist, cam[1] + ny * t * dist, z];
  }
  function pick(nx, ny, rect) {
    const t = Math.tan(FOV / 2);
    let best = -1, bd = Infinity;
    for (let k = 0; k < N; k++) {
      if (Wt[k] === 0 || !inside(k)) continue;
      const dist = cam[2] - X[k * 3 + 2];
      const px = (X[k * 3] - cam[0]) / (dist * t * aspect), py = (X[k * 3 + 1] - cam[1]) / (dist * t);
      const ddx = (px - nx) * rect.width * 0.5, ddy = (py - ny) * rect.height * 0.5;
      const d = ddx * ddx + ddy * ddy;
      if (d < bd) { bd = d; best = k; }
    }
    return bd < 26 * 26 ? best : -1;
  }
  function clampTarget(p) {
    // the cloth cannot be pulled off its rings: keep the grabbed point within its tether
    const a = TA[grab] * 3, ex = p[0] - X[a], ey = p[1] - X[a + 1], ez = p[2] - X[a + 2];
    const d = Math.hypot(ex, ey, ez), max = TR[grab] * 1.04;
    if (d > max) { p[0] = X[a] + (ex * max) / d; p[1] = X[a + 1] + (ey * max) / d; p[2] = X[a + 2] + (ez * max) / d; }
    return p;
  }
  let hover = null;
  function onDown(e) {
    if (!opt.interactive || still()) return;
    const [nx, ny, rect] = toNdc(e);
    const k = pick(nx, ny, rect);
    if (k < 0) return;
    e.preventDefault();
    grab = k;
    grabZ = X[k * 3 + 2] + 0.12;   // pulled a little towards the viewer, so the grab reads as a lift
    grabTarget = clampTarget(onPlane(nx, ny, grabZ));
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('is-grabbing');
    wake();
  }
  function onMove(e) {
    if (!opt.interactive || still()) return;
    const [nx, ny, rect] = toNdc(e);
    if (grab >= 0) {
      grabTarget = clampTarget(onPlane(nx, ny, grabZ));
      wake();
      return;
    }
    if (e.pointerType !== 'mouse') return;
    // brushing past the cloth: particles near the pointer take a little of its motion and a push away from the viewer
    const p = onPlane(nx, ny, 0);
    const over = pick(nx, ny, rect) >= 0;
    canvas.classList.toggle('is-over', over);
    if (hover && over) {
      const mx = p[0] - hover[0], my = p[1] - hover[1];
      const speed = Math.hypot(mx, my);
      if (speed > 0.0005) {
        for (let k = 0; k < N; k++) {
          if (Wt[k] === 0) continue;
          const ex = X[k * 3] - p[0], ey = X[k * 3 + 1] - p[1];
          const f = Math.exp(-(ex * ex + ey * ey) / 0.03);
          if (f < 0.02) continue;
          Vel[k * 3] += mx * 9 * f; Vel[k * 3 + 1] += my * 9 * f; Vel[k * 3 + 2] -= Math.min(speed, 0.05) * 14 * f;
        }
        wake();
      }
    }
    hover = p;
  }
  function onUp(e) {
    if (grab < 0) return;
    grab = -1;
    canvas.classList.remove('is-grabbing');
    if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    wake();
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', () => { hover = null; canvas.classList.remove('is-over'); });

  /* ---- lifecycle ---- */
  const ro = new ResizeObserver(() => { resize(); render(); });
  ro.observe(canvas);
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting && !document.hidden;
    if (visible) wake(); else sleep();
  });
  io.observe(canvas);
  const onVisibility = () => {
    visible = !document.hidden;
    if (visible) wake(); else sleep();
  };
  document.addEventListener('visibilitychange', onVisibility);
  const onTheme = () => { paintTexture(); render(); };
  darkQuery.addEventListener('change', onTheme);
  const onReduced = () => { if (still()) sleep(); else wake(); render(); };
  reduced.addEventListener('change', onReduced);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; sleep(); });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; init(); resize(); render(); wake(); });

  init();
  resize();
  // settle the rings' sag before the first frame
  for (let i = 0; i < 40; i++) simulate(1 / 60);
  render();
  if (opt.intro && !still()) { gust = 0.55; wake(); }
  else if (wind > 0) wake();

  return {
    get wind() { return wind; },
    /** steady breeze 0…1; 0 lets the cloth settle and the loop stop */
    setWind(v) { wind = Math.max(0, Math.min(1, v)); wake(); },
    /** a puff of wind that fades in about a second */
    gust(strength = 0.8) { if (still()) return; gust = Math.min(1.4, gust + strength); wake(); },
    /** jump the simulation forward by `seconds` without drawing every frame (for a still frame) */
    advance(seconds) { for (let i = 0; i < Math.round(seconds * 60); i++) simulate(1 / 60); render(); },
    /** hold the cloth at (u, v) — 0…1 across and down — moved by [dx, dy, dz] from where it hangs now; release() lets go */
    pull(u, v, offset = [0, 0, 0]) {
      const i = Math.round(u * (cols - 1)), j = Math.round(v * (rows - 1)), k = j * cols + i;
      if (Wt[k] === 0) return;
      grab = k;
      grabTarget = clampTarget([X[k * 3] + offset[0], X[k * 3 + 1] + offset[1], X[k * 3 + 2] + offset[2]]);
      wake();
    },
    release() { grab = -1; wake(); },
    /** start from a flat, motionless cloth */
    reset() { reset(); windNow = 0; gust = 0; for (let i = 0; i < 40; i++) simulate(1 / 60); render(); },
    set(next) { Object.assign(opt, next); if ('eyebrow' in next || 'lines' in next || 'paint' in next) paintTexture(); render(); wake(); },
    destroy() {
      destroyed = true; sleep(); ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      darkQuery.removeEventListener('change', onTheme);
      reduced.removeEventListener('change', onReduced);
    }
  };
}
