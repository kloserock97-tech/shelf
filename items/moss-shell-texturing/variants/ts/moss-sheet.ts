import * as THREE from "three";
import { anchorAt, type Anchor } from "./moss-stone";

/** What the moss shares with the frame loop: growth (0…1) and the clock as live uniforms, and the reduced-motion switch. */
export type MossState = { growth: { value: number }; clock: { value: number }; reduced: boolean };

/** How far the layer has come at a vertex, as GLSL over its `aDelay`. The pile uses the same curve, so it rides the
    cushion up instead of floating above it. */
export const RISE = "smoothstep(aDelay+.07,aDelay+.34,uGrowth)";

export type SheetOptions = {
  x0: number; x1: number; z0: number; z1: number; res: number;
  sample: (x: number, z: number, anchor: Anchor) => { h: number; delay: number; shade: number };
  material: THREE.Material; tint: (shade: number, out: THREE.Color) => void;
};

/** A sheet that lies on the stone and wraps down its walls. Every vertex stands on its anchor (a point of the solid
    and the normal there) at the height of the layer, knows the hidden rest point just under the surface and the
    growth value at which it rises.
    `aGrid` keeps the flat grid coordinates: on a wall x or z is constant, so the pile, which has to cover the wall
    evenly, is laid out in grid space and not in object space. */
export function buildSheet(state: MossState, opts: SheetOptions): THREE.Mesh {
  const { x0, x1, z0, z1, res } = opts, n = res + 1;
  const position = new Float32Array(n * n * 3), rest = new Float32Array(n * n * 3), grid = new Float32Array(n * n * 2);
  const delay = new Float32Array(n * n), colors = new Float32Array(n * n * 3), alive = new Uint8Array(n * n);
  const color = new THREE.Color();
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, x = x0 + (x1 - x0) * i / res, z = z0 + (z1 - z0) * j / res;
    const anchor = anchorAt(x, z), s = opts.sample(x, z, anchor), [px, py, pz] = anchor.p, [nx, ny, nz] = anchor.n;
    /* a vertex just outside the layer sits a little under the surface, on the continuation of the slope:
       the visible edge is then cut by the stone itself, smoothly, and not along the cells of the grid */
    const h = Math.max(-.05, s.h);
    position.set([px + nx * h, py + ny * h, pz + nz * h], k * 3);
    rest.set([px - nx * .012, py - ny * .012, pz - nz * .012], k * 3);
    grid.set([x, z], k * 2);
    if (s.h > 0) alive[k] = 1;
    delay[k] = s.delay;
    opts.tint(s.shade, color); colors.set([color.r, color.g, color.b], k * 3);
  }
  const index: number[] = [];
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
  const inject = (shader: THREE.WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uGrowth = state.growth;
    shader.vertexShader = "uniform float uGrowth; attribute vec3 aRest; attribute float aDelay;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `vec3 transformed=mix(aRest,position,${RISE});`);
  };
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  opts.material.onBeforeCompile = inject; depth.onBeforeCompile = inject;
  const mesh = new THREE.Mesh(geometry, opts.material);
  mesh.customDepthMaterial = depth;
  mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false;
  return mesh;
}
