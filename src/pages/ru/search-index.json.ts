// The Russian twin of /search-index.json.
import type { APIRoute } from 'astro';
import { allItems, indexEntry } from '../../lib/items';

export const GET: APIRoute = async () =>
  new Response(JSON.stringify((await allItems()).map((e) => indexEntry(e, 'ru'))), { headers: { 'Content-Type': 'application/json' } });
