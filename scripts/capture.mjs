// Takes a poster (4:3 WebP) of an item's demo in real Chrome with the GPU on:
//   npm run capture -- <slug> [--wait 2500] [--url https://...] [--size 1200x900]
// Headless Chromium's default renderer is SwiftShader (CPU); WebGL scenes need ANGLE on the GPU.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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
const target = flag('url', d.demo?.url ?? (d.demo?.path ? pathToFileURL(path.join(item.dir, d.demo.path)).href : null));
if (!target) {
  console.error(`${slug} has no demo to capture`);
  process.exit(1);
}
const [width, height] = flag('size', '1200x900').split('x').map(Number);
const wait = Number(flag('wait', d.demo?.url ? '4000' : '1200'));
const ground = { light: '#ffffff', dark: '#0b0b0c' }[d.demo?.background] ?? '#f5f5f7';

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl']
});
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
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

// Encode WebP in the browser, so the script needs no image library.
const webp = await page.evaluate(async (b64) => {
  const img = new Image();
  img.src = `data:image/png;base64,${b64}`;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  return c.toDataURL('image/webp', 0.86).split(',')[1];
}, png.toString('base64'));
await browser.close();

const file = path.join(item.dir, 'poster.webp');
fs.writeFileSync(file, Buffer.from(webp, 'base64'));
if (!/^poster:/m.test(fs.readFileSync(item.file, 'utf8').split(/\r?\n---/)[0])) {
  const src = fs.readFileSync(item.file, 'utf8');
  fs.writeFileSync(item.file, src.replace(/\r?\n---/, '\nposter: poster.webp\n---'));
}
console.log(`poster ${path.relative(process.cwd(), file)} ${width}x${height}, ${Math.round(fs.statSync(file).size / 1024)} KB · ${renderer}`);
