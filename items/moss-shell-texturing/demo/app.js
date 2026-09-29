// items/moss-shell-texturing/variants/ts/main.ts
import * as THREE3 from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// items/moss-shell-texturing/variants/ts/moss-stone.ts
var STONE = { width: 2.2, depth: 2, modelHeight: 1.6, thickness: 0.9, radius: 0.5 };
var DRAPE = 0.55;
var hashU = (x) => {
  x ^= x >>> 16;
  x = Math.imul(x, 1067222731);
  x ^= x >>> 14;
  x = Math.imul(x, 451533519);
  x ^= x >>> 15;
  return x >>> 0;
};
var rand = (n) => (hashU(Math.floor(n) + 3004995273 >>> 0) >>> 8) / 16777216;
var smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
var cx = STONE.width / 2 - STONE.radius;
var cz = STONE.depth / 2 - STONE.radius;
var sy = STONE.thickness / STONE.modelHeight;
function topSurface(x, z) {
  const qx = Math.max(0, Math.abs(x) - cx), qz = Math.max(0, Math.abs(z) - cz);
  const d2 = qx * qx + qz * qz;
  if (d2 > STONE.radius * STONE.radius) return null;
  const h = Math.sqrt(Math.max(0, STONE.radius * STONE.radius - d2));
  const nx = Math.sign(x) * qx, ny = h / sy, nz = Math.sign(z) * qz;
  const length = Math.hypot(nx, ny, nz);
  return { y: sy * (h - STONE.radius), nx: nx / length, ny: ny / length, nz: nz / length };
}
function anchorAt(x, z) {
  const top = topSurface(x, z);
  if (top) return { p: [x, top.y, z], n: [top.nx, top.ny, top.nz], wall: 0, bx: x, bz: z };
  const qx = Math.max(0, Math.abs(x) - cx), qz = Math.max(0, Math.abs(z) - cz), dist = Math.hypot(qx, qz);
  const dx = Math.sign(x) * qx / dist, dz = Math.sign(z) * qz / dist;
  const bx = Math.sign(x) * Math.min(Math.abs(x), cx) + dx * STONE.radius, bz = Math.sign(z) * Math.min(Math.abs(z), cz) + dz * STONE.radius;
  const wall = (dist - STONE.radius) / DRAPE;
  const yTop = -sy * STONE.radius, yBottom = -(STONE.thickness - sy * STONE.radius);
  return { p: [bx, yTop + (yBottom - yTop) * Math.min(1, wall), bz], n: [dx, 0, dz], wall, bx, bz };
}
var hash = (i, j) => (hashU(i + hashU(j + 3004995273 >>> 0) >>> 0) >>> 8) / 16777216;
var ease = (t) => t * t * (3 - 2 * t);
function noise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), u = ease(x - i), v = ease(z - j);
  return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - v) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v;
}
function fbm(x, z) {
  let sum = 0, amp = 0.5;
  for (let o = 0; o < 4; o++) {
    sum += noise(x, z) * amp;
    x = x * 2.03 + 11.7;
    z = z * 2.03 + 5.3;
    amp *= 0.5;
  }
  return sum / 0.9375;
}
var CELL = 0.5;
var COLS = 9;
var OFFSET = 2.2;
var bucket = (list) => {
  const cells = Array.from({ length: COLS * COLS }, () => []);
  const index = (v) => Math.min(COLS - 1, Math.max(0, Math.floor((v + OFFSET) / CELL)));
  for (const c of list)
    for (let j = index(c.z - c.r); j <= index(c.z + c.r); j++)
      for (let i = index(c.x - c.r); i <= index(c.x + c.r); i++) cells[j * COLS + i].push(c);
  return (x, z) => cells[index(z) * COLS + index(x)];
};
var cushions = [];
var knobs = [];
for (let n = 0; cushions.length < 70 && n < 4e3; n++) {
  const x = (rand(n * 5 + 901) - 0.5) * STONE.width, z = (rand(n * 5 + 902) - 0.5) * STONE.depth;
  if (topSurface(x, z)) cushions.push({ x, z, r: 0.14 + rand(n * 5 + 903) * 0.3, k: 0.45 + rand(n * 5 + 904) * 0.4 });
}
for (let n = 0; knobs.length < 420 && n < 9e3; n++) {
  const x = (rand(n * 5 + 1901) - 0.5) * STONE.width, z = (rand(n * 5 + 1902) - 0.5) * STONE.depth;
  if (topSurface(x, z)) knobs.push({ x, z, r: 0.05 + rand(n * 5 + 1903) * 0.075, k: 0.55 + rand(n * 5 + 1904) * 0.35 });
}
var cushionsNear = bucket(cushions);
var knobsNear = bucket(knobs);
var cushionAt = (x, z) => {
  let h = 0;
  for (const c of cushionsNear(x, z)) {
    const dx = x - c.x, dz = z - c.z;
    h = Math.max(h, (1 - (dx * dx + dz * dz) / (c.r * c.r)) * c.r * 0.9 * c.k);
  }
  return h;
};
var knobAt = (x, z) => {
  let h = 0;
  for (const c of knobsNear(x, z)) {
    const dx = x - c.x, dz = z - c.z, d2 = dx * dx + dz * dz;
    if (d2 < c.r * c.r) h = Math.max(h, Math.sqrt(c.r * c.r - d2) * c.k);
  }
  return h;
};
var mossKnob = (x, z) => Math.min(1, knobAt(x, z) / 0.07);
var CARPET = 0.045;
function mossAt(x, z, anchor = anchorAt(x, z)) {
  const wallMoss = () => {
    const stop = 0.42 + (fbm(anchor.bx * 2.6 + 7, anchor.bz * 2.6) - 0.5) * 0.7;
    return (CARPET + 0.02 + fbm(anchor.bx * 5 + anchor.wall * 4, anchor.bz * 5) * 0.07) * (1 - smooth(stop - 0.18, stop, anchor.wall)) - smooth(stop, stop + 0.08, anchor.wall) * 0.06;
  };
  if (anchor.wall > 0) return wallMoss();
  const big = Math.max(cushionAt(x, z), CARPET);
  const top = big + knobAt(x, z) * Math.min(1, big / 0.05);
  const flat = Math.min(1, anchor.n[1] * anchor.n[1] * 1.15);
  return flat >= 1 ? top : top * flat + wallMoss() * (1 - flat);
}
var arrivalAt = (anchor) => Math.min(0.62, Math.hypot(anchor.bx - 0.35, anchor.bz - 0.25) / 1.9 * 0.48 + Math.min(1, anchor.wall) * 0.14);

