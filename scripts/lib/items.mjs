// Reads items/<slug>/item.md and private/<slug>/item.md for the Node scripts (the site reads them through Astro).
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export const ROOT = path.resolve(import.meta.dirname, '..', '..');
// Same ids as src/lib/taxonomy.ts, which also holds labels, icons and sidebar groups.
export const TYPES = ['component', 'button', 'card', 'navigation', 'gallery', 'icon', 'cursor', 'motion', 'transition', 'scroll', 'text', 'loader', 'webgl', 'shader', 'background', 'object', 'section', 'app', 'sound', 'utility'];

export function splitFrontmatter(src) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(src);
  return m ? { yaml: m[1], body: m[2] } : null;
}

export function readItems() {
  const out = [];
  for (const base of ['items', 'private']) {
    const dir = path.join(ROOT, base);
    if (!fs.existsSync(dir)) continue;
    for (const slug of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, slug, 'item.md');
      if (!fs.existsSync(file)) continue;
      const parts = splitFrontmatter(fs.readFileSync(file, 'utf8'));
      if (!parts) throw new Error(`${base}/${slug}/item.md has no frontmatter`);
      out.push({ slug, base, dir: path.join(dir, slug), file, data: YAML.parse(parts.yaml) ?? {}, body: parts.body, private: base === 'private' });
    }
  }
  return out;
}

export const isFile = (p) => fs.existsSync(p) && fs.statSync(p).isFile();

export function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return fs.statSync(p).isDirectory() ? walk(p) : [p];
  });
}
