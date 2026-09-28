/* A diorama for a made-up product, "Northwind Board" — a team board. Layout in pixels of the 1672×941 frame:
 * the main panel (the product screen, white) in the middle, satellites on smoky glass around it, orbits, ribbons,
 * links, sparks and rocks. All content is drawn with Canvas 2D at the resolution it takes on screen. */
import { createDiorama, type DioramaScene } from "./kit";
import { MUTED, avatar, chip, font, hr, loadFonts, rr, sheet, step, text, type Ctx } from "./draw";

const HUB: [number, number] = [860, 440];
const GOLD = "#ffd08a";
const ACCENT = "#2f6fe0";
const BG = "rgba(34, 30, 24, 0.62)";
const PEOPLE: [string, string][] = [["AK", "#ffd9a8"], ["MR", "#bfe3cf"], ["JL", "#c9d7ff"], ["SO", "#f6c6d2"], ["TN", "#e6dcc3"]];

/* ── the main panel: the product screen ── */
const MAIN = { w: 640, h: 470 };
async function paintMain(scale: number) {
  await loadFonts();
  const c = document.createElement("canvas");
  c.width = Math.round(MAIN.w * scale); c.height = Math.round(MAIN.h * scale);
  const ctx = c.getContext("2d")!;
  ctx.scale(scale, scale);
  rr(ctx, 0, 0, MAIN.w, MAIN.h, 24); ctx.fillStyle = "#fbfaf8"; ctx.fill();
  rr(ctx, 0, 0, MAIN.w, MAIN.h, 24); ctx.clip();
  const dark = "#1d1d1f", soft = "rgba(29,29,31,0.5)";
  /* header: mark, product, sprint tab, people, share */
  rr(ctx, 22, 20, 26, 26, 8); ctx.fillStyle = ACCENT; ctx.fill();
  text(ctx, "Northwind Board", 58, 39, { w: 600, size: 16, color: dark });
  chip(ctx, "Sprint 14", 206, 21, { bg: "rgba(47,111,224,0.1)", color: ACCENT, size: 12 });
  PEOPLE.slice(0, 3).forEach(([ini, col], i) => avatar(ctx, 486 + i * 20, 33, 12, ini, col, "#fbfaf8"));
  rr(ctx, 548, 20, 70, 26, 13); ctx.fillStyle = dark; ctx.fill();
  text(ctx, "Share", 583, 38, { w: 500, size: 12, color: "#fff", align: "center" });
  ctx.fillStyle = "rgba(29,29,31,0.08)"; ctx.fillRect(0, 62, MAIN.w, 1);
  /* four columns of tasks */
  const cols: [string, number, [string, string][]][] = [
    ["To do", 4, [["Design", "#f3b562"], ["API", "#8fb3f5"], ["Copy", "#b8a3f0"]]],
    ["In progress", 3, [["Search", "#7fd1ae"], ["Design", "#f3b562"]]],
    ["Review", 2, [["Filters", "#8fb3f5"], ["QA", "#f39aa8"]]],
    ["Done", 6, [["Onboarding", "#7fd1ae"], ["Export", "#b8a3f0"], ["API", "#8fb3f5"]]],
  ];
  const cw = 138, gap = 12, x0 = 22, y0 = 80;
  cols.forEach(([name, n, cards], i) => {
    const x = x0 + i * (cw + gap);
    text(ctx, name, x + 2, y0 + 12, { w: 600, size: 12, color: dark });
    ctx.font = font(600, 12);
    text(ctx, String(n), x + 8 + ctx.measureText(name).width, y0 + 12, { w: 500, size: 12, color: soft });
    cards.forEach(([tag, col], k) => {
      const y = y0 + 26 + k * 84;
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.08)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
      rr(ctx, x, y, cw, 74, 12); ctx.fillStyle = "#fff"; ctx.fill(); ctx.restore();
      rr(ctx, x + 10, y + 10, ctx.measureText(tag).width + 18, 18, 9); ctx.fillStyle = col + "55"; ctx.fill();
      text(ctx, tag, x + 19, y + 23, { w: 500, size: 10.5, color: dark });
      ctx.fillStyle = "rgba(29,29,31,0.16)";
      rr(ctx, x + 10, y + 38, cw - 34, 6, 3); ctx.fill();
      rr(ctx, x + 10, y + 50, cw - 64, 6, 3); ctx.fill();
      const [ini, pc] = PEOPLE[(i * 2 + k) % PEOPLE.length];
      avatar(ctx, x + cw - 18, y + 56, 8, ini, pc, "#fff");
      if (i === 3) { ctx.fillStyle = "#7fd1ae"; ctx.beginPath(); ctx.arc(x + cw - 16, y + 18, 5, 0, Math.PI * 2); ctx.fill(); }
    });
  });
  /* sprint progress */
  text(ctx, "Sprint progress", 22, 440, { w: 500, size: 12, color: soft });
  rr(ctx, 130, 431, 420, 10, 5); ctx.fillStyle = "rgba(29,29,31,0.08)"; ctx.fill();
  rr(ctx, 130, 431, 420 * 0.68, 10, 5); ctx.fillStyle = ACCENT; ctx.fill();
  text(ctx, "68 %", 566, 441, { w: 600, size: 12, color: dark });
  return c;
}

