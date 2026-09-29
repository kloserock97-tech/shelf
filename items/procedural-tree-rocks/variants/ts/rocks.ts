/* Boulders in the moss. The shape is a sphere pushed about by three octaves of noise with a slightly flattened top.
   Colour, moss and lichen live in rockFragment (shaders.ts); the light is the same as the tree's. */
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { makeRng } from "./rng";
import { rockFragment, rockVertex } from "./shaders";

/** x, z — where it lies; size — width, m; h — share of height; yaw — turn; sink — share of the height under ground */
export type Rock = { x: number; z: number; size: number; h: number; yaw: number; sink: number; seed: number };

/** patches where grass hardly grows (under a boulder): an ellipse on the ground */
export const rockFootprints = (rocks: Rock[]) => rocks.map((r) => ({ x: r.x, z: r.z, rx: r.size * 0.46, rz: r.size * 0.42 }));

/* Hash Kit (our own hash, see shelf/items/hash-kit): lattice corner + salt in, 0…1 out */
const hashU = (x: number) => { x ^= x >>> 16; x = Math.imul(x, 0x3f9c86cb); x ^= x >>> 14; x = Math.imul(x, 0x1ae9dacf); x ^= x >>> 15; return x >>> 0; };
function hash3(x: number, y: number, z: number, s: number) {
  return (hashU((x + hashU((y + hashU((z + hashU((s + 0xb31c96c9) >>> 0)) >>> 0)) >>> 0)) >>> 0) >>> 8) / 16777216;
}
function noise3(x: number, y: number, z: number, s: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(ix + dx, iy + dy, iz + dz, s);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), ux), l(c(0, 1, 0), c(1, 1, 0), ux), uy),
    l(l(c(0, 0, 1), c(1, 0, 1), ux), l(c(0, 1, 1), c(1, 1, 1), ux), uy),
    uz,
  );
}

export function rockGeometry(seed: number) {
  const rng = makeRng(0x0bad5eed ^ seed);
  /* three's icosahedron comes without shared vertices: normals would be per face and the stone faceted */
  const ico = new THREE.IcosahedronGeometry(1, 4);
  ico.deleteAttribute("normal");
  ico.deleteAttribute("uv");
  const geo = mergeVertices(ico);
  ico.dispose();
  const pos = geo.attributes.position as THREE.BufferAttribute;
  /* Three octaves of noise over the sphere and a slightly flattened top. Flat chips cut by planes gave stepped
     triangles and the look of a crystal; a weathered boulder in a meadow is rounder and more irregular */
  const tilt = new THREE.Vector3(rng() - 0.5, 0, rng() - 0.5).multiplyScalar(0.5);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const big = noise3(v.x * 1.1 + 3, v.y * 1.1, v.z * 1.1, seed) - 0.5;
    const mid = noise3(v.x * 2.6, v.y * 2.6 + 7, v.z * 2.6, seed + 1) - 0.5;
    const fine = noise3(v.x * 7, v.y * 7 - 3, v.z * 7, seed + 2) - 0.5;
    const r = 1 + big * 0.5 + mid * 0.16 + fine * 0.04 + v.dot(tilt) * 0.3;
    v.multiplyScalar(r);
    if (v.y > 0.35) v.y = 0.35 + (v.y - 0.35) * 0.72;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** uniforms — the shared light (shaders.ts LIGHT) plus uGroundY; heightAt — ground height under a rock */
export function createRocks(uniforms: Record<string, THREE.IUniform>, rocks: Rock[], heightAt: (x: number, z: number) => number = () => 0) {
  const group = new THREE.Group();
  group.name = "rocks";
  const mat = new THREE.ShaderMaterial({ vertexShader: rockVertex, fragmentShader: rockFragment, uniforms });
  for (const r of rocks) {
    const mesh = new THREE.Mesh(rockGeometry(r.seed), mat);
    const half = r.size / 2;
    mesh.scale.set(half, half * r.h * 1.6, half * 0.9);
    mesh.rotation.set(0, r.yaw, 0);
    /* the lower part is in the ground: the centre drops so that (1 − sink) of the height sticks out */
    mesh.position.set(r.x, heightAt(r.x, r.z) + half * r.h * 1.6 * (1 - 2 * r.sink), r.z);
    group.add(mesh);
  }
  return group;
}
