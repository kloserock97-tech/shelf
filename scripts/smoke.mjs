// Smoke test in real Chrome: npm run smoke -- [base URL]   (default: the local preview, npm run preview)
// Screenshots go to .smoke/. Exits non-zero when a page logs an error, scrolls sideways or a flow breaks.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { ROOT } from './lib/items.mjs';

const base = (process.argv[2] ?? 'http://127.0.0.1:4329/shelf/').replace(/\/?$/, '/');
const out = path.join(ROOT, '.smoke');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const PAGES = ['', 'type/webgl/', 'favorites/', 'coverage/', 'collection/calm/', 'items/spring-toggle/', 'items/windcrest/', 'nope/', 'ru/', 'ru/type/webgl/', 'ru/coverage/', 'ru/items/spring-toggle/', 'ru/nope/'];
const problems = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });

async function open(ctx, rel) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && (m.location().url ?? '').startsWith(base) && !(rel.endsWith('nope/') && /404/.test(m.text()))) errors.push(`console: ${m.text()}`);
  });
  const res = await page.goto(base + rel, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  return { page, errors, status: res?.status() ?? 0 };
}

for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
  for (const rel of PAGES) {
    const { page, errors, status } = await open(ctx, rel);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    const name = (rel || 'index').replace(/\//g, '_').replace(/_$/, '');
    await page.screenshot({ path: path.join(out, `${name}-${scheme}.png`) });
    if (errors.length) problems.push(`${rel || '/'} (${scheme}): ${errors.join(' | ')}`);
    if (wide) problems.push(`${rel || '/'} (${scheme}): scrolls sideways`);
    if (rel.endsWith('nope/') ? status !== 404 : status !== 200) problems.push(`${rel || '/'}: HTTP ${status}`);
    await page.close();
  }
  await ctx.close();
}

