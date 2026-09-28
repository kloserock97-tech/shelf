import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/** A beige CRT monitor from primitives: bezel, hood, dark glass, stand, power light. The screen is a plane whose uv
    run from the top left, as the screen material expects. Returns the group and the screen mesh (for raycasting). */
export function buildMonitor(screenMaterial: THREE.Material, aspect: number) {
  const group = new THREE.Group();
  const beige = new THREE.MeshStandardMaterial({ color: "#d9d0b3", roughness: .58, envMapIntensity: .8 });
  const shade = new THREE.MeshStandardMaterial({ color: "#c7bd9d", roughness: .66, envMapIntensity: .6 });
  const glass = new THREE.MeshStandardMaterial({ color: "#0e1111", roughness: .22, envMapIntensity: 1.2 });
  const sw = 1.6, sh = sw / aspect;
  const part = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
    return mesh;
  };
  part(new RoundedBoxGeometry(sw + .44, sh + .5, .36, 6, .09), beige, 0, 0, 0);
  part(new RoundedBoxGeometry(sw * .84, sh * .82, .95, 6, .16), shade, 0, .02, -.6);
  /* the dark glass round the picture: the screen shader leaves its squircle corners empty */
  part(new RoundedBoxGeometry(sw + .08, sh + .08, .04, 4, .05), glass, 0, .02, .17);
  part(new RoundedBoxGeometry(.5, .34, .5, 4, .06), shade, 0, -sh / 2 - .38, -.35);
  part(new RoundedBoxGeometry(1.2, .1, .82, 4, .045), beige, 0, -sh / 2 - .58, -.3);
  const led = part(new THREE.SphereGeometry(.022, 12, 8), new THREE.MeshStandardMaterial({ color: "#3a3", emissive: "#5f5", emissiveIntensity: 1.4 }), sw / 2 + .06, -sh / 2 - .13, .18);
  led.castShadow = false;
  const plane = new THREE.PlaneGeometry(sw, sh);
  const uv = plane.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  const screen = new THREE.Mesh(plane, screenMaterial);
  screen.position.set(0, .02, .195);
  group.add(screen);
  /* how tall the whole thing is, from the foot to the top of the bezel: for framing */
  const size = new THREE.Vector3(sw + .44, sh + .5 + .63, 1.5);
  return { group, screen, size, floorY: -sh / 2 - .63 };
}
