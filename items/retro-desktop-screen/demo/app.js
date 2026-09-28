// ../shelf/items/retro-desktop-screen/variants/ts/main.ts
import * as THREE3 from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// ../shelf/items/retro-desktop-screen/variants/ts/retro-screen.ts
import * as THREE from "three";

// ../shelf/items/retro-desktop-screen/variants/ts/retro-content.ts
var SAMPLE_CONTENT = {
  windowTitle: "Noa Linden | Home Page",
  address: "http://www.example.com/~noa/index.htm",
  site: "Noa's Home Page",
  tagline: "Interface Designer",
  heroLine: "Digital products  \u2022  Interfaces  \u2022  Systems",
  heroButtons: ["About", "Projects", "Contact"],
  sections: ["About me", "What I'm doing now", "Hobbies", "Contact"],
  profile: [
    ["Name", "Noa Linden"],
    ["Occupation", "Interface Designer"],
    ["Languages", "English, Dutch, a little Japanese"]
  ],
  hello: "Hi there! I'm Noa. I design calm software: forms that forgive typos, dashboards that fit on one screen and settings pages nobody has to read twice.",
  now: [
    "Right now I'm redrawing a train timetable app so it works with one thumb on a crowded platform.",
    "In the evenings: a tiny game about a lighthouse keeper, built one Saturday at a time."
  ],
  hobbies: [
    { icon: "game", text: "Pixel art and small games. One of them is almost finished." },
    { icon: "cube", text: "3D in Blender. Mostly teapots, honestly." },
    { icon: "spark", text: "Collecting interface manuals from the nineties." }
  ],
  quote: "If it needs a manual, it needs another sketch.",
  contacts: [
    ["E-mail", "hello@example.com"],
    ["Homepage", "www.example.com/~noa"],
    ["Webring", "Calm Interfaces Ring"]
  ],
  visitors: "000026",
  footer: ["Best viewed at 1024\xD7768 \xB7 Last updated: September 2026", "Made with Notepad and a lot of patience"]
};

