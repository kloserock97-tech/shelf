/* The kit every diorama shares: entrance and exit, floating cards, the cursor, glows, ribbons, orbits, sparks, rocks.
 * A scene only lays out its cards and lines in pixels of the 1672×941 reference frame — the mechanics are one.
 *
 * Entrance: things fly from the middle of the composition (hub) and from the depth, stepped by delay; lines draw
 * themselves, light brightens (ease-out, ~1.4 s). Presence (0…1, e.g. from the page scroll) dims everything together. */
import * as THREE from "three";
/* Hash Kit (our own hash, see shelf/items/hash-kit) */
const hashU = (x: number) => { x ^= x >>> 16; x = Math.imul(x, 0x3f9c86cb); x ^= x >>> 14; x = Math.imul(x, 0x1ae9dacf); x ^= x >>> 15; return x >>> 0; };
import type { Line2 } from "three/addons/lines/Line2.js";
import type { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { at, card, canvasTexture, createStage, glow, line, ribbon, rock, sparks, type CardOpts, type Fit, type Stage } from "./engine";

export const deg = THREE.MathUtils.degToRad;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);

export type DioramaScene = {
  stage: Stage;
  ready: Promise<void>;
  /** presence on screen 0…1; the entrance plays when it passes 0.5 */
  setPresence(v: number): void;
  setPointer(x: number, y: number): void;
  /** where the free area of the window is (css px); null — the whole window with margins */
  setSafe(fn: () => Safe | null): void;
  /** show the finished frame at once, no entrance */
  still(): void;
  pause(): void;
  resume(): void;
};

type Anim = { delay: number; dur: number; apply(p: number, g: number): void };
type P3 = [number, number, number];
export type Safe = { l: number; t: number; r: number; b: number };

/** on a phone the composition is squeezed horizontally: satellites move to the middle while the cards themselves
    keep their proportions (inverse scale), so the whole scene fits the width and stays readable */
export const NARROW_SQUEEZE = 0.8;
/** on a phone satellites are smaller than the main panel: otherwise they hit the edges or overlap it */
const NARROW_SAT = 0.72;
/** the scene fits the free area whole, with air, and never larger than on the reference */
const fitBox = (box: [number, number, number, number], safe: () => Safe | null, onSqueeze: (f: number) => void, squeeze = NARROW_SQUEEZE): Fit => (w, h) => {
  const narrow = w / h < 0.8;
  const f = narrow ? squeeze : 1;
  onSqueeze(f);
  const sq = (x: number) => 836 + (x - 836) * f;
  const x0 = sq(box[0]), x1 = sq(box[2]), y0 = box[1], y1 = box[3];
  const bw = x1 - x0, bh = y1 - y0;
  const a = safe() ?? { l: w * 0.04, t: h * 0.08, r: w * 0.96, b: h * 0.92 };
  const sw = Math.max(40, a.r - a.l), sh = Math.max(40, a.b - a.t);
  const ref = Math.min(w / 1672, h / 941);
  if (narrow) {
    const s = Math.min((0.9 * w) / bw, sh / bh);
    /* spare height is split 60/40: the scene sits lower rather than hanging under the top edge */
    const cy = a.t + (sh - bh * s) * 0.6 + (bh * s) / 2;
    return { s, fx: w / 2 - ((x0 + x1) / 2 - 836) * s, fy: cy - ((y0 + y1) / 2 - 470.5) * s };
  }
  const s = Math.min(sw / bw, sh / bh, ref);
  return { s, fx: (a.l + a.r) / 2 - ((x0 + x1) / 2 - 836) * s, fy: (a.t + a.b) / 2 - ((y0 + y1) / 2 - 470.5) * s };
};

export type Kit = ReturnType<typeof makeKit>;

