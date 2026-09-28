// items/glass-diorama/variants/ts/kit.ts
import * as THREE2 from "three";

// items/glass-diorama/variants/ts/engine.ts
import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
var FRAME = { w: 1672, h: 941 };
var FOV = 30;
var addLight = (m) => {
  m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneFactor;
  m.blendSrcAlpha = THREE.ZeroFactor;
  m.blendDstAlpha = THREE.OneFactor;
  return m;
};
var DIST = FRAME.h / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
var at = (px, py, z = 0) => {
  const k = (DIST - z) / DIST;
  return new THREE.Vector3((px - FRAME.w / 2) * k, (FRAME.h / 2 - py) * k, z);
};
var CARD_VERT = (
  /* glsl */
  `
  varying vec2 vUv;
  varying vec3 vN, vV;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`
);
var CARD_FRAG = (
  /* glsl */
  `
  precision highp float;
  uniform sampler2D uMap;
  uniform float uHasMap, uRadius, uBorder, uOpacity, uBlur, uGlass, uWarm, uHalo, uMargin;
  uniform vec2 uSize, uInner;   // plate and content size (scene units)
  uniform float uInnerR;
  uniform vec2 uRep, uOff;      // a crop of the texture: uv scale and offset
  uniform vec3 uTint;           // glass tone: milky white or smoky dark
  uniform float uRim;           // glass edge: 0 \u2014 picture only
  uniform float uLinear;        // content is a screenshot: bring its brightness back from linear
  varying vec2 vUv;
  varying vec3 vN, vV;

  float sdRound(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }

  void main() {
    vec2 p = (vUv - 0.5) * (uSize + 2.0 * uMargin);
    float d = sdRound(p, uSize * 0.5, uRadius);
    float aa = fwidth(d) * 0.75;
    float plate = 1.0 - smoothstep(-aa, aa, d);
    /* a warm halo beyond the glass edge: light scattered by the rim falls on the background */
    if (plate <= 0.0) {
      float h = uHalo * exp(-d / (uMargin * 0.28)) * uOpacity;
      if (h < 0.004) discard;
      gl_FragColor = vec4(vec3(1.0, 0.74, 0.42), h);
      return;
    }

    /* frosted glass: milky white, lighter and warmer to the edge; a thin bright bevel and a warm glow from below */
    float toEdge = clamp(-d / max(uBorder, 1.0), 0.0, 1.0);
    vec3 glass = mix(vec3(1.0, 0.93, 0.8), uTint, toEdge);
    float ga = uGlass * (0.55 + 0.45 * (1.0 - toEdge));
    float rim = exp(-pow((d + 1.6) / 1.1, 2.0));
    float rimIn = exp(-pow((d + uBorder * 0.35) / (uBorder * 0.25 + 0.5), 2.0)) * 0.35;
    float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
    float warmLow = smoothstep(0.2, -0.5, p.y / uSize.y) * uWarm;
    vec3 col = glass + vec3(1.0, 0.72, 0.38) * (rim * 0.9 * uRim + warmLow * 0.35);
    float a = ga + (rim * 0.85 + fres * 0.15) * uRim + rimIn * uGlass;

    if (uHasMap > 0.5) {
      float di = sdRound(p, uInner * 0.5, uInnerR);
      float ai = fwidth(di) * 0.75;
      float inside = 1.0 - smoothstep(-ai, ai, di);
      vec2 uv = (p / uInner + 0.5) * uRep + uOff;
      vec4 c = texture2D(uMap, uv, uBlur);
      if (uLinear > 0.5) c.rgb = pow(c.rgb, vec3(1.0 / 2.2));
      /* the content's shadow on the glass and a slight warm glow at its lower edge */
      float sh = (1.0 - smoothstep(0.0, uBorder * 0.6, di)) * (1.0 - inside) * 0.12;
      col = mix(col, vec3(0.2, 0.16, 0.1), sh);
      a = max(a, sh);
      vec3 cc = c.rgb + vec3(1.0, 0.7, 0.35) * warmLow * 0.06;
      col = mix(col, cc, inside * c.a);
      a = mix(a, 1.0, inside * c.a);
    }
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0) * plate * uOpacity);
  }
`
);
function card(o) {
  const margin = o.margin ?? 40;
  const geo = new THREE.PlaneGeometry(o.size[0] + margin * 2, o.size[1] + margin * 2);
  const inner = o.inner ?? o.size;
  const mat = new THREE.ShaderMaterial({
    vertexShader: CARD_VERT,
    fragmentShader: CARD_FRAG,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uMap: { value: o.map ?? null },
      uHasMap: { value: o.map ? 1 : 0 },
      uSize: { value: new THREE.Vector2(...o.size) },
      uInner: { value: new THREE.Vector2(...inner) },
      uRadius: { value: o.radius },
      uInnerR: { value: o.innerRadius ?? Math.max(2, o.radius - (o.size[0] - inner[0]) / 2) },
      uBorder: { value: Math.max(2, (o.size[0] - inner[0]) / 2) },
      uGlass: { value: o.glass ?? 0.45 },
      uWarm: { value: o.warm ?? 0.5 },
      uOpacity: { value: 1 },
      uBlur: { value: o.blur ?? 0 },
      uHalo: { value: o.halo ?? 0.22 },
      uMargin: { value: margin },
      uRep: { value: o.rep ?? new THREE.Vector2(1, 1) },
      uRim: { value: o.rim ?? 1 },
      uLinear: { value: o.screen ? 1 : 0 },
      uTint: { value: new THREE.Color(o.tint ?? "#fffcf7") },
      uOff: { value: o.off ?? new THREE.Vector2(0, 0) }
    }
  });
  return new THREE.Mesh(geo, mat);
}
function canvasTexture(c, renderer) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
var RIB_VERT = (
  /* glsl */
  `
  attribute float aT;
  attribute vec3 aN;
  varying float vT;
  varying vec2 vUv;
  varying vec3 vN, vV;
  void main() {
    vT = aT; vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * aN);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`
);
var RIB_FRAG = (
  /* glsl */
  `
  precision highp float;
  uniform vec3 uColor;
  uniform float uReveal, uTime, uOpacity, uFadeIn, uFadeOut;
  varying float vT;
  varying vec2 vUv;
  varying vec3 vN, vV;
  void main() {
    if (vT > uReveal) discard;
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    vec3 l = normalize(vec3(-0.3, 0.7, 0.65));
    float diff = 0.55 + 0.45 * abs(dot(n, l));
    float spec = pow(max(abs(dot(n, normalize(l + vV))), 0.0), 28.0);
    float y = vUv.y * 2.0 - 1.0;
    /* satin: lighter in the middle, darker at the edges, the upper edge catches light */
    float body = 0.72 + 0.28 * (1.0 - y * y);
    float lip = exp(-pow((vUv.y - 0.88) / 0.06, 2.0)) * 0.55;
    /* a gloss runs along the ribbon */
    float sheen = pow(0.5 + 0.5 * sin(vT * 14.0 - uTime * 1.4), 10.0) * 0.45;
    float across = 1.0 - pow(abs(y), 6.0);
    vec3 col = uColor * diff * body + vec3(1.0, 0.78, 0.72) * (spec * 0.8 + sheen + lip) * across;
    float a = smoothstep(0.0, uFadeIn, vT) * (1.0 - smoothstep(1.0 - uFadeOut, 1.0, vT)) * uOpacity;
    a *= smoothstep(0.0, 0.25, across + 0.05);
    gl_FragColor = vec4(col, a);
  }
`
);
function ribbon(o) {
  const curve = new THREE.CatmullRomCurve3(o.points, false, "centripetal");
  const N = o.segments ?? 160;
  const pos = [], nor = [], ts = [], uv = [], idx = [];
  const Z = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = curve.getPointAt(t), T = curve.getTangentAt(t).normalize();
    const side = new THREE.Vector3().crossVectors(T, Z).normalize();
    side.applyAxisAngle(T, o.twist ? o.twist(t) : 0);
    const n = new THREE.Vector3().crossVectors(side, T).normalize();
    const w = (typeof o.width === "function" ? o.width(t) : o.width) / 2;
    for (const s of [-1, 1]) {
      pos.push(p.x + side.x * w * s, p.y + side.y * w * s, p.z + side.z * w * s);
      nor.push(n.x, n.y, n.z);
      ts.push(t);
      uv.push(t, s < 0 ? 0 : 1);
    }
    if (i < N) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("aN", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("aT", new THREE.Float32BufferAttribute(ts, 1));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    vertexShader: RIB_VERT,
    fragmentShader: RIB_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(o.color ?? "#e2323f") }, uReveal: { value: 1 }, uTime: { value: 0 }, uOpacity: { value: 1 }, uFadeIn: { value: o.fadeIn ?? 0.06 }, uFadeOut: { value: o.fadeOut ?? 0.12 } }
  });
  return new THREE.Mesh(geo, mat);
}
function line(points, o) {
  const g = new LineGeometry();
  g.setPositions(points.flatMap((p) => [p.x, p.y, p.z]));
  const base = new THREE.Color(o.color);
  const cols = [];
  points.forEach((_, i) => {
    const k = (o.fade ? o.fade(i / (points.length - 1)) : 1) * (o.opacity ?? 1);
    cols.push(base.r * k, base.g * k, base.b * k);
  });
  g.setColors(cols);
  const m = new LineMaterial({ linewidth: o.width, vertexColors: true, transparent: true, depthWrite: false, worldUnits: false });
  addLight(m);
  const l = new Line2(g, m);
  l.computeLineDistances();
  return l;
}
var SPARK_VERT = (
  /* glsl */
  `
  attribute float aSize, aSeed;
  uniform float uTime, uPx;
  varying float vA;
  void main() {
    vec3 p = position;
    p.y += sin(uTime * 0.5 + aSeed * 6.28) * 4.0;
    p.x += cos(uTime * 0.35 + aSeed * 9.1) * 3.0;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vA = 0.55 + 0.45 * sin(uTime * (1.2 + aSeed) + aSeed * 40.0);
    gl_PointSize = aSize * uPx * (${DIST.toFixed(1)} / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`
);
var SPARK_FRAG = (
  /* glsl */
  `
  precision highp float;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vA;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float core = smoothstep(0.22, 0.0, r);
    float halo = exp(-r * r * 5.0) * 0.45;
    gl_FragColor = vec4(uColor * (core * 2.2 + halo * 1.4) * vA * uOpacity, 0.0);
  }
`
);
function sparks(points, color = "#ffc070", rnd = Math.random) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(points.flatMap((s) => [s.p.x, s.p.y, s.p.z]), 3));
  g.setAttribute("aSize", new THREE.Float32BufferAttribute(points.map((s) => s.size), 1));
  g.setAttribute("aSeed", new THREE.Float32BufferAttribute(points.map(() => rnd()), 1));
  const m = new THREE.ShaderMaterial({
    vertexShader: SPARK_VERT,
    fragmentShader: SPARK_FRAG,
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 } }
  });
  addLight(m);
  return new THREE.Points(g, m);
}
var GLOW_FRAG = (
  /* glsl */
  `
  precision highp float;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float r = dot(q, q);
    /* the light fades exactly to zero at the spot edge: otherwise a dark background shows the rectangle */
    gl_FragColor = vec4(uColor * exp(-r * 3.2) * smoothstep(1.0, 0.55, r) * uOpacity, 0.0);
  }
`
);
function glow(w, h, color, opacity) {
  const m = new THREE.ShaderMaterial({
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: GLOW_FRAG,
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } }
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), addLight(m));
}
function rock(size, seed) {
  const g = new THREE.IcosahedronGeometry(size, 1);
  const p = g.attributes.position;
  const rnd = (k) => {
    const x = Math.sin(seed * 91.7 + k * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };
  const v = new THREE.Vector3();
  const cache = /* @__PURE__ */ new Map();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let k = cache.get(key);
    if (k === void 0) {
      k = 0.72 + rnd(cache.size) * 0.45;
      cache.set(key, k);
    }
    v.multiplyScalar(k);
    v.y *= 0.8;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: "#2c261e", roughness: 0.92, metalness: 0, flatShading: true, transparent: true }));
}
var containFit = (w, h) => ({ s: Math.min(w / FRAME.w, h / FRAME.h), fx: w / 2, fy: h / 2 });
function createStage(canvas2, fit = containFit) {
  const renderer = new THREE.WebGLRenderer({ canvas: canvas2, alpha: true, antialias: true });
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene2 = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 10, DIST * 3);
  camera.position.set(0, 0, DIST);
  const root = new THREE.Group();
  scene2.add(root);
  scene2.add(new THREE.HemisphereLight("#ffe6c0", "#1a2410", 1.1));
  const sun = new THREE.DirectionalLight("#ffc680", 2.4);
  sun.position.set(300, 500, 400);
  scene2.add(sun);
  let s = 1;
  const resize = () => {
    const w = canvas2.clientWidth, h = canvas2.clientHeight;
    const dpr = Math.min(2, devicePixelRatio);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    const f = fit(w, h);
    s = f.s;
    const visH = h / s;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(visH / 2 / DIST));
    camera.aspect = w / h;
    camera.setViewOffset(w, h, w / 2 - f.fx, h / 2 - f.fy, w, h);
    camera.updateProjectionMatrix();
  };
  resize();
  return { renderer, scene: scene2, camera, root, resize, pxScale: () => s * Math.min(2, devicePixelRatio) };
}

