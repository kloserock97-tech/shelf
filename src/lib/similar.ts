// Two lists under an item. Works well with: pieces that complement it, named by hand in `pairs` on either side.
// Similar: pieces of the same sort, by shared kind, jobs, collections, tags and stack; `related` pins go first.
import type { Item } from './items';

const shared = (a: readonly string[], b: readonly string[]) => a.filter((x) => b.includes(x)).length;
const WEIGHT = { type: 2, job: 2, collection: 2, tag: 1, tech: 0.5 };
export const MIN_SCORE = 3; // below this two pieces only share a word or two

// How alike two pieces are, on plain data: the build passes item data, the browser index entries (Favorites'
// "More like your favorites" sums this over every starred piece).
export interface Likeness { type: string; jobs: readonly string[]; collections: readonly string[]; tags: readonly string[]; tech: readonly string[] }
export const likeness = (a: Likeness, b: Likeness) =>
  (a.type === b.type ? WEIGHT.type : 0) +
  WEIGHT.job * shared(a.jobs, b.jobs) +
  WEIGHT.collection * shared(a.collections, b.collections) +
  WEIGHT.tag * shared(a.tags, b.tags) +
  WEIGHT.tech * shared(a.tech, b.tech);

export function pairsOf(item: Item, items: Item[]) {
  const named = new Set(item.data.pairs);
  for (const other of items) if (other.data.pairs.includes(item.id)) named.add(other.id);
  return items.filter((i) => i.id !== item.id && named.has(i.id));
}

export function similarTo(item: Item, items: Item[], n = 4) {
  const d = item.data;
  const skip = new Set([item.id, ...pairsOf(item, items).map((i) => i.id)]);
  const pinned = d.related.map((s) => items.find((i) => i.id === s)).filter((i): i is Item => Boolean(i) && !skip.has(i!.id));
  pinned.forEach((i) => skip.add(i.id));
  const scored = items
    .filter((i) => !skip.has(i.id))
    .map((i) => ({ i, score: likeness(i.data, d) }))
    .filter((x) => x.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || a.i.data.title.localeCompare(b.i.data.title));
  return [...pinned, ...scored.map((x) => x.i)].slice(0, n);
}