/* ── satellites on smoky glass ── */
const paintVelocity = (s: number) => sheet(300, 180, s, (ctx: Ctx) => {
  text(ctx, "Velocity", 20, 34, { w: 600, size: 17 });
  text(ctx, "42 pts", 20, 66, { w: 600, size: 26 });
  text(ctx, "per sprint", 108, 66, { size: 12, color: MUTED });
  [22, 30, 27, 35, 38, 42].forEach((v, i) => {
    const h = v * 1.8, x = 20 + i * 44;
    rr(ctx, x, 160 - h, 30, h, 6);
    ctx.fillStyle = i === 5 ? GOLD : "rgba(255,255,255,0.2)"; ctx.fill();
  });
}, BG, 20);

const paintTeam = (s: number) => sheet(300, 150, s, (ctx: Ctx) => {
  text(ctx, "Team", 20, 34, { w: 600, size: 17 });
  chip(ctx, "5 online", 72, 17, { bg: "rgba(127,209,174,0.18)", color: "#bdf0d9", size: 11, dot: "#7fd1ae", h: 22 });
  PEOPLE.forEach(([ini, col], i) => avatar(ctx, 42 + i * 54, 92, 20, ini, col));
  text(ctx, "2 reviewing · 3 building", 20, 136, { size: 12, color: MUTED });
}, BG, 20);

const paintCycle = (s: number) => sheet(300, 170, s, (ctx: Ctx) => {
  text(ctx, "Cycle time", 20, 34, { w: 600, size: 17 });
  text(ctx, "2.4 days", 20, 66, { w: 600, size: 24 });
  chip(ctx, "−18 %", 128, 48, { bg: "rgba(127,209,174,0.18)", color: "#bdf0d9", size: 12 });
  ctx.strokeStyle = GOLD; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath();
  [[20, 96], [66, 104], [112, 100], [158, 122], [204, 128], [250, 146], [280, 150]].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  hr(ctx, 20, 156, 260);
}, BG, 20);

const paintReleases = (s: number) => sheet(260, 196, s, (ctx: Ctx) => {
  text(ctx, "Releases", 20, 34, { w: 600, size: 17 });
  const rows: [string, boolean][] = [["v2.3 · Search", true], ["v2.4 · Filters", true], ["v2.5 · Export", false]];
  rows.forEach(([t, done], i) => {
    const y = 70 + i * 42;
    step(ctx, 34, y, 11, done, i + 1, "#7fd1ae");
    text(ctx, t, 56, y + 5, { size: 14, color: done ? "#f4efe6" : MUTED });
  });
}, BG, 20);

const paintBlockers = (s: number) => sheet(220, 92, s, (ctx: Ctx) => {
  chip(ctx, "3 blockers", 18, 18, { bg: "rgba(243,154,168,0.18)", color: "#ffd0d8", size: 13, dot: "#f39aa8", h: 26 });
  text(ctx, "need a decision today", 20, 72, { size: 12.5, color: MUTED });
}, BG, 18);

const paintTile = (label: string, value: string) => (s: number) => sheet(120, 90, s, (ctx: Ctx) => {
  text(ctx, value, 16, 46, { w: 600, size: 26 });
  text(ctx, label, 16, 70, { size: 12, color: MUTED });
}, BG, 14);