function makeKit(stage: Stage, hub: THREE.Vector3) {
  const { renderer, root } = stage;
  const anims: Anim[] = [];
  const ribbonU: Record<string, THREE.IUniform>[] = [];
  const sparkU: Record<string, THREE.IUniform>[] = [];
  const floaters: { m: THREE.Object3D; base: THREE.Vector3; ph: number; amp: number; enter: number; main: boolean }[] = [];
  let seed = 7;
  const rnd = () => { seed = (seed + 0xb31c96c9) >>> 0; return hashU(seed) / 4294967296; };

  const kit = {
    renderer,
    root,
    rnd,
    /** texture pixels per frame pixel — so cards are sharp on this screen */
    texScale: () => Math.min(3, Math.max(1.5, stage.pxScale() * 1.25)),
    canvasTexture: (c: HTMLCanvasElement) => canvasTexture(c, renderer),

    glow(x: number, y: number, z: number, w: number, h: number, color: string, o: number, delay = 0.05) {
      const m = glow(w, h, color, o);
      m.position.copy(at(x, y, z));
      root.add(m);
      const u = (m.material as THREE.ShaderMaterial).uniforms.uOpacity;
      anims.push({ delay, dur: 1.1, apply: (p, g) => { u.value = o * easeOut(p) * g; } });
    },

    /** a line draws itself from start to end */
    reveal(l: Line2, delay: number, dur: number) {
      root.add(l);
      const geo = l.geometry as THREE.InstancedBufferGeometry;
      const total = geo.attributes.instanceStart.count;
      const mat = l.material as LineMaterial;
      anims.push({ delay, dur, apply: (p, g) => { geo.instanceCount = Math.max(0, Math.round(total * easeOut(p))); mat.color.setScalar(g); } });
    },

    /** an orbit: a circle tilted to the viewer — an ellipse on screen, passing both in front of the cards and behind */
    orbit(o: { c: [number, number]; r: number; tilt: number; rotZ: number; from: number; to: number; color?: string; width?: number; opacity?: number; fade?: (t: number) => number; delay?: number; z?: number }) {
      const pts: THREE.Vector3[] = [];
      const q = new THREE.Euler(deg(o.tilt), 0, deg(o.rotZ));
      for (let i = 0; i <= 200; i++) {
        const a = deg(o.from + (o.to - o.from) * (i / 200));
        pts.push(at(o.c[0], o.c[1], o.z ?? 0).add(new THREE.Vector3(Math.cos(a) * o.r, 0, Math.sin(a) * o.r).applyEuler(q)));
      }
      kit.reveal(line(pts, { color: o.color ?? "#fff1dc", width: o.width ?? 1.4, opacity: o.opacity ?? 0.6, fade: o.fade ?? ((t) => 0.3 + 0.7 * Math.sin(Math.PI * t)) }), o.delay ?? 0.4, 1.3);
    },

    /** a curve through frame points (links between cards) */
    curve(pts: P3[], o: { color: string; width: number; opacity?: number; delay?: number; dur?: number; fade?: (t: number) => number }) {
      const c = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => at(x, y, z)), false, "centripetal");
      kit.reveal(line(c.getPoints(90), { color: o.color, width: o.width, opacity: o.opacity ?? 0.9, fade: o.fade ?? ((t) => Math.min(1, t * 6) * Math.min(1, (1 - t) * 6)) }), o.delay ?? 0.45, o.dur ?? 0.8);
    },

    /** a glossy ribbon */
    band(pts: P3[], w: number, twist: number, color: string, delay: number) {
      const m = ribbon({ points: pts.map(([x, y, z]) => at(x, y, z)), width: (t) => w * (0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, t * 1.25))), twist: (t) => twist * Math.sin(t * Math.PI * 1.5), color });
      root.add(m);
      const u = (m.material as THREE.ShaderMaterial).uniforms;
      ribbonU.push(u);
      anims.push({ delay, dur: 0.9, apply: (p, g) => { u.uReveal.value = easeOut(p) * 1.001; u.uOpacity.value = g; } });
    },

    /** sparks: frame points with a size (px) */
    sparks(pts: { p: THREE.Vector3; size: number }[], color: string, k: number, delay: number) {
      const m = sparks(pts, color, rnd);
      root.add(m);
      const u = (m.material as THREE.ShaderMaterial).uniforms;
      sparkU.push(u);
      anims.push({ delay, dur: 1.2, apply: (p, g) => { u.uOpacity.value = k * easeOut(p) * g; u.uPx.value = stage.pxScale(); } });
    },
    /** a cloud of sparks on an ellipse around the composition + large soft spots, as if out of focus */
    sparkField(c: [number, number], r: [number, number], n: number, color = "#ffc070", nodes: [number, number, number][] = []) {
      const sp: { p: THREE.Vector3; size: number }[] = [];
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, k = 0.55 + rnd() * 0.6;
        sp.push({ p: at(c[0] + Math.cos(a) * r[0] * k, c[1] + Math.sin(a) * r[1] * k, -150 + rnd() * 260), size: 3 + rnd() * 5 });
      }
      for (const [x, y, s] of nodes) sp.push({ p: at(x, y, 0), size: s });
      kit.sparks(sp, color, 1, 0.6);
      const bokeh: { p: THREE.Vector3; size: number }[] = [];
      for (let i = 0; i < 16; i++) bokeh.push({ p: at(c[0] - r[0] * 0.9 + rnd() * r[0] * 1.8, c[1] - r[1] + rnd() * r[1] * 2, 80 + rnd() * 200), size: 22 + rnd() * 30 });
      kit.sparks(bokeh, color, 0.28, 0.4);
    },

    /** rocks: float up from below on entrance */
    rocks(list: [number, number, number, number][]) {
      list.forEach(([x, y, s, z], i) => {
        const m = rock(s, i + 1);
        const base = at(x, y, z);
        m.rotation.set(i + 1, (i + 1) * 2.1, (i + 1) * 0.7);
        root.add(m);
        const mat = m.material as THREE.MeshStandardMaterial;
        anims.push({ delay: 0.3 + i * 0.04, dur: 1, apply: (p, g) => { const e = easeOut(p); m.position.set(base.x, base.y - (1 - e) * 40, base.z); mat.opacity = e * g; } });
      });
    },

    /** a glass card with content: centre and turn in the frame; on entrance flies from the hub and from the depth,
        then floats */
    card(o: CardOpts & { c: [number, number]; z: number; r: P3; delay: number; amp?: number; order?: number }) {
      const m = card(o);
      m.renderOrder = o.order ?? 3;
      m.rotation.set(deg(o.r[0]), deg(o.r[1]), deg(o.r[2]), "YXZ");
      /* the main panel is order 5 and its back plate 1, the rest are satellites */
      const fl = { m, base: at(o.c[0], o.c[1], o.z), ph: floaters.length * 1.7, amp: o.amp ?? 4, enter: 0, main: o.order === 5 || o.order === 1 };
      floaters.push(fl);
      const u = (m.material as THREE.ShaderMaterial).uniforms.uOpacity;
      anims.push({ delay: o.delay, dur: 0.95, apply: (p, g) => { fl.enter = easeOut(p); u.value = Math.min(1, p * 2.2) * g; } });
      root.add(m);
      return m;
    },
  };

  /** inverse scale of the cards when the composition is squeezed — a card keeps its proportions */
  const unsqueeze = (f: number) => {
    for (const fl of floaters) { const k = f < 1 && !fl.main ? NARROW_SAT : 1; fl.m.scale.set(k / f, k, k); }
  };
  const step = (ti: number, g: number, t: number, reduced: boolean) => {
    for (const a of anims) a.apply((ti - a.delay) / a.dur, g);
    for (const f of floaters) {
      const e = f.enter;
      f.m.position.set(
        hub.x + (f.base.x - hub.x) * e,
        hub.y + (f.base.y - hub.y) * e + (reduced ? 0 : Math.sin(t * 0.9 + f.ph) * f.amp),
        f.base.z - (1 - e) * 260,
      );
    }
    for (const u of ribbonU) u.uTime.value = t;
    for (const u of sparkU) u.uTime.value = t;
  };
  return Object.assign(kit, { step, unsqueeze });
}

