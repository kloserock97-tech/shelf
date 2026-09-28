// items/lite-mode-detector/variants/ts/lite.ts
var KEY = "lite-mode";
var TTL = 14 * 24 * 3600 * 1e3;
var WHY = {
  webgl: "3D is off in this browser",
  software: "3D would be too slow on this device",
  slow: "3D was too slow on this device",
  saved: "3D was too slow on this device last time",
  context: "the 3D view crashed",
  stall: "3D didn't start",
  error: "3D didn't start",
  param: ""
};
function liteReason(params2, checks2) {
  const note = (name, result, ok) => checks2?.push({ name, result, ok });
  const q = params2.get("lite");
  if (q === "1") {
    note("?lite", "1, lite on request", false);
    return "param";
  }
  if (q === "0") {
    try {
      localStorage.removeItem(KEY);
    } catch {
    }
    note("?lite", "0, 3D on request, the saved decision is cleared", true);
    return null;
  }
  note("?lite", "not set", true);
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (saved && Date.now() - saved.at < TTL) {
      const left = Math.ceil((TTL - (Date.now() - saved.at)) / 864e5);
      note("Saved decision", `lite, ${left} ${left === 1 ? "day" : "days"} left`, false);
      return "saved";
    }
  } catch {
  }
  note("Saved decision", "none", true);
  const probe = document.createElement("canvas");
  const gl2 = probe.getContext("webgl2", { failIfMajorPerformanceCaveat: true });
  if (!gl2) {
    note("WebGL2 on the GPU", "refused", false);
    const any = document.createElement("canvas").getContext("webgl2");
    if (!any) {
      note("WebGL2 at all", "no", false);
      return "webgl";
    }
    note("WebGL2 at all", "yes, on the CPU", false);
    any.getExtension("WEBGL_lose_context")?.loseContext();
    return "software";
  }
  note("WebGL2 on the GPU", "granted", true);
  const info = gl2.getExtension("WEBGL_debug_renderer_info");
  const renderer = info ? String(gl2.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
  gl2.getExtension("WEBGL_lose_context")?.loseContext();
  const software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
  note("Renderer", renderer || "hidden by the browser", !software);
  return software ? "software" : null;
}
function rememberLite() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ at: Date.now() }));
  } catch {
  }
}
function watchContext(gl2, onGiveUp) {
  const canvas = gl2.canvas;
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    window.setTimeout(() => {
      if (gl2.isContextLost()) onGiveUp();
    }, 2500);
  });
  canvas.addEventListener("webglcontextrestored", () => location.reload());
}
function watchStall(framesDrawn, onStall, ms = 14e3) {
  let wasHidden = document.hidden;
  const onVisibility = () => {
    if (document.hidden) wasHidden = true;
  };
  document.addEventListener("visibilitychange", onVisibility);
  const timer = window.setTimeout(() => {
    document.removeEventListener("visibilitychange", onVisibility);
    if (framesDrawn() === 0 && !wasHidden) onStall();
  }, ms);
  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
function showLiteBar(reason2, parent = document.body, text = { bar: "Lite version", back: "Try 3D anyway" }) {
  const bar = document.createElement("p");
  bar.className = "lite-bar";
  bar.setAttribute("role", "status");
  const why = WHY[reason2];
  const label = document.createElement("span");
  label.textContent = why ? `${text.bar} \xB7 ${why}` : text.bar;
  const link = document.createElement("a");
  link.href = "?lite=0";
  link.textContent = text.back;
  bar.append(label, " ", link);
  parent.appendChild(bar);
  return bar;
}

// items/lite-mode-detector/variants/ts/main.ts
var $ = (sel) => document.querySelector(sel);
var params = new URLSearchParams(location.search);
var page = $(".page");
var status = $("[data-status]");
var checks = [];
var t0 = performance.now();
var reason = liteReason(params, checks);
var took = performance.now() - t0;
var list = $("[data-checks]");
for (const c of checks) {
  const li = document.createElement("li");
  li.className = c.ok ? "ok" : "no";
  const name = document.createElement("span");
  name.textContent = c.name;
  const result = document.createElement("b");
  result.textContent = c.result;
  li.append(name, result);
  list.append(li);
}
$("[data-verdict]").textContent = `${reason ? `lite (${reason})` : "3D"} \xB7 checked in ${took.toFixed(0)} ms`;
var raf = 0;
var frames = 0;
var gl = null;
var stopStall = () => {
};
var sims = [...document.querySelectorAll("[data-sim]")];
function enterLite(why) {
  if (page.classList.contains("is-lite")) return;
  page.classList.add("is-lite");
  cancelAnimationFrame(raf);
  stopStall();
  showLiteBar(why, page);
  sims.forEach((b) => b.disabled = true);
  status.textContent = why === "param" ? "Lite on request." : `Lite: ${WHY[why]}.`;
}
var VERT = `#version 300 es
void main() { gl_Position = vec4(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0, 0.0, 1.0); }`;
var FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float px = 1.5 / uRes.y;
  vec3 col = mix(vec3(0.97, 0.78, 0.59), vec3(0.5, 0.58, 0.8), smoothstep(0.25, 0.95, uv.y));
  float d = length((uv - vec2(0.7, 0.56)) * vec2(uRes.x / uRes.y, 1.0));
  col = mix(col, vec3(1.0, 0.9, 0.7), smoothstep(0.075 + px, 0.075 - px, d));
  col += vec3(1.0, 0.7, 0.4) * exp(-d * 7.0) * 0.25;
  float far = 0.44 + 0.06 * sin(uv.x * 5.0 + uTime * 0.35) + 0.025 * sin(uv.x * 13.0 - uTime * 0.25);
  float near = 0.27 + 0.05 * sin(uv.x * 3.1 - 1.0 + uTime * 0.18);
  col = mix(col, vec3(0.45, 0.6, 0.42), smoothstep(far + px, far - px, uv.y));
  col = mix(col, vec3(0.25, 0.41, 0.27), smoothstep(near + px, near - px, uv.y));
  outColor = vec4(col, 1.0);
}`;
function start3d() {
  const canvas = $(".page canvas");
  gl = canvas.getContext("webgl2");
  if (!gl) return enterLite("error");
  const g = gl;
  const prog = g.createProgram();
  for (const [type, src] of [[g.VERTEX_SHADER, VERT], [g.FRAGMENT_SHADER, FRAG]]) {
    const sh = g.createShader(type);
    g.shaderSource(sh, src);
    g.compileShader(sh);
    g.attachShader(prog, sh);
  }
  g.linkProgram(prog);
  if (!g.getProgramParameter(prog, g.LINK_STATUS)) return enterLite("error");
  const uRes = g.getUniformLocation(prog, "uRes"), uTime = g.getUniformLocation(prog, "uTime");
  g.bindVertexArray(g.createVertexArray());
  new ResizeObserver(([e]) => {
    const k = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(e.contentRect.width * k));
    canvas.height = Math.max(1, Math.round(e.contentRect.height * k));
  }).observe(canvas);
  canvas.addEventListener("webglcontextlost", () => cancelAnimationFrame(raf));
  watchContext(g, () => enterLite("context"));
  stopStall = watchStall(() => frames, () => {
    rememberLite();
    enterLite("stall");
  });
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const draw = (t) => {
    g.viewport(0, 0, canvas.width, canvas.height);
    g.useProgram(prog);
    g.uniform2f(uRes, canvas.width, canvas.height);
    g.uniform1f(uTime, still ? 0 : t / 1e3);
    g.drawArrays(g.TRIANGLES, 0, 3);
    frames++;
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
  status.textContent = "3D is running.";
}
if (reason) enterLite(reason);
else start3d();
for (const b of sims) {
  b.addEventListener("click", () => {
    const sim = b.dataset.sim;
    if (sim === "context") {
      const ext = gl?.getExtension("WEBGL_lose_context");
      if (!ext) return enterLite("context");
      sims.forEach((s) => s.disabled = true);
      status.textContent = "Context lost. Waiting 2.5 s for it to come back\u2026";
      ext.loseContext();
      return;
    }
    if (sim === "slow" || sim === "stall") rememberLite();
    enterLite(sim);
    if (sim === "slow" || sim === "stall") status.textContent += " Remembered for 14 days: reload and the check says \u201Csaved\u201D.";
  });
}
$("[data-reload]").addEventListener("click", () => location.reload());
