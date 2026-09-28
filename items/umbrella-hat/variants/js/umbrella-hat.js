import * as THREE from "three";

/* A low-poly cap with an umbrella. In the portfolio the dog puts it on when it starts to rain.
   A yellow cap with a visor, a thin stick and an umbrella of eight wedges (coral and cream) with a scalloped rim.
   Units are metres, about 150 triangles, colour lives in the vertices: no textures, one material.

   Hierarchy: hat (attach it to a head bone or a stand) → rig (the animation: drop, spring, scale) →
   crown, visor, stick, canopy (opens and slowly turns). */

const CORAL = new THREE.Color("#e8604c");
const CREAM = new THREE.Color("#f6ecd6");
const YELLOW = new THREE.Color("#f2c14e");
const VISOR = new THREE.Color("#dca233");
const STICK = new THREE.Color("#4a3b33");

/* one colour per part. Non-indexed, so every face keeps its own normal under flat shading; uv goes, nothing reads it */
function paint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) color.toArray(c, i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  g.deleteAttribute("uv");
  return g;
}

function canopyGeometry(R, h, panels = 8) {
  const pos = [];
  const col = [];
  const push = (v, c) => { pos.push(v.x, v.y, v.z); col.push(c.r, c.g, c.b); };
  const top = new THREE.Vector3(0, h, 0);
  for (let i = 0; i < panels; i++) {
    const a0 = (i / panels) * Math.PI * 2, a1 = ((i + 1) / panels) * Math.PI * 2, am = (a0 + a1) / 2;
    const p0 = new THREE.Vector3(Math.cos(a0) * R, 0, Math.sin(a0) * R);
    const p1 = new THREE.Vector3(Math.cos(a1) * R, 0, Math.sin(a1) * R);
    /* scallop: the middle of each wedge sits a little inward and higher, so the rim runs in waves */
    const pm = new THREE.Vector3(Math.cos(am) * R * 0.9, h * 0.22, Math.sin(am) * R * 0.9);
    const c = i % 2 ? CREAM : CORAL;
    push(top, c); push(pm, c); push(p0, c);
    push(top, c); push(p1, c); push(pm, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** @returns {{ hat: THREE.Group, rig: THREE.Group, canopy: THREE.Group, material: THREE.Material }} */
export function createUmbrellaHat() {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.62, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.8 });
  const hat = new THREE.Group();
  hat.name = "umbrella-hat";
  const rig = new THREE.Group();
  hat.add(rig);

  const crown = new THREE.Mesh(paint(new THREE.SphereGeometry(0.05, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), YELLOW), material);
  crown.scale.set(1.1, 0.8, 1.14);
  const visor = new THREE.Mesh(paint(new THREE.CylinderGeometry(0.052, 0.052, 0.005, 10, 1, false, -Math.PI / 2, Math.PI), VISOR), material);
  visor.position.set(0, 0.003, 0.028);
  visor.scale.set(0.92, 1, 0.95);
  const stick = new THREE.Mesh(paint(new THREE.CylinderGeometry(0.0035, 0.0035, 0.06, 5), STICK), material);
  stick.position.y = 0.036 + 0.03;

  const canopy = new THREE.Group();
  canopy.position.y = 0.036 + 0.05;
  const shade = new THREE.Mesh(canopyGeometry(0.12, 0.062), material);
  const knob = new THREE.Mesh(paint(new THREE.IcosahedronGeometry(0.0065, 0), CORAL), material);
  knob.position.y = 0.066;
  canopy.add(shade, knob);

  rig.add(crown, visor, stick, canopy);
  hat.visible = false;
  return { hat, rig, canopy, material };
}
