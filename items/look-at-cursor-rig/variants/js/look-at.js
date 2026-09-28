import * as THREE from "three";

/* Head and neck turn to a target: the point under the cursor or, when there is none, a look of the character's own —
   at the viewer, to a side, up at the sky, at something nearby. Plus breathing, tail wags in bursts and ear flicks.

   Every frame the bones go back to the rest pose and the turns are laid on top. A turn is made around the character's
   own axes (up, side) re-expressed in the space of the bone's parent:
     local' = parent⁻¹ · R · parent · local
   so it does not matter how the bones themselves are oriented in the rig (Blender rolls, exported axes). */

const UP = new THREE.Vector3(0, 1, 0);
const SIDE = new THREE.Vector3(1, 0, 0);
const clamp = THREE.MathUtils.clamp;

/**
 * root  — the character's group: +Z forward, +Y up
 * bones — { neck, head, spine?, tail?: [bone, bone], ears?: [left, right] }
 * opts  — eyeHeight (head height in root space), interest (a world point to glance at), reduced
 */
export function createLookAt(root, bones, { eyeHeight = 0.45, interest = null, reduced = false } = {}) {
  const rest = new Map();
  for (const b of [bones.neck, bones.head, bones.spine, ...(bones.tail ?? []), ...(bones.ears ?? [])]) if (b) rest.set(b, b.quaternion.clone());

  let time = 0;
  let look = { kind: "viewer", until: 3, side: 1 };
  let yaw = 0, pitch = 0; // current head turn, rad
  let wag = 0, nextWag = 2;
  let earFlick = 0, earSide = 1, nextEar = 3;
  let naive = false;
  const target = new THREE.Vector3();
  const localT = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion(), parentQ = new THREE.Quaternion(), invQ = new THREE.Quaternion(), groupQ = new THREE.Quaternion();
  const axisW = new THREE.Vector3();

  /* turn a bone by angle around an axis of the character */
  function turn(bone, axis, angle) {
    if (!bone || !bone.parent || Math.abs(angle) < 1e-5) return;
    if (naive) {
      /* the tempting way: rotate in the bone's own axes. Works only if the bone happens to be aligned with the body */
      bone.quaternion.multiply(tmpQ.setFromAxisAngle(axis, angle));
    } else {
      bone.parent.getWorldQuaternion(parentQ);
      axisW.copy(axis).applyQuaternion(groupQ);
      tmpQ.setFromAxisAngle(axisW, angle);
      invQ.copy(parentQ).invert();
      tmpQ.premultiply(invQ).multiply(parentQ);
      bone.quaternion.premultiply(tmpQ);
    }
    bone.updateMatrixWorld(true);
  }

  function pickLook() {
    const r = Math.random();
    const kind = r < 0.45 ? "viewer" : r < 0.65 ? "interest" : r < 0.9 ? "side" : "sky";
    look = { kind: kind === "interest" && !interest ? "viewer" : kind, until: time + 1.8 + Math.random() * 3.5, side: Math.random() < 0.5 ? -1 : 1 };
  }

  return {
    get naive() { return naive; },
    set naive(v) { naive = v; },
    /** cursor — a world point under the cursor, or null; camera — the camera (to look at the viewer) */
    update(dt, cursor, camera) {
      time += dt;
      for (const [b, q] of rest) b.quaternion.copy(q);
      root.updateMatrixWorld(true);
      root.getWorldQuaternion(groupQ);

      /* where to look */
      if (cursor) target.copy(cursor);
      else {
        if (time > look.until) pickLook();
        const p = root.position;
        if (look.kind === "viewer") target.copy(camera.position);
        else if (look.kind === "interest") target.copy(interest);
        else if (look.kind === "sky") target.set(p.x + look.side * 2, p.y + 3, p.z - 3);
        else target.set(p.x + look.side * 4, p.y + 0.2, p.z + 1.5);
      }
      /* limits: ±1.25 rad to the sides, the head goes up 0.45 and down 0.35 rad and turns only 0.6 of the way up/down */
      const local = root.worldToLocal(localT.copy(target));
      const wantYaw = clamp(Math.atan2(local.x, local.z), -1.25, 1.25);
      const wantPitch = clamp(Math.atan2(local.y - eyeHeight, Math.hypot(local.x, local.z)) * 0.6, -0.35, 0.45);
      /* smoothing that does not depend on the frame rate: quick after the cursor, lazy on its own */
      const k = 1 - Math.exp(-dt * (reduced ? 1.5 : cursor ? 7 : 3.2));
      yaw += (wantYaw - yaw) * k;
      pitch += (wantPitch - pitch) * k;

      /* the neck takes 45 % of the turn, the head the rest and the nod */
      turn(bones.neck, UP, yaw * 0.45);
      turn(bones.head, UP, yaw * 0.55);
      turn(bones.head, SIDE, -pitch);

      /* breathing */
      turn(bones.spine, SIDE, Math.sin(time * 2.4) * 0.018);

      /* tail: bursts of wagging, more often while the cursor plays with it */
      nextWag -= dt * (cursor ? 2.5 : 1);
      if (nextWag <= 0) { wag = 1; nextWag = 3 + Math.random() * 6; }
      wag = Math.max(0, wag - dt * 0.45);
      const w = Math.sin(time * 13) * 0.45 * wag * wag;
      turn(bones.tail?.[0], UP, w);
      turn(bones.tail?.[1], UP, w * 1.3);

      /* now and then one ear flicks */
      nextEar -= dt;
      if (nextEar <= 0) { earFlick = 1; earSide = Math.random() < 0.5 ? 1 : -1; nextEar = 2.5 + Math.random() * 5; }
      earFlick = Math.max(0, earFlick - dt * 3.2);
      turn(bones.ears?.[earSide > 0 ? 0 : 1], SIDE, Math.sin((1 - earFlick) * Math.PI * 2) * earFlick * 0.35);
    },
  };
}
