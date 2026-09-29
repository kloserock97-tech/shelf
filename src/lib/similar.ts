// Two lists under an item. Works well with: pieces that complement it, named by hand in `pairs` on either side.
// Similar: pieces of the same sort, by shared kind, jobs, collections, tags and stack; `related` pins go first.
import type { Item } from './items';

const shared = (a: readonly string[], b: readonly string[]) => a.filter((x) => b.includes(x)).length;
const WEIGHT = { type: 3, job: 2, collection: 1.5, tag: 1, tech: 0.5 };
const MIN_SCORE = 3; // below this two pieces only share a word or two

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
    .map((i) => {
      const o = i.data;
      const score =
        (o.type === d.type ? WEIGHT.type : 0) +
        WEIGHT.job * shared(o.jobs, d.jobs) +
        WEIGHT.collection * shared(o.collections, d.collections) +
        WEIGHT.tag * shared(o.tags, d.tags) +
        WEIGHT.tech * shared(o.tech, d.tech);
      return { i, score };
    })
    .filter((x) => x.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || a.i.data.title.localeCompare(b.i.data.title));
  return [...pinned, ...scored.map((x) => x.i)].slice(0, n);
}
