import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { Garden } from "./garden-sheet";
import { buildSlab } from "./garden-slab";
import { buildIce } from "./garden-ice";
import { buildMoss } from "./garden-moss";
import { buildFlowers } from "./garden-flowers";
import { buildDrops, buildPollen } from "./garden-water";
import { createPost } from "./garden-post";

/** Quality steps, best first: the pixel ratio of the canvas and the number of layers in the pile of the moss. The
    scene starts on a step that suits the device and only ever moves down, when frames really come late. */
export const TIERS = [
  { dpr: 2, shells: 20 }, { dpr: 1.75, shells: 16 }, { dpr: 1.5, shells: 13 }, { dpr: 1.25, shells: 10 }, { dpr: 1, shells: 8 },
] as const;
const FOV = 23;

/** A thick slab of frosted glass seen in three-quarter view. It starts cold: ice along one edge, frost and leaf shadows
    on bare glass. As the page loads the ice melts and leaves condensation, and from the warm corner moss takes the
    slab: cushions with a velvet pile, then flowers that stand taller than the edge. At 100 % the whole solid is
    overgrown, walls included.
    This file only sets the stage (renderer, camera, light, quality, the frame); what lies on the slab lives in the
    garden-* files. No network assets: this scene must be cheaper to load than the page it introduces. */
