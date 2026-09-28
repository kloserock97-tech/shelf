/* Depth tilt: a cut-out object on one flat plane that turns after the cursor like a real thing.
 *
 * Every object has a depth map (a neural depth estimate of the original render, 384 px wide). The shader shifts
 * texture points the more, the closer they are: the object turns although it is a single plane. The same map
 * gives a normal, so a highlight and a little shading follow the tilt.
 * Several objects stand on a drum around a horizontal axis and roll with the active index: the leaving object tips
 * back and up, the coming one rolls in from below — with the camera's real perspective.
 *
 * Own small renderer: one draw call per visible object per frame, frames only while the block is on screen.
 * If the context or the textures fail, create() returns null and the page keeps plain images. */
import * as THREE from "three";

export type DepthItem = { src: string; depth: string; ratio: number };
export type DepthTilt = {
  /** active — fractional index on the drum; px, py — cursor −1…1 */
  set(active: number, px: number, py: number): void;
  resize(): void;
  dispose(): void;
};

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uMap, uDepth;
  uniform vec2 uTilt;      // "camera" tilt: cursor, drum travel, a little breathing
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    /* depth shift in two steps: the second step reads depth at the already shifted point, the outline tears less */
    float d = texture2D(uDepth, vUv).r;
    vec2 uv = vUv - (d - 0.42) * uTilt * 0.052;
    d = texture2D(uDepth, uv).r;
    uv = vUv - (d - 0.42) * uTilt * 0.052;
    vec4 c = texture2D(uMap, uv);

    /* a normal from the depth map: a highlight and soft shading that follow the tilt */
    float e = 1.0 / 384.0;
    float dx = texture2D(uDepth, uv + vec2(e, 0.0)).r - texture2D(uDepth, uv - vec2(e, 0.0)).r;
    float dy = texture2D(uDepth, uv + vec2(0.0, e)).r - texture2D(uDepth, uv - vec2(0.0, e)).r;
    vec3 n = normalize(vec3(-dx * 9.0, -dy * 9.0, 1.0));
    vec3 l = normalize(vec3(-0.35 + uTilt.x * 1.6, 0.55 + uTilt.y * 1.6, 0.9));
    float diff = dot(n, l) - dot(vec3(0.0, 0.0, 1.0), l);
    float spec = pow(max(dot(n, normalize(l + vec3(0.0, 0.0, 1.0))), 0.0), 36.0);
    c.rgb = clamp(c.rgb + diff * 0.22 + spec * 0.16, 0.0, 1.0);

    gl_FragColor = vec4(c.rgb, c.a * uOpacity);
  }
