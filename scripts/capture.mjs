// Takes a poster (4:3 WebP) of an item's demo in real Chrome with the GPU on:
//   npm run capture -- <slug> [--wait 2500] [--url https://...] [--size 1200x900] [--query "?lang=en"] [--phone]
// A piece made for a phone app (platform: [mobile]), or any with --phone, is shot at 390×844 and set in a phone frame
// in the middle of the 4:3 poster, the way Mobbin shows app screens.
// Headless Chromium's default renderer is SwiftShader (CPU); WebGL scenes need ANGLE on the GPU.
// Local demos are served over http from a throwaway server: Chrome does not load ES modules from file://.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { readItems } from './lib/items.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const slug = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const item = readItems().find((i) => i.slug === slug);
if (!item) {
  console.error('Usage: npm run capture -- <slug> [--wait 2500] [--url https://...] [--size 1200x900]');
  process.exit(1);
}
const d = item.data;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.glb': 'model/gltf-binary' };
let server = null;
async function serveItem() {
  const root = item.dir;
  server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  return `http://127.0.0.1:${server.address().port}/${d.demo.path.replaceAll('\\', '/')}${flag('query', '')}`;
}
const target = flag('url', null) ?? d.demo?.url ?? (d.demo?.path ? await serveItem() : null);
if (!target) {
  console.error(`${slug} has no demo to capture`);
  process.exit(1);
}
const phone = args.includes('--phone') || ((d.platform ?? []).includes('mobile') && !(d.platform ?? []).includes('web'));
const [width, height] = phone ? [390, 844] : flag('size', '1200x900').split('x').map(Number);
const wait = Number(flag('wait', d.demo?.url ? '4000' : '1200'));
const ground = { light: '#ffffff', dark: '#0b0b0c' }[d.demo?.background] ?? '#f5f5f7';

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl']
});
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone });
await page.goto(target, { waitUntil: 'load', timeout: 60_000 });
await page.addStyleTag({ content: `html { background: ${ground}; }` });
const renderer = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
  const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'no webgl';
});
if (/swiftshader/i.test(renderer)) console.warn(`warn  WebGL runs on SwiftShader (CPU): ${renderer}. The poster may lag behind the real scene.`);
await page.waitForTimeout(wait);
// Hide demo chrome that should not be on a poster (lil-gui panels, HUDs, credits).
await page.addStyleTag({ content: '.lil-gui, .hud, .credit, .stats, .toast { display: none !important; }' });
await page.waitForTimeout(150);
const png = await page.screenshot({ type: 'png' });

// Encode WebP in the browser, so the script needs no image library. A phone shot goes into a drawn phone frame first:
// dark body, rounded screen, a pill for the camera, on the poster's ground.
const webp = await page.evaluate(async ({ b64, phone, ground }) => {
  const img = new Image();
  img.src = `data:image/png;base64,${b64}`;
  await img.decode();
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  if (!phone) {
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    g.drawImage(img, 0, 0);
  } else {
    c.width = 1200; c.height = 900;
    g.fillStyle = ground === '#0b0b0c' ? '#161618' : '#ececef';
    g.fillRect(0, 0, 1200, 900);
    const sh = 800, sw = Math.round(sh * 390 / 844), bez = 11;
    const x = (1200 - sw) / 2, y = (900 - sh) / 2;
    const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
    g.save(); g.shadowColor = 'rgba(0,0,0,0.18)'; g.shadowBlur = 40; g.shadowOffsetY = 16;
    rr(x - bez, y - bez, sw + bez * 2, sh + bez * 2, 58); g.fillStyle = '#1b1b1d'; g.fill(); g.restore();
    g.save(); rr(x, y, sw, sh, 47); g.clip(); g.drawImage(img, x, y, sw, sh); g.restore();
    rr(x + sw / 2 - 52, y + 12, 104, 30, 15); g.fillStyle = '#0a0a0b'; g.fill();
  }
  return c.toDataURL('image/webp', 0.86).split(',')[1];
}, { b64: png.toString('base64'), phone, ground });
await browser.close();
server?.close();

const file = path.join(item.dir, 'poster.webp');
fs.writeFileSync(file, Buffer.from(webp, 'base64'));
if (!/^poster:/m.test(fs.readFileSync(item.file, 'utf8').split(/\r?\n---/)[0])) {
  const src = fs.readFileSync(item.file, 'utf8');
  fs.writeFileSync(item.file, src.replace(/\r?\n---/, '\nposter: poster.webp\n---'));
}
console.log(`poster ${path.relative(process.cwd(), file)} ${phone ? '1200x900 (phone frame)' : `${width}x${height}`}, ${Math.round(fs.statSync(file).size / 1024)} KB · ${renderer}`);
