import * as THREE from "three";
import { TILE, DRAPE, iceAt, meltDelay, smooth } from "./garden-surface";
import { buildSheet, type Garden } from "./garden-sheet";

/** Ice along the cold edge. Flat shading turns the ridged height field into crystal facets; the normals come from
    screen derivatives, so they stay right while the sheet melts. */
export function buildIce(garden: Garden, world: THREE.Group) {
  const material = new THREE.MeshPhysicalMaterial({
    color: "#d3ebf0", roughness: .2, metalness: 0, clearcoat: 1, clearcoatRoughness: .1, ior: 1.31,
    flatShading: true, vertexColors: true, emissive: "#8fc6d6", emissiveIntensity: .13, envMapIntensity: 1.5,
  });
  world.add(buildSheet(garden, {
    x0: -TILE.width / 2 - DRAPE, x1: -TILE.width / 2 + 1.85, z0: -TILE.depth / 2 - DRAPE, z1: -TILE.depth / 2 + 3.05,
    res: garden.small ? 60 : 88, mode: "melt", material,
    /* thin edges melt first, the core of the corner last; the ice hangs over the edge and part of the way down the
       wall, thinner the lower it gets */
    sample: (_x, _z, anchor) => {
      const ice = iceAt(anchor.bx, anchor.bz), wall = Math.min(1, anchor.wall), hang = 1 - smooth(.35, .8, wall);
      return { h: ice.h > 0 ? ice.h * hang - (1 - hang) * .05 : ice.h, delay: meltDelay(ice.t) - wall * .05, shade: ice.h };
    },
    /* deep blue where the sheet is thin and you look into it, white crust on the ridges */
    tint: (shade, out) => out.setRGB(.50 + shade * 2.1, .74 + shade * 1.1, .90 + shade * .45),
  }));
}
