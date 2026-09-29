/* A photo to put in the polaroid, painted on a canvas: dawn over a lake. Sky gradient, sun with a glow, four ridges
   that fade into haze with distance, a lake that mirrors the sky and a path of light under the sun.
   The same seed paints the same picture. */

// Hash Kit (our own, see shelf/items/hash-kit): a Weyl sequence through our mixer
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0xb31c96c9) >>> 0;
    let x = s;
    x ^= x >>> 16; x = Math.imul(x, 0x3f9c86cb); x ^= x >>> 14; x = Math.imul(x, 0x1ae9dacf); x ^= x >>> 15;
    return (x >>> 0) / 4294967296;
  };
}

export function paintLandscape(size = 512, seed = 7) {
  const rng = makeRng(seed);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const S = size;
  const shore = 0.72 * S;

  /* sky */
  const sky = g.createLinearGradient(0, 0, 0, shore);
  sky.addColorStop(0, "#86a9c6");
  sky.addColorStop(0.5, "#dcc3b0");
  sky.addColorStop(1, "#f5d6a4");
  g.fillStyle = sky;
  g.fillRect(0, 0, S, shore);

  /* sun and its glow */
  const sx = S * 0.66, sy = S * 0.5;
  const glow = g.createRadialGradient(sx, sy, 0, sx, sy, S * 0.42);
  glow.addColorStop(0, "rgba(255, 244, 214, 0.95)");
  glow.addColorStop(0.1, "rgba(255, 228, 176, 0.6)");
  glow.addColorStop(1, "rgba(255, 214, 160, 0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, S, shore);
  g.fillStyle = "#fff6e0";
  g.beginPath();
  g.arc(sx, sy, S * 0.04, 0, Math.PI * 2);
  g.fill();

  /* ridges, far to near: each is two sines from the seed; a veil of haze goes over every layer but the nearest */
  const ridges = [
    { y: 0.6, amp: 0.035, col: "#b9a7ae" },
    { y: 0.64, amp: 0.05, col: "#8f8798" },
    { y: 0.68, amp: 0.045, col: "#5f6772" },
    { y: 0.715, amp: 0.03, col: "#3b4744" },
  ];
  ridges.forEach((r, i) => {
    const f1 = 3 + rng() * 4, f2 = 9 + rng() * 8, p1 = rng() * 6.28, p2 = rng() * 6.28;
    g.beginPath();
    g.moveTo(0, shore);
    for (let x = 0; x <= S; x += 3) {
      const t = x / S;
      g.lineTo(x, (r.y - r.amp * (0.65 * Math.sin(t * f1 + p1) + 0.35 * Math.sin(t * f2 + p2) + 0.4)) * S);
    }
    g.lineTo(S, shore);
    g.closePath();
    g.fillStyle = r.col;
    g.fill();
    if (i < ridges.length - 1) {
      const haze = g.createLinearGradient(0, S * (r.y - 0.12), 0, shore);
      haze.addColorStop(0, "rgba(245, 214, 164, 0)");
      haze.addColorStop(1, "rgba(245, 214, 164, 0.28)");
      g.fillStyle = haze;
      g.fillRect(0, S * (r.y - 0.12), S, shore - S * (r.y - 0.12));
    }
  });

  /* lake: the sky upside down, darker, and a path of light under the sun */
  const lake = g.createLinearGradient(0, shore, 0, S);
  lake.addColorStop(0, "#e8c9a0");
  lake.addColorStop(0.35, "#a7a6a8");
  lake.addColorStop(1, "#5d7488");
  g.fillStyle = lake;
  g.fillRect(0, shore, S, S - shore);
  for (let i = 0; i < 26; i++) {
    const y = shore + 3 + (S - shore) * Math.pow(i / 26, 1.35);
    const w = S * (0.02 + 0.09 * (i / 26)) * (0.6 + rng() * 0.8);
    g.fillStyle = `rgba(255, 240, 205, ${0.55 - i * 0.015})`;
    g.fillRect(sx - w / 2 + (rng() - 0.5) * S * 0.03, y, w, 1.5 + i * 0.06);
  }
  /* a dark line of the far shore where water meets land */
  g.fillStyle = "rgba(40, 48, 44, 0.55)";
  g.fillRect(0, shore - 1, S, 2);
  return c;
}
