/* Cursor parallax: one requestAnimationFrame writes --px and --py (−1…1) on the root, eased towards the cursor
   independently of the frame rate, and only when the value rounded to 0.001 has changed. Layers move in CSS.
   Touch is ignored (a finger has no hover); leaving the window brings everything back to rest.
   Usage: <div data-cursor-parallax>…</div>, or initCursorParallax(element, { rate }) → returns a stop function. */
(function () {
  var REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  /* smooth approach to a target, the same at 60 and 120 Hz */
  var approach = function (value, target, rate, dt) { return value + (target - value) * (1 - Math.exp(-rate * dt)); };

  function initCursorParallax(root, options) {
    var rate = (options && options.rate) || 3.2;
    if (!root || REDUCED) return function () {};
    var pointer = { nx: 0, ny: 0 };
    var tilt = { x: 0, y: 0, lastX: NaN, lastY: NaN };
    var onMove = function (e) {
      if (e.pointerType === "touch") return;
      pointer.nx = (e.clientX / innerWidth) * 2 - 1;
      pointer.ny = (e.clientY / innerHeight) * 2 - 1;
    };
    var onLeave = function () { pointer.nx = pointer.ny = 0; };
    addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    root.classList.add("cp-on");

    var last = 0, raf = 0;
    var frame = function (now) {
      raf = requestAnimationFrame(frame);
      var dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
      last = now;
      tilt.x = approach(tilt.x, pointer.nx, rate, dt);
      tilt.y = approach(tilt.y, pointer.ny, rate, dt);
      var x = Math.round(tilt.x * 1000) / 1000, y = Math.round(tilt.y * 1000) / 1000;
      if (x !== tilt.lastX || y !== tilt.lastY) {
        tilt.lastX = x;
        tilt.lastY = y;
        root.style.setProperty("--px", String(x));
        root.style.setProperty("--py", String(y));
      }
    };
    raf = requestAnimationFrame(frame);

    return function stop() {
      cancelAnimationFrame(raf);
      removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      root.classList.remove("cp-on");
    };
  }

  window.initCursorParallax = initCursorParallax;
  document.querySelectorAll("[data-cursor-parallax]").forEach(function (el) { initCursorParallax(el); });
})();
