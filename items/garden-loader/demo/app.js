// items/garden-loader/variants/ts/garden-scene.ts
import * as THREE8 from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// items/garden-loader/variants/ts/garden-slab.ts
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// items/garden-loader/variants/ts/garden-surface.ts
var TILE = { width: 3.05, depth: 3.25, modelHeight: 1.5, thickness: 0.42, radius: 0.36 };
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
var delayAt = (x, z) => Math.min(0.7, Math.max(
  0.025,
  Math.hypot((x - 1.15) * 0.8, z - 1.1) / 4.5 + Math.sin(x * 5 + z * 3) * 0.035
));
var GARDEN_DELAY_GLSL = "clamp(length(vec2((x-1.15)*.8,z-1.1))/4.5+sin(x*5.+z*3.)*.035,.025,.70)";
var FRONT = 0.66;
var seedDelay = (x, z) => delayAt(x, z) / 0.7 * FRONT;
var DRAPE = 0.3;
var cx = TILE.width / 2 - TILE.radius;
var cz = TILE.depth / 2 - TILE.radius;
var sy = TILE.thickness / TILE.modelHeight;
function topSurface(x, z) {
  const qx = Math.max(0, Math.abs(x) - cx), qz = Math.max(0, Math.abs(z) - cz);
  const d2 = qx * qx + qz * qz;
  if (d2 > TILE.radius * TILE.radius) return null;
  const h = Math.sqrt(Math.max(0, TILE.radius * TILE.radius - d2));
  const nx = Math.sign(x) * qx, ny = h / sy, nz = Math.sign(z) * qz;
  const length = Math.hypot(nx, ny, nz);
  return { x, y: sy * (h - TILE.radius), z, nx: nx / length, ny: ny / length, nz: nz / length };
}
function anchorAt(x, z) {
  const top = topSurface(x, z);
  if (top) return { p: [x, top.y, z], n: [top.nx, top.ny, top.nz], wall: 0, bx: x, bz: z };
  const qx = Math.max(0, Math.abs(x) - cx), qz = Math.max(0, Math.abs(z) - cz), dist = Math.hypot(qx, qz);
  const dx = Math.sign(x) * qx / dist, dz = Math.sign(z) * qz / dist;
  const bx = Math.sign(x) * Math.min(Math.abs(x), cx) + dx * TILE.radius, bz = Math.sign(z) * Math.min(Math.abs(z), cz) + dz * TILE.radius;
  const wall = (dist - TILE.radius) / DRAPE;
  const yTop = -sy * TILE.radius, yBottom = -(TILE.thickness - sy * TILE.radius);
  return { p: [bx, yTop + (yBottom - yTop) * Math.min(1, wall) - Math.max(0, wall - 1) * 0.12, bz], n: [dx, 0, dz], wall, bx, bz };
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
  for (const c of list) {
    for (let j = index(c.z - c.r); j <= index(c.z + c.r); j++)
      for (let i = index(c.x - c.r); i <= index(c.x + c.r); i++) cells[j * COLS + i].push(c);
  }
  return (x, z) => cells[index(z) * COLS + index(x)];
};
var cushionList = [];
var knobList = [];
for (let n = 0; cushionList.length < 130 && n < 6e3; n++) {
  const x = (rand(n * 5 + 901) - 0.5) * TILE.width, z = (rand(n * 5 + 902) - 0.5) * TILE.depth;
  if (!topSurface(x, z)) continue;
  const warm = 1 - Math.min(1, Math.max(0, (delayAt(x, z) - 0.16) / 0.34));
  cushionList.push({ x, z, r: (0.14 + rand(n * 5 + 903) * 0.3) * (0.55 + 0.45 * warm), k: (0.6 + rand(n * 5 + 904) * 0.4) * (0.26 + 1 * warm) });
}
for (let n = 0; knobList.length < 620 && n < 12e3; n++) {
  const x = (rand(n * 5 + 1901) - 0.5) * TILE.width, z = (rand(n * 5 + 1902) - 0.5) * TILE.depth;
  if (!topSurface(x, z)) continue;
  knobList.push({ x, z, r: 0.05 + rand(n * 5 + 1903) * 0.075, k: 0.55 + rand(n * 5 + 1904) * 0.35 });
}
var cushionsNear = bucket(cushionList);
var knobsNear = bucket(knobList);
var cushionAt = (x, z) => {
  let h = 0;
  for (const c of cushionsNear(x, z)) {
    const dx = x - c.x, dz = z - c.z, r2 = c.r * c.r;
    h = Math.max(h, (1 - (dx * dx + dz * dz) / r2) * c.r * 0.9 * c.k);
  }
  return h;
};
var knobAt = (x, z) => {
  let h = 0;
  for (const c of knobsNear(x, z)) {
    const dx = x - c.x, dz = z - c.z, d2 = dx * dx + dz * dz, r2 = c.r * c.r;
    if (d2 < r2) h = Math.max(h, Math.sqrt(r2 - d2) * c.k);
  }
  return h;
};
var mossKnob = (x, z) => Math.min(1, knobAt(x, z) / 0.07);
var CARPET = 0.045;
function mossAt(x, z, anchor = anchorAt(x, z)) {
  const wallMoss = () => (CARPET + 0.02 + fbm(anchor.bx * 5 + anchor.wall * 4, anchor.bz * 5) * 0.07) * (1 - Math.max(0, anchor.wall - 1) / 0.3 * 1.6);
  if (anchor.wall > 0) return wallMoss();
  const big = Math.max(cushionAt(x, z), CARPET);
  const top = big + knobAt(x, z) * Math.min(1, big / 0.05);
  const flat = Math.min(1, anchor.n[1] * anchor.n[1] * 1.15);
  return flat >= 1 ? top : top * flat + wallMoss() * (1 - flat);
}
function iceAt(x, z) {
  const u = Math.max(0, (x + TILE.width / 2 + 0.16) / 1.7), v = Math.max(0, (z + TILE.depth / 2 + 0.16) / 3);
  const t = Math.pow(u, 1.15) + Math.pow(v, 1.6) + (fbm(x * 2.4 + 3, z * 2.4) - 0.5) * 0.46;
  if (t >= 1) return { h: Math.max(-0.05, (1 - t) * 0.3), t };
  const edge = Math.min(1, (1 - t) / 0.16);
  const ridge = 1 - Math.abs(2 * fbm(x * 3.1 + 40, z * 3.1 + 9) - 1);
  const crust = fbm(x * 11 + 7, z * 11 + 3);
  return { h: edge * (0.06 + ridge * ridge * 0.24 * (0.4 + 0.6 * (1 - t)) + crust * 0.035), t };
}
var meltDelay = (t) => 0.14 + Math.max(0, 1 - t) * 0.4;

