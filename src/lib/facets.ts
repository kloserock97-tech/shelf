// Library filter: the facets (Type, Stack, Tags), how their values group, and the sort orders.
// Shared by the page (markup) and the client (counts, matching, the URL). Patterns follow Mobbin's catalogue:
// several values within a facet widen the result (OR), facets narrow it together (AND), and so does the text query.
import type { Key, Lang } from './i18n';

export type FacetId = 'type' | 'stack' | 'tag';
export const FACETS: { id: FacetId; key: Key; param: string }[] = [
  { id: 'type', key: 'facetType', param: 'type' },
  { id: 'stack', key: 'facetStack', param: 'stack' },
  { id: 'tag', key: 'facetTag', param: 'tag' }
];

export type SortId = 'new' | 'updated' | 'az' | 'type';
export const SORTS: { id: SortId; key: Key; param: string | null }[] = [
  { id: 'new', key: 'newest', param: null },
  { id: 'updated', key: 'sortUpdated', param: 'updated' },
  { id: 'az', key: 'az', param: 'az' },
  { id: 'type', key: 'sortType', param: 'type' }
];

// Technologies, grouped the way people look for them. Anything unknown falls into Tools.
export const STACK_GROUPS: { key: Key; members: string[] }[] = [
  { key: 'stackWeb', members: ['HTML', 'CSS', 'JavaScript', 'TypeScript', 'SVG', 'Canvas 2D', 'Web Audio'] },
  { key: 'stackFrameworks', members: ['React', 'Vue', 'R3F', 'Svelte', 'Astro'] },
  { key: 'stackGraphics', members: ['three.js', 'WebGL', 'WebGL2', 'WebGPU', 'GLSL', 'WGSL', 'TSL'] }
];
export const stackGroupOf = (tech: string): Key => STACK_GROUPS.find((g) => g.members.includes(tech))?.key ?? 'stackTools';

// Tags are written in both languages on each item; the facet lists the ones in the page's language.
const CYRILLIC = /[а-яё]/i;
export const tagInLang = (tag: string, lang: Lang) => (lang === 'ru' ? CYRILLIC.test(tag) : !CYRILLIC.test(tag));