// items/glass-diorama/variants/ts/kit.ts
var deg = THREE2.MathUtils.degToRad;
var clamp01 = (v) => Math.min(1, Math.max(0, v));
var easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
var NARROW_SQUEEZE = 0.8;
var NARROW_SAT = 0.72;
var fitBox = (box, safe, onSqueeze, squeeze = NARROW_SQUEEZE) => (w, h) => {
  const narrow = w / h < 0.8;
  const f = narrow ? squeeze : 1;
  onSqueeze(f);
  const sq = (x) => 836 + (x - 836) * f;
  const x0 = sq(box[0]), x1 = sq(box[2]), y0 = box[1], y1 = box[3];
  const bw = x1 - x0, bh = y1 - y0;
  const a = safe() ?? { l: w * 0.04, t: h * 0.08, r: w * 0.96, b: h * 0.92 };
  const sw = Math.max(40, a.r - a.l), sh = Math.max(40, a.b - a.t);
  const ref = Math.min(w / 1672, h / 941);
  if (narrow) {
    const s2 = Math.min(0.9 * w / bw, sh / bh);
    const cy = a.t + (sh - bh * s2) * 0.6 + bh * s2 / 2;
    return { s: s2, fx: w / 2 - ((x0 + x1) / 2 - 836) * s2, fy: cy - ((y0 + y1) / 2 - 470.5) * s2 };
  }
  const s = Math.min(sw / bw, sh / bh, ref);
  return { s, fx: (a.l + a.r) / 2 - ((x0 + x1) / 2 - 836) * s, fy: (a.t + a.b) / 2 - ((y0 + y1) / 2 - 470.5) * s };
};
function makeKit(stage, hub) {
  const { renderer, root } = stage;
  const anims = [];
  const ribbonU = [];
  const sparkU = [];
  const floaters = [];
  let seed = 7;
  const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  const kit = {
    renderer,
    root,
    rnd,
    /** texture pixels per frame pixel — so cards are sharp on this screen */
    texScale: () => Math.min(3, Math.max(1.5, stage.pxScale() * 1.25)),
    canvasTexture: (c) => canvasTexture(c, renderer),
    glow(x, y, z, w, h, color, o, delay = 0.05) {
      const m = glow(w, h, color, o);
      m.position.copy(at(x, y, z));
      root.add(m);
      const u = m.material.uniforms.uOpacity;
      anims.push({ delay, dur: 1.1, apply: (p, g) => {
        u.value = o * easeOut(p) * g;
      } });
    },
    /** a line draws itself from start to end */
    reveal(l, delay, dur) {
      root.add(l);
      const geo = l.geometry;
      const total = geo.attributes.instanceStart.count;
      const mat = l.material;
      anims.push({ delay, dur, apply: (p, g) => {
        geo.instanceCount = Math.max(0, Math.round(total * easeOut(p)));
        mat.color.setScalar(g);
      } });
    },
    /** an orbit: a circle tilted to the viewer — an ellipse on screen, passing both in front of the cards and behind */
    orbit(o) {
      const pts = [];
      const q = new THREE2.Euler(deg(o.tilt), 0, deg(o.rotZ));
      for (let i = 0; i <= 200; i++) {
        const a = deg(o.from + (o.to - o.from) * (i / 200));
        pts.push(at(o.c[0], o.c[1], o.z ?? 0).add(new THREE2.Vector3(Math.cos(a) * o.r, 0, Math.sin(a) * o.r).applyEuler(q)));
      }
      kit.reveal(line(pts, { color: o.color ?? "#fff1dc", width: o.width ?? 1.4, opacity: o.opacity ?? 0.6, fade: o.fade ?? ((t) => 0.3 + 0.7 * Math.sin(Math.PI * t)) }), o.delay ?? 0.4, 1.3);
    },
    /** a curve through frame points (links between cards) */
    curve(pts, o) {
      const c = new THREE2.CatmullRomCurve3(pts.map(([x, y, z]) => at(x, y, z)), false, "centripetal");
      kit.reveal(line(c.getPoints(90), { color: o.color, width: o.width, opacity: o.opacity ?? 0.9, fade: o.fade ?? ((t) => Math.min(1, t * 6) * Math.min(1, (1 - t) * 6)) }), o.delay ?? 0.45, o.dur ?? 0.8);
    },
    /** a glossy ribbon */
    band(pts, w, twist, color, delay) {
      const m = ribbon({ points: pts.map(([x, y, z]) => at(x, y, z)), width: (t) => w * (0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, t * 1.25))), twist: (t) => twist * Math.sin(t * Math.PI * 1.5), color });
      root.add(m);
      const u = m.material.uniforms;
      ribbonU.push(u);
      anims.push({ delay, dur: 0.9, apply: (p, g) => {
        u.uReveal.value = easeOut(p) * 1.001;
        u.uOpacity.value = g;
      } });
    },
    /** sparks: frame points with a size (px) */
    sparks(pts, color, k, delay) {
      const m = sparks(pts, color, rnd);
      root.add(m);
      const u = m.material.uniforms;
      sparkU.push(u);
      anims.push({ delay, dur: 1.2, apply: (p, g) => {
        u.uOpacity.value = k * easeOut(p) * g;
        u.uPx.value = stage.pxScale();
      } });
    },
    /** a cloud of sparks on an ellipse around the composition + large soft spots, as if out of focus */
    sparkField(c, r, n, color = "#ffc070", nodes = []) {
      const sp = [];
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, k = 0.55 + rnd() * 0.6;
        sp.push({ p: at(c[0] + Math.cos(a) * r[0] * k, c[1] + Math.sin(a) * r[1] * k, -150 + rnd() * 260), size: 3 + rnd() * 5 });
      }
      for (const [x, y, s] of nodes) sp.push({ p: at(x, y, 0), size: s });
      kit.sparks(sp, color, 1, 0.6);
      const bokeh = [];
      for (let i = 0; i < 16; i++) bokeh.push({ p: at(c[0] - r[0] * 0.9 + rnd() * r[0] * 1.8, c[1] - r[1] + rnd() * r[1] * 2, 80 + rnd() * 200), size: 22 + rnd() * 30 });
      kit.sparks(bokeh, color, 0.28, 0.4);
    },
    /** rocks: float up from below on entrance */
    rocks(list) {
      list.forEach(([x, y, s, z], i) => {
        const m = rock(s, i + 1);
        const base = at(x, y, z);
        m.rotation.set(i + 1, (i + 1) * 2.1, (i + 1) * 0.7);
        root.add(m);
        const mat = m.material;
        anims.push({ delay: 0.3 + i * 0.04, dur: 1, apply: (p, g) => {
          const e = easeOut(p);
          m.position.set(base.x, base.y - (1 - e) * 40, base.z);
          mat.opacity = e * g;
        } });
      });
    },
    /** a glass card with content: centre and turn in the frame; on entrance flies from the hub and from the depth,
        then floats */
    card(o) {
      const m = card(o);
      m.renderOrder = o.order ?? 3;
      m.rotation.set(deg(o.r[0]), deg(o.r[1]), deg(o.r[2]), "YXZ");
      const fl = { m, base: at(o.c[0], o.c[1], o.z), ph: floaters.length * 1.7, amp: o.amp ?? 4, enter: 0, main: o.order === 5 || o.order === 1 };
      floaters.push(fl);
      const u = m.material.uniforms.uOpacity;
      anims.push({ delay: o.delay, dur: 0.95, apply: (p, g) => {
        fl.enter = easeOut(p);
        u.value = Math.min(1, p * 2.2) * g;
      } });
      root.add(m);
      return m;
    }
  };
  const unsqueeze = (f) => {
    for (const fl of floaters) {
      const k = f < 1 && !fl.main ? NARROW_SAT : 1;
      fl.m.scale.set(k / f, k, k);
    }
  };
  const step2 = (ti, g, t, reduced) => {
    for (const a of anims) a.apply((ti - a.delay) / a.dur, g);
    for (const f of floaters) {
      const e = f.enter;
      f.m.position.set(
        hub.x + (f.base.x - hub.x) * e,
        hub.y + (f.base.y - hub.y) * e + (reduced ? 0 : Math.sin(t * 0.9 + f.ph) * f.amp),
        f.base.z - (1 - e) * 260
      );
    }
    for (const u of ribbonU) u.uTime.value = t;
    for (const u of sparkU) u.uTime.value = t;
  };
  return Object.assign(kit, { step: step2, unsqueeze });
}
function createDiorama(canvas2, o) {
  let safe = null;
  let squeeze = 1;
  const stage = createStage(canvas2, fitBox(o.box, () => safe?.() ?? null, (f) => {
    squeeze = f;
  }, o.squeeze));
  const { renderer, scene: scene2, camera, root } = stage;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const kit = makeKit(stage, at(o.hub[0], o.hub[1], -120));
  const ready = (async () => {
    await o.build(kit);
    await renderer.compileAsync(scene2, camera);
  })();
  let raf = 0, last = 0, paused = false, built = false;
  let presence = 0, intro = -1;
  const pointer = new THREE2.Vector2(), look = new THREE2.Vector2(), res = new THREE2.Vector2();
  const frame = (now) => {
    raf = 0;
    const dt = Math.min(0.05, last ? (now - last) / 1e3 : 0.016);
    last = now;
    if (!built) return;
    if (presence > 0.5 && intro < 0) intro = 0;
    if (presence <= 1e-3) intro = -1;
    if (intro >= 0) intro += dt;
    look.lerp(pointer, 0.06);
    root.scale.x = squeeze;
    kit.unsqueeze(squeeze);
    root.rotation.set(-look.y * 0.035, look.x * 0.05, 0);
    kit.step(reduced ? 99 : Math.max(0, intro), presence, now / 1e3, reduced);
    renderer.getDrawingBufferSize(res);
    root.traverse((x) => {
      x.material?.resolution?.set(res.x, res.y);
    });
    renderer.render(scene2, camera);
    if (!paused && (presence > 0 || intro >= 0)) kick();
  };
  const kick = () => {
    if (!raf && !paused) raf = requestAnimationFrame(frame);
  };
  void ready.then(() => {
    built = true;
    kick();
  });
  return {
    stage,
    ready,
    setPresence(v) {
      const was = presence;
      presence = clamp01(v);
      if (presence !== was) kick();
    },
    setPointer(x, y) {
      pointer.set(x, y);
    },
    setSafe(fn) {
      safe = fn;
      stage.resize();
      kick();
    },
    still() {
      presence = 1;
      intro = 99;
      kick();
    },
    pause() {
      paused = true;
      cancelAnimationFrame(raf);
      raf = 0;
    },
    resume() {
      paused = false;
      kick();
    }
  };
}

