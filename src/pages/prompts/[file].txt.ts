// The AI prompt of every item as a plain file, so Quick Look, Claude and any script can take it without loading the
// item's page: /prompts/<slug>.<variant>.txt for each code variant, and /prompts/<slug>.txt (the first variant, or
// the prompt without code when there is none). The same text the item page copies (promptFor in src/lib/items.ts).
import type { APIRoute, GetStaticPaths } from 'astro';
import { allItems, promptFor, variantsOf } from '../../lib/items';

export const getStaticPaths = (async () => {
  const items = await allItems();
  return items.flatMap((item) => {
    const variants = variantsOf(item);
    return [
      { params: { file: item.id }, props: { text: promptFor(item, variants) } },
      ...variants.map((v) => ({ params: { file: `${item.id}.${v.id}` }, props: { text: promptFor(item, variants, v.id) } }))
    ];
  });
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) =>
  new Response(`${(props as { text: string }).text}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