// items/moss-shell-texturing/variants/ts/moss-sheet.ts
import * as THREE from "three";
var RISE = "smoothstep(aDelay+.07,aDelay+.34,uGrowth)";
function buildSheet(state2, opts) {
  const { x0, x1, z0, z1, res } = opts, n = res + 1;
  const position = new Float32Array(n * n * 3), rest = new Float32Array(n * n * 3), grid = new Float32Array(n * n * 2);
  const delay = new Float32Array(n * n), colors = new Float32Array(n * n * 3), alive = new Uint8Array(n * n);
  const color = new THREE.Color();
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, x = x0 + (x1 - x0) * i / res, z = z0 + (z1 - z0) * j / res;
    const anchor = anchorAt(x, z), s = opts.sample(x, z, anchor), [px, py, pz] = anchor.p, [nx, ny, nz] = anchor.n;
    const h = Math.max(-0.05, s.h);
    position.set([px + nx * h, py + ny * h, pz + nz * h], k * 3);
    rest.set([px - nx * 0.012, py - ny * 0.012, pz - nz * 0.012], k * 3);
    grid.set([x, z], k * 2);
    if (s.h > 0) alive[k] = 1;
    delay[k] = s.delay;
    opts.tint(s.shade, color);
    colors.set([color.r, color.g, color.b], k * 3);
  }
  const index = [];
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    if (alive[a] || alive[b] || alive[c] || alive[d]) index.push(a, c, b, b, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("aRest", new THREE.BufferAttribute(rest, 3));
  geometry.setAttribute("aDelay", new THREE.BufferAttribute(delay, 1));
  geometry.setAttribute("aGrid", new THREE.BufferAttribute(grid, 2));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const inject = (shader) => {
    shader.uniforms.uGrowth = state2.growth;
    shader.vertexShader = "uniform float uGrowth; attribute vec3 aRest; attribute float aDelay;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `vec3 transformed=mix(aRest,position,${RISE});`);
  };
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  opts.material.onBeforeCompile = inject;
  depth.onBeforeCompile = inject;
  const mesh = new THREE.Mesh(geometry, opts.material);
  mesh.customDepthMaterial = depth;
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

// items/moss-shell-texturing/variants/ts/moss-shells.ts
import * as THREE2 from "three";
var FUR = 0.05;
var MAX_SHELLS = 22;
var PILE_GLSL = `
  vec3 lifted(vec3 from,vec3 along,float layer){
    float pile=smoothstep(aDelay+.02,aDelay+.30,uGrowth);
    vec3 p=from+along*(layer*uFur*pile);
    p.xz+=vec2(sin(uTime*1.3+from.x*9.+from.z*5.),cos(uTime*1.1+from.z*8.-from.x*4.))*(.008*layer*layer*pile);
    return p;
  }`;
function buildMossPile(state2, base2) {
  const uniforms = { uShells: { value: 16 }, uFur: { value: FUR }, uDensity: { value: 60 } };
  const shared = { uGrowth: state2.growth, uTime: state2.clock };
  const vertexHead = `uniform float uGrowth, uTime, uShells, uFur;
attribute vec3 aRest; attribute float aDelay; attribute vec2 aGrid;
varying float vShell; varying vec2 vGrid;
${PILE_GLSL}
`;
  const hullMaterial = new THREE2.MeshLambertMaterial({ color: new THREE2.Color(1.8, 2, 1.7), vertexColors: true, depthWrite: false });
  hullMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, shared);
    shader.vertexShader = (vertexHead + shader.vertexShader).replace("#include <begin_vertex>", `
      vec3 transformed=lifted(mix(aRest,position,${RISE}),normal,1.);
      vShell=1.; vGrid=aGrid;`);
  };
  const hull2 = new THREE2.Mesh(base2.geometry, hullMaterial);
  hull2.frustumCulled = false;
  hull2.renderOrder = 1;
  const material = new THREE2.MeshLambertMaterial({ color: "#ffffff", vertexColors: true, alphaToCoverage: true });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, shared);
    shader.vertexShader = (vertexHead + shader.vertexShader).replace("#include <begin_vertex>", `
      float layer=(float(gl_InstanceID)+1.)/uShells;
      vec3 transformed=lifted(mix(aRest,position,${RISE}),normal,layer);
      vShell=layer; vGrid=aGrid;`);
    shader.fragmentShader = `uniform float uDensity;
varying float vShell; varying vec2 vGrid;
/* Integer hash of a lattice cell and a salt: the mixer of our Hash Kit (shelf/items/hash-kit).
   Cells reach a few hundred and integers, unlike a sine hash, do not care how far from the origin they are. */
uint mossMix(uint x){ x^=x>>16; x*=0x3f9c86cbu; x^=x>>14; x*=0x1ae9dacfu; x^=x>>15; return x; }
float cellHash(vec2 cell,uint salt){
  uvec2 q=uvec2(ivec2(cell));
  return float(mossMix(mossMix(mossMix(salt)^q.x)^q.y)>>8)*(1./16777216.);
}
/* One lattice of strands: a strand to a cell, some cells empty, centres well scattered. Returns coverage and hands
   back what the colour needs: how far up its strand this layer is, a random for the hue, and whether it is a tall one. */
float strands(vec2 uv,uint seed,out float up,out float hue,out float tall){
  vec2 cell=floor(uv);
  float h1=cellHash(cell,seed), present=step(.16,cellHash(cell,seed+1u));
  hue=cellHash(cell,seed+2u); tall=step(.93,cellHash(cell,seed+3u));
  float len=mix(.36+.5*h1*h1,1.,tall);
  up=vShell/len;
  if(up>1.||present<.5) return 0.;
  vec2 jitter=(vec2(cellHash(cell,seed+4u),cellHash(cell,seed+5u))-.5)*.62;
  // the cross-section of a strand shrinks towards its tip
  float radius=(.34-.08*tall)*sqrt(1.-up);
  float dist=length(fract(uv)-.5-jitter);
  float soft=fwidth(dist)*1.1+1e-4;
  return 1.-smoothstep(radius-soft,radius+soft,dist);
}
${shader.fragmentShader}`.replace("#include <map_fragment>", `
      /* Two lattices at different scales, one turned against the other, both bent by a slow warp: rows of a single
         grid read as a rubber mat, this reads as growth. */
      vec2 warp=vec2(sin(vGrid.y*7.3+vGrid.x*2.1),cos(vGrid.x*6.1-vGrid.y*1.7))*.035;
      vec2 ga=(vGrid+warp)*uDensity;
      vec2 gb=mat2(.7986,-.6018,.6018,.7986)*(vGrid-warp*1.4)*uDensity*1.37+31.7;
      float upA,hueA,tallA,upB,hueB,tallB;
      float sa=strands(ga,0u,upA,hueA,tallA), sb=strands(gb,8u,upB,hueB,tallB);
      float strand=max(sa,sb);
      if(strand<.04) discard;
      float pick=step(sa,sb);
      float up=mix(upA,upB,pick), hue=mix(hueA,hueB,pick), tall=mix(tallA,tallB,pick);
      #include <map_fragment>`).replace("#include <color_fragment>", `
      #include <color_fragment>
      // dark at the root, yellow-green at the tip: the depth of the pile comes from colour, not from shadow maps
      float crown=clamp((vColor.g-.022)/.045,0.,1.);
      float rise=pow(up,1.25);
      vec3 rootColor=vec3(.010,.026,.006)*(1.+crown);
      vec3 tipColor=mix(vec3(.050,.115,.020),vec3(.17,.26,.052),hue)*(.38+.98*crown);
      // here and there a dry, ochre strand and a tall pale one
      tipColor=mix(tipColor,vec3(.30,.27,.085),step(.9,hue)*.5);
      tipColor=mix(tipColor,vec3(.40,.46,.16),tall*.6);
      diffuseColor.rgb=mix(rootColor,tipColor,rise);
      diffuseColor.a=strand;`).replace("#include <opaque_fragment>", `
      // velvet: moss lights up where you look along it
      float sheen=pow(1.-abs(dot(normalize(vNormal),normalize(vViewPosition))),3.);
      outgoingLight+=tipColor*sheen*.5*rise;
      #include <opaque_fragment>`);
  };
  const shells = new THREE2.InstancedMesh(base2.geometry, material, MAX_SHELLS);
  const identity = new THREE2.Matrix4();
  for (let i = 0; i < MAX_SHELLS; i++) shells.setMatrixAt(i, identity);
  shells.frustumCulled = false;
  shells.renderOrder = 2;
  shells.castShadow = false;
  shells.receiveShadow = true;
  const lockAlpha = (renderer2) => renderer2.getContext().colorMask(true, true, true, false);
  const unlockAlpha = (renderer2) => renderer2.getContext().colorMask(true, true, true, true);
  shells.onBeforeRender = lockAlpha;
  shells.onAfterRender = unlockAlpha;
  const group = new THREE2.Group();
  group.add(hull2, shells);
  return {
    group,
    /** how many layers to draw: the quality dial */
    setShells(count) {
      shells.count = Math.min(MAX_SHELLS, Math.max(4, Math.round(count)));
      uniforms.uShells.value = shells.count;
    },
    /** cells of the strand lattice per world unit; keep a cell at 3–4 device pixels, so a strand never falls under a
        pixel and shimmers */
    setDensity(perUnit) {
      uniforms.uDensity.value = perUnit;
    },
    /** for comparison only: the pile without its hull */
    setHull(on) {
      hull2.visible = on;
    },
    /** for comparison only: the layers writing their coverage into the alpha channel */
    setAlphaLock(on) {
      shells.onBeforeRender = on ? lockAlpha : () => {
      };
    }
  };
}