// items/glass-diorama/variants/ts/draw.ts
var FONT = "Onest";
var INK = "#f4efe6";
var MUTED = "rgba(244, 239, 230, 0.62)";
var LINE = "rgba(255, 255, 255, 0.14)";
var font = (w, size) => `${w} ${size}px "${FONT}", system-ui, sans-serif`;
var rr = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};
var fontsReady = null;
var loadFonts = () => fontsReady ??= Promise.all(["400", "500", "600"].map((w) => document.fonts.load(`${w} 16px "${FONT}"`))).catch(() => void 0);
async function sheet(w, h, scale, draw, bg = "rgba(24, 22, 18, 0.62)", r = 18) {
  await loadFonts();
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const ctx = c.getContext("2d");
  ctx.scale(scale, scale);
  if (bg) {
    rr(ctx, 0, 0, w, h, r);
    ctx.fillStyle = bg;
    ctx.fill();
  }
  await draw(ctx);
  return c;
}
function text(ctx, s, x, y, o = {}) {
  ctx.font = font(o.w ?? 400, o.size ?? 14);
  ctx.fillStyle = o.color ?? INK;
  ctx.textAlign = o.align ?? "left";
  ctx.fillText(s, x, y);
  ctx.textAlign = "left";
  return ctx.measureText(s).width;
}
function chip(ctx, s, x, y, o) {
  const size = o.size ?? 13, h = o.h ?? 24;
  ctx.font = font(500, size);
  const w = ctx.measureText(s).width + (o.dot ? 30 : 20);
  rr(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = o.bg;
  ctx.fill();
  if (o.dot) {
    ctx.beginPath();
    ctx.arc(x + 13, y + h / 2, 4, 0, Math.PI * 2);
    ctx.fillStyle = o.dot;
    ctx.fill();
  }
  ctx.fillStyle = o.color;
  ctx.fillText(s, x + (o.dot ? 22 : 10), y + h / 2 + size * 0.36);
  return w;
}
function hr(ctx, x, y, w) {
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + 0.5);
  ctx.lineTo(x + w, y + 0.5);
  ctx.stroke();
}
function step(ctx, x, y, r, done, n, color) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (done) {
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#10180e";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.4, y);
    ctx.lineTo(x - r * 0.1, y + r * 0.32);
    ctx.lineTo(x + r * 0.42, y - r * 0.3);
    ctx.stroke();
  } else {
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    text(ctx, String(n), x, y + 5, { size: 13, color: MUTED, align: "center" });
  }
}
function avatar(ctx, x, y, r, initials, bg, ring = "rgba(24,22,18,0.9)") {
  ctx.beginPath();
  ctx.arc(x, y, r + 2, 0, Math.PI * 2);
  ctx.fillStyle = ring;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();
  text(ctx, initials, x, y + r * 0.34, { w: 600, size: r * 0.9, color: "#1b1712", align: "center" });
}