// ../shelf/items/retro-desktop-screen/variants/ts/retro-screen.ts
var SW = 1024;
var SCREEN_ASPECT = 0.25 / 0.232;
var SH = Math.round(SW / SCREEN_ASPECT);
var RETRO_SCREEN_ASPECT = SCREEN_ASPECT;
var WIN = { x0: 26, y0: 22, x1: SW - 26, y1: SH - 66 };
var TITLE_H = 42;
var MENU_H = 28;
var ADDR_H = 36;
var STATUS_H = 28;
var SCROLL_W = 22;
var TASK_H = 52;
var PAGE = { x0: WIN.x0 + 6, y0: WIN.y0 + TITLE_H + MENU_H + ADDR_H + 2, x1: WIN.x1 - 6 - SCROLL_W, y1: WIN.y1 - STATUS_H - 4 };
var TRACK = { x0: PAGE.x1, y0: PAGE.y0 + SCROLL_W, x1: PAGE.x1 + SCROLL_W, y1: PAGE.y1 - SCROLL_W };
var PW = PAGE.x1 - PAGE.x0;
var K = 1.3;
var PWL = PW / K;
var VIEW_H = PAGE.y1 - PAGE.y0;
var UI = `Tahoma, Verdana, "Segoe UI", "DejaVu Sans", sans-serif`;
var BODY = `Verdana, Tahoma, "DejaVu Sans", sans-serif`;
var DISPLAY = `"Trebuchet MS", "Arial Black", Verdana, sans-serif`;
var LINK = "#0033cc";
var TEXT = "#1b1b1b";
var BEIGE = "#ece9d8";
var screenVertex = (
  /* glsl */
  `
#include <common>
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 transformed = position;
  #include <project_vertex>
}`
);
var screenFragment = (
  /* glsl */
  `
#include <common>
uniform sampler2D uChrome, uPage;
uniform float uTime, uCurve, uChroma, uCorner, uVignette, uVignetteSoft;
uniform float uScan, uScanCount, uFlicker, uAspect, uScroll, uView;
uniform vec4 uRect, uTrack;
uniform vec2 uScreenPx;
varying vec2 vUv;

vec3 screenAt(vec2 w) {
  vec4 chrome = texture2D(uChrome, w);
  vec2 cu = (w - uRect.xy) / (uRect.zw - uRect.xy);
  float inPage = step(0.0, cu.x) * step(cu.x, 1.0) * step(0.0, cu.y) * step(cu.y, 1.0);
  vec3 page = texture2D(uPage, vec2(cu.x, uScroll + clamp(cu.y, 0.0, 1.0) * uView)).rgb * inPage;
  vec3 col = mix(page, chrome.rgb, chrome.a);

  /* the scrollbar thumb, 2000s style: light blue with a frame and a grip */
  vec2 tu = (w - uTrack.xy) / (uTrack.zw - uTrack.xy);
  float room = 1.0 - uView;
  float top = room > 0.0 ? uScroll / room * room : 0.0;
  float inTrack = step(0.0, tu.x) * step(tu.x, 1.0) * step(top, tu.y) * step(tu.y, top + uView);
  vec2 px = vec2(tu.x, (tu.y - top) / max(uView, 1e-4)) * (uTrack.zw - uTrack.xy) * uScreenPx * vec2(1.0, uView);
  vec2 size = (uTrack.zw - uTrack.xy) * uScreenPx * vec2(1.0, uView);
  float edge = step(px.x, 1.5) + step(size.x - 1.5, px.x) + step(px.y, 1.5) + step(size.y - 1.5, px.y);
  vec3 thumb = mix(vec3(0.78, 0.85, 0.99), vec3(0.62, 0.73, 0.96), tu.x);
  float grip = step(abs(px.y - size.y * 0.5), 7.0) * step(0.5, fract((px.y - size.y * 0.5) / 3.0)) * step(abs(px.x - size.x * 0.5), 4.5);
  thumb = mix(thumb, vec3(0.52, 0.64, 0.92), grip);
  thumb = mix(thumb, vec3(0.44, 0.56, 0.86), min(1.0, edge));
  return mix(col, thumb, inTrack);
}

void main() {
  vec2 c = vUv - 0.5;
  /* the bulge of the glass: a quadratic term plus a weak quartic one, the edges bend more than the middle */
  float r2 = dot(c, c);
  vec2 w = 0.5 + c * (1.0 + uCurve * r2 * (1.0 + 1.6 * r2));

  /* The tube is a superellipse ("squircle"): real screens have no straight sides with rounded corners, the edge fades
     out smoothly. The power comes from uCorner: less rounding, closer to a square. */
  vec2 p = (w - 0.5) * 2.0;
  float n = clamp(0.9 / max(uCorner, 0.01), 4.0, 40.0);
  float shape = pow(pow(abs(p.x), n) + pow(abs(p.y), n), 1.0 / n);
  float d = (shape - 1.0) * 0.5;
  /* past the edge of the picture the plate is not drawn: the glass of the model shows */
  if (d > 0.004) discard;

  /* channels drift outwards from the centre, along the radius, more towards the edges */
  vec2 spread = c * (0.0016 + r2 * uChroma * 2.0);
  vec3 col = vec3(screenAt(w + spread).r, screenAt(w).g, screenAt(w - spread).b);

  /* scanlines: narrow dark gaps between bright rows, not an even sine */
  float row = abs(fract(w.y * uScanCount / 6.2831853) - 0.5) * 2.0;
  col *= 1.0 - uScan * 1.6 * smoothstep(0.55, 1.0, row);
  /* flicker from two unrelated frequencies, so it never reads as an even pulse */
  col *= 1.0 + (sin(uTime * 9.7) * 0.6 + sin(uTime * 23.3) * 0.4) * uFlicker;
  /* vignette along the ellipse of the screen, not a circle */
  float ell = length((w - 0.5) * vec2(1.0, 1.0 / max(uAspect, 0.01)) * 1.08);
  col *= 1.0 - smoothstep(uVignette - uVignetteSoft, uVignette + uVignetteSoft, ell);
  col *= 1.0 - smoothstep(-0.004, 0.004, d);

  gl_FragColor = vec4(col, 1.0);
  /* straight to the canvas this converts to sRGB; into a render target (post-processing after) it does nothing */
  #include <colorspace_fragment>
}`
);
var RetroScreen = class {
  constructor(content = SAMPLE_CONTENT) {
    this.content = content;
    this.chrome.width = SW;
    this.chrome.height = SH;
    this.page.width = PW;
    this.page.height = this.contentH;
    this.cg = this.chrome.getContext("2d");
    this.pg = this.page.getContext("2d");
    this.chromeTex = this.makeTexture(this.chrome);
    this.pageTex = this.makeTexture(this.page);
    const uv = (x, y) => [x / SW, y / SH];
    this.material = new THREE.ShaderMaterial({
      vertexShader: screenVertex,
      fragmentShader: screenFragment,
      uniforms: {
        uChrome: { value: this.chromeTex },
        uPage: { value: this.pageTex },
        uTime: { value: 0 },
        uCurve: { value: 0.1 },
        uChroma: { value: 4e-3 },
        uCorner: { value: 0.035 },
        uVignette: { value: 0.72 },
        uVignetteSoft: { value: 0.5 },
        uScan: { value: 0.035 },
        uScanCount: { value: 640 },
        uFlicker: { value: 8e-3 },
        uAspect: { value: SCREEN_ASPECT },
        uScroll: { value: 0 },
        uView: { value: 0.25 },
        uRect: { value: new THREE.Vector4(...uv(PAGE.x0, PAGE.y0), ...uv(PAGE.x1, PAGE.y1)) },
        uTrack: { value: new THREE.Vector4(...uv(TRACK.x0, TRACK.y0), ...uv(TRACK.x1, TRACK.y1)) },
        uScreenPx: { value: new THREE.Vector2(SW, SH) }
      }
    });
    this.drawChrome();
    this.drawPage();
    void document.fonts?.ready.then(() => {
      this.drawChrome();
      this.drawPage();
    });
  }
  content;
  material;
  chrome = document.createElement("canvas");
  page = document.createElement("canvas");
  cg;
  pg;
  chromeTex;
  pageTex;
  contentH = VIEW_H * 4;
  scroll = 0;
  scrollTo = 0;
  active = true;
  minute = -1;
  /* the first screen of the page: a banner and three buttons that scroll the page to their sections. Places of the
     buttons and of the sections are in logical page pixels, written by layout() */
  buttons = [];
  anchors = [];
  hover = -1;
  makeTexture(canvas2) {
    const t = new THREE.CanvasTexture(canvas2);
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false;
    t.anisotropy = 8;
    return t;
  }
  /** The page in hand: scrolling on. Out of focus it scrolls back to the top. */
  setActive(on) {
    this.active = on;
    if (!on) this.scrollTo = 0;
  }
  scrollBy(px) {
    if (!this.active) return;
    this.scrollTo = THREE.MathUtils.clamp(this.scrollTo + px, 0, Math.max(0, this.contentH - VIEW_H));
  }
  scrollPage(dir) {
    this.scrollBy(dir * VIEW_H * 0.85);
  }
  scrollHome(end) {
    this.scrollBy(end ? this.contentH : -this.contentH);
  }
  /** Height of the visible part of the page in strip pixels: for scrolling with a finger. */
  get viewHeight() {
    return VIEW_H;
  }
  update(time, dt) {
    const u = this.material.uniforms;
    u.uTime.value = time;
    this.scroll += (this.scrollTo - this.scroll) * (1 - Math.exp(-dt * (this.active ? 10 : 3)));
    u.uScroll.value = this.scroll / this.contentH;
    u.uView.value = Math.min(1, VIEW_H / this.contentH);
    if ((/* @__PURE__ */ new Date()).getMinutes() !== this.minute) this.drawChrome();
  }
  dispose() {
    this.chromeTex.dispose();
    this.pageTex.dispose();
    this.material.dispose();
  }
  /* ───────────────────────── chrome: wallpaper, window, taskbar ───────────────────────── */
  drawChrome() {
    const g = this.cg, c = this.content;
    this.minute = (/* @__PURE__ */ new Date()).getMinutes();
    g.clearRect(0, 0, SW, SH);
    const sky = g.createLinearGradient(0, 0, 0, SH);
    sky.addColorStop(0, "#2f6fd6");
    sky.addColorStop(0.55, "#8fc3f5");
    sky.addColorStop(1, "#cfe6fb");
    g.fillStyle = sky;
    g.fillRect(0, 0, SW, SH);
    g.fillStyle = "rgba(255,255,255,0.75)";
    for (const [x, y2, r] of [[160, 120, 60], [230, 100, 46], [760, 180, 70], [840, 160, 50]]) {
      g.beginPath();
      g.ellipse(x, y2, r * 1.8, r * 0.55, 0, 0, Math.PI * 2);
      g.fill();
    }
    const hill = g.createLinearGradient(0, SH * 0.5, 0, SH);
    hill.addColorStop(0, "#6fbf3c");
    hill.addColorStop(1, "#2f7a1c");
    g.fillStyle = hill;
    g.beginPath();
    g.moveTo(0, SH);
    g.quadraticCurveTo(SW * 0.35, SH * 0.48, SW, SH * 0.72);
    g.lineTo(SW, SH);
    g.fill();
    g.fillStyle = "rgba(0,0,0,0.28)";
    this.round(g, WIN.x0 + 6, WIN.y0 + 8, WIN.x1 - WIN.x0, WIN.y1 - WIN.y0, 10);
    g.fill();
    const frame = g.createLinearGradient(0, WIN.y0, 0, WIN.y0 + TITLE_H);
    frame.addColorStop(0, "#3d8cff");
    frame.addColorStop(0.12, "#0a5ee6");
    frame.addColorStop(0.6, "#0053e0");
    frame.addColorStop(1, "#0a44c2");
    g.fillStyle = "#0a4fd3";
    this.round(g, WIN.x0, WIN.y0, WIN.x1 - WIN.x0, WIN.y1 - WIN.y0, 10);
    g.fill();
    g.fillStyle = frame;
    this.roundTop(g, WIN.x0, WIN.y0, WIN.x1 - WIN.x0, TITLE_H, 10);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.fillRect(WIN.x0 + 8, WIN.y0 + 2, WIN.x1 - WIN.x0 - 16, 2);
    this.globe(g, WIN.x0 + 24, WIN.y0 + TITLE_H / 2, 11);
    g.font = `bold 19px ${UI}`;
    g.textBaseline = "middle";
    g.fillStyle = "rgba(0,0,40,0.55)";
    g.fillText(c.windowTitle, WIN.x0 + 45, WIN.y0 + TITLE_H / 2 + 2);
    g.fillStyle = "#fff";
    g.fillText(c.windowTitle, WIN.x0 + 44, WIN.y0 + TITLE_H / 2 + 1);
    const bs = 28, by = WIN.y0 + (TITLE_H - bs) / 2;
    ["min", "max", "close"].forEach((k, i) => {
      const bx = WIN.x1 - 10 - (3 - i) * (bs + 4) + 4;
      const grad = g.createLinearGradient(0, by, 0, by + bs);
      if (k === "close") {
        grad.addColorStop(0, "#f0a08a");
        grad.addColorStop(0.5, "#e0522e");
        grad.addColorStop(1, "#c7391b");
      } else {
        grad.addColorStop(0, "#7fb2ff");
        grad.addColorStop(0.5, "#2f76f0");
        grad.addColorStop(1, "#1c5ad8");
      }
      g.fillStyle = grad;
      this.round(g, bx, by, bs, bs, 5);
      g.fill();
      g.strokeStyle = "#fff";
      g.lineWidth = 1.5;
      this.round(g, bx + 0.75, by + 0.75, bs - 1.5, bs - 1.5, 5);
      g.stroke();
      g.lineWidth = 3;
      g.beginPath();
      if (k === "min") {
        g.moveTo(bx + 8, by + 19);
        g.lineTo(bx + 16, by + 19);
      }
      if (k === "max") {
        g.strokeRect(bx + 8, by + 8, 12, 11);
      }
      if (k === "close") {
        g.moveTo(bx + 9, by + 9);
        g.lineTo(bx + 19, by + 19);
        g.moveTo(bx + 19, by + 9);
        g.lineTo(bx + 9, by + 19);
      }
      g.stroke();
    });
    const bx0 = WIN.x0 + 4, bx1 = WIN.x1 - 4;
    g.fillStyle = BEIGE;
    g.fillRect(bx0, WIN.y0 + TITLE_H, bx1 - bx0, WIN.y1 - WIN.y0 - TITLE_H - 4);
    let y = WIN.y0 + TITLE_H;
    g.font = `15px ${UI}`;
    g.fillStyle = TEXT;
    let mx = bx0 + 12;
    for (const item of ["File", "Edit", "View", "Favorites", "Tools", "Help"]) {
      g.fillText(item, mx, y + MENU_H / 2 + 1);
      mx += g.measureText(item).width + 22;
    }
    g.fillStyle = "#c5c2b2";
    g.fillRect(bx0, y + MENU_H - 1, bx1 - bx0, 1);
    y += MENU_H;
    g.fillStyle = "#6d6d6d";
    g.font = `15px ${UI}`;
    g.fillText("Address", bx0 + 10, y + ADDR_H / 2 + 1);
    const ax = bx0 + 76, aw = bx1 - ax - 62;
    g.fillStyle = "#fff";
    g.fillRect(ax, y + 5, aw, ADDR_H - 10);
    g.strokeStyle = "#7f9db9";
    g.lineWidth = 1;
    g.strokeRect(ax + 0.5, y + 5.5, aw - 1, ADDR_H - 11);
    this.globe(g, ax + 14, y + ADDR_H / 2, 7);
    g.fillStyle = TEXT;
    g.fillText(c.address, ax + 28, y + ADDR_H / 2 + 1);
    const go = g.createLinearGradient(0, y + 6, 0, y + ADDR_H - 6);
    go.addColorStop(0, "#5fd45f");
    go.addColorStop(1, "#2a9a2a");
    g.fillStyle = go;
    this.round(g, bx1 - 54, y + 6, 22, ADDR_H - 12, 4);
    g.fill();
    g.fillStyle = "#fff";
    g.beginPath();
    g.moveTo(bx1 - 47, y + 12);
    g.lineTo(bx1 - 38, y + ADDR_H / 2);
    g.lineTo(bx1 - 47, y + ADDR_H - 12);
    g.fill();
    g.fillStyle = TEXT;
    g.fillText("Go", bx1 - 27, y + ADDR_H / 2 + 1);
    g.strokeStyle = "#7f9db9";
    g.lineWidth = 2;
    g.strokeRect(PAGE.x0 - 1, PAGE.y0 - 1, PAGE.x1 - PAGE.x0 + SCROLL_W + 2, PAGE.y1 - PAGE.y0 + 2);
    g.clearRect(PAGE.x0, PAGE.y0, PW, VIEW_H);
    g.fillStyle = "#f3f1e6";
    g.fillRect(TRACK.x0, PAGE.y0, SCROLL_W, VIEW_H);
    for (const [ay, up] of [[PAGE.y0, true], [PAGE.y1 - SCROLL_W, false]]) {
      const ag = g.createLinearGradient(TRACK.x0, 0, TRACK.x1, 0);
      ag.addColorStop(0, "#c8d6fb");
      ag.addColorStop(1, "#9fb8f2");
      g.fillStyle = ag;
      this.round(g, TRACK.x0 + 1, ay + 1, SCROLL_W - 2, SCROLL_W - 2, 3);
      g.fill();
      g.fillStyle = "#4d6185";
      g.beginPath();
      const cx = TRACK.x0 + SCROLL_W / 2, cy = ay + SCROLL_W / 2;
      if (up) {
        g.moveTo(cx - 5, cy + 3);
        g.lineTo(cx, cy - 3);
        g.lineTo(cx + 5, cy + 3);
      } else {
        g.moveTo(cx - 5, cy - 3);
        g.lineTo(cx, cy + 3);
        g.lineTo(cx + 5, cy - 3);
      }
      g.fill();
    }
    g.fillStyle = "#f3f1e6";
    g.fillRect(TRACK.x0 + 1, TRACK.y0, SCROLL_W - 2, TRACK.y1 - TRACK.y0);
    const sy = WIN.y1 - STATUS_H - 4;
    g.fillStyle = "#c5c2b2";
    g.fillRect(bx0, sy + 2, bx1 - bx0, 1);
    g.font = `14px ${UI}`;
    g.fillStyle = TEXT;
    g.textBaseline = "middle";
    g.fillText("Done", bx0 + 12, sy + STATUS_H / 2 + 3);
    g.fillText("Internet", bx1 - 90, sy + STATUS_H / 2 + 3);
    this.globe(g, bx1 - 106, sy + STATUS_H / 2 + 3, 7);
    const ty = SH - TASK_H;
    const bar = g.createLinearGradient(0, ty, 0, SH);
    bar.addColorStop(0, "#3c8cf3");
    bar.addColorStop(0.1, "#245edb");
    bar.addColorStop(0.9, "#1e55d0");
    bar.addColorStop(1, "#1941a5");
    g.fillStyle = bar;
    g.fillRect(0, ty, SW, TASK_H);
    const st = g.createLinearGradient(0, ty, 0, SH);
    st.addColorStop(0, "#5ec85e");
    st.addColorStop(0.5, "#3a9f3a");
    st.addColorStop(1, "#2c872c");
    g.fillStyle = st;
    g.beginPath();
    g.moveTo(0, ty);
    g.lineTo(130, ty);
    g.quadraticCurveTo(150, ty, 150, ty + 18);
    g.lineTo(150, SH);
    g.lineTo(0, SH);
    g.fill();
    g.font = `bold 22px ${UI}`;
    g.textBaseline = "middle";
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.fillText("Start", 50, ty + TASK_H / 2 + 2);
    g.fillStyle = "#fff";
    g.fillText("Start", 48, ty + TASK_H / 2);
    this.hillIcon(g, 26, ty + TASK_H / 2, 10);
    g.fillStyle = "#1e4fb8";
    this.round(g, 166, ty + 7, 250, TASK_H - 14, 4);
    g.fill();
    this.globe(g, 186, ty + TASK_H / 2, 9);
    g.font = `15px ${UI}`;
    g.fillStyle = "#fff";
    g.fillText(c.site, 204, ty + TASK_H / 2 + 1);
    g.fillStyle = "#0f8be8";
    g.fillRect(SW - 130, ty, 130, TASK_H);
    g.fillStyle = "rgba(255,255,255,0.25)";
    g.fillRect(SW - 130, ty, 1, TASK_H);
    const now = /* @__PURE__ */ new Date();
    g.fillStyle = "#fff";
    g.font = `16px ${UI}`;
    g.fillText(`${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`, SW - 64, ty + TASK_H / 2 + 1);
    this.leaf(g, SW - 104, ty + TASK_H / 2);
    this.chromeTex.needsUpdate = true;
  }
  /* ───────────────────────── the home page ───────────────────────── */
  drawPage() {
    const h = Math.min(4096, Math.ceil(this.layout(false) * K));
    if (h !== this.page.height) {
      this.page.height = h;
      this.contentH = h;
      this.scrollTo = Math.min(this.scrollTo, Math.max(0, h - VIEW_H));
      this.pageTex.dispose();
    }
    this.layout(true);
    this.pageTex.needsUpdate = true;
  }
  layout(paint) {
    const g = this.pg, c = this.content;
    const M = 34, inner = PWL - M * 2;
    g.setTransform(K, 0, 0, K, 0, 0);
    g.textBaseline = "alphabetic";
    g.textAlign = "left";
    if (paint) {
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, PWL, this.page.height / K);
    }
    const heroH = Math.round(VIEW_H / K);
    const hero = this.heroLayout(heroH);
    if (paint) this.paintHero(g, heroH, hero);
    this.buttons = hero.buttons.map((b, i) => ({ ...b, to: i }));
    let y = heroH + 36;
    this.anchors[0] = y - 46;
    y = this.sectionBar(g, c.sections[0], M, y, inner, paint);
    const tx = M, tw = inner;
    let ty = y;
    const labelW = 128, rowH = 44;
    for (const [k, v] of c.profile) {
      if (paint) {
        g.fillStyle = BEIGE;
        g.fillRect(tx, ty, labelW, rowH);
        g.fillStyle = "#fff";
        g.fillRect(tx + labelW, ty, tw - labelW, rowH);
        g.strokeStyle = "#aca899";
        g.lineWidth = 1;
        g.strokeRect(tx + 0.5, ty + 0.5, tw - 1, rowH);
        g.fillStyle = "#aca899";
        g.fillRect(tx + labelW, ty, 1, rowH);
        g.font = `bold 15px ${BODY}`;
        g.fillStyle = "#333";
        g.fillText(k, tx + 12, ty + 28);
        g.font = `16px ${BODY}`;
        g.fillStyle = TEXT;
        g.fillText(v, tx + labelW + 12, ty + 28);
      }
      ty += rowH;
    }
    ty += 18;
    g.font = `16px ${BODY}`;
    ty = this.wrap(g, c.hello, tx, ty + 6, tw, 26, paint, TEXT);
    y = ty + 22;
    this.anchors[1] = y - 46;
    y = this.sectionBar(g, c.sections[1], M, y, inner, paint);
    g.font = `17px ${BODY}`;
    for (const p of c.now) y = this.wrap(g, p, M, y + 4, inner, 28, paint, TEXT) + 12;
    y += 16;
    const noteH = 96;
    if (paint) {
      g.save();
      g.translate(PWL / 2, y + noteH / 2);
      g.rotate(-0.012);
      g.fillStyle = "rgba(0,0,0,0.14)";
      g.fillRect(-inner / 2 + 90 + 5, -noteH / 2 + 6, inner - 180, noteH);
      g.fillStyle = "#fff6a8";
      g.fillRect(-inner / 2 + 90, -noteH / 2, inner - 180, noteH);
      g.textAlign = "center";
      g.font = `bold 14px ${BODY}`;
      g.fillStyle = "#8a7a12";
      g.fillText("WORDS TO LIVE BY", 0, -18);
      g.font = `italic bold 22px ${DISPLAY}`;
      g.fillStyle = "#3a3208";
      g.fillText(`\u201C${c.quote}\u201D`, 0, 20);
      g.restore();
      g.textAlign = "left";
    }
    y += noteH + 40;
    y = this.sectionBar(g, c.sections[2], M, y, inner, paint);
    for (const h of c.hobbies) {
      if (paint) this.icon(g, h.icon, M + 18, y - 8);
      g.font = `16px ${BODY}`;
      y = this.wrap(g, h.text, M + 50, y, inner - 50, 25, paint, TEXT) + 14;
    }
    y += 12;
    this.anchors[2] = y - 46;
    y = this.sectionBar(g, c.sections[3], M, y, inner, paint);
    for (const [k, v] of c.contacts) {
      g.font = `bold 16px ${BODY}`;
      if (paint) {
        g.fillStyle = "#333";
        g.fillText(`${k}:`, M, y);
      }
      g.font = `16px ${BODY}`;
      if (paint) {
        g.fillStyle = LINK;
        g.fillText(v, M + 160, y);
        g.fillRect(M + 160, y + 3, g.measureText(v).width, 1.5);
      }
      y += 32;
    }
    y += 10;
    if (paint) {
      const bw = 230, bhh = 38;
      const bgd = g.createLinearGradient(0, y, 0, y + bhh);
      bgd.addColorStop(0, "#ffffff");
      bgd.addColorStop(1, "#dcd9c8");
      g.fillStyle = bgd;
      this.round(g, M, y, bw, bhh, 4);
      g.fill();
      g.strokeStyle = "#003c74";
      g.lineWidth = 1.5;
      this.round(g, M + 0.75, y + 0.75, bw - 1.5, bhh - 1.5, 4);
      g.stroke();
      g.font = `15px ${UI}`;
      g.fillStyle = TEXT;
      g.textAlign = "center";
      g.fillText("Sign my guestbook", M + bw / 2, y + 25);
      g.textAlign = "left";
      g.font = `15px ${BODY}`;
      g.fillStyle = "#555";
      g.fillText("You are visitor number", M + bw + 40, y + 25);
      let dx = M + bw + 40 + g.measureText("You are visitor number").width + 12;
      for (const d of c.visitors) {
        g.fillStyle = "#111";
        g.fillRect(dx, y + 4, 22, 30);
        g.font = `bold 20px "Courier New", monospace`;
        g.fillStyle = "#7dff5a";
        g.fillText(d, dx + 5, y + 26);
        dx += 25;
      }
    }
    y += 70;
    if (paint) this.bevelRule(g, M, y, inner);
    y += 34;
    g.font = `13px ${BODY}`;
    if (paint) {
      g.textAlign = "center";
      g.fillStyle = "#666";
      g.fillText(c.footer[0], PWL / 2, y);
      g.fillText(c.footer[1], PWL / 2, y + 22);
      g.textAlign = "left";
    }
    return y + 50;
  }
  /* ───────────────────────── the first screen ───────────────────────── */
  heroLayout(h) {
    const bw = 318, bh = 70, gap = 14;
    const bx = PWL - 30 - bw;
    const by0 = h - 30 - (bh * 3 + gap * 2);
    const photo = { x: 30, y: by0 - 4, w: bx - 30 - 24, h: bh * 3 + gap * 2 + 8 };
    return { photo, buttons: [0, 1, 2].map((i) => ({ x: bx, y: by0 + i * (bh + gap), w: bw, h: bh })) };
  }
  paintHero(g, h, hero) {
    const W = PWL, c = this.content;
    g.save();
    g.beginPath();
    g.rect(0, 0, W, h);
    g.clip();
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#0b2fb8");
    sky.addColorStop(0.42, "#1f63ec");
    sky.addColorStop(1, "#3f8cff");
    g.fillStyle = sky;
    g.fillRect(0, 0, W, h);
    const R = W * 1.35, cx = W / 2, cy = 236 + R;
    const halo = g.createRadialGradient(cx, cy, R - 6, cx, cy, R + 40);
    halo.addColorStop(0, "rgba(190,235,255,0.9)");
    halo.addColorStop(0.25, "rgba(120,200,255,0.55)");
    halo.addColorStop(1, "rgba(80,160,255,0)");
    g.fillStyle = halo;
    g.beginPath();
    g.arc(cx, cy, R + 40, 0, Math.PI * 2);
    g.fill();
    const earth = g.createLinearGradient(0, 236, 0, h);
    earth.addColorStop(0, "#5aa8ff");
    earth.addColorStop(0.18, "#2a74e6");
    earth.addColorStop(1, "#1a4fc4");
    g.fillStyle = earth;
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = "rgba(255,255,255,0.10)";
    for (const [x, y, rx, ry] of [[120, 262, 90, 7], [330, 256, 130, 6], [560, 266, 110, 8], [240, 300, 150, 10], [520, 320, 120, 9], [80, 360, 120, 12]]) {
      g.beginPath();
      g.ellipse(x, y, rx, ry, -0.04, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    g.fillStyle = "rgba(255,255,255,0.75)";
    for (let i = 0; i < 40; i++) g.fillRect(i * 97.3 % W, i * 53.7 % 220, 1.6, 1.6);
    g.fillStyle = "#ffe14a";
    for (const [x, y, r] of [[W * 0.33, 30, 9], [W * 0.72, 44, 12], [22, 150, 7], [W * 0.23, 170, 8], [W - 60, 186, 14], [W - 36, 216, 7]]) this.sparkle(g, x, y, r);
    g.save();
    g.translate(W / 2, 96);
    g.rotate(-0.05);
    g.strokeStyle = "#ffd23a";
    g.lineWidth = 3;
    g.lineCap = "round";
    for (const [a, b] of [[0.94, 1.32], [1.9, 2.08], [0.02, 0.2]]) {
      g.beginPath();
      g.ellipse(0, 0, W * 0.47, 44, 0, Math.PI * a, Math.PI * b);
      g.stroke();
    }
    g.restore();
    const name = c.profile[0][1];
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    let fs = 66;
    g.font = `italic 900 ${fs}px ${DISPLAY}`;
    while (g.measureText(name).width > W - 70 && fs > 30) {
      fs -= 2;
      g.font = `italic 900 ${fs}px ${DISPLAY}`;
    }
    g.lineJoin = "round";
    g.lineWidth = 12;
    g.strokeStyle = "#0a1a6a";
    g.strokeText(name, W / 2, 112);
    g.lineWidth = 5;
    g.strokeStyle = "#ff9a1a";
    g.strokeText(name, W / 2, 112);
    const gold = g.createLinearGradient(0, 112 - fs * 0.8, 0, 112);
    gold.addColorStop(0, "#fffbc4");
    gold.addColorStop(0.45, "#ffd42a");
    gold.addColorStop(1, "#ff8e14");
    g.fillStyle = gold;
    g.fillText(name, W / 2, 112);
    g.font = `bold 40px ${DISPLAY}`;
    g.lineWidth = 6;
    g.strokeStyle = "#0a2a8a";
    g.strokeText(c.tagline, W / 2, 160);
    g.fillStyle = "#ffffff";
    g.fillText(c.tagline, W / 2, 160);
    g.font = `16px "Courier New", "Lucida Console", monospace`;
    g.fillStyle = "#e8f0ff";
    g.fillText(c.heroLine, W / 2, 196);
    g.textAlign = "left";
    const p = hero.photo;
    g.fillStyle = "rgba(0,20,80,0.35)";
    this.round(g, p.x + 4, p.y + 6, p.w, p.h, 10);
    g.fill();
    const fr = g.createLinearGradient(0, p.y, 0, p.y + p.h);
    fr.addColorStop(0, "#f2f7ff");
    fr.addColorStop(1, "#bcd3f7");
    g.fillStyle = fr;
    this.round(g, p.x, p.y, p.w, p.h, 10);
    g.fill();
    g.save();
    this.round(g, p.x + 9, p.y + 9, p.w - 18, p.h - 18, 4);
    g.clip();
    this.avatar(g, p.x + 9, p.y + 9, p.w - 18, p.h - 18);
    g.restore();
    g.strokeStyle = "#5b86d6";
    g.lineWidth = 1.5;
    this.round(g, p.x + 9, p.y + 9, p.w - 18, p.h - 18, 4);
    g.stroke();
    g.fillStyle = "#ffe14a";
    this.sparkle(g, p.x + p.w - 46, p.y + 46, 10);
    this.sparkle(g, p.x + 34, p.y + p.h * 0.62, 8);
    const on = this.hover < 0 ? 0 : this.hover;
    hero.buttons.forEach((b, i) => {
      const sel = i === on;
      g.fillStyle = "rgba(0,20,80,0.35)";
      this.round(g, b.x + 3, b.y + 5, b.w, b.h, 10);
      g.fill();
      const bg = g.createLinearGradient(0, b.y, 0, b.y + b.h);
      if (sel) {
        bg.addColorStop(0, "#fff7a8");
        bg.addColorStop(0.5, "#ffe03a");
        bg.addColorStop(1, "#f5c400");
      } else {
        bg.addColorStop(0, "#ffffff");
        bg.addColorStop(0.55, "#eef3ff");
        bg.addColorStop(1, "#c9d9fa");
      }
      g.fillStyle = bg;
      this.round(g, b.x, b.y, b.w, b.h, 10);
      g.fill();
      g.strokeStyle = "#1c47c8";
      g.lineWidth = 3;
      this.round(g, b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3, 9);
      g.stroke();
      g.fillStyle = "rgba(255,255,255,0.6)";
      this.round(g, b.x + 8, b.y + 5, b.w - 16, 5, 3);
      g.fill();
      this.heroIcon(g, i, b.x + 42, b.y + b.h / 2);
      g.font = `bold 30px ${DISPLAY}`;
      g.fillStyle = "#101c7a";
      g.textBaseline = "middle";
      g.fillText(c.heroButtons[i], b.x + 84, b.y + b.h / 2 + 1);
      g.strokeStyle = "#101c7a";
      g.lineWidth = 3.5;
      g.lineJoin = "miter";
      g.lineCap = "butt";
      g.beginPath();
      g.moveTo(b.x + b.w - 34, b.y + b.h / 2 - 9);
      g.lineTo(b.x + b.w - 25, b.y + b.h / 2);
      g.lineTo(b.x + b.w - 34, b.y + b.h / 2 + 9);
      g.stroke();
      g.textBaseline = "alphabetic";
    });
    g.restore();
  }
  /** A drawn stand-in for a portrait: a bust against a warm sky. Swap it for drawImage with a real photo. */
  avatar(g, x, y, w, h) {
    const bg = g.createLinearGradient(0, y, 0, y + h);
    bg.addColorStop(0, "#ffd9a8");
    bg.addColorStop(1, "#f29a6b");
    g.fillStyle = bg;
    g.fillRect(x, y, w, h);
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.beginPath();
    g.arc(x + w * 0.76, y + h * 0.28, h * 0.15, 0, Math.PI * 2);
    g.fill();
    const cx = x + w / 2, s = h;
    g.fillStyle = "#3a2618";
    g.beginPath();
    g.ellipse(cx, y + h * 0.45, s * 0.2, s * 0.24, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#2f4f8f";
    g.beginPath();
    g.ellipse(cx, y + h * 1.08, s * 0.44, s * 0.4, 0, Math.PI, Math.PI * 2);
    g.fill();
    g.fillStyle = "#c98b62";
    g.fillRect(cx - s * 0.07, y + h * 0.52, s * 0.14, s * 0.2);
    g.beginPath();
    g.ellipse(cx, y + h * 0.46, s * 0.155, s * 0.185, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#3a2618";
    g.beginPath();
    g.ellipse(cx + s * 0.03, y + h * 0.32, s * 0.16, s * 0.075, -0.25, 0, Math.PI * 2);
    g.fill();
  }
  heroIcon(g, i, cx, cy) {
    g.lineWidth = 2.6;
    g.strokeStyle = "#101c7a";
    g.lineJoin = "round";
    if (i === 0) {
      g.fillStyle = "#6aa8ff";
      g.beginPath();
      g.arc(cx, cy - 8, 8, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(cx - 15, cy + 16);
      g.quadraticCurveTo(cx - 15, cy + 2, cx, cy + 2);
      g.quadraticCurveTo(cx + 15, cy + 2, cx + 15, cy + 16);
      g.closePath();
      g.fill();
      g.stroke();
    } else if (i === 1) {
      g.fillStyle = "#ffd23a";
      g.beginPath();
      g.moveTo(cx - 17, cy - 11);
      g.lineTo(cx - 6, cy - 11);
      g.lineTo(cx - 2, cy - 7);
      g.lineTo(cx + 17, cy - 7);
      g.lineTo(cx + 17, cy + 13);
      g.lineTo(cx - 17, cy + 13);
      g.closePath();
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(cx - 17, cy - 2);
      g.lineTo(cx + 17, cy - 2);
      g.stroke();
    } else {
      g.fillStyle = "#8fc0ff";
      g.beginPath();
      g.rect(cx - 17, cy - 11, 34, 23);
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(cx - 17, cy - 11);
      g.lineTo(cx, cy + 3);
      g.lineTo(cx + 17, cy - 11);
      g.stroke();
    }
  }
  /** a four-pointed sparkle, like the clip art of those years */
  sparkle(g, cx, cy, r) {
    g.beginPath();
    g.moveTo(cx, cy - r);
    g.quadraticCurveTo(cx, cy, cx + r, cy);
    g.quadraticCurveTo(cx, cy, cx, cy + r);
    g.quadraticCurveTo(cx, cy, cx - r, cy);
    g.quadraticCurveTo(cx, cy, cx, cy - r);
    g.fill();
  }
  /** A point on the screen (uv of the mesh, 0…1 from the top) → index of a first-screen button or −1. The bulge of the
      glass is taken into account exactly as the shader does it. */
  buttonAt(u, v) {
    const cx = u - 0.5, cy = v - 0.5, r2 = cx * cx + cy * cy;
    const k = 1 + this.material.uniforms.uCurve.value * r2 * (1 + 1.6 * r2);
    const x = (0.5 + cx * k) * SW - PAGE.x0, y = (0.5 + cy * k) * SH - PAGE.y0;
    if (x < 0 || y < 0 || x > PW || y > VIEW_H) return -1;
    const lx = x / K, ly = (y + this.scroll) / K;
    return this.buttons.findIndex((b) => lx >= b.x && lx <= b.x + b.w && ly >= b.y && ly <= b.y + b.h);
  }
  /** Hover: light the button up; true when the pointer is over a button. Pass −1, −1 when the pointer leaves. */
  hoverAt(u, v) {
    const i = this.active ? this.buttonAt(u, v) : -1;
    if (i !== this.hover) {
      this.hover = i;
      this.layout(true);
      this.pageTex.needsUpdate = true;
    }
    return i >= 0;
  }
  /** Click on a button: the page scrolls to its section; true when the click hit a button */
  clickAt(u, v) {
    if (!this.active) return false;
    const i = this.buttonAt(u, v);
    if (i < 0) return false;
    const y = (this.anchors[this.buttons[i].to] ?? 0) * K;
    this.scrollTo = THREE.MathUtils.clamp(y, 0, Math.max(0, this.contentH - VIEW_H));
    return true;
  }
  /* ───────────────────────── small drawing helpers ───────────────────────── */
  sectionBar(g, title, x, y, w, paint) {
    const h = 34;
    if (paint) {
      const bar = g.createLinearGradient(x, 0, x + w, 0);
      bar.addColorStop(0, "#1f4fbf");
      bar.addColorStop(0.7, "#6d9bf0");
      bar.addColorStop(1, "#ffffff");
      g.fillStyle = bar;
      g.fillRect(x, y, w, h);
      g.font = `bold 18px ${UI}`;
      g.fillStyle = "#fff";
      g.fillText(title, x + 12, y + 23);
    }
    return y + h + 30;
  }
  bevelRule(g, x, y, w) {
    g.fillStyle = "#a0a0a0";
    g.fillRect(x, y, w, 1);
    g.fillStyle = "#ffffff";
    g.fillRect(x, y + 1, w, 1);
  }
  wrap(g, text, x, y, maxW, lh, paint, color) {
    let line = "";
    if (paint) g.fillStyle = color;
    for (const word of text.split(" ")) {
      const cand = line ? `${line} ${word}` : word;
      if (g.measureText(cand).width > maxW && line) {
        if (paint) g.fillText(line, x, y);
        y += lh;
        line = word;
      } else line = cand;
    }
    if (line) {
      if (paint) g.fillText(line, x, y);
      y += lh;
    }
    return y;
  }
  round(g, x, y, w, h, r) {
    g.beginPath();
    g.roundRect(x, y, w, h, r);
  }
  roundTop(g, x, y, w, h, r) {
    g.beginPath();
    g.roundRect(x, y, w, h, [r, r, 0, 0]);
  }
  globe(g, cx, cy, r) {
    const grad = g.createRadialGradient(cx - r * 0.4, cy - r * 0.4, r * 0.1, cx, cy, r);
    grad.addColorStop(0, "#bfe6ff");
    grad.addColorStop(1, "#1a74d8");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.8)";
    g.lineWidth = Math.max(1, r / 7);
    g.beginPath();
    g.ellipse(cx, cy, r * 0.45, r, 0, 0, Math.PI * 2);
    g.moveTo(cx - r, cy);
    g.lineTo(cx + r, cy);
    g.stroke();
  }
  /** the icon at Start: a hill with a sun, no logos of real systems */
  hillIcon(g, cx, cy, s) {
    g.save();
    g.fillStyle = "#ffd76a";
    g.beginPath();
    g.arc(cx + s * 0.35, cy - s * 0.35, s * 0.42, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#e9f7d8";
    g.beginPath();
    g.moveTo(cx - s * 1.05, cy + s * 0.9);
    g.quadraticCurveTo(cx - s * 0.1, cy - s * 0.55, cx + s * 1.05, cy + s * 0.9);
    g.closePath();
    g.fill();
    g.restore();
  }
  leaf(g, cx, cy) {
    g.fillStyle = "#7ddc4a";
    g.beginPath();
    g.ellipse(cx, cy, 5, 10, 0.6, 0, Math.PI * 2);
    g.fill();
  }
  star(g, cx, cy, r) {
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2, rr = i % 2 ? r * 0.35 : r;
      g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.fill();
  }
  icon(g, kind, cx, cy) {
    if (kind === "game") {
      g.fillStyle = "#555";
      this.round(g, cx - 16, cy - 9, 32, 18, 8);
      g.fill();
      g.fillStyle = "#fff";
      g.fillRect(cx - 11, cy - 1.5, 8, 3);
      g.fillRect(cx - 8.5, cy - 4, 3, 8);
      g.fillStyle = "#e33";
      g.beginPath();
      g.arc(cx + 7, cy - 2, 2.5, 0, 7);
      g.fill();
      g.fillStyle = "#3c3";
      g.beginPath();
      g.arc(cx + 11, cy + 2, 2.5, 0, 7);
      g.fill();
    } else if (kind === "cube") {
      g.fillStyle = "#6aa8ff";
      g.beginPath();
      g.moveTo(cx, cy - 14);
      g.lineTo(cx + 13, cy - 7);
      g.lineTo(cx, cy);
      g.lineTo(cx - 13, cy - 7);
      g.fill();
      g.fillStyle = "#2f6fd6";
      g.beginPath();
      g.moveTo(cx - 13, cy - 7);
      g.lineTo(cx, cy);
      g.lineTo(cx, cy + 14);
      g.lineTo(cx - 13, cy + 7);
      g.fill();
      g.fillStyle = "#1c4aa8";
      g.beginPath();
      g.moveTo(cx + 13, cy - 7);
      g.lineTo(cx, cy);
      g.lineTo(cx, cy + 14);
      g.lineTo(cx + 13, cy + 7);
      g.fill();
    } else {
      g.fillStyle = "#ffb400";
      this.star(g, cx, cy, 15);
    }
  }
};

// ../shelf/items/retro-desktop-screen/variants/ts/monitor.ts
import * as THREE2 from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
function buildMonitor(screenMaterial, aspect) {
  const group = new THREE2.Group();
  const beige = new THREE2.MeshStandardMaterial({ color: "#d9d0b3", roughness: 0.58, envMapIntensity: 0.8 });
  const shade = new THREE2.MeshStandardMaterial({ color: "#c7bd9d", roughness: 0.66, envMapIntensity: 0.6 });
  const glass = new THREE2.MeshStandardMaterial({ color: "#0e1111", roughness: 0.22, envMapIntensity: 1.2 });
  const sw = 1.6, sh = sw / aspect;
  const part = (geometry, material, x, y, z) => {
    const mesh = new THREE2.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  part(new RoundedBoxGeometry(sw + 0.44, sh + 0.5, 0.36, 6, 0.09), beige, 0, 0, 0);
  part(new RoundedBoxGeometry(sw * 0.84, sh * 0.82, 0.95, 6, 0.16), shade, 0, 0.02, -0.6);
  part(new RoundedBoxGeometry(sw + 0.08, sh + 0.08, 0.04, 4, 0.05), glass, 0, 0.02, 0.17);
  part(new RoundedBoxGeometry(0.5, 0.34, 0.5, 4, 0.06), shade, 0, -sh / 2 - 0.38, -0.35);
  part(new RoundedBoxGeometry(1.2, 0.1, 0.82, 4, 0.045), beige, 0, -sh / 2 - 0.58, -0.3);
  const led = part(new THREE2.SphereGeometry(0.022, 12, 8), new THREE2.MeshStandardMaterial({ color: "#3a3", emissive: "#5f5", emissiveIntensity: 1.4 }), sw / 2 + 0.06, -sh / 2 - 0.13, 0.18);
  led.castShadow = false;
  const plane = new THREE2.PlaneGeometry(sw, sh);
  const uv = plane.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  const screen2 = new THREE2.Mesh(plane, screenMaterial);
  screen2.position.set(0, 0.02, 0.195);
  group.add(screen2);
  const size = new THREE2.Vector3(sw + 0.44, sh + 0.5 + 0.63, 1.5);
  return { group, screen: screen2, size, floorY: -sh / 2 - 0.63 };
}

// ../shelf/items/retro-desktop-screen/variants/ts/main.ts
var FOV = 26;
var canvas = document.querySelector("#scene");
var renderer = new THREE3.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setClearColor(0, 0);
renderer.toneMapping = THREE3.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
var scene = new THREE3.Scene();
var pmrem = new THREE3.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;
pmrem.dispose();
scene.add(new THREE3.HemisphereLight("#fff8ec", "#8a8270", 0.9));
var key = new THREE3.DirectionalLight("#fff3e0", 1.6);
key.position.set(-2.5, 4, 3.5);
key.castShadow = true;
key.shadow.mapSize.setScalar(1024);
key.shadow.radius = 6;
key.shadow.bias = -5e-4;
Object.assign(key.shadow.camera, { left: -2.5, right: 2.5, top: 2.5, bottom: -2.5, near: 0.5, far: 12 });
scene.add(key);
var screen = new RetroScreen();
var monitor = buildMonitor(screen.material, RETRO_SCREEN_ASPECT);
scene.add(monitor.group);
var floor = new THREE3.Mesh(new THREE3.PlaneGeometry(12, 12), new THREE3.ShadowMaterial({ opacity: 0.16 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = monitor.floorY;
floor.receiveShadow = true;
scene.add(floor);
var camera = new THREE3.PerspectiveCamera(FOV, 1, 0.1, 50);
var look = new THREE3.Vector3(0, -0.12, 0);
var resize = () => {
  const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const tan = Math.tan(THREE3.MathUtils.degToRad(FOV / 2));
  const distance = Math.max(monitor.size.y / (2 * tan), monitor.size.x / (2 * tan * camera.aspect)) * 1.08;
  camera.position.set(distance * 0.12, distance * 0.1, distance);
  camera.lookAt(look);
  camera.updateProjectionMatrix();
};
new ResizeObserver(resize).observe(canvas);
resize();
var raycaster = new THREE3.Raycaster();
var ndc = new THREE3.Vector2();
var screenUv = (event) => {
  const r = canvas.getBoundingClientRect();
  ndc.set((event.clientX - r.left) / r.width * 2 - 1, -((event.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObject(monitor.screen, false)[0]?.uv ?? null;
};
var drag = null;
canvas.addEventListener("pointermove", (event) => {
  if (drag && event.pointerId === drag.id) {
    const px = monitor.screen.geometry.parameters.height / (2 * Math.tan(THREE3.MathUtils.degToRad(FOV / 2)) * camera.position.length()) * canvas.clientHeight;
    screen.scrollBy((drag.y - event.clientY) * screen.viewHeight / Math.max(1, px));
    drag.y = event.clientY;
    return;
  }
  const uv = screenUv(event);
  canvas.style.cursor = screen.hoverAt(uv ? uv.x : -1, uv ? uv.y : -1) ? "pointer" : "default";
});
canvas.addEventListener("pointerleave", () => {
  screen.hoverAt(-1, -1);
  canvas.style.cursor = "default";
});
canvas.addEventListener("pointerdown", (event) => {
  if (event.pointerType !== "mouse" && screenUv(event)) {
    drag = { y: event.clientY, id: event.pointerId };
    canvas.setPointerCapture(event.pointerId);
  }
});
var endDrag = () => {
  drag = null;
};
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("click", (event) => {
  const uv = screenUv(event);
  if (uv) screen.clickAt(uv.x, uv.y);
});
canvas.addEventListener("wheel", (event) => {
  if (!screenUv(event)) return;
  event.preventDefault();
  screen.scrollBy(event.deltaY * (event.deltaMode === 1 ? 40 : 1) * 1.2);
}, { passive: false });
canvas.addEventListener("keydown", (event) => {
  const keys = {
    PageDown: () => screen.scrollPage(1),
    PageUp: () => screen.scrollPage(-1),
    " ": () => screen.scrollPage(event.shiftKey ? -1 : 1),
    ArrowDown: () => screen.scrollBy(60),
    ArrowUp: () => screen.scrollBy(-60),
    Home: () => screen.scrollHome(false),
    End: () => screen.scrollHome(true)
  };
  if (keys[event.key]) {
    event.preventDefault();
    keys[event.key]();
  }
});
var last = performance.now();
var start = last;
renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1e3);
  last = now;
  screen.update((now - start) / 1e3, dt);
  renderer.render(scene, camera);
});
