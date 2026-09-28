/* Putting the hat on and taking it off. Driven by time since the last change, so it can be flipped at any moment.
   On: the cap drops from 18 cm on a damped spring, the umbrella opens with an overshoot and whirls down to a slow turn.
   Off: the umbrella folds, the cap gives a small hop and flies up, shrinking away.
   With reduced motion it only scales in and out. */

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeOutBack = (x) => { const c = 1.6; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };

/** parts — what createUmbrellaHat() returns */
export function createHatMotion({ hat, rig, canopy }, { reduced = false } = {}) {
  let want = false;
  let clock = 10; // seconds since the last change
  let level = 0; // 0 — off, 1 — on and open; lets "off" start from the middle of "on"
  let time = 0;

  return {
    get wearing() { return want; },
    /** true — put on, false — take off. The same value twice does nothing */
    set(on) {
      if (on === want) return;
      want = on;
      clock = 0;
    },
    update(dt) {
      time += dt;
      clock += dt;
      const t = clock;
      if (want) {
        if (reduced) {
          const k = clamp01(t / 0.5);
          hat.visible = true;
          rig.position.y = 0;
          rig.scale.setScalar(Math.max(0.01, k));
          canopy.scale.set(1, 1, 1);
          level = k;
        } else {
          /* damped spring from 18 cm down. The dip below zero is squashed to a quarter, so the cap never sinks into the head */
          const y = 0.18 * Math.exp(-6.5 * t) * Math.cos(10.5 * t);
          rig.position.y = y < 0 ? y * 0.25 : y;
          rig.scale.setScalar(0.55 + 0.45 * clamp01(t * 3.5));
          const open = easeOutBack(clamp01((t - 0.22) / 0.55));
          canopy.scale.set(Math.max(0.08, open), 0.55 + 0.45 * Math.min(1, open), Math.max(0.08, open));
          hat.visible = true;
          level = clamp01(t / 0.8);
        }
        /* opens with a whirl that settles into a slow turn; the whole hat sways a little */
        canopy.rotation.y += dt * (0.5 + 5 * Math.max(0, 1 - t * 1.4));
        rig.rotation.z = Math.sin(time * 1.7) * 0.05;
      } else if (hat.visible) {
        const from = level;
        const k = clamp01(t / 0.6);
        if (reduced || from < 0.2) {
          rig.scale.setScalar(Math.max(0.01, (1 - k) * Math.max(from, 0.2)));
        } else {
          const close = clamp01(t / 0.25);
          canopy.scale.set(Math.max(0.08, 1 - close * 0.9), 1 - close * 0.3, Math.max(0.08, 1 - close * 0.9));
          const lift = clamp01((t - 0.15) / 0.45);
          rig.position.y = -0.012 * Math.sin(clamp01(t / 0.15) * Math.PI) + 0.35 * lift * lift;
          rig.scale.setScalar(Math.max(0.01, 1 - lift));
          canopy.rotation.y += dt * 4;
        }
        if (k >= 1) {
          hat.visible = false;
          level = 0;
        }
      }
    }
  };
}