// items/glass-diorama/variants/ts/board.ts
var HUB = [860, 440];
var GOLD = "#ffd08a";
var ACCENT = "#2f6fe0";
var BG = "rgba(34, 30, 24, 0.62)";
var PEOPLE = [["AK", "#ffd9a8"], ["MR", "#bfe3cf"], ["JL", "#c9d7ff"], ["SO", "#f6c6d2"], ["TN", "#e6dcc3"]];
var MAIN = { w: 640, h: 470 };
async function paintMain(scale) {
  await loadFonts();
  const c = document.createElement("canvas");
  c.width = Math.round(MAIN.w * scale);
  c.height = Math.round(MAIN.h * scale);
  const ctx = c.getContext("2d");
  ctx.scale(scale, scale);
  rr(ctx, 0, 0, MAIN.w, MAIN.h, 24);
  ctx.fillStyle = "#fbfaf8";
  ctx.fill();
  rr(ctx, 0, 0, MAIN.w, MAIN.h, 24);
  ctx.clip();
  const dark = "#1d1d1f", soft = "rgba(29,29,31,0.5)";
  rr(ctx, 22, 20, 26, 26, 8);
  ctx.fillStyle = ACCENT;
  ctx.fill();
  text(ctx, "Northwind Board", 58, 39, { w: 600, size: 16, color: dark });
  chip(ctx, "Sprint 14", 206, 21, { bg: "rgba(47,111,224,0.1)", color: ACCENT, size: 12 });
  PEOPLE.slice(0, 3).forEach(([ini, col], i) => avatar(ctx, 486 + i * 20, 33, 12, ini, col, "#fbfaf8"));
  rr(ctx, 548, 20, 70, 26, 13);
  ctx.fillStyle = dark;
  ctx.fill();
  text(ctx, "Share", 583, 38, { w: 500, size: 12, color: "#fff", align: "center" });
  ctx.fillStyle = "rgba(29,29,31,0.08)";
  ctx.fillRect(0, 62, MAIN.w, 1);
  const cols = [
    ["To do", 4, [["Design", "#f3b562"], ["API", "#8fb3f5"], ["Copy", "#b8a3f0"]]],
    ["In progress", 3, [["Search", "#7fd1ae"], ["Design", "#f3b562"]]],
    ["Review", 2, [["Filters", "#8fb3f5"], ["QA", "#f39aa8"]]],
    ["Done", 6, [["Onboarding", "#7fd1ae"], ["Export", "#b8a3f0"], ["API", "#8fb3f5"]]]
  ];
  const cw = 138, gap = 12, x0 = 22, y0 = 80;
  cols.forEach(([name, n, cards], i) => {
    const x = x0 + i * (cw + gap);
    text(ctx, name, x + 2, y0 + 12, { w: 600, size: 12, color: dark });
    ctx.font = font(600, 12);
    text(ctx, String(n), x + 8 + ctx.measureText(name).width, y0 + 12, { w: 500, size: 12, color: soft });
    cards.forEach(([tag, col], k) => {
      const y = y0 + 26 + k * 84;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.08)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
      rr(ctx, x, y, cw, 74, 12);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.restore();
      rr(ctx, x + 10, y + 10, ctx.measureText(tag).width + 18, 18, 9);
      ctx.fillStyle = col + "55";
      ctx.fill();
      text(ctx, tag, x + 19, y + 23, { w: 500, size: 10.5, color: dark });
      ctx.fillStyle = "rgba(29,29,31,0.16)";
      rr(ctx, x + 10, y + 38, cw - 34, 6, 3);
      ctx.fill();
      rr(ctx, x + 10, y + 50, cw - 64, 6, 3);
      ctx.fill();
      const [ini, pc] = PEOPLE[(i * 2 + k) % PEOPLE.length];
      avatar(ctx, x + cw - 18, y + 56, 8, ini, pc, "#fff");
      if (i === 3) {
        ctx.fillStyle = "#7fd1ae";
        ctx.beginPath();
        ctx.arc(x + cw - 16, y + 18, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  });
  text(ctx, "Sprint progress", 22, 440, { w: 500, size: 12, color: soft });
  rr(ctx, 130, 431, 420, 10, 5);
  ctx.fillStyle = "rgba(29,29,31,0.08)";
  ctx.fill();
  rr(ctx, 130, 431, 420 * 0.68, 10, 5);
  ctx.fillStyle = ACCENT;
  ctx.fill();
  text(ctx, "68 %", 566, 441, { w: 600, size: 12, color: dark });
  return c;
}
var paintVelocity = (s) => sheet(300, 180, s, (ctx) => {
  text(ctx, "Velocity", 20, 34, { w: 600, size: 17 });
  text(ctx, "42 pts", 20, 66, { w: 600, size: 26 });
  text(ctx, "per sprint", 108, 66, { size: 12, color: MUTED });
  [22, 30, 27, 35, 38, 42].forEach((v, i) => {
    const h = v * 1.8, x = 20 + i * 44;
    rr(ctx, x, 160 - h, 30, h, 6);
    ctx.fillStyle = i === 5 ? GOLD : "rgba(255,255,255,0.2)";
    ctx.fill();
  });
}, BG, 20);
var paintTeam = (s) => sheet(300, 150, s, (ctx) => {
  text(ctx, "Team", 20, 34, { w: 600, size: 17 });
  chip(ctx, "5 online", 72, 17, { bg: "rgba(127,209,174,0.18)", color: "#bdf0d9", size: 11, dot: "#7fd1ae", h: 22 });
  PEOPLE.forEach(([ini, col], i) => avatar(ctx, 42 + i * 54, 92, 20, ini, col));
  text(ctx, "2 reviewing \xB7 3 building", 20, 136, { size: 12, color: MUTED });
}, BG, 20);
var paintCycle = (s) => sheet(300, 170, s, (ctx) => {
  text(ctx, "Cycle time", 20, 34, { w: 600, size: 17 });
  text(ctx, "2.4 days", 20, 66, { w: 600, size: 24 });
  chip(ctx, "\u221218 %", 128, 48, { bg: "rgba(127,209,174,0.18)", color: "#bdf0d9", size: 12 });
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  [[20, 96], [66, 104], [112, 100], [158, 122], [204, 128], [250, 146], [280, 150]].forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.stroke();
  hr(ctx, 20, 156, 260);
}, BG, 20);
var paintReleases = (s) => sheet(260, 196, s, (ctx) => {
  text(ctx, "Releases", 20, 34, { w: 600, size: 17 });
  const rows = [["v2.3 \xB7 Search", true], ["v2.4 \xB7 Filters", true], ["v2.5 \xB7 Export", false]];
  rows.forEach(([t, done], i) => {
    const y = 70 + i * 42;
    step(ctx, 34, y, 11, done, i + 1, "#7fd1ae");
    text(ctx, t, 56, y + 5, { size: 14, color: done ? "#f4efe6" : MUTED });
  });
}, BG, 20);
var paintBlockers = (s) => sheet(220, 92, s, (ctx) => {
  chip(ctx, "3 blockers", 18, 18, { bg: "rgba(243,154,168,0.18)", color: "#ffd0d8", size: 13, dot: "#f39aa8", h: 26 });
  text(ctx, "need a decision today", 20, 72, { size: 12.5, color: MUTED });
}, BG, 18);
var paintTile = (label, value) => (s) => sheet(120, 90, s, (ctx) => {
  text(ctx, value, 16, 46, { w: 600, size: 26 });
  text(ctx, label, 16, 70, { size: 12, color: MUTED });
}, BG, 14);
function createBoardScene(canvas2) {
  return createDiorama(canvas2, {
    hub: HUB,
    box: [280, 140, 1470, 740],
    async build(k) {
      k.glow(880, 440, -220, 1250, 820, "#ff9a3c", 0.44);
      k.glow(860, 640, -20, 720, 220, "#ffb060", 0.75);
      k.glow(500, 420, -160, 520, 460, "#ffaa55", 0.2);
      k.glow(1250, 440, -160, 520, 520, "#ffaa55", 0.2);
      k.glow(870, 300, -260, 900, 300, "#ffd28a", 0.16);
      k.orbit({ c: [845, 425], r: 560, tilt: 21, rotZ: -5, from: -10, to: 350, opacity: 0.6, fade: (t) => 0.35 + 0.65 * Math.sin(Math.PI * t), delay: 0.35 });
      k.orbit({ c: [880, 395], r: 510, tilt: 18, rotZ: 7, from: 170, to: 530, opacity: 0.6, fade: (t) => 0.25 + 0.75 * Math.sin(Math.PI * t), delay: 0.5 });
      k.band([[700, 400, -60], [620, 380, -30], [560, 392, -10], [500, 420, -40], [430, 455, -90]], 30, 0.9, "#ef6f4c", 0.25);
      k.band([[700, 440, -60], [624, 430, -30], [566, 446, -10], [506, 478, -40], [440, 515, -100]], 20, 1.2, "#dc5a3a", 0.32);
      k.band([[1020, 470, -60], [1110, 450, -20], [1190, 405, -10], [1262, 335, -30], [1316, 250, -60]], 28, 1.1, "#ef6f4c", 0.3);
      k.band([[1020, 505, -60], [1116, 490, -20], [1204, 452, -20], [1280, 380, -40], [1342, 290, -80]], 18, 0.8, "#dc5a3a", 0.38);
      k.sparkField([850, 430], [620, 280], 110, "#ffc070", [[640, 210, 12], [1045, 212, 12], [1400, 575, 12], [460, 635, 9], [300, 545, 9], [950, 650, 10]]);
      k.rocks([[345, 640, 30, 60], [872, 712, 20, 40], [1010, 690, 14, 20], [540, 650, 11, 0], [620, 600, 8, -40], [1290, 150, 9, -60], [1560, 170, 10, -80]]);
      const ts = k.texScale();
      const iw = 430, ih = iw * MAIN.h / MAIN.w;
      const mainTex = k.canvasTexture(await paintMain(iw / MAIN.w * ts * 2));
      k.card({ size: [iw + 30, ih + 30], radius: 32, glass: 0.45, halo: 0, c: [898, 452], z: -45, r: [-6, 10, -8], delay: 0.08, amp: 3, order: 1 });
      k.card({ map: mainTex, size: [iw + 34, ih + 34], inner: [iw, ih], radius: 34, innerRadius: 22, glass: 0.7, warm: 1, halo: 0.42, margin: 70, c: [862, 436], z: 0, r: [-6, 10, -8], delay: 0, amp: 3, order: 5 });
      const sat = async (paint, w0, h0, w, c, z, r, delay, amp) => {
        const cv = await paint(w / w0 * ts * 2);
        const h = w * h0 / w0;
        k.card({ map: k.canvasTexture(cv), size: [w + 12, h + 12], inner: [w, h], radius: 20, innerRadius: 16, glass: 0.5, tint: "#6a5a3a", halo: 0.3, margin: 40, c, z, r, delay, amp, order: 3 });
      };
      await sat(paintVelocity, 300, 180, 236, [468, 268], -30, [4, 14, -8], 0.22, 5);
      await sat(paintTeam, 300, 150, 236, [470, 520], 10, [-4, 16, -6], 0.29, 6);
      await sat(paintCycle, 300, 170, 230, [1262, 262], -30, [4, -16, 4], 0.36, 5);
      await sat(paintReleases, 260, 196, 200, [1318, 492], -40, [0, -18, 2], 0.43, 7);
      await sat(paintBlockers, 220, 92, 176, [1170, 676], 20, [-4, -12, -4], 0.5, 8);
      const tiles = [
        ["open tasks", "18", [300, 420], -120, [0, 18, -6], 2.2],
        ["merged", "27", [1440, 330], -140, [0, -20, 6], 1.6],
        ["reviews", "9", [660, 690], 90, [-10, 8, 6], 2.4]
      ];
      for (const [i, [label, value, c, z, r, blur]] of tiles.entries()) {
        const cv = await paintTile(label, value)(96 / 120 * ts * 2);
        k.card({ map: k.canvasTexture(cv), size: [102, 78], inner: [96, 72], radius: 12, innerRadius: 10, glass: 0.4, tint: "#6a5a3a", blur, halo: 0.12, margin: 20, c, z, r, delay: 0.35 + i * 0.05, amp: 6, order: z > 0 ? 6 : 2 });
      }
      k.curve([[640, 330, -20], [600, 300, -25], [590, 280, -30]], { color: GOLD, width: 1.6, delay: 0.7 });
      k.curve([[640, 500, -20], [610, 515, -10], [590, 520, 10]], { color: GOLD, width: 1.6, delay: 0.75 });
      k.curve([[1085, 320, -20], [1120, 290, -25], [1146, 275, -30]], { color: GOLD, width: 1.6, delay: 0.8 });
      k.curve([[1085, 520, -20], [1160, 510, -30], [1216, 500, -40]], { color: GOLD, width: 1.6, delay: 0.85 });
      k.curve([[1030, 600, -10], [1060, 640, 0], [1082, 668, 20]], { color: GOLD, width: 1.6, delay: 0.9 });
    }
  });
}

// items/glass-diorama/variants/ts/main.ts
var canvas = document.querySelector("#scene");
var scene = createBoardScene(canvas);
addEventListener("resize", () => scene.stage.resize());
addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse") return;
  scene.setPointer(e.clientX / innerWidth * 2 - 1, e.clientY / innerHeight * 2 - 1);
});
document.querySelector(".replay").addEventListener("click", () => {
  scene.setPresence(0);
  requestAnimationFrame(() => requestAnimationFrame(() => scene.setPresence(1)));
});
document.addEventListener("visibilitychange", () => document.hidden ? scene.pause() : scene.resume());
await scene.ready;
if (new URLSearchParams(location.search).get("still") === "1") scene.still();
else scene.setPresence(1);
document.body.classList.add("is-ready");
