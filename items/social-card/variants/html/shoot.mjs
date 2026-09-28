// Shoots the link-preview card as a 1200×630 JPEG (LinkedIn doesn't unfurl WebP, so JPEG it is).
//   npm i -D playwright && npx playwright install chromium
//   node shoot.mjs [og-card.html] [og-cover.jpg]
// If the card uses local fonts or images, serve its folder over http and pass the URL instead of the file:
// some browsers refuse file:// fonts.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const [src = 'og-card.html', out = 'og-cover.jpg'] = process.argv.slice(2);
const url = /^https?:/.test(src) ? src : pathToFileURL(path.resolve(src)).href;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: 'networkidle' });
/* document.fonts.ready alone resolves too early: nothing is pending until a font is requested, and the shot
   catches the fallback. Load every declared face first. */
await page.evaluate(() => Promise.all([...document.fonts].map((f) => f.load().catch(() => null))).then(() => document.fonts.ready));
await page.screenshot({ path: out, type: 'jpeg', quality: 90 });
await browser.close();
console.log(`${out}: 1200×630 JPEG`);
