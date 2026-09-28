// items/smooth-wheel/variants/ts/scrollFeel.ts
var SCROLL_LAMBDA = 6.5;

// items/smooth-wheel/variants/ts/smoothScroll.ts
var LINE = 100 / 3;
function smoothWheel(scroller, skip, report) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const win = scroller === window;
  const root = document.scrollingElement;
  const box = win ? root : scroller;
  const getTop = () => win ? scrollY : box.scrollTop;
  const setTop = (v) => {
    if (win) scrollTo({ top: v, behavior: "instant" });
    else box.scrollTop = v;
  };
  const view = () => win ? innerHeight : box.clientHeight;
  let target = getTop();
  let current = target;
  let expected = -1;
  let raf = 0;
  let last = 0;
  const max = () => Math.max(0, box.scrollHeight - view());
  const clamp = (v) => Math.min(max(), Math.max(0, v));
  const tick = (now) => {
    const dt = Math.min(1, (now - last) / 1e3);
    last = now;
    current += (target - current) * (1 - Math.exp(-dt * SCROLL_LAMBDA));
    if (Math.abs(target - current) < 0.4) current = target;
    expected = current;
    setTop(current);
    raf = current === target ? 0 : requestAnimationFrame(tick);
  };
  const start = () => {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };
  const halt = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    target = current = getTop();
  };
  const nested = (from, dy) => {
    for (let el = from; el && el !== box; el = el.parentElement) {
      if (el === document.body || el.scrollHeight <= el.clientHeight + 1) continue;
      const oy = getComputedStyle(el).overflowY;
      if (oy !== "auto" && oy !== "scroll") continue;
      if (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
    }
    return false;
  };
  const onWheel = (e) => {
    if (e.ctrlKey || e.metaKey) {
      report?.("zoom");
      return;
    }
    if (reduce.matches) {
      report?.("reduced");
      return;
    }
    if (e.defaultPrevented || skip?.()) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      report?.("sideways");
      return;
    }
    if (e.deltaMode === 0 && Math.abs(e.deltaY) < 40) {
      if (raf) halt();
      report?.("trackpad");
      return;
    }
    if (nested(e.target, e.deltaY)) {
      report?.("nested");
      return;
    }
    if (!raf && (e.deltaY > 0 ? getTop() >= max() - 1 : getTop() <= 1)) {
      report?.("edge");
      return;
    }
    const px = e.deltaMode === 1 ? e.deltaY * LINE : e.deltaMode === 2 ? e.deltaY * view() * 0.9 : e.deltaY;
    e.preventDefault();
    if (!raf) target = current = getTop();
    target = clamp(target + px);
    report?.("smooth");
    start();
  };
  const onScroll = () => {
    if (raf && Math.abs(getTop() - expected) > 2) halt();
  };
  scroller.addEventListener("wheel", onWheel, { passive: false });
  scroller.addEventListener("scroll", onScroll, { passive: true });
  return {
    /** get to a place with the same motion as the wheel; from far away, cut closer first and glide the rest */
    to(top) {
      const goal = clamp(top);
      if (reduce.matches) {
        halt();
        setTop(goal);
        return;
      }
      if (!raf) target = current = getTop();
      const reach = view() * 1.2;
      if (Math.abs(goal - current) > reach) {
        current = goal + (current > goal ? reach : -reach);
        expected = current;
        setTop(current);
      }
      target = goal;
      start();
    },
    stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      scroller.removeEventListener("wheel", onWheel);
      scroller.removeEventListener("scroll", onScroll);
    }
  };
}

// items/smooth-wheel/variants/ts/main.ts
var $ = (s) => document.querySelector(s);
var toggle = $("#smooth");
var speed = $("#speed");
var route = $("#route");
var canvas = $("#spark");
var ROUTES = {
  smooth: "Wheel \xB7 smoothed",
  trackpad: "Trackpad \xB7 native",
  nested: "Inner box \xB7 native",
  zoom: "Ctrl + wheel \xB7 zoom",
  sideways: "Sideways \xB7 native",
  reduced: "Reduced motion \xB7 native",
  edge: "Page edge \xB7 passed on"
};
var show = (s) => {
  if (route && route.textContent !== s) route.textContent = s;
};
var smoother = null;
var enable = () => {
  smoother = smoothWheel(window, void 0, (r) => show(ROUTES[r]));
};
enable();
toggle?.addEventListener("click", () => {
  const on = toggle.getAttribute("aria-checked") !== "true";
  toggle.setAttribute("aria-checked", String(on));
  smoother?.stop();
  smoother = null;
  if (on) enable();
  show(on ? "Smoothing on" : "Wheel \xB7 native (smoothing off)");
});
addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key)) show("Keys \xB7 native");
});
addEventListener("touchstart", () => show("Finger \xB7 native"), { passive: true });
document.querySelectorAll("[data-to]").forEach((b) => b.addEventListener("click", () => {
  const to = b.dataset.to === "end" ? document.documentElement.scrollHeight : 0;
  if (smoother) smoother.to(to);
  else scrollTo({ top: to, behavior: "instant" });
}));
var W = 180;
var H = 36;
var N = 90;
var samples = new Array(N).fill(0);
var ctx = canvas?.getContext("2d");
var dpr = Math.min(2, devicePixelRatio || 1);
if (canvas && ctx) {
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
}
var accent = () => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#3e63dd";
var draw = () => {
  if (!ctx) return;
  const peak = Math.min(8e3, Math.max(2500, ...samples.map(Math.abs)));
  const c = accent();
  ctx.clearRect(0, 0, W, H);
  ctx.beginPath();
  samples.forEach((v, i) => {
    const x = i * W / (N - 1), y = H - 2 - Math.min(1, Math.abs(v) / peak) * (H - 6);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.strokeStyle = c;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = c;
  ctx.fill();
  ctx.globalAlpha = 1;
};
var lastY = scrollY;
var lastT = performance.now();
var still = 0;
var loop = 0;
var frame = (t) => {
  const v = (scrollY - lastY) / Math.max(1, t - lastT) * 1e3;
  lastY = scrollY;
  lastT = t;
  samples.push(v);
  samples.shift();
  if (speed) speed.textContent = `${Math.round(Math.abs(v)).toLocaleString("en")} px/s`;
  draw();
  still = v === 0 ? still + 1 : 0;
  loop = still > N ? 0 : requestAnimationFrame(frame);
};
addEventListener("scroll", () => {
  if (loop) return;
  lastY = scrollY;
  lastT = performance.now();
  still = 0;
  loop = requestAnimationFrame(frame);
}, { passive: true });
draw();
