import * as THREE from "three";
import { rand, seedDelay, anchorAt, mossAt, fbm, smooth } from "./garden-surface";
import { FUR } from "./garden-moss";
import type { Garden } from "./garden-sheet";

function petalGeometry() {
  const geo = new THREE.PlaneGeometry(1, 1, 5, 9);
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const t = uv.getY(i), across = (uv.getX(i) - .5) * 2;
    p.setXYZ(i, across * Math.pow(Math.sin(Math.PI * t), .65) * .055, Math.sin(t * Math.PI) * .035 + across * across * .012, t * .19);
  }
  geo.computeVertexNormals(); return geo;
}

/** Orange ranunculus and a bud at the warm edge, leaning out past it; daisies in loose drifts over the moss.
    Returns the per-frame update: stems rise, then the corollas open. */
export function buildFlowers(garden: Garden, world: THREE.Group) {
  const flowers: { group: THREE.Group; petals: THREE.Mesh[]; delay: number; seed: number }[] = [];
  const petalGeo = petalGeometry();
  const petalMat = (hex: string) => new THREE.MeshStandardMaterial({ color: hex, roughness: .6, side: THREE.DoubleSide, envMapIntensity: .4 });
  const ivory = petalMat("#fff4d8");
  /* a ranunculus deepens towards its heart: pale outer petals, red-orange inside */
  const orange = [petalMat("#f6a03c"), petalMat("#ee7a22"), petalMat("#dc5518"), petalMat("#c9440f")];
  const stemMat = new THREE.MeshStandardMaterial({ color: "#35581f", roughness: .9, envMapIntensity: .3 });
  const coreMat = new THREE.MeshStandardMaterial({ color: "#d6a52c", roughness: .94, envMapIntensity: .3 });
  const budMat = new THREE.MeshStandardMaterial({ color: "#e0641c", roughness: .7, envMapIntensity: .3 });
  const coreGeo = new THREE.SphereGeometry(.043, 12, 8);
  const leafGeo = new THREE.SphereGeometry(1, 8, 6);
  const spots: { x: number; z: number; accent: number }[] = [
    { x: 1.34, z: -.18, accent: 0 }, { x: 1.43, z: .30, accent: 1 }, { x: 1.26, z: .78, accent: 2 }, { x: 1.40, z: .02, accent: 3 },
  ];
  for (let n = 0; spots.length < 20 && n < 1500; n++) {
    const x = (rand(n * 9 + 211) - .5) * 2.75, z = (rand(n * 9 + 212) - .5) * 2.95;
    /* daisies grow in loose drifts, not as an even polka dot */
    if (fbm(x * 1.3 + 20, z * 1.3 + 4) < .52 || spots.some(s => Math.hypot(s.x - x, s.z - z) < .2)) continue;
    spots.push({ x, z, accent: -1 });
  }
  spots.forEach(({ x, z, accent: slot }, i) => {
    const accent = slot >= 0, bud = slot === 3;
    const height = accent ? [.62, .80, .50, .46][slot] : .13 + rand(i + 80) * .13;
    /* stems start inside the pile, not on top of it */
    const anchor = anchorAt(x, z), h = mossAt(x, z, anchor) * .8 + FUR * .3;
    const group = new THREE.Group(); group.position.set(anchor.p[0] + anchor.n[0] * h, anchor.p[1] + anchor.n[1] * h, anchor.p[2] + anchor.n[2] * h);
    /* accents lean outwards over the edge */
    const bend = accent ? .16 + slot * .04 : (rand(i + 31) - .5) * .12;
    const path = new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(-bend * .4, height * .6, .015), new THREE.Vector3(bend, height, 0));
    const stem = new THREE.Mesh(new THREE.TubeGeometry(path, 9, accent ? .009 : .005, 5, false), stemMat);
    stem.castShadow = true; group.add(stem);
    for (let j = 0; j < 2; j++) {
      const leaf = new THREE.Mesh(leafGeo, stemMat);
      leaf.position.set(j ? -.02 : .035, height * (.3 + j * .2), 0);
      leaf.scale.set(accent ? .075 : .045, .008, accent ? .026 : .018); leaf.rotation.z = j ? -.6 : .6;
      leaf.castShadow = true; group.add(leaf);
    }
    const head = new THREE.Group(); head.position.set(bend, height, 0);
    /* heads tip towards the camera a little, so the corolla reads in three-quarter view */
    head.rotation.set(accent ? .55 : .3, i * 1.17, accent ? -.35 : -.17); group.add(head);
    const petals: THREE.Mesh[] = [];
    if (bud) {
      const closed = new THREE.Mesh(coreGeo, budMat); closed.scale.set(.9, 1.5, .9); closed.position.y = .03; closed.castShadow = true; head.add(closed);
      const calyx = new THREE.Mesh(coreGeo, stemMat); calyx.scale.set(.75, .6, .75); calyx.castShadow = true; head.add(calyx);
    } else {
      const core = new THREE.Mesh(coreGeo, coreMat); core.scale.set(accent ? .7 : 1, .55, accent ? .7 : 1); core.castShadow = true; head.add(core);
      const layers = accent ? 4 : 1, amount = accent ? 8 : 10;
      for (let layer = 0; layer < layers; layer++) for (let j = 0; j < amount; j++) {
        const pivot = new THREE.Group(); pivot.rotation.y = j / amount * Math.PI * 2 + layer * .42;
        head.add(pivot);
        const petal = new THREE.Mesh(petalGeo, accent ? orange[layer] : ivory);
        petal.scale.setScalar(accent ? .82 - layer * .16 : .27 + rand(i + 1) * .12);
        petal.position.y = layer * .01; petal.castShadow = petal.receiveShadow = true;
        /* inner rings stay cupped: that is what makes a ranunculus and not a daisy */
        petal.userData.open = accent ? [.02, -.34, -.66, -.95][layer] : .1;
        pivot.add(petal); petals.push(petal);
      }
    }
    flowers.push({ group, petals, delay: seedDelay(x, z) + .1, seed: i });
    world.add(group);
  });

  return (progress: number, time: number) => {
    for (const flower of flowers) {
      const stem = smooth(flower.delay, flower.delay + .14, progress);
      const bloom = smooth(flower.delay + .09, flower.delay + .26, progress);
      flower.group.scale.setScalar(Math.max(.0001, stem));
      flower.group.rotation.z = garden.reduced ? 0 : Math.sin(time * 1.25 + flower.seed) * .022 * stem;
      for (const petal of flower.petals) petal.rotation.x = -1.32 * (1 - bloom) + (petal.userData.open as number) * bloom;
    }
  };
}