export class GardenScene {
  get isReady() { return this.ready; }
  /** which quality step the scene is on, 0 is the best */
  get quality() { return this.tier; }
  readonly renderer: THREE.WebGLRenderer;
  /** how long each part of the start-up took, ms */
  readonly timings: Record<string, number> = {};
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 1, 40);
  private world = new THREE.Group();
  private garden: Garden;
  private env: THREE.WebGLRenderTarget | null = null;
  private post: ReturnType<typeof createPost>;
  private moss: ReturnType<typeof buildMoss>;
  private updateFlowers: (progress: number, time: number) => void;
  private updateDrops: (progress: number) => void;
  private sizePollen: ((canvasHeightPx: number) => void) | null;
  private key: THREE.DirectionalLight;
  private distance: number;
  private ready = false;
  private disposed = false;
  private lastShadow = -1;
  private lastTime = 0;
  private pointer = new THREE.Vector2();
  private tilt = new THREE.Vector2();
  private size = { width: 1, height: 1 };
  private tier: number;
  private pinned = false;
  private pace = { last: 0, frames: 0, seen: 0, late: 0 };

  /** `tier` pins a quality step (0…4): for looking at the low ones on a fast machine */
  constructor(canvas: HTMLCanvasElement, reduced: boolean, tier?: number) {
    const small = matchMedia("(max-width: 700px)").matches;
    this.garden = { growth: { value: 0 }, clock: { value: 0 }, small, reduced };
    this.pinned = tier !== undefined && Number.isInteger(tier) && tier >= 0 && tier < TIERS.length;
    this.tier = this.pinned ? tier! : small ? 2 : (navigator.hardwareConcurrency ?? 4) >= 8 ? 0 : 1;

    let mark = performance.now();
    const lap = (name: string) => { const now = performance.now(); this.timings[name] = Math.round(now - mark); mark = now; };
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: "low-power" });
    /* The canvas is transparent: the page background shows around the slab, and the floor is only a shadow catcher.
       A rendered backdrop never matched the CSS one exactly and showed as a pale disc. */
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    lap("renderer");
    /* Glass and ice are read through what they reflect. A tiny procedural room, prefiltered once, gives them
       soft boxes to mirror; nothing is downloaded. */
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.env = pmrem.fromScene(room, .05);
    this.scene.environment = this.env.texture;
    this.scene.environmentIntensity = .42;
    room.dispose(); pmrem.dispose();
    lap("env");
    /* Three-quarter view from the front left with a long lens: the left and the near wall show the thickness,
       the top stays almost square, and tall flowers rise past the far edge instead of reading as dots from above. */
    const azimuth = THREE.MathUtils.degToRad(23), elevation = THREE.MathUtils.degToRad(49);
    this.distance = small ? 14.4 : 12.9;
    this.camera.position.set(-Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)).multiplyScalar(this.distance);
    this.camera.lookAt(.05, -.06, .1);
    this.world.rotation.y = -.17;
    this.scene.add(this.world);
    this.scene.add(new THREE.HemisphereLight("#f3f7ee", "#5c6349", .42));
    this.key = new THREE.DirectionalLight("#fff1de", 2.35);
    this.key.position.set(-2.3, 7, -1.7);
    this.key.castShadow = true;
    this.key.shadow.mapSize.setScalar(small ? 1024 : 2048);
    Object.assign(this.key.shadow.camera, { left: -3.8, right: 3.8, top: 3.8, bottom: -3.8, near: .5, far: 16 });
    this.key.shadow.bias = -.00025;
    this.key.shadow.normalBias = .016;
    this.key.shadow.radius = 9;
    this.scene.add(this.key);
    const fill = new THREE.DirectionalLight("#d6e4ff", .7);
    fill.position.set(3, 2, 4); this.scene.add(fill);

    buildSlab(this.garden, this.scene, this.world, () => this.disposed); lap("slab");
    buildIce(this.garden, this.world); lap("ice");
    this.moss = buildMoss(this.garden, this.world); lap("moss");
    this.updateFlowers = buildFlowers(this.garden, this.world); lap("flowers");
    this.updateDrops = buildDrops(this.garden, this.world);
    this.sizePollen = buildPollen(this.garden, this.world); lap("water");
    this.post = createPost(this.renderer);
    this.applyTier();
    this.renderer.setRenderTarget(this.post.target);
    void this.renderer.compileAsync(this.scene, this.camera).then(() => {
      if (!this.disposed) this.ready = true;
    }).catch(() => { if (!this.disposed) this.ready = true; });
    this.renderer.setRenderTarget(null);
    lap("compile");
  }

  /** cursor position in the loader, −1…1 on both axes; the slab leans a little towards it */
  setPointer(x: number, y: number) { this.pointer.set(THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1)); }

  resize(width: number, height: number) {
    this.size = { width: Math.max(1, width), height: Math.max(1, height) };
    this.applyTier();
  }

  /** everything that depends on the quality step and on the size of the canvas */
  private applyTier() {
    const { width, height } = this.size, step = TIERS[this.tier];
    const dpr = Math.min(devicePixelRatio, step.dpr);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.post.resize(Math.round(width * dpr), Math.round(height * dpr));
    this.moss.setShells(step.shells);
    /* a cell of the strand lattice is kept at three to four device pixels: finer than that a strand would fall under
       a pixel and shimmer, which is exactly what the old blades did */
    const pixelsPerUnit = height * dpr / (2 * this.distance * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    this.moss.setDensity(THREE.MathUtils.clamp(pixelsPerUnit / 3.6, 24, 88));
    this.sizePollen?.(height * dpr);
  }

  /** Frames that come late for real (not the odd stall while the page behind compiles its shaders) move the scene
      one quality step down. It never climbs back: a loader lives for a few seconds. */
  private watchPace() {
    if (this.pinned || this.garden.reduced || this.tier >= TIERS.length - 1) return;
    const now = performance.now(), dt = now - this.pace.last;
    this.pace.last = now;
    if (++this.pace.frames < 20 || dt < 4 || dt > 90) return;
    this.pace.seen++;
    if (dt > 26) this.pace.late++;
    if (this.pace.seen < 30) return;
    if (this.pace.late >= 17) { this.tier++; this.applyTier(); this.pace.frames = 8; }
    this.pace.seen = this.pace.late = 0;
  }

  render(progress: number, time: number) {
    if (!this.ready || this.disposed) return;
    this.watchPace();
    this.garden.growth.value = progress;
    this.garden.clock.value = this.garden.reduced ? 0 : time;
    /* The slab hovers, so it may breathe: a slow float, and a lean towards the cursor. Both are tiny, the composition
       holds. With reduced motion it stays still. */
    if (!this.garden.reduced) {
      const dt = Math.min(.05, Math.max(0, time - this.lastTime)); this.lastTime = time;
      this.tilt.lerp(this.pointer, 1 - Math.exp(-dt * 3.2));
      this.world.position.y = Math.sin(time * .9) * .022;
      this.world.rotation.x = Math.sin(time * .7 + 1.3) * .008 + this.tilt.y * .05;
      this.world.rotation.z = Math.cos(time * .6) * .008 - this.tilt.x * .05;
    }
    this.updateFlowers(progress, time);
    this.updateDrops(progress);
    // Growth casts matching shadows. Once grown, refresh only at 12 Hz for the breeze.
    if (progress < .99 || time - this.lastShadow > .083) {
      this.renderer.shadowMap.needsUpdate = true; this.lastShadow = time;
    }
    this.post.render(this.scene, this.camera);
  }

  /** Everything goes back to the GPU: geometry, materials, textures, the shadow map, the targets, the context. */
  dispose() {
    if (this.disposed) return; this.disposed = true;
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => materials.add(m));
      if (mesh.customDepthMaterial) materials.add(mesh.customDepthMaterial);
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    materials.forEach(m => { Object.values(m).forEach(v => { if (v instanceof THREE.Texture) textures.add(v); }); m.dispose(); });
    textures.forEach(t => t.dispose()); geometries.forEach(g => g.dispose());
    this.scene.environment = null; this.env?.dispose(); this.env = null;
    this.key.shadow.map?.dispose(); this.post.dispose();
    this.renderer.dispose(); this.renderer.forceContextLoss();
  }
}
