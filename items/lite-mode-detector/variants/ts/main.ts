import { liteReason, rememberLite, showLiteBar, watchContext, watchStall, WHY, type LiteCheck, type LiteReason } from "./lite";

/* Demo: the real check runs on load and is listed step by step. The mock page runs a small WebGL scene; the
   buttons break it on purpose. "Too slow" and "Stalled" remember lite for 14 days, as the real site does, so the
   next load says "saved"; the bar's "Try 3D anyway" (?lite=0) clears it. */

const $ = <E extends Element = HTMLElement>(sel: string) => document.querySelector<E>(sel)!;
const params = new URLSearchParams(location.search);
const page = $(".page");
const status = $("[data-status]");

/* the check itself, timed */
const checks: LiteCheck[] = [];
const t0 = performance.now();
const reason = liteReason(params, checks);
const took = performance.now() - t0;
const list = $("[data-checks]");
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
$("[data-verdict]").textContent = `${reason ? `lite (${reason})` : "3D"} · checked in ${took.toFixed(0)} ms`;

let raf = 0;
let frames = 0;
let gl: WebGL2RenderingContext | null = null;
let stopStall = () => {};
const sims = [...document.querySelectorAll<HTMLButtonElement>("[data-sim]")];

function enterLite(why: LiteReason) {
  if (page.classList.contains("is-lite")) return;
  page.classList.add("is-lite");
  cancelAnimationFrame(raf);
  stopStall();
  showLiteBar(why, page);
  sims.forEach((b) => (b.disabled = true));
  status.textContent = why === "param" ? "Lite on request." : `Lite: ${WHY[why]}.`;
}

const VERT = `#version 300 es
void main() { gl_Position = vec4(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0, 0.0, 1.0); }`;
const FRAG = `#version 300 es
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
  const canvas = $<HTMLCanvasElement>(".page canvas");
  gl = canvas.getContext("webgl2");
  if (!gl) return enterLite("error");
  const g = gl;
  const prog = g.createProgram()!;
  for (const [type, src] of [[g.VERTEX_SHADER, VERT], [g.FRAGMENT_SHADER, FRAG]] as const) {
    const sh = g.createShader(type)!;
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
  /* the two ways a started scene gives up */
  canvas.addEventListener("webglcontextlost", () => cancelAnimationFrame(raf));
  watchContext(g, () => enterLite("context"));
  stopStall = watchStall(() => frames, () => { rememberLite(); enterLite("stall"); });
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const draw = (t: number) => {
    g.viewport(0, 0, canvas.width, canvas.height);
    g.useProgram(prog);
    g.uniform2f(uRes, canvas.width, canvas.height);
    g.uniform1f(uTime, still ? 0 : t / 1000);
    g.drawArrays(g.TRIANGLES, 0, 3);
    frames++;
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
  status.textContent = "3D is running.";
}

if (reason) enterLite(reason);
else start3d();

/* break it on purpose */
for (const b of sims) {
  b.addEventListener("click", () => {
    const sim = b.dataset.sim as LiteReason;
    if (sim === "context") {
      const ext = gl?.getExtension("WEBGL_lose_context");
      if (!ext) return enterLite("context");
      sims.forEach((s) => (s.disabled = true));
      status.textContent = "Context lost. Waiting 2.5 s for it to come back…";
      ext.loseContext();
      return;
    }
    if (sim === "slow" || sim === "stall") rememberLite();
    enterLite(sim);
    if (sim === "slow" || sim === "stall") status.textContent += " Remembered for 14 days: reload and the check says “saved”.";
  });
}
$("[data-reload]").addEventListener("click", () => location.reload());
