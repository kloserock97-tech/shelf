/* Glass diorama engine. Coordinates are pixels of a 1672×941 reference frame: x right from the centre, y up, z towards
 * the viewer. The camera is chosen so that the z = 0 plane lands on the frame one to one, so any detail can be
 * checked against the reference by overlaying it. The frame is fitted into the window by a Fit function.
 * The canvas is transparent and premultiplied: it lies over whatever the page draws behind it. */
import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

export const FRAME = { w: 1672, h: 941 };
const FOV = 30;
/** pure additive light: colour is added, the canvas alpha does not grow — light falls on the page under the canvas */
export const addLight = (m: THREE.Material) => {
  m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor;
  m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor;
  return m;
};
export const DIST = FRAME.h / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));

/** a frame point (px) at depth z → world coordinates that land on the same screen point */
export const at = (px: number, py: number, z = 0) => {
  const k = (DIST - z) / DIST;
  return new THREE.Vector3((px - FRAME.w / 2) * k, (FRAME.h / 2 - py) * k, z);
};

/* ── card glass ── */
const CARD_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN, vV;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const CARD_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uMap;
  uniform float uHasMap, uRadius, uBorder, uOpacity, uBlur, uGlass, uWarm, uHalo, uMargin;
  uniform vec2 uSize, uInner;   // plate and content size (scene units)
  uniform float uInnerR;
  uniform vec2 uRep, uOff;      // a crop of the texture: uv scale and offset
  uniform vec3 uTint;           // glass tone: milky white or smoky dark
  uniform float uRim;           // glass edge: 0 — picture only
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
`;

export type CardOpts = {
  map?: THREE.Texture;
  /** plate and content size in scene units; content is centred */
  size: [number, number];
  inner?: [number, number];
  radius: number;
  innerRadius?: number;
  glass?: number;
  warm?: number;
  blur?: number;
  /** strength of the warm halo beyond the edge and its width, scene units */
  halo?: number;
  margin?: number;
  /** a crop of the texture (uv): scale and offset — a photo "cover", a piece of a big render */
  rep?: THREE.Vector2;
  off?: THREE.Vector2;
  /** glass tone; milky white by default */
  tint?: string;
  /** edge brightness, 0 — no edge */
  rim?: number;
  /** the content is a screenshot: return its brightness from linear colour */
  screen?: boolean;
};
export function card(o: CardOpts) {
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
      uOff: { value: o.off ?? new THREE.Vector2(0, 0) },
    },
  });
  return new THREE.Mesh(geo, mat);
}

export function canvasTexture(c: HTMLCanvasElement, renderer: THREE.WebGLRenderer) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/* ── glossy ribbon ── */
const RIB_VERT = /* glsl */ `
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
`;
const RIB_FRAG = /* glsl */ `
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
`;
export type RibbonOpts = { points: THREE.Vector3[]; width: number | ((t: number) => number); twist?: (t: number) => number; color?: string; segments?: number; fadeIn?: number; fadeOut?: number };
export function ribbon(o: RibbonOpts) {
  const curve = new THREE.CatmullRomCurve3(o.points, false, "centripetal");
  const N = o.segments ?? 160;
  const pos: number[] = [], nor: number[] = [], ts: number[] = [], uv: number[] = [], idx: number[] = [];
  const Z = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = curve.getPointAt(t), T = curve.getTangentAt(t).normalize();
    /* the ribbon lies almost in the frame plane and twists around its own axis — that moves the highlight */
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
    if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("aN", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("aT", new THREE.Float32BufferAttribute(ts, 1));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    vertexShader: RIB_VERT, fragmentShader: RIB_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(o.color ?? "#e2323f") }, uReveal: { value: 1 }, uTime: { value: 0 }, uOpacity: { value: 1 }, uFadeIn: { value: o.fadeIn ?? 0.06 }, uFadeOut: { value: o.fadeOut ?? 0.12 } },
  });
  return new THREE.Mesh(geo, mat);
}

/* ── a thin line of constant pixel width (orbits, links) ── */
export function line(points: THREE.Vector3[], o: { color: string; width: number; fade?: (t: number) => number; opacity?: number }) {
  const g = new LineGeometry();
  g.setPositions(points.flatMap((p) => [p.x, p.y, p.z]));
  const base = new THREE.Color(o.color);
  const cols: number[] = [];
  points.forEach((_, i) => { const k = (o.fade ? o.fade(i / (points.length - 1)) : 1) * (o.opacity ?? 1); cols.push(base.r * k, base.g * k, base.b * k); });
  g.setColors(cols);
  /* additive colours: fading along the length is simply a darker colour */
  const m = new LineMaterial({ linewidth: o.width, vertexColors: true, transparent: true, depthWrite: false, worldUnits: false });
  addLight(m);
  const l = new Line2(g, m);
  l.computeLineDistances();
  return l;
}

/* ── sparks ── */
const SPARK_VERT = /* glsl */ `
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
`;
const SPARK_FRAG = /* glsl */ `
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
`;
export function sparks(points: { p: THREE.Vector3; size: number }[], color = "#ffc070", rnd: () => number = Math.random) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(points.flatMap((s) => [s.p.x, s.p.y, s.p.z]), 3));
  g.setAttribute("aSize", new THREE.Float32BufferAttribute(points.map((s) => s.size), 1));
  g.setAttribute("aSeed", new THREE.Float32BufferAttribute(points.map(() => rnd()), 1));
  const m = new THREE.ShaderMaterial({
    vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG, transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 } },
  });
  addLight(m);
  return new THREE.Points(g, m);
}

/* ── glow: a soft spot, additive ── */
const GLOW_FRAG = /* glsl */ `
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
`;
export function glow(w: number, h: number, color: string, opacity: number) {
  const m = new THREE.ShaderMaterial({
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: GLOW_FRAG, transparent: true, depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), addLight(m));
}

/* ── a rock: low-poly, dark, lit by a warm back light ── */
export function rock(size: number, seed: number) {
  const g = new THREE.IcosahedronGeometry(size, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  const rnd = (k: number) => { const x = Math.sin(seed * 91.7 + k * 12.9898) * 43758.5453; return x - Math.floor(x); };
  const v = new THREE.Vector3();
  const cache = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    /* shared corners get the same push, so the faces stay closed */
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let k = cache.get(key);
    if (k === undefined) { k = 0.72 + rnd(cache.size) * 0.45; cache.set(key, k); }
    v.multiplyScalar(k);
    v.y *= 0.8;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: "#2c261e", roughness: 0.92, metalness: 0, flatShading: true, transparent: true }));
}

/* ── renderer ── */
export type Stage = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  root: THREE.Group;
  resize(): void;
  /** screen pixels per frame pixel (with DPR) */
  pxScale(): number;
};
/** how the frame lies in the window: s — css px per frame px, fx/fy — the frame centre on screen (css px) */
export type Fit = (w: number, h: number) => { s: number; fx: number; fy: number };
export const containFit: Fit = (w, h) => ({ s: Math.min(w / FRAME.w, h / FRAME.h), fx: w / 2, fy: h / 2 });

export function createStage(canvas: HTMLCanvasElement, fit: Fit = containFit): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 10, DIST * 3);
  camera.position.set(0, 0, DIST);
  const root = new THREE.Group();
  scene.add(root);
  scene.add(new THREE.HemisphereLight("#ffe6c0", "#1a2410", 1.1));
  const sun = new THREE.DirectionalLight("#ffc680", 2.4);
  sun.position.set(300, 500, 400);
  scene.add(sun);
  let s = 1;
  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const dpr = Math.min(2, devicePixelRatio);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    const f = fit(w, h);
    s = f.s;
    const visH = h / s;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(visH / 2 / DIST));
    camera.aspect = w / h;
    /* the frame centre is not necessarily the window centre: shift the view, not the camera — perspective stays */
    camera.setViewOffset(w, h, w / 2 - f.fx, h / 2 - f.fy, w, h);
    camera.updateProjectionMatrix();
  };
  resize();
  return { renderer, scene, camera, root, resize, pxScale: () => s * Math.min(2, devicePixelRatio) };
}