// Flows on the library and an item page.
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', permissions: ['clipboard-read', 'clipboard-write'] });
const check = (ok, what) => { if (!ok) problems.push(`flow: ${what}`); return ok; };
{
  const { page } = await open(ctx, '');
  const cards = await page.locator('.sh-card:not([hidden])').count();
  check(cards > 0, 'the library shows no cards');
  await page.keyboard.press('Control+k');
  check(await page.locator('#palette').isVisible(), '⌘K does not open the palette');
  await page.keyboard.type('grass');
  await page.waitForTimeout(150);
  check((await page.locator('.sh-palette__item').count()) > 0, 'the palette finds nothing for "grass"');
  await page.screenshot({ path: path.join(out, 'flow-palette.png') });
  await page.keyboard.press('Escape');
  check(await page.locator('#palette').isHidden(), 'Esc does not close the palette');
  await page.fill('#search', 'spring toggle');
  await page.waitForTimeout(150);
  const found = await page.locator('.sh-card:not([hidden])').count();
  check(found >= 1 && found <= 3 && (await page.locator('.sh-card:not([hidden])[data-slug="spring-toggle"]').count()) === 1, `searching "spring toggle" should find Spring Toggle among a few cards (got ${found})`);
  await page.fill('#search', '');
  await page.waitForTimeout(150);
  await page.locator('.sh-card__thumb[data-loop]').first().hover();
  await page.waitForTimeout(900);
  check((await page.locator('.sh-card__video').count()) > 0, 'hovering a card does not start its loop');
  await page.locator('.sh-card__thumb').first().focus();
  await page.keyboard.press(' ');
  await page.waitForTimeout(400);
  check(await page.locator('#quicklook').isVisible(), 'Space does not open Quick Look');
  await page.screenshot({ path: path.join(out, 'flow-quicklook.png') });
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  check(await page.locator('#quicklook').isHidden(), 'Esc does not close Quick Look');
  await page.locator('.sh-card__fav').first().click();
  check((await page.locator('[data-count="favorites"]').textContent()) === '1', 'the favourite count does not update');
  await page.close();
}
{
  const { page } = await open(ctx, 'items/spring-toggle/');
  await page.waitForSelector('#demo-frame.is-ready', { timeout: 8000 }).catch(() => check(false, 'the Spring Toggle demo never became ready'));
  await page.locator('[data-variant-switch] .sh-seg__opt', { hasText: 'Vue' }).click();
  check(await page.locator('.sh-code__variant[data-variant="vue"]').isVisible(), 'the Vue variant does not show');
  await page.locator('.sh-code__variant[data-variant="vue"] [data-copy-code]').click();
  await page.waitForTimeout(200);
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  check(clip.includes('defineModel'), 'Copy does not put the Vue file on the clipboard');
  await page.locator('[data-copy-prompt]').click();
  await page.waitForTimeout(200);
  const prompt = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  check(prompt.includes('Spring Toggle') && prompt.includes('SpringToggle.vue') === false, 'the prompt is missing or uses the wrong variant');
  await page.locator('[data-action="stage-bg"]').click();
  check((await page.locator('#stage').getAttribute('data-bg')) === 'light', 'the background switch does not change the stage');
  await page.screenshot({ path: path.join(out, 'flow-item.png'), fullPage: true });
  await page.close();
}
{
  // The sidebar: rail, tooltips, profile menu, folded sections, shortcuts, resizing.
  const { page } = await open(ctx, '');
  const width = () => page.evaluate(() => Math.round(document.querySelector('#sidebar').getBoundingClientRect().width));
  await page.screenshot({ path: path.join(out, 'sidebar-expanded.png') });
  await page.keyboard.press('Control+b');
  await page.waitForTimeout(600);
  check(await page.evaluate(() => document.documentElement.classList.contains('sidebar-rail')), '⌘B does not fold the sidebar');
  check(Math.abs((await width()) - 64) <= 2, `the rail should be 64px wide, got ${await width()}`);
  await page.locator('#sidebar .sh-sb__row[href]').nth(1).hover();
  await page.waitForTimeout(400);
  check(await page.locator('#tip').isVisible(), 'rail icons show no tooltip');
  await page.screenshot({ path: path.join(out, 'sidebar-rail.png') });
  await page.keyboard.press('Control+b');
  await page.waitForTimeout(600);
  check((await width()) > 200, 'the sidebar does not unfold again');
  await page.locator('[data-action="profile-menu"]').click();
  check(await page.locator('#profile-menu').isVisible(), 'the profile menu does not open');
  await page.locator('[data-theme-switch] .sh-seg__opt', { hasText: 'Dark' }).click();
  check((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'the appearance switch does not set dark');
  await page.screenshot({ path: path.join(out, 'sidebar-menu-dark.png') });
  await page.locator('[data-theme-switch] .sh-seg__opt', { hasText: 'Auto' }).click();
  await page.keyboard.press('Escape');
  check(await page.locator('#profile-menu').isHidden(), 'Esc does not close the profile menu');
  // Sidebar style: attached (macOS 27) touches the window edges and survives a reload; floating sits 8px in.
  const box = () => page.evaluate(() => { const r = document.querySelector('#sidebar').getBoundingClientRect(); return `${Math.round(r.left)},${Math.round(r.top)}`; });
  await page.locator('[data-action="profile-menu"]').click();
  await page.locator('[data-sidebar-style] .sh-seg__opt', { hasText: 'Attached' }).click();
  await page.waitForTimeout(500);
  check((await box()) === '0,0', `an attached sidebar should touch the window edges, got ${await box()}`);
  await page.keyboard.press('Escape');
  await page.reload();
  await page.waitForTimeout(300);
  check((await box()) === '0,0', `the attached sidebar does not survive a reload, got ${await box()}`);
  await page.screenshot({ path: path.join(out, 'sidebar-attached.png') });
  await page.locator('[data-action="profile-menu"]').click();
  await page.locator('[data-sidebar-style] .sh-seg__opt', { hasText: 'Floating' }).click();
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  check((await box()) === '8,8', `a floating sidebar should sit 8px from the window edges, got ${await box()}`);
  await page.locator('section[data-section] .sh-sb__heading >> nth=0').click();
  await page.reload();
  await page.waitForTimeout(300);
  check((await page.locator('section[data-section] .sh-sb__heading >> nth=0').getAttribute('aria-expanded')) === 'false', 'a folded section does not stay folded');
  await page.locator('section[data-section] .sh-sb__heading >> nth=0').click();
  await page.keyboard.press('?');
  check(await page.locator('#shortcuts').isVisible(), '? does not open the shortcuts');
  await page.screenshot({ path: path.join(out, 'shortcuts.png') });
  await page.keyboard.press('Escape');
  const edge = await page.locator('.sh-sb__edge').boundingBox();
  if (check(Boolean(edge), 'the sidebar has no resize edge')) {
    await page.mouse.move(edge.x + edge.width / 2, edge.y + 40);
    await page.mouse.down();
    await page.mouse.move(edge.x + 50, edge.y + 40, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    check((await width()) >= 280, `dragging the edge does not widen the sidebar (got ${await width()})`);
    await page.locator('.sh-sb__edge').dblclick();
  }
  await page.close();
}
{
  // Language: the Russian twin, the switch in the profile menu, the remembered choice; the skip link.
  const lang = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const { page } = await open(lang, 'ru/');
  check((await page.evaluate(() => document.documentElement.lang)) === 'ru', 'the Russian library is not lang="ru"');
  check((await page.locator('#sidebar .sh-sb__row[href]').first().textContent())?.includes('Все элементы'), 'the Russian sidebar is not in Russian');
  await page.keyboard.press('Tab');
  check(await page.locator('.sh-skip').evaluate((el) => el === document.activeElement), 'the first Tab does not land on the skip link');
  await page.locator('[data-action="profile-menu"]').click();
  await Promise.all([page.waitForURL((u) => !u.pathname.includes('/ru/')), page.locator('[data-lang-switch] .sh-seg__opt', { hasText: 'English' }).click()]);
  check((await page.evaluate(() => document.documentElement.lang)) === 'en', 'the language switch does not open the English page');
  await page.evaluate(() => localStorage.setItem('shelf:lang', 'ru'));
  await page.goto(base + 'items/spring-toggle/', { waitUntil: 'load' });
  check(page.url().includes('/ru/items/spring-toggle/'), `a remembered Russian choice does not redirect (${page.url()})`);
  await page.evaluate(() => localStorage.removeItem('shelf:lang'));
  await lang.close();
}
{
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'light', hasTouch: true, isMobile: true });
  const { page, errors } = await open(mobile, '');
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'the phone layout scrolls sideways');
  await page.screenshot({ path: path.join(out, 'mobile-library.png') });
  await page.locator('.sh-toolbar .sh-sidebar-toggle').tap();
  await page.waitForTimeout(500);
  check(await page.evaluate(() => document.documentElement.classList.contains('sidebar-open')), 'the sidebar does not open on a phone');
  await page.screenshot({ path: path.join(out, 'mobile-sidebar.png') });
  const item = await open(mobile, 'items/windcrest/');
  await item.page.waitForTimeout(1500);
  await item.page.screenshot({ path: path.join(out, 'mobile-item.png'), fullPage: true });
  if (errors.length || item.errors.length) problems.push(`phone: ${[...errors, ...item.errors].join(' | ')}`);
  await mobile.close();
}
await ctx.close();
await browser.close();

if (problems.length) {
  console.error(problems.map((p) => `fail  ${p}`).join('\n'));
  console.error(`\n${problems.length} problem(s). Screenshots: ${path.relative(process.cwd(), out)}`);
  process.exit(1);
}
console.log(`ok    ${PAGES.length} pages x 2 themes, flows and phone layout. Screenshots: ${path.relative(process.cwd(), out)}`);