`;

const loadTexture = (loader: THREE.TextureLoader, url: string) =>
  new Promise<THREE.Texture>((resolve, reject) => loader.load(url, resolve, undefined, reject));

/** align — where the object sits in the free width: 0.5 centre, 0.38 a little to the left (as in the case wheel) */
export async function createDepthTilt(host: HTMLElement, list: DepthItem[], opts: { align?: number } = {}): Promise<DepthTilt | null> {
  const align = opts.align ?? 0.5;
  const canvas = document.createElement("canvas");
  canvas.className = "dt-gl";
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: "low-power" });
  } catch {
    return null;
  }
  renderer.setClearColor(0x000000, 0);

  const loader = new THREE.TextureLoader();
  let maps: THREE.Texture[], depths: THREE.Texture[];
  try {
    [maps, depths] = await Promise.all([
      Promise.all(list.map((c) => loadTexture(loader, c.src))),
      Promise.all(list.map((c) => loadTexture(loader, c.depth))),
    ]);
  } catch {
    renderer.dispose();
    return null;
  }
  for (const m of maps) { m.colorSpace = THREE.NoColorSpace; m.generateMipmaps = true; m.minFilter = THREE.LinearMipmapLinearFilter; m.anisotropy = 4; m.needsUpdate = true; }
  for (const d of depths) { d.colorSpace = THREE.NoColorSpace; d.minFilter = THREE.LinearFilter; d.generateMipmaps = false; d.needsUpdate = true; }

  const scene = new THREE.Scene();
  const FOV = 26;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);
  const DIST = 1 / Math.tan((FOV * Math.PI) / 360); // at this distance the frame height in the z = 0 plane is 2
  camera.position.set(0, 0, DIST);

  const geo = new THREE.PlaneGeometry(1, 1);
  const meshes = list.map((_c, i) => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: false,
      uniforms: { uMap: { value: maps[i] }, uDepth: { value: depths[i] }, uTilt: { value: new THREE.Vector2() }, uOpacity: { value: 0 } },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  });
  host.appendChild(canvas);

  let aspect = 1;
  let dirty = true;
  const fit = () => {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, innerWidth <= 900 ? 1.5 : 2));
    renderer.setSize(w, h, false);
    aspect = w / h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    /* the object is fitted whole into the zone: 2 % margin on top, 4 % at the bottom, a little lower than centre */
    const boxW = 0.98 * 2 * aspect, boxH = 2 - 0.06, top = 1 - 0.02;
    list.forEach((c, i) => {
      let ph = boxH, pw = ph * c.ratio;
      if (pw > boxW) { pw = boxW; ph = pw / c.ratio; }
      const m = meshes[i];
      m.scale.set(pw, ph, 1);
      m.userData.x = -aspect + (2 * aspect - boxW) / 2 + (boxW - pw) * align + pw / 2;
      m.userData.y = top - (boxH - ph) * 0.6 - ph / 2;
    });
    dirty = true;
  };

  let active = 0, lastActive = 0, spin = 0;
  let tx = 0, ty = 0, cx = 0, cy = 0;
  let visible = true, raf = 0, last = performance.now();
  const RD = 1.7; // drum radius
  const STEP = 1.5; // radians between neighbours on the drum: the neighbour has time to leave the zone

  const frame = (now: number) => {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    /* the tilt catches up with the cursor; drum travel adds a vertical tilt that fades out */
    const k = 1 - Math.exp(-dt * 7);
    cx += (tx - cx) * k; cy += (ty - cy) * k;
    spin += ((active - lastActive) * 9 - spin) * k;
    lastActive = active;
    const breathe = now * 0.00055;
    const tiltX = cx * 0.9 + Math.sin(breathe) * 0.16;
    const tiltY = -cy * 0.7 + Math.cos(breathe * 0.8) * 0.1 + Math.max(-1.2, Math.min(1.2, spin));
    meshes.forEach((m, i) => {
      const d = i - active;
      const ad = Math.abs(d);
      const on = ad < 1;
      m.visible = on;
      if (!on) return;
      const phi = d * STEP;
      m.position.set(m.userData.x + d * 0.08 * aspect, m.userData.y - Math.sin(phi) * RD, (Math.cos(phi) - 1) * RD);
      m.rotation.set(phi * 0.9, -tiltX * 0.12, d * -0.12);
      const u = (m.material as THREE.ShaderMaterial).uniforms;
      (u.uTilt.value as THREE.Vector2).set(tiltX, tiltY);
      u.uOpacity.value = Math.max(0, Math.min(1, 1 - ad * 2.1));
    });
    renderer.render(scene, camera);
    /* frames run while the block is on screen: the object breathes a little even without a cursor */
    if (visible) raf = requestAnimationFrame(frame);
  };
  const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };

  /* off screen and on a hidden tab there are no frames */
  const io = new IntersectionObserver((entries) => { visible = entries.some((e) => e.isIntersecting) && !document.hidden; if (visible) kick(); });
  io.observe(host);
  const onVis = () => { visible = !document.hidden && host.getBoundingClientRect().bottom > 0; if (visible) kick(); };
  document.addEventListener("visibilitychange", onVis);
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); canvas.remove(); host.classList.remove("has-gl"); });

  fit();
  kick();
  host.classList.add("has-gl");
  return {
    set(a, px, py) { active = a; tx = px; ty = py; if (dirty || visible) kick(); dirty = false; },
    resize: fit,
    dispose() {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      maps.forEach((m) => m.dispose()); depths.forEach((d) => d.dispose());
      meshes.forEach((m) => (m.material as THREE.Material).dispose());
      geo.dispose(); renderer.dispose(); canvas.remove();
    },
  };
}