// items/garden-loader/variants/ts/garden-slab.ts
function buildSlab(garden, scene, world, isDisposed) {
  const floorMat = new THREE.ShadowMaterial({ color: "#1d1e1f", opacity: 0.3 });
  floorMat.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying vec3 vCatch;
${shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
vCatch=(modelMatrix*vec4(position,1.)).xyz;`)}`;
    shader.fragmentShader = `varying vec3 vCatch;
${shader.fragmentShader.replace("#include <tonemapping_fragment>", `gl_FragColor.a*=1.-smoothstep(2.0,3.0,length(vCatch.xz-vec2(.45,.4)));
#include <tonemapping_fragment>`)}`;
  };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -TILE.thickness - 0.42;
  floor.receiveShadow = true;
  scene.add(floor);
  const material = new THREE.MeshPhysicalMaterial({
    color: "#d6e4e3",
    roughness: 0.34,
    metalness: 0,
    clearcoat: 0.8,
    clearcoatRoughness: 0.18,
    ior: 1.45,
    envMapIntensity: 1.1
  });
  const data = new Uint8Array(128 * 128);
  for (let i = 0; i < data.length; i++) data[i] = Math.round(112 + rand(i) * 30);
  const bump = new THREE.DataTexture(data, 128, 128, THREE.RedFormat);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(4, 4);
  bump.magFilter = THREE.LinearFilter;
  bump.needsUpdate = true;
  material.bumpMap = bump;
  material.bumpScale = 0.012;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGarden = garden.growth;
    shader.uniforms.uGardenTime = garden.clock;
    shader.vertexShader = "varying vec3 vTile; varying vec3 vTileN;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvTile=position; vTileN=normal;");
    shader.fragmentShader = "varying vec3 vTile; varying vec3 vTileN; uniform float uGarden; uniform float uGardenTime; float gWet;\nuint hashU(uint x){ x^=x>>16; x*=0x3f9c86cbu; x^=x>>14; x*=0x1ae9dacfu; x^=x>>15; return x; }\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `
      #include <color_fragment>
      float x=vTile.x,z=vTile.z;
      float delay=${GARDEN_DELAY_GLSL};
      float arrive=delay/.70*${FRONT.toFixed(3)};
      // where the moss already stands: frost and the glow of the glass give way there
      float moss=smoothstep(arrive,arrive+.16,uGarden);
      float top=smoothstep(.5,.95,abs(normalize(vTileN).y));
      // Cloudy density inside the glass.
      float cloud=.5+.5*sin(x*2.1+sin(z*2.9)*1.3)*cos(z*1.7-x*.9);
      diffuseColor.rgb*=mix(.93,1.03,cloud);
      // Walls: you look into the thickness, so they are deeper and cooler than the milky top.
      float wallTint=1.-smoothstep(.15,.85,abs(normalize(vTileN).y));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.50,.64,.69),wallTint*.78);
      // A cool breath across the top towards the cold corner.
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.74,.86,.90),(1.-wallTint)*.34*smoothstep(1.4,-1.8,x+z));
      // Frost along the ice, fading as the slab warms up.
      float frost=(1.-smoothstep(.9,2.6,length(vec2((x+1.7)*1.25,(z+1.2)*.6))))*(1.-moss)*(1.-uGarden*.55);
      float crystal=.5+.5*sin(x*47.+sin(z*35.))*cos(z*53.);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.60,.77,.83)*(1.+crystal*.2),frost*.62);
      // Matting: tiny crystals scattered over the top, denser inside the frost.
      uvec2 sq=uvec2(ivec2(floor(vTile.xz*70.))); float speck=float(hashU(sq.x+hashU(sq.y+0xb31c96c9u))>>8)*(1./16777216.);
      diffuseColor.rgb*=1.-step(.62,speck)*(.03+frost*.07)*top;
      // Foliage somewhere above, out of frame: soft leaf shadows lie across the bare glass and sway a little.
      float shade=0.;
      for(int i=0;i<9;i++){
        float fi=float(i);
        float sway=sin(uGardenTime*.45+fi*1.7)*.035;
        // two loose branches crossing the slab from the far side
        vec2 c=vec2(-.95+fi*.27+sin(fi*2.3)*.22, -.75+fi*.17+cos(fi*1.9)*.38)+vec2(sway,sway*.6);
        float a=.9+sin(fi*3.1)*.9+sway*2.;
        vec2 p=vec2(x,z)-c; p=vec2(cos(a)*p.x+sin(a)*p.y,-sin(a)*p.x+cos(a)*p.y);
        p/=vec2(.46+.12*sin(fi*5.),.17+.04*cos(fi*4.));
        // a leaf: an ellipse pinched towards both tips
        float d=length(vec2(p.x,p.y*(1.+.9*abs(p.x))));
        shade=max(shade,(1.-smoothstep(.45,1.15,d))*(.7+.3*sin(fi*7.)));
      }
      diffuseColor.rgb*=1.-shade*.26*top;
      // Where the ice has gone it leaves a film of water: darker, and much glossier than the matted glass.
      float iu=max(0.,(x+1.685)/1.7), iv=max(0.,(z+1.785)/3.0);
      float it=pow(iu,1.15)+pow(iv,1.6);
      float gone=.14+max(0.,1.-it)*.40;
      gWet=(1.-smoothstep(.95,1.2,it))*smoothstep(gone+.12,gone+.32,uGarden)*(1.-moss)*top;
      diffuseColor.rgb*=1.-gWet*.07;
      // The mound stands on the glass: a soft contact shadow runs just ahead of the moss.
      float ahead=uGarden-arrive;
      float contact=smoothstep(-.10,.0,ahead)*(1.-smoothstep(.0,.14,ahead));
      diffuseColor.rgb*=1.-contact*.2*top;
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", `
      #include <roughnessmap_fragment>
      roughnessFactor*=mix(1.,.28,gWet);
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_maps>", `
      #include <normal_fragment_maps>
      normal=normalize(normal+vec3(sin(vTile.x*3.1+vTile.z*1.7),0.,cos(vTile.z*3.6-vTile.x*1.3))*.035);
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>", `
      #include <emissivemap_fragment>
      // Light that would travel through the thickness: strongest in the walls, a breath of it on the top face.
      float wall=1.-smoothstep(.12,.8,abs(normalize(vTileN).y));
      float depthFade=smoothstep(-${TILE.thickness.toFixed(3)},0.,vTile.y);
      totalEmissiveRadiance+=vec3(.50,.74,.78)*(wall*.10*depthFade+.012)*(1.-moss);
    `);
  };
  const geometry = new RoundedBoxGeometry(TILE.width, TILE.modelHeight, TILE.depth, 10, TILE.radius);
  geometry.scale(1, TILE.thickness / TILE.modelHeight, 1);
  geometry.translate(0, -TILE.thickness / 2, 0);
  const tile = new THREE.Mesh(geometry, material);
  tile.castShadow = tile.receiveShadow = true;
  world.add(tile);
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = Math.round(1024 * TILE.depth / TILE.width);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const draw = () => {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '700 27px Onest, "Segoe UI", system-ui, sans-serif';
    ctx.letterSpacing = "7px";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#1f3138";
    const put = (text, u, v, turn) => {
      ctx.save();
      ctx.translate(u * canvas.width, v * canvas.height);
      ctx.rotate(turn);
      ctx.fillText(text, 0, 0);
      ctx.restore();
    };
    put("COLD", 0.6, 0.085, 0);
    put("WARM", 0.4, 0.918, 0);
    put("QUIET", 0.082, 0.56, -Math.PI / 2);
    put("ALIVE", 0.92, 0.44, Math.PI / 2);
    texture.needsUpdate = true;
  };
  draw();
  void document.fonts?.ready.then(() => {
    if (!isDisposed()) draw();
  });
  const labels = new THREE.Mesh(
    new THREE.PlaneGeometry(TILE.width, TILE.depth),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.78, depthWrite: false })
  );
  labels.rotation.x = -Math.PI / 2;
  labels.position.y = 3e-3;
  world.add(labels);
}

// items/garden-loader/variants/ts/garden-ice.ts
import * as THREE3 from "three";

// items/garden-loader/variants/ts/garden-sheet.ts
import * as THREE2 from "three";
var RISE = "smoothstep(aDelay+.07,aDelay+.34,uGarden)";
var MELT = "1.-smoothstep(aDelay,aDelay+.30,uGarden)";
function buildSheet(garden, opts) {
  const { x0, x1, z0, z1, res } = opts, n = res + 1;
  const position = new Float32Array(n * n * 3), rest = new Float32Array(n * n * 3), grid = new Float32Array(n * n * 2);
  const delay = new Float32Array(n * n), colors = new Float32Array(n * n * 3), alive = new Uint8Array(n * n);
  const color = new THREE2.Color();
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
  const geometry = new THREE2.BufferGeometry();
  geometry.setAttribute("position", new THREE2.BufferAttribute(position, 3));
  geometry.setAttribute("aRest", new THREE2.BufferAttribute(rest, 3));
  geometry.setAttribute("aDelay", new THREE2.BufferAttribute(delay, 1));
  geometry.setAttribute("aGrid", new THREE2.BufferAttribute(grid, 2));
  geometry.setAttribute("color", new THREE2.BufferAttribute(colors, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const amount = opts.mode === "grow" ? RISE : MELT;
  const inject = (shader) => {
    shader.uniforms.uGarden = garden.growth;
    shader.vertexShader = "uniform float uGarden; attribute vec3 aRest; attribute float aDelay;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `vec3 transformed=mix(aRest,position,${amount});`);
  };
  const depth = new THREE2.MeshDepthMaterial({ depthPacking: THREE2.RGBADepthPacking });
  opts.material.onBeforeCompile = inject;
  depth.onBeforeCompile = inject;
  const mesh = new THREE2.Mesh(geometry, opts.material);
  mesh.customDepthMaterial = depth;
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

// items/garden-loader/variants/ts/garden-ice.ts
function buildIce(garden, world) {
  const material = new THREE3.MeshPhysicalMaterial({
    color: "#d3ebf0",
    roughness: 0.2,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    ior: 1.31,
    flatShading: true,
    vertexColors: true,
    emissive: "#8fc6d6",
    emissiveIntensity: 0.13,
    envMapIntensity: 1.5
  });
  world.add(buildSheet(garden, {
    x0: -TILE.width / 2 - DRAPE,
    x1: -TILE.width / 2 + 1.85,
    z0: -TILE.depth / 2 - DRAPE,
    z1: -TILE.depth / 2 + 3.05,
    res: garden.small ? 60 : 88,
    mode: "melt",
    material,
    /* thin edges melt first, the core of the corner last; the ice hangs over the edge and part of the way down the
       wall, thinner the lower it gets */
    sample: (_x, _z, anchor) => {
      const ice = iceAt(anchor.bx, anchor.bz), wall = Math.min(1, anchor.wall), hang = 1 - smooth(0.35, 0.8, wall);
      return { h: ice.h > 0 ? ice.h * hang - (1 - hang) * 0.05 : ice.h, delay: meltDelay(ice.t) - wall * 0.05, shade: ice.h };
    },
    /* deep blue where the sheet is thin and you look into it, white crust on the ridges */
    tint: (shade, out) => out.setRGB(0.5 + shade * 2.1, 0.74 + shade * 1.1, 0.9 + shade * 0.45)
  }));
}

// items/garden-loader/variants/ts/garden-moss.ts
import * as THREE4 from "three";
var FUR = 0.05;
var MAX_SHELLS = 22;
var PILE_GLSL = `
  vec3 lifted(vec3 from,vec3 along,float layer){
    float pile=smoothstep(aDelay+.02,aDelay+.30,uGarden);
    vec3 p=from+along*(layer*uFur*pile);
    p.xz+=vec2(sin(uGardenTime*1.3+from.x*9.+from.z*5.),cos(uGardenTime*1.1+from.z*8.-from.x*4.))*(.008*layer*layer*pile);
    return p;
  }`;
function buildMoss(garden, world) {
  const uniforms = { uShells: { value: 16 }, uFur: { value: FUR }, uDensity: { value: 60 } };
  const base = buildSheet(garden, {
    x0: -TILE.width / 2 - DRAPE - 0.1,
    x1: TILE.width / 2 + DRAPE + 0.1,
    z0: -TILE.depth / 2 - DRAPE - 0.1,
    z1: TILE.depth / 2 + DRAPE + 0.1,
    res: garden.small ? 76 : 106,
    mode: "grow",
    material: new THREE4.MeshLambertMaterial({ color: "#ffffff", vertexColors: true }),
    /* the front runs over the top first and then creeps down each wall */
    sample: (x, z, anchor) => {
      const h = mossAt(x, z, anchor);
      const crown = anchor.wall > 0 ? 0.3 + fbm(x * 7, z * 7) * 0.5 : mossKnob(x, z) * 0.5 + fbm(x * 6, z * 6) * 0.22 + Math.min(1, h / 0.3) * 0.28;
      return { h, delay: seedDelay(anchor.bx, anchor.bz) + Math.min(1, anchor.wall) * 0.07, shade: crown };
    },
    /* what shows between the strands: deep, almost black green */
    tint: (shade, out) => out.setRGB(0.012 + shade * 0.02, 0.022 + shade * 0.045, 6e-3 + shade * 9e-3)
  });
  world.add(base);
  const vertexHead = `uniform float uGarden, uGardenTime, uShells, uFur;
