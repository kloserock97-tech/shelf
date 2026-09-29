// The search index as one file, for item pages: they load it instead of carrying it inline (see App.astro).
import type { APIRoute } from 'astro';
import { allItems, indexEntry } from '../lib/items';

export const GET: APIRoute = async () =>
  new Response(JSON.stringify((await allItems()).map((e) => indexEntry(e, 'en'))), { headers: { 'Content-Type': 'application/json' } });
