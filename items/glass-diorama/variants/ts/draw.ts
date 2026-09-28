/* Canvas 2D primitives for satellite cards: dark smoky glass, light text. A card is drawn at the resolution it
 * will take on screen (scale), sizes are in layout units — so text stays sharp instead of a stretched bitmap. */
export type Ctx = CanvasRenderingContext2D;
export const FONT = "Onest";
export const INK = "#f4efe6";
export const MUTED = "rgba(244, 239, 230, 0.62)";
export const LINE = "rgba(255, 255, 255, 0.14)";
export const font = (w: number, size: number) => `${w} ${size}px "${FONT}", system-ui, sans-serif`;
export const rr = (ctx: Ctx, x: number, y: number, w: number, h: number, r: number | number[]) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };

let fontsReady: Promise<unknown> | null = null;
/** the page declares the font (a stylesheet); a canvas only gets it after an explicit load */
export const loadFonts = () => (fontsReady ??= Promise.all(["400", "500", "600"].map((w) => document.fonts.load(`${w} 16px "${FONT}"`))).catch(() => undefined));

export function wrap(ctx: Ctx, text: string, maxW: number) {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(" ")) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

/** a card canvas: the background is dark glass (or your colour), drawing is in layout units */
export async function sheet(w: number, h: number, scale: number, draw: (ctx: Ctx) => void | Promise<void>, bg: string | null = "rgba(24, 22, 18, 0.62)", r = 18) {
  await loadFonts();
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  const ctx = c.getContext("2d")!;
  ctx.scale(scale, scale);
  if (bg) { rr(ctx, 0, 0, w, h, r); ctx.fillStyle = bg; ctx.fill(); }
  await draw(ctx);
  return c;
}

export function text(ctx: Ctx, s: string, x: number, y: number, o: { w?: number; size?: number; color?: string; align?: CanvasTextAlign } = {}) {
  ctx.font = font(o.w ?? 400, o.size ?? 14);
  ctx.fillStyle = o.color ?? INK;
  ctx.textAlign = o.align ?? "left";
  ctx.fillText(s, x, y);
  ctx.textAlign = "left";
  return ctx.measureText(s).width;
}
/** wrapped lines; returns y under the last line */
export function para(ctx: Ctx, s: string, x: number, y: number, maxW: number, o: { w?: number; size?: number; color?: string; lh?: number; max?: number } = {}) {
  ctx.font = font(o.w ?? 400, o.size ?? 14);
  ctx.fillStyle = o.color ?? INK;
  for (const l of wrap(ctx, s, maxW).slice(0, o.max ?? 99)) { ctx.fillText(l, x, y); y += o.lh ?? (o.size ?? 14) * 1.4; }
  return y;
}
export function chip(ctx: Ctx, s: string, x: number, y: number, o: { bg: string; color: string; size?: number; dot?: string; h?: number }) {
  const size = o.size ?? 13, h = o.h ?? 24;
  ctx.font = font(500, size);
  const w = ctx.measureText(s).width + (o.dot ? 30 : 20);
  rr(ctx, x, y, w, h, h / 2); ctx.fillStyle = o.bg; ctx.fill();
  if (o.dot) { ctx.beginPath(); ctx.arc(x + 13, y + h / 2, 4, 0, Math.PI * 2); ctx.fillStyle = o.dot; ctx.fill(); }
  ctx.fillStyle = o.color; ctx.fillText(s, x + (o.dot ? 22 : 10), y + h / 2 + size * 0.36);
  return w;
}
export function hr(ctx: Ctx, x: number, y: number, w: number) {
  ctx.strokeStyle = LINE; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y + 0.5); ctx.lineTo(x + w, y + 0.5); ctx.stroke();
}
/** a tick in a circle, or a step number */
export function step(ctx: Ctx, x: number, y: number, r: number, done: boolean, n: number, color: string) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  if (done) { ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = "#10180e"; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(x - r * 0.4, y); ctx.lineTo(x - r * 0.1, y + r * 0.32); ctx.lineTo(x + r * 0.42, y - r * 0.3); ctx.stroke(); }
  else { ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.lineWidth = 1.5; ctx.stroke(); text(ctx, String(n), x, y + 5, { size: 13, color: MUTED, align: "center" }); }
}
/** an avatar: a circle with initials */
export function avatar(ctx: Ctx, x: number, y: number, r: number, initials: string, bg: string, ring = "rgba(24,22,18,0.9)") {
  ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2); ctx.fillStyle = ring; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = bg; ctx.fill();
  text(ctx, initials, x, y + r * 0.34, { w: 600, size: r * 0.9, color: "#1b1712", align: "center" });
}
