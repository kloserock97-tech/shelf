// Scaffolds an item: npm run new -- <slug> [--type control] [--title "Glass Button"] [--private]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, TYPES } from './lib/items.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const slug = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1]?.startsWith('--') !== true);
if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
  console.error('Usage: npm run new -- <kebab-slug> [--type control] [--title "Title"] [--private]');
  process.exit(1);
}
const type = flag('type', 'control');
if (!TYPES.includes(type)) {
  console.error(`Unknown type "${type}". One of: ${TYPES.join(', ')}`);
  process.exit(1);
}
const title = flag('title', slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' '));
const base = args.includes('--private') ? 'private' : 'items';
const dir = path.join(ROOT, base, slug);
if (fs.existsSync(dir)) {
  console.error(`${base}/${slug} already exists`);
  process.exit(1);
}
const today = new Date().toISOString().slice(0, 10);
const files = {
  'item.md': `---
title: ${title}
type: ${type}
status: draft
summary: Одно предложение о том, что делает элемент.
tech: [HTML, CSS]
tags: []
added: ${today}
origin: own
source: ""
demo:
  path: demo/index.html
  background: auto
  grid: true
variants:
  - { id: html, label: HTML }
---
Заметки: грабли, решения, где используется.
`,
  'demo/index.html': `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title}</title>
<link rel="stylesheet" href="../variants/html/style.css">
<style>
  html, body { height: 100%; margin: 0; background: transparent; }
  body { display: grid; place-items: center; font-family: system-ui, sans-serif; }
</style>
</head>
<body>
<!-- the same markup as variants/html/index.html -->
<script src="../variants/html/script.js"></script>
</body>
</html>
`,
  'variants/html/index.html': '<!-- markup -->\n',
  'variants/html/style.css': '/* styles */\n',
  'variants/html/script.js': '// behaviour\n'
};
for (const [rel, text] of Object.entries(files)) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}
console.log(`Created ${base}/${slug}/. Fill in the demo and variants, then: npm run capture -- ${slug}`);