export function createBoardScene(canvas: HTMLCanvasElement): DioramaScene {
  return createDiorama(canvas, {
    hub: HUB,
    box: [280, 140, 1470, 740],
    async build(k) {
      /* light: a golden haze behind, a warm glow under the main panel, spots by the satellites */
      k.glow(880, 440, -220, 1250, 820, "#ff9a3c", 0.44);
      k.glow(860, 640, -20, 720, 220, "#ffb060", 0.75);
      k.glow(500, 420, -160, 520, 460, "#ffaa55", 0.2);
      k.glow(1250, 440, -160, 520, 520, "#ffaa55", 0.2);
      k.glow(870, 300, -260, 900, 300, "#ffd28a", 0.16);

      k.orbit({ c: [845, 425], r: 560, tilt: 21, rotZ: -5, from: -10, to: 350, opacity: 0.6, fade: (t) => 0.35 + 0.65 * Math.sin(Math.PI * t), delay: 0.35 });
      k.orbit({ c: [880, 395], r: 510, tilt: 18, rotZ: 7, from: 170, to: 530, opacity: 0.6, fade: (t) => 0.25 + 0.75 * Math.sin(Math.PI * t), delay: 0.5 });

      /* ribbons leave the main panel and go behind the satellites */
      k.band([[700, 400, -60], [620, 380, -30], [560, 392, -10], [500, 420, -40], [430, 455, -90]], 30, 0.9, "#ef6f4c", 0.25);
      k.band([[700, 440, -60], [624, 430, -30], [566, 446, -10], [506, 478, -40], [440, 515, -100]], 20, 1.2, "#dc5a3a", 0.32);
      k.band([[1020, 470, -60], [1110, 450, -20], [1190, 405, -10], [1262, 335, -30], [1316, 250, -60]], 28, 1.1, "#ef6f4c", 0.3);
      k.band([[1020, 505, -60], [1116, 490, -20], [1204, 452, -20], [1280, 380, -40], [1342, 290, -80]], 18, 0.8, "#dc5a3a", 0.38);

      k.sparkField([850, 430], [620, 280], 110, "#ffc070", [[640, 210, 12], [1045, 212, 12], [1400, 575, 12], [460, 635, 9], [300, 545, 9], [950, 650, 10]]);
      k.rocks([[345, 640, 30, 60], [872, 712, 20, 40], [1010, 690, 14, 20], [540, 650, 11, 0], [620, 600, 8, -40], [1290, 150, 9, -60], [1560, 170, 10, -80]]);

      const ts = k.texScale();
      /* the main panel: 430 px of the frame wide, 17 px of glass around it, and a back plate */
      const iw = 430, ih = (iw * MAIN.h) / MAIN.w;
      const mainTex = k.canvasTexture(await paintMain((iw / MAIN.w) * ts * 2));
      k.card({ size: [iw + 30, ih + 30], radius: 32, glass: 0.45, halo: 0, c: [898, 452], z: -45, r: [-6, 10, -8], delay: 0.08, amp: 3, order: 1 });
      k.card({ map: mainTex, size: [iw + 34, ih + 34], inner: [iw, ih], radius: 34, innerRadius: 22, glass: 0.7, warm: 1, halo: 0.42, margin: 70, c: [862, 436], z: 0, r: [-6, 10, -8], delay: 0, amp: 3, order: 5 });

      /* satellites: centre, width in frame px, turn, depth */
      const sat = async (paint: (s: number) => Promise<HTMLCanvasElement>, w0: number, h0: number, w: number, c: [number, number], z: number, r: [number, number, number], delay: number, amp: number) => {
        const cv = await paint((w / w0) * ts * 2);
        const h = (w * h0) / w0;
        k.card({ map: k.canvasTexture(cv), size: [w + 12, h + 12], inner: [w, h], radius: 20, innerRadius: 16, glass: 0.5, tint: "#6a5a3a", halo: 0.3, margin: 40, c, z, r, delay, amp, order: 3 });
      };
      await sat(paintVelocity, 300, 180, 236, [468, 268], -30, [4, 14, -8], 0.22, 5);
      await sat(paintTeam, 300, 150, 236, [470, 520], 10, [-4, 16, -6], 0.29, 6);
      await sat(paintCycle, 300, 170, 230, [1262, 262], -30, [4, -16, 4], 0.36, 5);
      await sat(paintReleases, 260, 196, 200, [1318, 492], -40, [0, -18, 2], 0.43, 7);
      await sat(paintBlockers, 220, 92, 176, [1170, 676], 20, [-4, -12, -4], 0.5, 8);

      /* small tiles, far and near, softened — a depth of field */
      const tiles: [string, string, [number, number], number, [number, number, number], number][] = [
        ["open tasks", "18", [300, 420], -120, [0, 18, -6], 2.2],
        ["merged", "27", [1440, 330], -140, [0, -20, 6], 1.6],
        ["reviews", "9", [660, 690], 90, [-10, 8, 6], 2.4],
      ];
      for (const [i, [label, value, c, z, r, blur]] of tiles.entries()) {
        const cv = await paintTile(label, value)((96 / 120) * ts * 2);
        k.card({ map: k.canvasTexture(cv), size: [102, 78], inner: [96, 72], radius: 12, innerRadius: 10, glass: 0.4, tint: "#6a5a3a", blur, halo: 0.12, margin: 20, c, z, r, delay: 0.35 + i * 0.05, amp: 6, order: z > 0 ? 6 : 2 });
      }

      /* gold links from the panel to the satellites */
      k.curve([[640, 330, -20], [600, 300, -25], [590, 280, -30]], { color: GOLD, width: 1.6, delay: 0.7 });
      k.curve([[640, 500, -20], [610, 515, -10], [590, 520, 10]], { color: GOLD, width: 1.6, delay: 0.75 });
      k.curve([[1085, 320, -20], [1120, 290, -25], [1146, 275, -30]], { color: GOLD, width: 1.6, delay: 0.8 });
      k.curve([[1085, 520, -20], [1160, 510, -30], [1216, 500, -40]], { color: GOLD, width: 1.6, delay: 0.85 });
      k.curve([[1030, 600, -10], [1060, 640, 0], [1082, 668, 20]], { color: GOLD, width: 1.6, delay: 0.9 });
    },
  });
}
