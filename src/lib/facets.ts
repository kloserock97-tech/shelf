// Library filter: the facets (Type, Task, Stack, Tags), how their values group, and the sort orders.
// Shared by the page (markup) and the client (counts, matching, the URL). Patterns follow Mobbin's catalogue:
// several values within a facet widen the result (OR), facets narrow it together (AND), and so does the text query.
import type { Key, Lang } from './i18n';

export type FacetId = 'type' | 'job' | 'stack' | 'tag';
export const FACETS: { id: FacetId; key: Key; param: string }[] = [
  { id: 'type', key: 'facetType', param: 'type' },
  { id: 'job', key: 'facetJob', param: 'job' },
  { id: 'stack', key: 'facetStack', param: 'stack' },
  { id: 'tag', key: 'facetTag', param: 'tag' }
];

// 'type' shows the list in sections by kind group (Interface, Animation, Graphics, Pages & tools), the way a store's
// browse page does; the others are one flat grid. All items opens in sections, every other list opens newest first.
// The address names the sort only when it differs from the page's own default.
export type SortId = 'new' | 'updated' | 'az' | 'type';
export const SORTS: { id: SortId; key: Key; param: string }[] = [
  { id: 'type', key: 'sortType', param: 'type' },
  { id: 'new', key: 'newest', param: 'new' },
  { id: 'updated', key: 'sortUpdated', param: 'updated' },
  { id: 'az', key: 'az', param: 'az' }
];
export type ListMode = 'all' | 'type' | 'favorites' | 'collection';
export const defaultSort = (mode: string): SortId => (mode === 'all' ? 'type' : 'new');
// Sections make no sense on a kind's own page
export const sortsFor = (mode: string) => SORTS.filter((s) => s.id !== 'type' || mode !== 'type');

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
