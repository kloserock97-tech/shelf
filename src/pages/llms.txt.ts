// /llms.txt: the shelf as a table of contents for a language model (llmstxt.org): every item with its kind, summary,
// page and prompt files. The prompts carry the code, so a model reads one file per piece instead of a page.
import type { APIRoute } from 'astro';
import { allItems, itemUrl, variantsOf } from '../lib/items';
import { typeOf, typeOne } from '../lib/taxonomy';
import { url } from '../lib/url';

export const GET: APIRoute = async ({ site }) => {
  const abs = (path: string) => new URL(path, site).href;
  const items = await allItems();
  const lines = [
    '# Shelf',
    '',
    '> A personal library of UI pieces by Nikita Gorbachev: components, sections, WebGL and Three.js scenes, shaders, motion and loaders. Each piece has a live demo and code in one or more variants. Summaries and notes are in Russian.',
    '',
    `Each prompt file below is a ready prompt for reusing the piece: what it is, its stack, the author's notes and the code of one variant. ${abs(url('prompts/'))}<slug>.txt holds the first variant.`,
    '',
    '## Items',
    ''
  ];
  for (const e of items) {
    const d = e.data;
    const variants = variantsOf(e);
    const prompts = variants.length
      ? variants.map((v) => `[${v.label} prompt](${abs(url(`prompts/${e.id}.${v.id}.txt`))})`).join(', ')
      : `[prompt](${abs(url(`prompts/${e.id}.txt`))})`;
    lines.push(`- [${d.title}](${abs(itemUrl(e))}): ${typeOne(typeOf(d.type), 'en')}${d.tech.length ? `, ${d.tech.join(', ')}` : ''}. ${d.summary} — ${prompts}`);
  }
  lines.push('', '## Optional', '', `- [Search index](${abs(url('search-index.json'))}): every item as JSON, with tags, tasks and collections`);
  return new Response(`${lines.join('\n')}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
