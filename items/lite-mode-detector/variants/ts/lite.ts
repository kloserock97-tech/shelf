/* Lite version: who gets the page without 3D, and the quiet bar that says so.
   Who: browsers without WebGL2 (corporate laptops and VDI with acceleration switched off), software rendering
   (SwiftShader, llvmpipe: the hill ran at 0.2 fps there), devices where the scene doesn't fit even the lowest
   quality tier, and a WebGL context that was lost and never came back.
   What they see: the same page with ordinary scrolling, and a quiet bar at the bottom: "Lite version" with a
   "Try 3D anyway" link. */

const KEY = "lite-mode";
/* the decision is kept for two weeks: a device that was too slow once is probably still too slow tomorrow */
const TTL = 14 * 24 * 3600 * 1000;
/** even the lowest quality tier takes longer than this (under 22 fps, ~13 on scroll): lite is kinder */
export const TOO_SLOW_MS = 45;

export type LiteReason = "param" | "saved" | "webgl" | "software" | "slow" | "context" | "stall" | "error";
export type LiteCheck = { name: string; result: string; ok: boolean };

export const WHY: Record<LiteReason, string> = {
  webgl: "3D is off in this browser",
  software: "3D would be too slow on this device",
  slow: "3D was too slow on this device",
  saved: "3D was too slow on this device last time",
  context: "the 3D view crashed",
  stall: "3D didn't start",
  error: "3D didn't start",
  param: "",
};

/** The reason to open the lite version right away, or null: try 3D. Pass `checks` to collect every step. */
export function liteReason(params: URLSearchParams, checks?: LiteCheck[]): LiteReason | null {
  const note = (name: string, result: string, ok: boolean) => checks?.push({ name, result, ok });
  const q = params.get("lite");
  if (q === "1") { note("?lite", "1, lite on request", false); return "param"; }
  if (q === "0") {
    try { localStorage.removeItem(KEY); } catch { /* private mode */ }
    note("?lite", "0, 3D on request, the saved decision is cleared", true);
    return null;
  }
  note("?lite", "not set", true);
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as { at: number } | null;
    if (saved && Date.now() - saved.at < TTL) {
      const left = Math.ceil((TTL - (Date.now() - saved.at)) / 864e5);
      note("Saved decision", `lite, ${left} ${left === 1 ? "day" : "days"} left`, false);
      return "saved";
    }
  } catch { /* nothing saved, or an old format */ }
  note("Saved decision", "none", true);
  /* failIfMajorPerformanceCaveat: the browser won't hand out a context if the CPU would be doing the drawing */
  const probe = document.createElement("canvas");
  const gl = probe.getContext("webgl2", { failIfMajorPerformanceCaveat: true });
  if (!gl) {
    note("WebGL2 on the GPU", "refused", false);
    const any = document.createElement("canvas").getContext("webgl2");
    if (!any) { note("WebGL2 at all", "no", false); return "webgl"; }
    note("WebGL2 at all", "yes, on the CPU", false);
    any.getExtension("WEBGL_lose_context")?.loseContext();
    return "software";
  }
  note("WebGL2 on the GPU", "granted", true);
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
  /* every probe context is released at once: browsers cap how many live contexts a page may hold */
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  const software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
  note("Renderer", renderer || "hidden by the browser", !software);
  return software ? "software" : null;
}

/** Remember "lite" for 14 days. Worth it after "slow" and "stall", not after a lost context: that one is a fluke. */
export function rememberLite() {
  try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now() })); } catch { /* private mode */ }
}

/** A lost context usually comes back within a second, then the page reloads. Still lost after 2.5 s: give up. */
export function watchContext(gl: WebGL2RenderingContext | WebGLRenderingContext, onGiveUp: () => void) {
  const canvas = gl.canvas as HTMLCanvasElement;
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    window.setTimeout(() => { if (gl.isContextLost()) onGiveUp(); }, 2500);
  });
  canvas.addEventListener("webglcontextrestored", () => location.reload());
}

/** Not a single frame in 14 s: the scene didn't start. A tab in the background draws nothing, that isn't a stall. */
export function watchStall(framesDrawn: () => number, onStall: () => void, ms = 14000) {
  let wasHidden = document.hidden;
  const onVisibility = () => { if (document.hidden) wasHidden = true; };
  document.addEventListener("visibilitychange", onVisibility);
  const timer = window.setTimeout(() => {
    document.removeEventListener("visibilitychange", onVisibility);
    if (framesDrawn() === 0 && !wasHidden) onStall();
  }, ms);
  return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", onVisibility); };
}

/** The quiet bar: "Lite version · why" and a way back. ?lite=0 also clears the saved decision. */
export function showLiteBar(reason: LiteReason, parent: HTMLElement = document.body, text = { bar: "Lite version", back: "Try 3D anyway" }) {
  const bar = document.createElement("p");
  bar.className = "lite-bar";
  bar.setAttribute("role", "status");
  const why = WHY[reason];
  const label = document.createElement("span");
  label.textContent = why ? `${text.bar} · ${why}` : text.bar;
  const link = document.createElement("a");
  link.href = "?lite=0";
  link.textContent = text.back;
  bar.append(label, " ", link);
  parent.appendChild(bar);
  return bar;
}
