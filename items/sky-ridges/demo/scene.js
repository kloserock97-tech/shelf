/* Sky Ridges demo: a full-screen background. Sliders move the weather like the site's Weather button does,
   the pointer shifts the camera a little so the ridges part by distance. ?dusk=0.5&overcast=0&haze=1 sets a state. */
(function () {
  const canvas = document.getElementById('stage');
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) { document.getElementById('fallback').hidden = false; return; }

  const q = new URLSearchParams(location.search);
  const num = (name, fallback) => (q.has(name) && Number.isFinite(Number(q.get(name))) ? Number(q.get(name)) : fallback);
  const sky = createSkyRidges(gl, { dusk: num('dusk', 0), overcast: num('overcast', 0), haze: num('haze', 1) });
  let dirty = true;
  for (const name of ['dusk', 'overcast', 'haze']) {
    HUD.set(name, sky.params[name]);
    HUD.on(name, (v) => { sky.set({ [name]: v }); dirty = true; });
  }

  // parallax: up to 2.5 m sideways and 0.4 m up, eased; the near ridge moves most
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const goal = [0, 0];
  addEventListener('pointermove', (e) => {
    goal[0] = (e.clientX / innerWidth - 0.5) * 5;
    goal[1] = (0.5 - e.clientY / innerHeight) * 0.8;
  });

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w;
    canvas.height = h;
    dirty = true;
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    resize();
    const off = sky.params.offset;
    const k = reduced ? 1 : 1 - Math.exp(-dt / 0.35);
    for (const i of [0, 1]) {
      const next = off[i] + (goal[i] - off[i]) * k;
      if (Math.abs(next - off[i]) > 1e-4) { off[i] = next; dirty = true; }
    }
    // a background: draw only when something changed
    if (dirty) { sky.render(); dirty = false; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
