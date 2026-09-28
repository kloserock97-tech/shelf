// Build-time access to the shelf: entries, their files on disk, URLs, the search index and the AI prompt.
import fs from 'node:fs';
import path from 'node:path';
import { getCollection, type CollectionEntry } from 'astro:content';
import { typeOf } from './taxonomy';
import { url } from './url';

export type Item = CollectionEntry<'items'>;
export interface VariantFile { name: string; code: string }
export interface Variant { id: string; label: string; files: VariantFile[] }

const ROOT = process.cwd();
const rel = (e: Item) => (e.filePath ?? `items/${e.id}/item.md`).replace(/\\/g, '/');
export const dirOf = (e: Item) => path.join(ROOT, path.dirname(rel(e)));
export const isPrivate = (e: Item) => rel(e).startsWith('private/');

export async function allItems() {
  const list = await getCollection('items');
  return list.sort((a, b) => +b.data.added - +a.data.added || a.data.title.localeCompare(b.data.title));
}

export const itemUrl = (e: Item) => url(`items/${e.id}/`);
export const mediaUrl = (e: Item, file?: string) => (file ? url(`media/${e.id}/${file}`) : undefined);
export const posterUrl = (e: Item) => mediaUrl(e, e.data.poster);
export const loopUrl = (e: Item) => mediaUrl(e, e.data.loop);
export const demoUrl = (e: Item) => {
  if (e.data.demo.url) return e.data.demo.url;
  if (e.data.demo.path) return url(`demos/${e.id}/${e.data.demo.path.replace(/index\.html$/, '')}`);
  return undefined;
};
export const isExternal = (e: Item) => Boolean(e.data.demo.url);
export const subtitle = (e: Item) => [typeOf(e.data.type).one, ...e.data.tech.slice(0, 2)].join(' · ');

// Primary file first: markup, then components, then styles, then the rest.
const RANK = ['.html', '.tsx', '.jsx', '.vue', '.svelte', '.ts', '.js', '.css'];
const rank = (f: string) => {
  const i = RANK.findIndex((ext) => f.endsWith(ext));
  return i < 0 ? RANK.length : i;
};

export function variantsOf(e: Item): Variant[] {
  return e.data.variants.map((v) => {
    const dir = path.join(dirOf(e), 'variants', v.id);
    const names = v.files ?? (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isFile()) : []);
    const ordered = v.files ? names : [...names].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    return {
      id: v.id,
      label: v.label,
      files: ordered.map((name) => ({ name, code: fs.readFileSync(path.join(dir, name), 'utf8') }))
    };
  });
}

// Plain-text notes for search and prompts: the markdown body without markup.
export const notesText = (e: Item) =>
  (e.body ?? '').replace(/```[\s\S]*?```/g, ' ').replace(/[`*_>#\[\]()-]/g, ' ').replace(/\s+/g, ' ').trim();

const PROMPT_CODE_LIMIT = 24_000;

export function promptFor(e: Item, variants: Variant[]) {
  const d = e.data;
  const lines = [
    `You are helping me reuse a piece from my UI library Shelf: "${d.title}" (${typeOf(d.type).one}).`,
    '',
    `What it is: ${d.summary}`,
    d.tech.length ? `Built with: ${d.tech.join(', ')}` : '',
    d.depends.length ? `Dependencies: ${d.depends.join(', ')}` : '',
    demoUrl(e) ? `Live demo: ${d.demo.url ?? new URL(demoUrl(e)!, 'https://kloserock97-tech.github.io').href}` : '',
    d.repo ? `Source repository: ${d.repo}` : '',
    '',
    e.body?.trim() ? `Notes from the author (Russian):\n${e.body.trim()}` : '',
    ''
  ];
  const v = variants[0];
  if (v) {
    lines.push(`Code, ${v.label} variant:`);
    let used = 0;
    const skipped: string[] = [];
    for (const f of v.files) {
      if (used + f.code.length > PROMPT_CODE_LIMIT) { skipped.push(f.name); continue; }
      used += f.code.length;
      lines.push('', `--- ${f.name} ---`, f.code.trimEnd());
    }
    if (skipped.length) lines.push('', `Not included to keep this short: ${skipped.join(', ')}.`);
    if (variants.length > 1) lines.push('', `Also available as: ${variants.slice(1).map((x) => x.label).join(', ')}.`);
  }
  lines.push('', 'Adapt it to my current project, keep the behaviour and the motion, and keep it accessible.');
  return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim();
}

export function indexEntry(e: Item) {
  const d = e.data;
  return {
    slug: e.id,
    title: d.title,
    type: d.type,
    typeLabel: typeOf(d.type).one,
    tech: d.tech,
    tags: d.tags,
    status: d.status,
    summary: d.summary,
    notes: notesText(e).slice(0, 1500),
    url: itemUrl(e),
    poster: posterUrl(e) ?? null,
    loop: loopUrl(e) ?? null,
    demo: demoUrl(e) ?? null,
    external: isExternal(e),
    bg: d.demo.background,
    grid: d.demo.grid,
    added: d.added.toISOString().slice(0, 10),
    private: isPrivate(e)
  };
}
export type IndexEntry = ReturnType<typeof indexEntry>;
