import * as THREE from "three";

/* A little low-poly bird made of primitives, with a real bone hierarchy: spine → neck → head → two crest feathers,
   spine → tail_01 → tail_02. Bones are oriented the way Blender exports them: +Y along the bone, plus a roll.
   So their local axes do NOT match the bird's axes, which is exactly what the look-at has to cope with.
   Parts are modelled in the bird's own space and then attached to their bones without moving (Object3D.attach). */

const Y = new THREE.Vector3(0, 1, 0);

function makeBone(name, head, tail, roll) {
  const b = new THREE.Bone();
  b.name = name;
  const dir = new THREE.Vector3().subVectors(tail, head).normalize();
  b.quaternion.setFromUnitVectors(Y, dir).multiply(new THREE.Quaternion().setFromAxisAngle(Y, roll));
  b.position.copy(head);
  return b;
}

export function createBird() {
  const root = new THREE.Group();
  root.name = "bird";
  const mat = (color, roughness = 0.7) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, flatShading: true });
  const M = {
    body: mat("#e2744a"), wing: mat("#b9553a"), belly: mat("#f5dcc0"), beak: mat("#f2b33d", 0.5),
    eye: mat("#fbfaf6", 0.35), pupil: mat("#1d1a1a", 0.3), cheek: mat("#f09a8c"), leg: mat("#d98f3a"),
  };
  const part = (geo, m, pos, rot = [0, 0, 0], scale = [1, 1, 1]) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(...pos);
    mesh.rotation.set(...rot);
    mesh.scale.set(...scale);
    mesh.castShadow = true;
    return mesh;
  };
  const v = (x, y, z) => new THREE.Vector3(x, y, z);

  /* bones, with rolls that have nothing to do with the bird's axes */
  const spine = makeBone("spine", v(0, 0.12, 0), v(0, 0.3, 0.05), 0.5);
  root.add(spine);
  root.updateMatrixWorld(true);
  const neck = makeBone("neck", v(0, 0.3, 0.06), v(0, 0.39, 0.1), 1.3);
  spine.attach(neck);
  const head = makeBone("head", v(0, 0.39, 0.1), v(0, 0.52, 0.13), -0.9);
  neck.attach(head);
  const tail1 = makeBone("tail_01", v(0, 0.17, -0.13), v(0, 0.13, -0.22), 0.8);
  spine.attach(tail1);
  const tail2 = makeBone("tail_02", v(0, 0.13, -0.22), v(0, 0.1, -0.31), -0.4);
  tail1.attach(tail2);
  const earL = makeBone("crest_L", v(0.022, 0.53, 0.09), v(0.035, 0.6, 0.06), 0.3);
  head.attach(earL);
  const earR = makeBone("crest_R", v(-0.022, 0.53, 0.09), v(-0.035, 0.6, 0.06), -0.7);
  head.attach(earR);
  root.updateMatrixWorld(true);

  /* body */
  spine.attach(part(new THREE.IcosahedronGeometry(0.16, 1), M.body, [0, 0.2, 0], [0, 0, 0], [1, 1.08, 1.15]));
  spine.attach(part(new THREE.IcosahedronGeometry(0.13, 1), M.belly, [0, 0.18, 0.1], [0, 0, 0], [0.95, 1, 0.8]));
  for (const s of [1, -1]) spine.attach(part(new THREE.IcosahedronGeometry(0.12, 1), M.wing, [s * 0.14, 0.22, -0.03], [0.25, 0, s * 0.2], [0.34, 0.8, 1.15]));
  /* legs stay on the ground */
  for (const s of [1, -1]) {
    root.attach(part(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 5), M.leg, [s * 0.05, 0.045, 0.01]));
    root.attach(part(new THREE.BoxGeometry(0.05, 0.012, 0.065), M.leg, [s * 0.05, 0.006, 0.03]));
  }
  /* neck and head */
  neck.attach(part(new THREE.CylinderGeometry(0.06, 0.075, 0.11, 8), M.body, [0, 0.35, 0.08], [0.35, 0, 0]));
  head.attach(part(new THREE.IcosahedronGeometry(0.1, 1), M.body, [0, 0.45, 0.1], [0, 0, 0], [1, 0.95, 1]));
  head.attach(part(new THREE.ConeGeometry(0.026, 0.075, 6), M.beak, [0, 0.44, 0.215], [Math.PI / 2, 0, 0]));
  for (const s of [1, -1]) {
    head.attach(part(new THREE.SphereGeometry(0.028, 12, 8), M.eye, [s * 0.045, 0.475, 0.175]));
    head.attach(part(new THREE.SphereGeometry(0.015, 10, 6), M.pupil, [s * 0.047, 0.477, 0.2]));
    head.attach(part(new THREE.CircleGeometry(0.018, 10), M.cheek, [s * 0.07, 0.43, 0.165], [0, s * 0.7, 0]));
  }
  /* crest feathers and the tail */
  earL.attach(part(new THREE.ConeGeometry(0.016, 0.07, 5), M.wing, [0.028, 0.57, 0.075], [-0.4, 0, -0.25]));
  earR.attach(part(new THREE.ConeGeometry(0.016, 0.06, 5), M.wing, [-0.028, 0.565, 0.075], [-0.4, 0, 0.25]));
  tail1.attach(part(new THREE.BoxGeometry(0.11, 0.014, 0.1), M.wing, [0, 0.15, -0.19], [-0.35, 0, 0]));
  tail2.attach(part(new THREE.BoxGeometry(0.14, 0.012, 0.1), M.wing, [0, 0.115, -0.27], [-0.45, 0, 0]));

  root.updateMatrixWorld(true);
  return { root, bones: { spine, neck, head, tail: [tail1, tail2], ears: [earL, earR] } };
}