/** a diorama: its own transparent canvas, a render loop only while it is present */
export function createDiorama(canvas: HTMLCanvasElement, o: { hub: [number, number]; box: [number, number, number, number]; squeeze?: number; build(kit: Kit): Promise<void> }): DioramaScene {
  let safe: (() => Safe | null) | null = null;
  let squeeze = 1;
  const stage = createStage(canvas, fitBox(o.box, () => safe?.() ?? null, (f) => { squeeze = f; }, o.squeeze));
  const { renderer, scene, camera, root } = stage;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const kit = makeKit(stage, at(o.hub[0], o.hub[1], -120));
  const ready = (async () => {
    await o.build(kit);
    /* shaders compile ahead, so the first frame of the entrance does not stutter */
    await renderer.compileAsync(scene, camera);
  })();

  let raf = 0, last = 0, paused = false, built = false;
  let presence = 0, intro = -1; // intro — seconds since the entrance began; −1 — it has not begun
  const pointer = new THREE.Vector2(), look = new THREE.Vector2(), res = new THREE.Vector2();
  const frame = (now: number) => {
    raf = 0;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    if (!built) return;
    if (presence > 0.5 && intro < 0) intro = 0;
    if (presence <= 0.001) intro = -1;
    if (intro >= 0) intro += dt;
    look.lerp(pointer, 0.06);
    root.scale.x = squeeze;
    kit.unsqueeze(squeeze);
    root.rotation.set(-look.y * 0.035, look.x * 0.05, 0);
    kit.step(reduced ? 99 : Math.max(0, intro), presence, now / 1000, reduced);
    renderer.getDrawingBufferSize(res);
    root.traverse((x) => { (x as Line2Like).material?.resolution?.set(res.x, res.y); });
    renderer.render(scene, camera);
    if (!paused && (presence > 0 || intro >= 0)) kick();
  };
  const kick = () => { if (!raf && !paused) raf = requestAnimationFrame(frame); };
  void ready.then(() => { built = true; kick(); });

  return {
    stage,
    ready,
    setPresence(v) { const was = presence; presence = clamp01(v); if (presence !== was) kick(); },
    setPointer(x, y) { pointer.set(x, y); },
    setSafe(fn) { safe = fn; stage.resize(); kick(); },
    still() { presence = 1; intro = 99; kick(); },
    pause() { paused = true; cancelAnimationFrame(raf); raf = 0; },
    resume() { paused = false; kick(); },
  };
}
type Line2Like = THREE.Object3D & { material?: { resolution?: THREE.Vector2 } };