attribute vec3 aRest; attribute float aDelay; attribute vec2 aGrid;
varying float vShell; varying vec2 vGrid;
${PILE_GLSL}
`;
  const hullMaterial = new THREE4.MeshLambertMaterial({ color: new THREE4.Color(1.8, 2, 1.7), vertexColors: true, depthWrite: false });
  hullMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, { uGarden: garden.growth, uGardenTime: garden.clock });
    shader.vertexShader = (vertexHead + shader.vertexShader).replace("#include <begin_vertex>", `
      vec3 transformed=lifted(mix(aRest,position,${RISE}),normal,1.);
      vShell=1.; vGrid=aGrid;`);
  };
  const hull = new THREE4.Mesh(base.geometry, hullMaterial);
  hull.frustumCulled = false;
  hull.renderOrder = 1;
  world.add(hull);
  const material = new THREE4.MeshLambertMaterial({ color: "#ffffff", vertexColors: true, alphaToCoverage: true });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, { uGarden: garden.growth, uGardenTime: garden.clock });
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
  const shells = new THREE4.InstancedMesh(base.geometry, material, MAX_SHELLS);
  const identity = new THREE4.Matrix4();
  for (let i = 0; i < MAX_SHELLS; i++) shells.setMatrixAt(i, identity);
  shells.frustumCulled = false;
  shells.renderOrder = 2;
  shells.castShadow = false;
  shells.receiveShadow = !garden.small;
  shells.onBeforeRender = (renderer) => renderer.getContext().colorMask(true, true, true, false);
  shells.onAfterRender = (renderer) => renderer.getContext().colorMask(true, true, true, true);
  world.add(shells);
  return {
    /** how many layers to draw: the quality dial */
    setShells(count) {
      shells.count = Math.min(MAX_SHELLS, Math.max(4, Math.round(count)));
      uniforms.uShells.value = shells.count;
    },
    /** cells of the strand lattice per world unit; kept at a few device pixels a cell, so a strand never falls under a
        pixel and shimmers */
    setDensity(perUnit) {
      uniforms.uDensity.value = perUnit;
    }
  };
}

// items/garden-loader/variants/ts/garden-flowers.ts
import * as THREE5 from "three";
function petalGeometry() {
  const geo = new THREE5.PlaneGeometry(1, 1, 5, 9);
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const t = uv.getY(i), across = (uv.getX(i) - 0.5) * 2;
    p.setXYZ(i, across * Math.pow(Math.sin(Math.PI * t), 0.65) * 0.055, Math.sin(t * Math.PI) * 0.035 + across * across * 0.012, t * 0.19);
  }
  geo.computeVertexNormals();
  return geo;
}
function buildFlowers(garden, world) {
  const flowers = [];
  const petalGeo = petalGeometry();
  const petalMat = (hex) => new THREE5.MeshStandardMaterial({ color: hex, roughness: 0.6, side: THREE5.DoubleSide, envMapIntensity: 0.4 });
  const ivory = petalMat("#fff4d8");
  const orange = [petalMat("#f6a03c"), petalMat("#ee7a22"), petalMat("#dc5518"), petalMat("#c9440f")];
  const stemMat = new THREE5.MeshStandardMaterial({ color: "#35581f", roughness: 0.9, envMapIntensity: 0.3 });
  const coreMat = new THREE5.MeshStandardMaterial({ color: "#d6a52c", roughness: 0.94, envMapIntensity: 0.3 });
  const budMat = new THREE5.MeshStandardMaterial({ color: "#e0641c", roughness: 0.7, envMapIntensity: 0.3 });
  const coreGeo = new THREE5.SphereGeometry(0.043, 12, 8);
  const leafGeo = new THREE5.SphereGeometry(1, 8, 6);
  const spots = [
    { x: 1.34, z: -0.18, accent: 0 },
    { x: 1.43, z: 0.3, accent: 1 },
    { x: 1.26, z: 0.78, accent: 2 },
    { x: 1.4, z: 0.02, accent: 3 }
  ];
  for (let n = 0; spots.length < 20 && n < 1500; n++) {
    const x = (rand(n * 9 + 211) - 0.5) * 2.75, z = (rand(n * 9 + 212) - 0.5) * 2.95;
    if (fbm(x * 1.3 + 20, z * 1.3 + 4) < 0.52 || spots.some((s) => Math.hypot(s.x - x, s.z - z) < 0.2)) continue;
    spots.push({ x, z, accent: -1 });
  }
  spots.forEach(({ x, z, accent: slot }, i) => {
    const accent = slot >= 0, bud = slot === 3;
    const height = accent ? [0.62, 0.8, 0.5, 0.46][slot] : 0.13 + rand(i + 80) * 0.13;
    const anchor = anchorAt(x, z), h = mossAt(x, z, anchor) * 0.8 + FUR * 0.3;
    const group = new THREE5.Group();
    group.position.set(anchor.p[0] + anchor.n[0] * h, anchor.p[1] + anchor.n[1] * h, anchor.p[2] + anchor.n[2] * h);
    const bend = accent ? 0.16 + slot * 0.04 : (rand(i + 31) - 0.5) * 0.12;
    const path = new THREE5.QuadraticBezierCurve3(new THREE5.Vector3(), new THREE5.Vector3(-bend * 0.4, height * 0.6, 0.015), new THREE5.Vector3(bend, height, 0));
    const stem = new THREE5.Mesh(new THREE5.TubeGeometry(path, 9, accent ? 9e-3 : 5e-3, 5, false), stemMat);
    stem.castShadow = true;
    group.add(stem);
    for (let j = 0; j < 2; j++) {
      const leaf = new THREE5.Mesh(leafGeo, stemMat);
      leaf.position.set(j ? -0.02 : 0.035, height * (0.3 + j * 0.2), 0);
      leaf.scale.set(accent ? 0.075 : 0.045, 8e-3, accent ? 0.026 : 0.018);
      leaf.rotation.z = j ? -0.6 : 0.6;
      leaf.castShadow = true;
      group.add(leaf);
    }
    const head = new THREE5.Group();
    head.position.set(bend, height, 0);
    head.rotation.set(accent ? 0.55 : 0.3, i * 1.17, accent ? -0.35 : -0.17);
    group.add(head);
    const petals = [];
    if (bud) {
      const closed = new THREE5.Mesh(coreGeo, budMat);
      closed.scale.set(0.9, 1.5, 0.9);
      closed.position.y = 0.03;
      closed.castShadow = true;
      head.add(closed);
      const calyx = new THREE5.Mesh(coreGeo, stemMat);
      calyx.scale.set(0.75, 0.6, 0.75);
      calyx.castShadow = true;
      head.add(calyx);
    } else {
      const core = new THREE5.Mesh(coreGeo, coreMat);
      core.scale.set(accent ? 0.7 : 1, 0.55, accent ? 0.7 : 1);
      core.castShadow = true;
      head.add(core);
      const layers = accent ? 4 : 1, amount = accent ? 8 : 10;
      for (let layer = 0; layer < layers; layer++) for (let j = 0; j < amount; j++) {
        const pivot = new THREE5.Group();
        pivot.rotation.y = j / amount * Math.PI * 2 + layer * 0.42;
        head.add(pivot);
        const petal = new THREE5.Mesh(petalGeo, accent ? orange[layer] : ivory);
        petal.scale.setScalar(accent ? 0.82 - layer * 0.16 : 0.27 + rand(i + 1) * 0.12);
        petal.position.y = layer * 0.01;
        petal.castShadow = petal.receiveShadow = true;
        petal.userData.open = accent ? [0.02, -0.34, -0.66, -0.95][layer] : 0.1;
        pivot.add(petal);
        petals.push(petal);
      }
    }
    flowers.push({ group, petals, delay: seedDelay(x, z) + 0.1, seed: i });
    world.add(group);
  });
  return (progress, time) => {
    for (const flower of flowers) {
      const stem = smooth(flower.delay, flower.delay + 0.14, progress);
      const bloom = smooth(flower.delay + 0.09, flower.delay + 0.26, progress);
      flower.group.scale.setScalar(Math.max(1e-4, stem));
      flower.group.rotation.z = garden.reduced ? 0 : Math.sin(time * 1.25 + flower.seed) * 0.022 * stem;
      for (const petal of flower.petals) petal.rotation.x = -1.32 * (1 - bloom) + petal.userData.open * bloom;
    }
  };
}

// items/garden-loader/variants/ts/garden-water.ts
import * as THREE6 from "three";
function buildDrops(garden, world) {
  const glass = garden.small ? 260 : 480, dew = garden.small ? 40 : 80, total = glass + dew;
  const seeds = [];
  const water = new THREE6.MeshPhysicalMaterial({
    color: "#ffffff",
    metalness: 0,
    roughness: 0.02,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    ior: 1.33,
    transparent: true,
    opacity: 1,
    envMapIntensity: 2.6,
    depthWrite: false
  });
  water.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `
      #include <color_fragment>
      float rim=pow(1.-clamp(dot(normalize(vNormal),normalize(vViewPosition)),0.,1.),1.6);
      diffuseColor.rgb=mix(vec3(.88,.94,.95),vec3(.16,.25,.29),rim);
      diffuseColor.a=mix(.24,.95,rim);
    `);
  };
  const drops = new THREE6.InstancedMesh(new THREE6.SphereGeometry(1, 12, 8), water, total);
  drops.frustumCulled = false;
  drops.castShadow = true;
  for (let n = 0; seeds.length < glass && n < glass * 40; n++) {
    const x = (rand(n * 3 + 711) - 0.5) * TILE.width, z = (rand(n * 3 + 712) - 0.5) * TILE.depth;
    const surface = topSurface(x, z);
    if (!surface || surface.ny < 0.8) continue;
    const ice = iceAt(x, z), arrive = seedDelay(x, z);
    if (ice.t > 1.35 && rand(n + 9) > 0.4) continue;
    const at = ice.t < 1 ? meltDelay(ice.t) + 0.16 : 0.04 + rand(n + 4) * 0.22;
    if (arrive < at + 0.1) continue;
    seeds.push({ p: new THREE6.Vector3(x, surface.y, z), size: 9e-3 + Math.pow(rand(n + 13), 5) * 0.075, at, until: arrive, flat: 0.42 });
  }
  for (let n = 0; seeds.length < total && n < dew * 40; n++) {
    const x = (rand(n * 3 + 1711) - 0.5) * TILE.width, z = (rand(n * 3 + 1712) - 0.5) * TILE.depth;
    const surface = topSurface(x, z);
    if (!surface || surface.ny < 0.8) continue;
    seeds.push({ p: new THREE6.Vector3(x, surface.y + mossAt(x, z) + FUR * 0.85, z), size: 8e-3 + rand(n + 13) * 0.011, at: seedDelay(x, z) + 0.32, until: 9, flat: 0.8 });
  }
  drops.count = seeds.length;
  world.add(drops);
  const dummy = new THREE6.Object3D();
  return (progress) => {
    seeds.forEach((drop, i) => {
      const g = smooth(drop.at, drop.at + 0.2, progress) * (1 - smooth(drop.until - 0.03, drop.until + 0.05, progress));
      dummy.position.copy(drop.p);
      dummy.scale.setScalar(Math.max(1e-5, drop.size * g));
      dummy.scale.y *= drop.flat;
      dummy.updateMatrix();
      drops.setMatrixAt(i, dummy.matrix);
    });
    drops.instanceMatrix.needsUpdate = true;
  };
}
function buildPollen(garden, world) {
  if (garden.reduced) return null;
  const count = garden.small ? 28 : 52;
  const base = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    base.set([-0.5 + rand(i * 3 + 3101) * 2.1, 0.12, -1 + rand(i * 3 + 3102) * 2.4], i * 3);
    seed[i] = rand(i * 3 + 3103);
  }
  const geometry = new THREE6.BufferGeometry();
  geometry.setAttribute("position", new THREE6.BufferAttribute(base, 3));
  geometry.setAttribute("aSeed", new THREE6.BufferAttribute(seed, 1));
  const material = new THREE6.ShaderMaterial({
    uniforms: { uGarden: garden.growth, uGardenTime: garden.clock, uSize: { value: 6 } },
    vertexShader: `
      uniform float uGarden, uGardenTime, uSize; attribute float aSeed; varying float vAlpha;
      void main(){
        float life=fract(uGardenTime*(.035+aSeed*.03)+aSeed*7.);
        vec3 p=position+vec3(sin(uGardenTime*.31+aSeed*40.)*.16, life*1.25, cos(uGardenTime*.27+aSeed*23.)*.16);
        vec4 mv=modelViewMatrix*vec4(p,1.);
        gl_Position=projectionMatrix*mv;
        gl_PointSize=uSize*(.55+aSeed*.7)*(12.9/-mv.z);
        // born softly, gone softly, and only once the corner is in bloom
        vAlpha=smoothstep(0.,.18,life)*(1.-smoothstep(.7,1.,life))*smoothstep(.42,.7,uGarden);
      }`,
    fragmentShader: `
      varying float vAlpha;
      void main(){
        float d=length(gl_PointCoord-.5);
        float a=(1.-smoothstep(.12,.5,d))*vAlpha*.7;
        gl_FragColor=vec4(vec3(1.,.93,.70)*2.4,a);
      }`,
    transparent: true,
    depthWrite: false
  });
  const points = new THREE6.Points(geometry, material);
  points.frustumCulled = false;
  world.add(points);
  return (canvasHeightPx) => {
    material.uniforms.uSize.value = Math.max(2.5, canvasHeightPx / 150);
  };
}

// items/garden-loader/variants/ts/garden-post.ts
import * as THREE7 from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";
function createPost(renderer) {
  const target = new THREE7.WebGLRenderTarget(1, 1, { type: THREE7.HalfFloatType, format: THREE7.RGBAFormat, samples: 4 });
  const material = new THREE7.ShaderMaterial({
    uniforms: { tScene: { value: target.texture }, uPixel: { value: new THREE7.Vector2() } },
    vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }",
    fragmentShader: `
      uniform sampler2D tScene; uniform vec2 uPixel; varying vec2 vUv;
      // Hash Kit (our own hash, see shelf/items/hash-kit)
      uint hashU(uint x){ x^=x>>16; x*=0x3f9c86cbu; x^=x>>14; x*=0x1ae9dacfu; x^=x>>15; return x; }
      void main(){
        vec4 texel=texture2D(tScene,vUv);
        vec3 c=texel.rgb;
        // Highlight-only halation, not a screen-wide blur over the moss.
        vec3 halo=vec3(0.);
        for(int i=0;i<8;i++){
          float a=float(i)*.785398;
          vec3 s=texture2D(tScene,vUv+vec2(cos(a),sin(a))*uPixel*3.).rgb;
          halo+=max(s-vec3(1.5),vec3(0.));
        }
        c+=halo*.012;
        c*=1.-.075*dot((vUv-.5)*1.4,(vUv-.5)*1.4);
        /* The target is premultiplied (edge pixels of the slab are colour \xD7 coverage). Tone mapping is not linear,
           so it has to see the straight colour; otherwise every silhouette gets a pale fringe. */
        float coverage=texel.a;
        gl_FragColor=vec4(coverage>.001?c/coverage:vec3(0.),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        uvec2 gq=uvec2(gl_FragCoord.xy); float grain=float(hashU(gq.x+hashU(gq.y+0xb31c96c9u))>>8)*(1./16777216.)-.5;
        gl_FragColor.rgb+=grain*.003;
        gl_FragColor=vec4(gl_FragColor.rgb*coverage,coverage);
      }`,
    depthTest: false,
    depthWrite: false
  });
  const quad = new FullScreenQuad(material);
  return {
    target,
    resize(widthPx, heightPx) {
      target.setSize(widthPx, heightPx);
      material.uniforms.uPixel.value.set(1 / widthPx, 1 / heightPx);
    },
    render(scene, camera) {
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      quad.render(renderer);
    },
    dispose() {
      target.dispose();
      quad.dispose();
      material.dispose();
    }
  };
}

// items/garden-loader/variants/ts/garden-scene.ts
var TIERS = [
  { dpr: 2, shells: 20 },
  { dpr: 1.75, shells: 16 },
  { dpr: 1.5, shells: 13 },
  { dpr: 1.25, shells: 10 },
  { dpr: 1, shells: 8 }
];
var FOV = 23;
var GardenScene = class {
  get isReady() {
    return this.ready;
  }
  /** which quality step the scene is on, 0 is the best */
  get quality() {
    return this.tier;
  }
  renderer;
  /** how long each part of the start-up took, ms */
  timings = {};
  scene = new THREE8.Scene();
  camera = new THREE8.PerspectiveCamera(FOV, 1, 1, 40);
  world = new THREE8.Group();
  garden;
  env = null;
  post;
  moss;
  updateFlowers;
  updateDrops;
  sizePollen;
  key;
  distance;
  ready = false;
  disposed = false;
  lastShadow = -1;
  lastTime = 0;
  pointer = new THREE8.Vector2();
  tilt = new THREE8.Vector2();
  size = { width: 1, height: 1 };
  tier;
  pinned = false;
  pace = { last: 0, frames: 0, seen: 0, late: 0 };
  /** `tier` pins a quality step (0…4): for looking at the low ones on a fast machine */
  constructor(canvas, reduced, tier2) {
    const small = matchMedia("(max-width: 700px)").matches;
    this.garden = { growth: { value: 0 }, clock: { value: 0 }, small, reduced };
    this.pinned = tier2 !== void 0 && Number.isInteger(tier2) && tier2 >= 0 && tier2 < TIERS.length;
    this.tier = this.pinned ? tier2 : small ? 2 : (navigator.hardwareConcurrency ?? 4) >= 8 ? 0 : 1;
    let mark = performance.now();
    const lap = (name) => {
      const now = performance.now();
      this.timings[name] = Math.round(now - mark);
      mark = now;
    };
    this.renderer = new THREE8.WebGLRenderer({ canvas, alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: "low-power" });
    this.renderer.setClearColor(0, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE8.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = THREE8.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    lap("renderer");
    const pmrem = new THREE8.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.env = pmrem.fromScene(room, 0.05);
    this.scene.environment = this.env.texture;
    this.scene.environmentIntensity = 0.42;
    room.dispose();
    pmrem.dispose();
    lap("env");
    const azimuth = THREE8.MathUtils.degToRad(23), elevation = THREE8.MathUtils.degToRad(49);
    this.distance = small ? 14.4 : 12.9;
    this.camera.position.set(-Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)).multiplyScalar(this.distance);
    this.camera.lookAt(0.05, -0.06, 0.1);
    this.world.rotation.y = -0.17;
    this.scene.add(this.world);
    this.scene.add(new THREE8.HemisphereLight("#f3f7ee", "#5c6349", 0.42));
    this.key = new THREE8.DirectionalLight("#fff1de", 2.35);
    this.key.position.set(-2.3, 7, -1.7);
    this.key.castShadow = true;
    this.key.shadow.mapSize.setScalar(small ? 1024 : 2048);
    Object.assign(this.key.shadow.camera, { left: -3.8, right: 3.8, top: 3.8, bottom: -3.8, near: 0.5, far: 16 });
    this.key.shadow.bias = -25e-5;
    this.key.shadow.normalBias = 0.016;
    this.key.shadow.radius = 9;
    this.scene.add(this.key);
    const fill = new THREE8.DirectionalLight("#d6e4ff", 0.7);
    fill.position.set(3, 2, 4);
    this.scene.add(fill);
    buildSlab(this.garden, this.scene, this.world, () => this.disposed);
    lap("slab");
    buildIce(this.garden, this.world);
    lap("ice");
    this.moss = buildMoss(this.garden, this.world);
    lap("moss");
    this.updateFlowers = buildFlowers(this.garden, this.world);
    lap("flowers");
    this.updateDrops = buildDrops(this.garden, this.world);
    this.sizePollen = buildPollen(this.garden, this.world);
    lap("water");
    this.post = createPost(this.renderer);
    this.applyTier();
    this.renderer.setRenderTarget(this.post.target);
    void this.renderer.compileAsync(this.scene, this.camera).then(() => {
      if (!this.disposed) this.ready = true;
    }).catch(() => {
      if (!this.disposed) this.ready = true;
    });
    this.renderer.setRenderTarget(null);
    lap("compile");
  }
  /** cursor position in the loader, −1…1 on both axes; the slab leans a little towards it */
  setPointer(x, y) {
    this.pointer.set(THREE8.MathUtils.clamp(x, -1, 1), THREE8.MathUtils.clamp(y, -1, 1));
  }
  resize(width, height) {
    this.size = { width: Math.max(1, width), height: Math.max(1, height) };
    this.applyTier();
  }
  /** everything that depends on the quality step and on the size of the canvas */
  applyTier() {
    const { width, height } = this.size, step = TIERS[this.tier];
    const dpr = Math.min(devicePixelRatio, step.dpr);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.post.resize(Math.round(width * dpr), Math.round(height * dpr));
    this.moss.setShells(step.shells);
    const pixelsPerUnit = height * dpr / (2 * this.distance * Math.tan(THREE8.MathUtils.degToRad(FOV / 2)));
    this.moss.setDensity(THREE8.MathUtils.clamp(pixelsPerUnit / 3.6, 24, 88));
    this.sizePollen?.(height * dpr);
  }
  /** Frames that come late for real (not the odd stall while the page behind compiles its shaders) move the scene
      one quality step down. It never climbs back: a loader lives for a few seconds. */
  watchPace() {
    if (this.pinned || this.garden.reduced || this.tier >= TIERS.length - 1) return;
    const now = performance.now(), dt = now - this.pace.last;
    this.pace.last = now;
    if (++this.pace.frames < 20 || dt < 4 || dt > 90) return;
    this.pace.seen++;
    if (dt > 26) this.pace.late++;
    if (this.pace.seen < 30) return;
    if (this.pace.late >= 17) {
      this.tier++;
      this.applyTier();
      this.pace.frames = 8;
    }
    this.pace.seen = this.pace.late = 0;
  }
  render(progress, time) {
    if (!this.ready || this.disposed) return;
    this.watchPace();
    this.garden.growth.value = progress;
    this.garden.clock.value = this.garden.reduced ? 0 : time;
    if (!this.garden.reduced) {
      const dt = Math.min(0.05, Math.max(0, time - this.lastTime));
      this.lastTime = time;
      this.tilt.lerp(this.pointer, 1 - Math.exp(-dt * 3.2));
      this.world.position.y = Math.sin(time * 0.9) * 0.022;
      this.world.rotation.x = Math.sin(time * 0.7 + 1.3) * 8e-3 + this.tilt.y * 0.05;
      this.world.rotation.z = Math.cos(time * 0.6) * 8e-3 - this.tilt.x * 0.05;
    }
    this.updateFlowers(progress, time);
    this.updateDrops(progress);
    if (progress < 0.99 || time - this.lastShadow > 0.083) {
      this.renderer.shadowMap.needsUpdate = true;
      this.lastShadow = time;
    }
    this.post.render(this.scene, this.camera);
  }
  /** Everything goes back to the GPU: geometry, materials, textures, the shadow map, the targets, the context. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const geometries = /* @__PURE__ */ new Set(), materials = /* @__PURE__ */ new Set(), textures = /* @__PURE__ */ new Set();
    this.scene.traverse((o) => {
      const mesh = o;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => materials.add(m));
      if (mesh.customDepthMaterial) materials.add(mesh.customDepthMaterial);
      if (o instanceof THREE8.InstancedMesh) o.dispose();
    });
    materials.forEach((m) => {
      Object.values(m).forEach((v) => {
        if (v instanceof THREE8.Texture) textures.add(v);
      });
      m.dispose();
    });
    textures.forEach((t) => t.dispose());
    geometries.forEach((g) => g.dispose());
    this.scene.environment = null;
    this.env?.dispose();
    this.env = null;
    this.key.shadow.map?.dispose();
    this.post.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
};

// items/garden-loader/variants/ts/garden-loader.ts
function createGardenLoader(options) {
  const {
    onDone,
    onLite,
    name = "YOUR NAME",
    role = "PRODUCT DESIGNER",
    edition = "DIGITAL NATURE \xB7 01",
    stages = ["Setting the light.", "Building the space.", "Finishing touches.", "Ready to explore."],
    progressLabel = "Preparing the page",
    fallbackLabel = "Open lightweight version",
    slowAfterMs = 1e4
  } = options;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const frozen2 = typeof options.frozen === "number" && Number.isFinite(options.frozen) ? Math.min(1, Math.max(0, options.frozen)) : null;
  const root = document.createElement("section");
  root.className = "garden-loader";
  root.tabIndex = -1;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "garden-title");
  root.innerHTML = `
    <header class="garden-loader__top">
      <div class="garden-loader__identity"><b></b><span></span></div>
      <span class="garden-loader__edition"></span>
    </header>
    <div class="garden-loader__stage" aria-hidden="true"><canvas></canvas></div>
    <div class="garden-loader__bottom">
      <h1 class="garden-loader__title garden-loader__status" id="garden-title" role="status" aria-live="polite"></h1>
      <div class="garden-loader__line">
        <div class="garden-loader__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
        <span class="garden-loader__step" aria-hidden="true">01 / 03</span>
      </div>
      <button class="garden-loader__fallback" type="button"></button>
    </div>`;
  root.querySelector(".garden-loader__identity b").textContent = name;
  root.querySelector(".garden-loader__identity span").textContent = role;
  root.querySelector(".garden-loader__edition").textContent = edition;
  document.body.appendChild(root);
  document.body.classList.add("garden-loading");
  const previousFocus = document.activeElement;
  const inert = [...document.body.children].filter((e) => e instanceof HTMLElement && e !== root && !["SCRIPT", "STYLE", "LINK"].includes(e.tagName)).map((e) => ({ e, was: e.inert }));
  inert.forEach(({ e }) => {
    e.inert = true;
  });
  const fallback = root.querySelector(".garden-loader__fallback");
  const label = root.querySelector(".garden-loader__status");
  const stepEl = root.querySelector(".garden-loader__step");
  const track = root.querySelector(".garden-loader__track");
  const stage = root.querySelector(".garden-loader__stage");
  const canvas = root.querySelector("canvas");
  fallback.textContent = fallbackLabel;
  track.setAttribute("aria-label", progressLabel);
  label.textContent = stages[0];
  if (document.hasFocus()) root.focus({ preventScroll: true });
  let view = null;
  let target = 0.04, growth = 0, elapsed = 0, last = performance.now(), lastDraw = 0;
  let ready = false, leaving = false, disposed = false, raf = 0, exitTimer = 0;
  let statusIndex = 0, completedAt = -1, renderedGrowth = -1;
  const resize = () => {
    const { width, height } = stage.getBoundingClientRect();
    view?.resize(width, height);
  };
  const buildStart = performance.now();
  try {
    view = new GardenScene(canvas, reduced, options.tier);
    resize();
    root.dataset.buildMs = (performance.now() - buildStart).toFixed(0);
    root.dataset.build = JSON.stringify(view.timings);
  } catch (error) {
    console.warn("Garden renderer unavailable; using the static loader", error);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  canvas.addEventListener("webglcontextlost", () => {
    if (disposed) return;
    view?.dispose();
    view = null;
    stage.classList.remove("has-render");
  });
  const slowTimer = window.setTimeout(() => root.classList.add("is-slow"), slowAfterMs);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    clearTimeout(slowTimer);
    clearTimeout(exitTimer);
    observer.disconnect();
    view?.dispose();
    view = null;
    inert.forEach(({ e, was }) => {
      e.inert = was;
    });
    root.remove();
    document.body.classList.remove("garden-loading");
    if (previousFocus?.isConnected && previousFocus !== document.body) previousFocus.focus({ preventScroll: true });
  };
  const finish = () => {
    if (leaving || disposed || frozen2 !== null) return;
    leaving = true;
    root.classList.add("is-leaving");
    onDone();
    exitTimer = window.setTimeout(dispose, reduced ? 0 : 680);
  };
  fallback.addEventListener("click", () => {
    dispose();
    onLite?.();
  });
  root.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || reduced) return;
    view?.setPointer(e.clientX / innerWidth * 2 - 1, e.clientY / innerHeight * 2 - 1);
  });
  root.addEventListener("pointerdown", (e) => e.stopPropagation());
  root.addEventListener("click", (e) => e.stopPropagation());
  root.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    (root.classList.contains("is-slow") ? fallback : root).focus({ preventScroll: true });
  });
  const frame = (now) => {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1e3);
    last = now;
    if (document.hidden) return;
    elapsed += dt;
    const desired = frozen2 ?? (reduced ? target : Math.min(target, elapsed / 2.8));
    growth += (desired - growth) * (1 - Math.exp(-dt * 4.5));
    if (frozen2 !== null) growth = frozen2;
    else if (reduced || ready && desired === 1 && growth > 0.995) growth = desired;
    root.dataset.growth = growth.toFixed(3);
    if (now - lastDraw >= (reduced ? 220 : 7.5) || growth === 1 && renderedGrowth !== 1) {
      view?.render(growth, elapsed);
      if (view?.isReady) {
        stage.classList.add("has-render");
        renderedGrowth = growth;
        root.dataset.quality = String(view.quality);
      }
      lastDraw = now;
    }
    const complete = ready && growth === 1 && (!view || renderedGrowth === 1);
    const progress = complete ? 1 : Math.min(0.99, growth, target);
    root.style.setProperty("--garden-progress", String(progress));
    track.setAttribute("aria-valuenow", String(Math.floor(progress * 100)));
    if (complete && completedAt < 0) completedAt = elapsed;
    const index = complete ? 3 : progress < 0.36 ? 0 : progress < 0.72 ? 1 : 2;
    if (index !== statusIndex) {
      statusIndex = index;
      label.textContent = stages[index];
      stepEl.textContent = `0${Math.min(3, index + 1)} / 03`;
    }
    if (complete && (reduced || elapsed - completedAt >= 0.32)) finish();
  };
  raf = requestAnimationFrame(frame);
  return {
    /** real readiness of the page, 0…1; held under 94 % until ready() */
    progress(value) {
      target = Math.max(target, Math.min(0.94, value));
    },
    ready() {
      if (disposed) return;
      ready = true;
      target = 1;
    },
    dispose
  };
}

// items/garden-loader/variants/ts/main.ts
var LOAD = 12;
var PAUSE = 2600;
var query = new URLSearchParams(location.search);
var number = (key) => query.has(key) && query.get(key) !== "" ? Number(query.get(key)) : NaN;
var frozen = Number.isFinite(number("garden")) ? Math.min(1, Math.max(0, number("garden"))) : null;
var tier = Number.isInteger(number("gardentier")) ? number("gardentier") : void 0;
var site = document.querySelector(".site");
var note = document.querySelector(".site__note");
function run() {
  site.classList.remove("is-shown");
  let raf = 0, again = 0;
  const start = performance.now();
  const restart = (text) => {
    cancelAnimationFrame(raf);
    clearTimeout(again);
    note.textContent = text;
    site.classList.add("is-shown");
    again = window.setTimeout(run, PAUSE);
  };
  const loader = createGardenLoader({
    name: "NOA LINDEN",
    role: "PRODUCT DESIGNER",
    frozen,
    tier,
    slowAfterMs: query.has("slow") ? 3e3 : 2e4,
    onDone: () => restart("Loaded. The garden grows again in a moment."),
    onLite: () => restart("The lightweight version opens here. The garden grows again in a moment.")
  });
  const root = document.querySelector(".garden-loader:last-of-type");
  if (root && site.classList.contains("was-shown")) {
    root.style.opacity = "0";
    requestAnimationFrame(() => requestAnimationFrame(() => {
      root.style.opacity = "";
    }));
  }
  site.classList.add("was-shown");
  if (frozen !== null) {
    loader.progress(frozen);
    if (frozen >= 1) loader.ready();
    return;
  }
  const tick = (now) => {
    const t = (now - start) / 1e3;
    loader.progress(t / LOAD);
    if (t >= LOAD) {
      loader.ready();
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}
run();
