// Checks every item and lays out what the site serves:
//   public/demos/<slug>/  demo and variant files (live previews run from here)
//   public/media/<slug>/  poster and loop
//   public/r/             shadcn registry for React items
// `npm run check` only validates.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, TYPES, JOBS, COLLECTIONS, PROJECTS, readItems, isFile, walk } from './lib/items.mjs';
import { CODE, borrowedIn } from './lib/provenance.mjs';

const checkOnly = process.argv.includes('--check');
const SITE = 'https://kloserock97-tech.github.io/shelf/';
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const TEXT = /\.(html?|css|m?js|jsx|ts|tsx|vue|svelte|glsl|vert|frag|wgsl|json|md|txt)$/i;
// Things that must never reach the public repository.
const LEAKS = [
  [/admin\.mos\.ru/i, 'a private mos.ru address'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
  [/\bghp_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}/, 'a GitHub token'],
  [/\bsk-ant-[A-Za-z0-9-]{20,}/, 'an Anthropic key']
];

const errors = [];
const warnings = [];
const items = readItems();
const slugs = new Set();

for (const it of items) {
  const d = it.data;
  const where = `${it.base}/${it.slug}`;
  if (!SLUG.test(it.slug)) errors.push(`${where}: the folder name must be kebab-case`);
  if (slugs.has(it.slug)) errors.push(`${where}: the slug is used twice`);
  slugs.add(it.slug);
  for (const key of ['title', 'type', 'summary', 'added']) if (!d[key]) errors.push(`${where}: missing "${key}"`);
  if (d.type && !TYPES.includes(d.type)) errors.push(`${where}: unknown type "${d.type}" (one of ${TYPES.join(', ')})`);
  if (d.status && !['stable', 'draft'].includes(d.status)) errors.push(`${where}: status is stable or draft`);
  for (const [key, known] of [['jobs', JOBS], ['collections', COLLECTIONS], ['usedIn', PROJECTS]]) {
    for (const v of d[key] ?? []) if (!known.includes(v)) errors.push(`${where}: unknown ${key} "${v}" (one of ${known.join(', ')})`);
  }
  if (!(d.jobs ?? []).length) warnings.push(`${where}: no jobs yet — say what it does for the person on the page`);
  if (!it.private && d.origin === 'third-party') errors.push(`${where}: third-party code can't be public. Rewrite it, or move the folder to private/`);
  if (d.origin === 'adapted' && !d.priorArt) errors.push(`${where}: an adapted item names its prior art (priorArt)`);
  if (d.demo?.path && !isFile(path.join(it.dir, d.demo.path))) errors.push(`${where}: demo.path "${d.demo.path}" doesn't exist`);
  if (d.demo?.url && !/^https:\/\//.test(d.demo.url)) errors.push(`${where}: demo.url must be an https address`);
  for (const f of [d.poster, d.loop].filter(Boolean)) if (!isFile(path.join(it.dir, f))) errors.push(`${where}: "${f}" doesn't exist`);
  if (!d.poster) warnings.push(`${where}: no poster yet (npm run capture -- ${it.slug})`);
  for (const v of d.variants ?? []) {
    if (!v.id || !v.label) errors.push(`${where}: every variant has an id and a label`);
    else if (!fs.existsSync(path.join(it.dir, 'variants', v.id))) errors.push(`${where}: variants/${v.id}/ is missing`);
  }
  if (d.registry && !(d.variants ?? []).some((v) => v.id === 'react')) warnings.push(`${where}: "registry" needs a react variant, skipped`);
  if (!it.private) {
    for (const file of walk(it.dir).filter((f) => TEXT.test(f))) {
      const text = fs.readFileSync(file, 'utf8');
      for (const [re, what] of LEAKS) if (re.test(text)) errors.push(`${where}: ${path.relative(it.dir, file)} contains ${what}`);
      // someone else's code, recognised by its constants and names: rewrite it with our own (items/hash-kit, items/edge-aa)
      if (CODE.test(file)) for (const hit of borrowedIn(text)) errors.push(`${where}: ${path.relative(it.dir, file)}:${hit.line} looks like ${hit.what} — rewrite it as our own`);
    }
  }
}

// pairs and related point at other items, which must exist
for (const it of items) for (const key of ['pairs', 'related']) {
  for (const s of it.data[key] ?? []) {
    if (s === it.slug) errors.push(`${it.base}/${it.slug}: ${key} names the item itself`);
    else if (!slugs.has(s)) errors.push(`${it.base}/${it.slug}: ${key} names "${s}", which isn't on the shelf`);
  }
}

for (const w of warnings) console.warn(`warn  ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`error ${e}`);
  console.error(`\n${errors.length} problem(s). Nothing was published.`);
  process.exit(1);
}
if (checkOnly) {
  console.log(`ok    ${items.length} item(s), ${items.filter((i) => i.private).length} private`);
  process.exit(0);
}

const out = (...p) => path.join(ROOT, 'public', ...p);
for (const dir of ['demos', 'media', 'r']) fs.rmSync(out(dir), { recursive: true, force: true });

// Licences of what ships to the browser (the search, the icons, the fonts, Astro's runtime). The bundler drops
// licence comments, so the texts travel as a file; the profile menu links to it as Credits.
const SHIPPED = ['minisearch', 'lucide-static', '@fontsource-variable/onest', '@fontsource-variable/jetbrains-mono', 'astro'];
const notices = SHIPPED.map((name) => {
  const dir = path.join(ROOT, 'node_modules', name);
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const file = fs.readdirSync(dir).find((f) => /^licen[cs]e(\.|$)/i.test(f));
  return `${name}@${pkg.version} — ${typeof pkg.license === 'string' ? pkg.license : 'see text'}\n\n${file ? fs.readFileSync(path.join(dir, file), 'utf8').trim() : '(no licence file in the package)'}`;
});
fs.writeFileSync(out('THIRD_PARTY_NOTICES.txt'), `Shelf — open-source pieces that ship with the site. Everything else on it is our own.\n\n${notices.join(`\n\n${'-'.repeat(72)}\n\n`)}\n`);

const NOINDEX = '<meta name="robots" content="noindex, nofollow">';
// A demo that declares both schemes stays transparent in the stage whatever the page theme is.
const SCHEME = '<meta name="color-scheme" content="light dark">';
// A demo opened in its own tab shows the Shelf mark, not the browser's blank: the site lives under /shelf/.
const ICONS = [
  '<link rel="icon" href="/shelf/favicon.ico" sizes="32x32">',
  '<link rel="icon" href="/shelf/favicon.svg" type="image/svg+xml">',
  '<link rel="apple-touch-icon" href="/shelf/apple-touch-icon.png">'
].join('\n');
function copyTree(from, to) {
  for (const file of walk(from)) {
    const dest = path.join(to, path.relative(from, file));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (/\.html?$/i.test(file)) {
      let text = fs.readFileSync(file, 'utf8');
      for (const [re, tag] of [[/name=["']robots["']/i, NOINDEX], [/name=["']color-scheme["']/i, SCHEME], [/rel=["'](?:shortcut )?icon["']/i, ICONS]]) {
        if (!re.test(text)) text = /<head[^>]*>/i.test(text) ? text.replace(/<head[^>]*>/i, (m) => `${m}\n${tag}`) : `${tag}\n${text}`;
      }
      fs.writeFileSync(dest, text);
    } else {
      fs.copyFileSync(file, dest);
    }
  }
}

let demos = 0;
let media = 0;
for (const it of items) {
  const d = it.data;
  if (d.demo?.path) {
    // The demo folder and the variants travel together, so a demo can link ../variants/<id>/file.css.
    const demoDir = d.demo.path.includes('/') ? d.demo.path.split('/')[0] : '.';
    if (demoDir === '.') copyTree(it.dir, out('demos', it.slug));
    else {
      copyTree(path.join(it.dir, demoDir), out('demos', it.slug, demoDir));
      copyTree(path.join(it.dir, 'variants'), out('demos', it.slug, 'variants'));
    }
    demos++;
  }
  for (const f of [d.poster, d.loop].filter(Boolean)) {
    fs.mkdirSync(out('media', it.slug), { recursive: true });
    fs.copyFileSync(path.join(it.dir, f), out('media', it.slug, f));
    media++;
  }
}

// shadcn registry: public React items become installable with `npx shadcn add <url>`.
const registry = [];
for (const it of items.filter((i) => !i.private && i.data.registry)) {
  const react = (it.data.variants ?? []).find((v) => v.id === 'react');
  if (!react) continue;
  const dir = path.join(it.dir, 'variants', 'react');
  const names = (react.files ?? fs.readdirSync(dir)).filter((f) => isFile(path.join(dir, f)));
  const name = it.data.registry;
  const entry = {
    $schema: 'https://ui.shadcn.com/schema/registry-item.json',
    name,
    type: 'registry:component',
    title: it.data.title,
    description: it.data.summary,
    dependencies: it.data.depends ?? [],
    files: names.map((f) => ({ path: `registry/${name}/${f}`, type: 'registry:component', content: fs.readFileSync(path.join(dir, f), 'utf8') }))
  };
  fs.mkdirSync(out('r'), { recursive: true });
  fs.writeFileSync(out('r', `${name}.json`), JSON.stringify(entry, null, 2));
  registry.push({ name, type: entry.type, title: entry.title, description: entry.description, files: entry.files.map(({ path: p, type }) => ({ path: p, type })) });
}
if (registry.length) {
  fs.writeFileSync(out('r', 'registry.json'), JSON.stringify({ $schema: 'https://ui.shadcn.com/schema/registry.json', name: 'shelf', homepage: SITE, items: registry }, null, 2));
}

console.log(`sync  ${items.length} item(s): ${demos} demo(s), ${media} media file(s), ${registry.length} registry item(s)`);