// items/moss-shell-texturing/variants/ts/main.ts
var FOV = 30;
var DISTANCE = 7.2;
var GROW_SECONDS = 3.2;
var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
var canvas = document.querySelector("#scene");
var state = { growth: { value: reduced ? 1 : 0 }, clock: { value: 0 }, reduced };
var renderer = new THREE3.WebGLRenderer({ canvas, alpha: true, premultipliedAlpha: true, antialias: false });
renderer.setClearColor(0, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE3.PCFShadowMap;
renderer.toneMapping = THREE3.ACESFilmicToneMapping;
var scene = new THREE3.Scene();
var pmrem = new THREE3.PMREMGenerator(renderer);
var room = new RoomEnvironment();
var env = pmrem.fromScene(room, 0.05);
scene.environment = env.texture;
scene.environmentIntensity = 0.35;
room.dispose();
pmrem.dispose();
var camera = new THREE3.PerspectiveCamera(FOV, 1, 0.5, 40);
var elevation = THREE3.MathUtils.degToRad(30);
var azimuth = THREE3.MathUtils.degToRad(-28);
camera.position.set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)).multiplyScalar(DISTANCE);
var controls = new OrbitControls(camera, canvas);
controls.target.set(0, -0.3, 0);
Object.assign(controls, { enableZoom: false, enablePan: false, enableDamping: true, autoRotate: !reduced, autoRotateSpeed: 0.7, minPolarAngle: 0.45, maxPolarAngle: 1.3 });
controls.update();
scene.add(new THREE3.HemisphereLight("#f3f7ee", "#5c6349", 0.5));
var key = new THREE3.DirectionalLight("#fff1de", 2.3);
key.position.set(-2.6, 6.5, 2.2);
key.castShadow = true;
key.shadow.mapSize.setScalar(2048);
Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 16 });
key.shadow.bias = -3e-4;
key.shadow.normalBias = 0.016;
key.shadow.radius = 7;
scene.add(key);
var fill = new THREE3.DirectionalLight("#d6e4ff", 0.6);
fill.position.set(3, 2, 4);
scene.add(fill);
var floorMat = new THREE3.ShadowMaterial({ color: "#1d1e1f", opacity: 0.28 });
var floor = new THREE3.Mesh(new THREE3.PlaneGeometry(40, 40), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -STONE.thickness;
floor.receiveShadow = true;
scene.add(floor);
var size = 128;
var stoneData = new Uint8Array(size * size * 4);
for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
  const v = 84 + fbm(i / 14, j / 14) * 54 + (fbm(i / 3, j / 3) - 0.5) * 24, k = (j * size + i) * 4;
  stoneData.set([v, v * 1.01, v * 0.98, 255], k);
}
var stoneMap = new THREE3.DataTexture(stoneData, size, size);
stoneMap.colorSpace = THREE3.SRGBColorSpace;
stoneMap.wrapS = stoneMap.wrapT = THREE3.RepeatWrapping;
stoneMap.needsUpdate = true;
var stoneGeo = new RoundedBoxGeometry(STONE.width, STONE.modelHeight, STONE.depth, 10, STONE.radius);
stoneGeo.scale(1, STONE.thickness / STONE.modelHeight, 1);
stoneGeo.translate(0, -STONE.thickness / 2, 0);
var stone = new THREE3.Mesh(stoneGeo, new THREE3.MeshStandardMaterial({ map: stoneMap, bumpMap: stoneMap, bumpScale: 1.2, roughness: 0.88, envMapIntensity: 0.6 }));
stone.castShadow = stone.receiveShadow = true;
scene.add(stone);
var base = buildSheet(state, {
  x0: -STONE.width / 2 - DRAPE - 0.1,
  x1: STONE.width / 2 + DRAPE + 0.1,
  z0: -STONE.depth / 2 - DRAPE - 0.1,
  z1: STONE.depth / 2 + DRAPE + 0.1,
  res: 110,
  material: new THREE3.MeshLambertMaterial({ color: "#ffffff", vertexColors: true }),
  sample: (x, z, anchor) => {
    const h = mossAt(x, z, anchor);
    const crown = anchor.wall > 0 ? 0.3 + fbm(x * 7, z * 7) * 0.5 : mossKnob(x, z) * 0.5 + fbm(x * 6, z * 6) * 0.22 + Math.min(1, h / 0.3) * 0.28;
    return { h, delay: arrivalAt(anchor), shade: crown };
  },
  tint: (shade, out2) => out2.setRGB(0.012 + shade * 0.02, 0.022 + shade * 0.045, 6e-3 + shade * 9e-3)
});
scene.add(base);
var pile = buildMossPile(state, base);
scene.add(pile.group);
var target = new THREE3.WebGLRenderTarget(1, 1, { type: THREE3.HalfFloatType, samples: 4 });
var composite = new FullScreenQuad(new THREE3.ShaderMaterial({
  uniforms: { tScene: { value: target.texture } },
  vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }",
  fragmentShader: `
    uniform sampler2D tScene; varying vec2 vUv;
    void main(){
      vec4 texel=texture2D(tScene,vUv);
      float coverage=texel.a;
      gl_FragColor=vec4(coverage>.001?texel.rgb/coverage:vec3(0.),1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      gl_FragColor=vec4(gl_FragColor.rgb*coverage,coverage);
    }`,
  depthTest: false,
  depthWrite: false
}));
var layers = document.querySelector("#layers");
var cell = document.querySelector("#cell");
var hull = document.querySelector("#hull");
var lock = document.querySelector("#lock");
var out = (id) => document.querySelector(id);
var height = 1;
var dpr = 1;
var distance = DISTANCE;
var grownAt = performance.now();
var applyDensity = () => {
  const pixelsPerUnit = height * dpr / (2 * distance * Math.tan(THREE3.MathUtils.degToRad(FOV / 2)));
  pile.setDensity(THREE3.MathUtils.clamp(pixelsPerUnit / Number(cell.value), 16, 200));
  out("#cell-out").value = `${Number(cell.value).toFixed(1)} px`;
};
layers.addEventListener("input", () => {
  pile.setShells(Number(layers.value));
  out("#layers-out").value = layers.value;
});
cell.addEventListener("input", applyDensity);
hull.addEventListener("change", () => pile.setHull(hull.checked));
lock.addEventListener("change", () => pile.setAlphaLock(lock.checked));
document.querySelector("#regrow").addEventListener("click", () => {
  grownAt = performance.now();
});
pile.setShells(Number(layers.value));
out("#layers-out").value = layers.value;
var resize = () => {
  const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
  dpr = Math.min(devicePixelRatio, 2);
  height = h;
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  distance = Math.max(DISTANCE, 3.4 / (2 * Math.tan(THREE3.MathUtils.degToRad(FOV / 2)) * camera.aspect));
  camera.position.sub(controls.target).setLength(distance).add(controls.target);
  target.setSize(Math.round(w * dpr), Math.round(h * dpr));
  applyDensity();
};
new ResizeObserver(resize).observe(canvas);
resize();
var startedAt = performance.now();
renderer.setAnimationLoop(() => {
  const time = (performance.now() - startedAt) / 1e3;
  state.clock.value = reduced ? 0 : time;
  state.growth.value = reduced ? 1 : smooth(0, 1, (performance.now() - grownAt) / 1e3 / GROW_SECONDS);
  controls.update();
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  composite.render(renderer);
});
