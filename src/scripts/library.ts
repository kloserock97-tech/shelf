// The library's filter and sort, after Mobbin's catalogue: facets (Type, Task, Stack, Tags) as pills with a popover,
// counts beside every value recomputed against the other filters, several values per facet (OR), facets and the
// text query together (AND), the applied count inside the pill, a view menu (grouping and order), a readable URL, filters kept when the
// sidebar changes the type, and an empty state that names the filter to drop. On a phone the popover is a sheet.
import { FACETS, SORTS, GROUPINGS, VIEWS, STACK_GROUPS, defaultSort, defaultGroup, defaultView, sortsFor, groupsFor, stackGroupOf, tagInLang, type FacetId, type GroupId, type SortId, type ViewId } from '../lib/facets';
import { GROUPS, TYPES, typeLabel, typeAbout, typeOf } from '../lib/taxonomy';
import { JOBS, jobOf, nameOf, aboutOf } from '../lib/curation';
import { itemsWord, type Key, type Lang } from '../lib/i18n';

export interface LibEntry { slug: string; title: string; type: string; jobs: string[]; tech: string[]; tags: string[]; added: string; updated: string; poster: string | null }
export interface LibDeps {
  lang: Lang;
  tr: (k: Key, vars?: Record<string, string | number>) => string;
  index: Map<string, LibEntry>;
  find: (q: string) => string[];
  store: { get: (k: string) => string | null; set: (k: string, v: string | null) => void };
  favs: Set<string>;
  narrow: MediaQueryList;
}
export interface LibApi {
  apply: () => void;
  visible: () => HTMLElement[];
  /** filter values whose name matches a palette query: [{ facet, value, label }] */
  suggest: (q: string) => { facet: FacetId; value: string; label: string }[];
  /** add a value to its facet (from the palette) */
  choose: (facet: FacetId, value: string) => void;
}

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T | null;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll(sel)) as T[];
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const CARRY = ['job', 'stack', 'tag', 'sort']; // what follows you to another type in the sidebar
const CARRY_SORTS: SortId[] = ['updated', 'az']; // orders that mean the same on every list
const TAG_POPULAR = 2; // a tag used this many times is listed before you search

export function initLibrary(grid: HTMLElement, d: LibDeps): LibApi {
  const { tr, lang, index } = d;
  const mode = grid.dataset.mode ?? 'all';
  const cards = $$('.sh-card', grid);
  const entries = cards.map((c) => index.get(c.dataset.slug!)).filter((e): e is LibEntry => Boolean(e));
  const cardOf = new Map(cards.map((c) => [c.dataset.slug!, c]));
  const collator = new Intl.Collator(lang === 'ru' ? 'ru' : 'en', { sensitivity: 'base', numeric: true });
  const input = $<HTMLInputElement>('#search');
  const countEl = $('[data-count="visible"]');
  const status = $('[data-results-status]');
  const clearBtn = $('.sh-filters__clear');
  const facetBtns = $$<HTMLButtonElement>('[data-facet]');
  const hasFacet = (f: FacetId) => facetBtns.some((b) => b.dataset.facet === f);
  // a page without the filter row (Favorites) takes only the sort from the URL: no filters you can't see
  const facetsOn = Boolean($('[data-filters]'));

  /* ---------- state and the URL ---------- */
  type State = { q: string; type: Set<string>; job: Set<string>; stack: Set<string>; tag: Set<string>; sort: SortId; group: GroupId; view: ViewId };
  const params = new URLSearchParams(location.search);
  const list = (k: string) => new Set((params.get(k) ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  const baseSort = defaultSort(mode);
  const offered = sortsFor(mode);
  const sortFromParam = (v: string | null): SortId | null => offered.find((s) => s.param === v)?.id ?? null;
  const storedSort = d.store.get('shelf:sort');
  // the grouping is remembered per kind of list: tasks on All items shouldn't turn a kind's page into groups
  const baseGroup = defaultGroup(mode);
  const groupings = groupsFor(mode);
  const groupKey = `shelf:group:${mode}`;
  const groupFromParam = (v: string | null): GroupId | null => groupings.find((g) => g.param === v)?.id ?? null;
  const storedGroup = groupings.find((g) => g.id === d.store.get(groupKey))?.id;
  const baseView = defaultView(mode);
  const viewKey = `shelf:view:${mode}`;
  const viewFromParam = (v: string | null): ViewId | null => VIEWS.find((x) => x.param === v)?.id ?? null;
  const storedView = VIEWS.find((x) => x.id === d.store.get(viewKey))?.id;
  const state: State = {
    q: params.get('q') ?? '',
    type: hasFacet('type') ? list('type') : new Set(),
    job: facetsOn ? list('job') : new Set(),
    stack: facetsOn ? list('stack') : new Set(),
    tag: facetsOn ? list('tag') : new Set(),
    sort: sortFromParam(params.get('sort')) ?? (storedSort === 'name' ? 'az' : (offered.find((s) => s.id === storedSort)?.id ?? baseSort)),
    group: groupFromParam(params.get('group')) ?? storedGroup ?? baseGroup,
    view: viewFromParam(params.get('view')) ?? storedView ?? baseView
  };
  // links from before the facets used ?tech=
  if (facetsOn && params.get('tech')) state.stack.add(params.get('tech')!);
  if (input && state.q) input.value = state.q;

  const active = () => state.type.size + state.job.size + state.stack.size + state.tag.size;
  function writeUrl() {
    const p = new URLSearchParams(location.search);
    ['q', 'type', 'job', 'stack', 'tag', 'view', 'group', 'sort', 'tech'].forEach((k) => p.delete(k));
    if (state.q.trim()) p.set('q', state.q.trim());
    for (const f of FACETS) if (state[f.id].size) p.set(f.param, [...state[f.id]].join(','));
    if (state.view !== baseView) p.set('view', VIEWS.find((x) => x.id === state.view)!.param);
    if (state.group !== baseGroup) p.set('group', GROUPINGS.find((g) => g.id === state.group)!.param);
    if (state.sort !== baseSort) p.set('sort', SORTS.find((s) => s.id === state.sort)!.param);
    const qs = p.toString().replace(/%2C/g, ',');
    history.replaceState(history.state, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
    carryToSidebar();
  }
  // Mobbin keeps filters when you switch the content type; here the sidebar links carry Task, Stack, Tags and the sort.
  function carryToSidebar() {
    const p = new URLSearchParams();
    if (state.job.size) p.set('job', [...state.job].join(','));
    if (state.stack.size) p.set('stack', [...state.stack].join(','));
    if (state.tag.size) p.set('tag', [...state.tag].join(','));
    if (CARRY_SORTS.includes(state.sort)) p.set('sort', SORTS.find((s) => s.id === state.sort)!.param);
    const qs = p.toString().replace(/%2C/g, ',');
    $$<HTMLAnchorElement>('#sidebar a.sh-sb__row[href]').forEach((a) => {
      const url = new URL(a.href);
      CARRY.forEach((k) => url.searchParams.delete(k));
      if (qs) new URLSearchParams(qs).forEach((v, k) => url.searchParams.set(k, v));
      a.href = url.toString().replace(/%2C/g, ',');
    });
  }

  /* ---------- matching ---------- */
  const has = (e: LibEntry, f: FacetId, v: string) =>
    f === 'type' ? e.type === v : f === 'job' ? e.jobs.includes(v) : f === 'stack' ? e.tech.includes(v) : e.tags.includes(v);
  const passes = (e: LibEntry, f: FacetId) => state[f].size === 0 || [...state[f]].some((v) => has(e, f, v));
  const inMode = (e: LibEntry) => mode !== 'favorites' || d.favs.has(e.slug);
  let queryHits: Map<string, number> | null = null;
  const refreshQuery = () => {
    const q = state.q.trim();
    queryHits = q ? new Map(d.find(q).map((s, i) => [s, i])) : null;
  };
  // the set a facet counts against: everything else applied, this facet left open
  const baseFor = (except: FacetId | null) =>
    entries.filter((e) => inMode(e) && (!queryHits || queryHits.has(e.slug)) && FACETS.every((f) => f.id === except || passes(e, f.id)));
  const matching = () => baseFor(null);

  const sorters: Record<SortId, (a: LibEntry, b: LibEntry) => number> = {
    new: (a, b) => b.added.localeCompare(a.added) || collator.compare(a.title, b.title),
    updated: (a, b) => b.updated.localeCompare(a.updated) || b.added.localeCompare(a.added) || collator.compare(a.title, b.title),
    az: (a, b) => collator.compare(a.title, b.title),
    type: (a, b) => TYPES.findIndex((t) => t.id === a.type) - TYPES.findIndex((t) => t.id === b.type) || collator.compare(a.title, b.title)
  };
  // With a text query the default order is relevance, as in Mobbin's search; a sort you picked still wins.
  const relevance = () => Boolean(queryHits) && state.sort === baseSort;
  // Sections: the list broken up by kind group under its own headers, unless the words sort by relevance
  const heads = new Map($$('[data-group-head]', grid).map((h) => [h.dataset.groupHead!, h]));
  const grouped = () => state.group !== 'none' && !relevance() && heads.size > 0;
  // sections by kind group, or tasks by each piece's main job (a piece shows once, under its first job). With tasks in
  // the filter, a piece stands under the first of those it has: filtered to Showcase, every showcase piece is in one group.
  const jobOfEntry = (e: LibEntry) => (state.job.size ? e.jobs.find((j) => state.job.has(j)) : undefined) ?? e.jobs[0];
  const groupDefs = (): { key: string; has: (e: LibEntry) => boolean }[] =>
    state.group === 'section'
      ? GROUPS.map((g) => ({ key: `section:${g.id}`, has: (e: LibEntry) => typeOf(e.type).group === g.id }))
      : JOBS.map((j) => ({ key: `job:${j.id}`, has: (e: LibEntry) => jobOfEntry(e) === j.id }));

  /* ---------- rendering the grid ---------- */
  let visible: HTMLElement[] = cards;
  const hero = $('[data-hero]');
  const rail = $('[data-rail]');
  function apply() {
    refreshQuery();
    const found = matching();
    found.sort(relevance() ? (a, b) => queryHits!.get(a.slug)! - queryHits!.get(b.slug)! : sorters[state.sort]);
    const keep = new Set(found.map((e) => e.slug));
    cards.forEach((c) => { c.hidden = !keep.has(c.dataset.slug!); if (c.hidden) c.removeAttribute('data-selected'); });
    visible = found.map((e) => cardOf.get(e.slug)!);
    layout(found);
    grid.hidden = found.length === 0;
    if (countEl) countEl.textContent = String(found.length);
    const filtered = Boolean(state.q.trim()) || active() > 0;
    hero?.toggleAttribute('hidden', filtered);
    rail?.toggleAttribute('hidden', filtered);
    if (clearBtn) clearBtn.hidden = !filtered;
    // the words search only this page's items: the placeholder says how many (Favorites changes as you star)
    const own = entries.filter(inMode).length;
    if (input) input.placeholder = tr('searchHere', { n: own, items: itemsWord(lang, own) });
    renderEmpty(found.length, filtered);
    syncControls();
    if (status) status.textContent = filtered ? tr('resultsCount', { n: found.length, items: itemsWord(lang, found.length) }) : '';
    if (pop && !pop.hidden && openFacet) renderPop(openFacet, false);
  }

  // In the grid each group's header spans the row above its cards; on shelves each group is a row of its own that
  // scrolls sideways. Empty groups hide either way.
  function layout(found: LibEntry[]) {
    heads.forEach((h) => (h.hidden = true));
    shelves.forEach((s) => (s.el.hidden = true));
    grid.dataset.layout = 'grid';
    if (!grouped()) { visible.forEach((c) => grid.append(c)); return; }
    const groups = groupDefs()
      .map((g) => ({ key: g.key, head: heads.get(g.key), items: found.filter(g.has) }))
      .filter((g): g is { key: string; head: HTMLElement; items: LibEntry[] } => Boolean(g.head) && g.items.length > 0);
    const onShelves = state.view === 'shelves' && groups.length > 1;
    grid.dataset.layout = onShelves ? 'shelves' : 'grid';
    // the cards in the order you see them, so arrows and Quick Look walk the groups as laid out
    const seq: HTMLElement[] = [];
    for (const g of groups) {
      g.head.hidden = false;
      const n = $('[data-group-count]', g.head);
      if (n) n.textContent = String(g.items.length);
      const groupCards = g.items.map((e) => cardOf.get(e.slug)!);
      seq.push(...groupCards);
      if (onShelves) {
        const s = shelfFor(g.key);
        s.bar.prepend(g.head);
        s.all.hidden = !facetsOn;
        s.all.textContent = tr('seeAll');
        s.all.setAttribute('aria-label', tr('seeAllOf', { group: $('.sh-grid__title', g.head)?.firstChild?.textContent?.trim() ?? '' }));
        s.row.replaceChildren(...groupCards);
        s.row.scrollLeft = 0;
        s.el.hidden = false;
        grid.append(s.el);
      } else {
        grid.append(g.head, ...groupCards);
      }
    }
    // a piece without a job yet still shows, after the groups
    const rest = found.map((e) => cardOf.get(e.slug)!).filter((c) => !seq.includes(c));
    if (onShelves && rest.length) shelves.get(groups[groups.length - 1].key)!.row.append(...rest); else grid.append(...rest);
    visible = [...seq, ...rest];
    if (onShelves) { fitShelves(); shelves.forEach((s) => s.sync()); }
  }

  /* ---------- shelves: a row per group, arrows in its bar, See all narrows the list to it ---------- */
  type Shelf = { el: HTMLElement; bar: HTMLElement; row: HTMLElement; all: HTMLButtonElement; sync: () => void };
  const shelves = new Map<string, Shelf>();
  function shelfFor(key: string): Shelf {
    const have = shelves.get(key);
    if (have) return have;
    const el = document.createElement('section');
    el.className = 'sh-shelf';
    el.dataset.shelf = key;
    const bar = document.createElement('div');
    bar.className = 'sh-shelf__bar';
    const tools = document.createElement('div');
    tools.className = 'sh-shelf__tools';
    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'sh-btn sh-btn--plain sh-btn--sm sh-shelf__all';
    all.addEventListener('click', () => seeAll(key));
    const nav = document.createElement('div');
    nav.className = 'sh-rail__nav';
    const arrow = (dir: -1 | 1) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sh-btn sh-btn--ghost sh-btn--icon sh-btn--sm';
      b.setAttribute('aria-label', tr(dir < 0 ? 'railPrev' : 'railNext'));
      b.innerHTML = $<HTMLTemplateElement>('template[data-arrow="' + dir + '"]')?.innerHTML ?? '';
      return b;
    };
    const prev = arrow(-1), next = arrow(1);
    nav.append(prev, next);
    tools.append(all, nav);
    bar.append(tools);
    const row = document.createElement('div');
    row.className = 'sh-shelf__row';
    el.append(bar, row);
    const s: Shelf = { el, bar, row, all, sync: wireRow(row, prev, next) };
    shelves.set(key, s);
    return s;
  }
  // how many cards a row shows: as many as the grid would put in a line at this card size
  function fitShelves() {
    const row = $('.sh-shelf:not([hidden]) .sh-shelf__row', grid);
    if (!row) return;
    const cs = getComputedStyle(row);
    const inner = row.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const gap = parseFloat(cs.columnGap) || 24;
    const min = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--card-min-width')) || 232;
    const n = Math.max(1, Math.floor((inner + gap) / (min + gap)));
    // on touch the next card peeks past the edge, so the row reads as one you can swipe
    grid.style.setProperty('--shelf-n', String(matchMedia('(hover: none)').matches ? n + 0.3 : n));
  }
  function seeAll(key: string) {
    const [kind, id] = key.split(':');
    if (kind === 'section') state.type = new Set(TYPES.filter((t) => t.group === id).map((t) => t.id));
    else state.job = new Set([id]);
    writeUrl();
    apply();
    grid.scrollIntoView({ block: 'start', behavior: 'instant' });
    (grid.querySelector<HTMLElement>('.sh-card:not([hidden]) .sh-card__thumb') ?? input)?.focus({ preventScroll: true });
  }
  // a row that scrolls sideways: arrows step a screenful and grey out at the ends, hide when there is nowhere to go
  function wireRow(list: HTMLElement, prev: HTMLButtonElement, next: HTMLButtonElement) {
    const sync = () => {
      const max = list.scrollWidth - list.clientWidth;
      prev.disabled = list.scrollLeft <= 1;
      next.disabled = list.scrollLeft >= max - 1;
      prev.hidden = next.hidden = max <= 1;
    };
    const step = (dir: number) => () => {
      const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
      list.scrollBy({ left: dir * list.clientWidth * 0.9, behavior: smooth ? 'smooth' : 'instant' });
    };
    prev.addEventListener('click', step(-1));
    next.addEventListener('click', step(1));
    list.addEventListener('scroll', sync, { passive: true });
    return sync;
  }
  addEventListener('resize', () => { if (grid.dataset.layout === 'shelves') { fitShelves(); shelves.forEach((s) => s.sync()); } });
  $('[data-zoom]')?.addEventListener('input', () => { if (grid.dataset.layout === 'shelves') { fitShelves(); shelves.forEach((s) => s.sync()); } });

  function renderEmpty(n: number, filtered: boolean) {
    const empty = n ? '' : filtered ? 'search' : mode === 'favorites' ? 'favorites' : 'none';
    $$('[data-empty]').forEach((el) => (el.hidden = el.dataset.empty !== empty));
    if (empty !== 'search') return;
    const q = state.q.trim();
    const titleEl = $('[data-empty-title]');
    const textEl = $('[data-empty-text]');
    const fixes = $('[data-empty-fixes]');
    const byFilters = active() > 0;
    if (titleEl) titleEl.textContent = byFilters ? titleEl.dataset.emptyTitleFilters ?? '' : (titleEl.dataset.emptyTitle ?? '').replace('{q}', q);
    if (textEl) textEl.textContent = byFilters ? textEl.dataset.emptyTextFilters ?? '' : textEl.dataset.emptyText ?? '';
    if (!fixes) return;
    // Mobbin never leaves you at zero: name each filter and how many items come back without it
    const rows: string[] = [];
    // over a copy: taking a value out and putting it back would move it to the end of the live set, forever
    for (const f of FACETS) for (const v of [...state[f.id]]) {
      state[f.id].delete(v);
      const back = matching().length;
      state[f.id].add(v);
      if (back > 0) rows.push(`<button class="sh-chip" type="button" data-drop-facet="${f.id}" data-drop-value="${esc(v)}">${esc(tr('withoutValue', { value: valueLabel(f.id, v) }))} <span class="sh-chip__count">${back}</span></button>`);
    }
    fixes.innerHTML = rows.join('');
    fixes.hidden = rows.length === 0;
  }

  function syncControls() {
    for (const b of facetBtns) {
      const f = b.dataset.facet as FacetId;
      const n = state[f].size;
      const badge = $('[data-facet-n]', b);
      if (badge) { badge.textContent = String(n); badge.hidden = n === 0; }
      b.classList.toggle('is-on', n > 0);
      const name = tr(FACETS.find((x) => x.id === f)!.key);
      b.setAttribute('aria-label', n ? `${name}, ${n}` : name);
    }
    $$<HTMLButtonElement>('[data-filter="tech"] .sh-chip').forEach((c) => c.setAttribute('aria-pressed', String(state.stack.has(c.dataset.value ?? ''))));
    // the button names what differs from a plain grid: shelves, the grouping, an order that isn't the page's own
    const sortLabel = $('[data-sort-label]');
    const orderName = tr(SORTS.find((s) => s.id === state.sort)!.key);
    const groupName = tr(GROUPINGS.find((g) => g.id === state.group)!.key);
    const shelved = grid.dataset.layout === 'shelves';
    const parts = [
      shelved ? tr('viewShelves') : '',
      state.group !== 'none' && (!shelved || state.group !== baseGroup) ? groupName : '',
      state.sort !== baseSort || (state.group === 'none' && !shelved) ? orderName : ''
    ].filter(Boolean);
    const current = relevance() ? tr('sortBest') : parts.join(' · ') || orderName;
    if (sortLabel) sortLabel.textContent = current;
    $('[data-sort-trigger]')?.setAttribute('aria-label', tr('viewLabel', { view: current }));
    $$('[data-sort-menu] [data-value]').forEach((el) => el.setAttribute('aria-checked', String(el.dataset.value === state.sort)));
    $$('[data-sort-menu] [data-group]').forEach((el) => el.setAttribute('aria-checked', String(el.dataset.group === state.group)));
    $$('[data-sort-menu] [data-view]').forEach((el) => el.setAttribute('aria-checked', String(el.dataset.view === state.view)));
  }

  /* ---------- value labels and option lists ---------- */
  const valueLabel = (f: FacetId, v: string) => (f === 'type' ? typeLabel(typeOf(v), lang) : f === 'job' ? nameOf(jobOf(v), lang) : v);
  type Opt = { value: string; label: string; count: number; group: string };
  function optionsFor(f: FacetId, needle = ''): { groups: { label: string; opts: Opt[] }[]; searchable: boolean } {
    const inPage = entries.filter(inMode);
    const base = baseFor(f);
    const count = (v: string) => base.filter((e) => has(e, f, v)).length;
    const pageHas = (v: string) => inPage.some((e) => has(e, f, v));
    const n = needle.trim().toLowerCase();
    if (f === 'type') {
      const groups = GROUPS.map((g) => ({
        label: lang === 'ru' ? g.ru : g.label,
        opts: TYPES.filter((t) => t.group === g.id && pageHas(t.id)).map((t) => ({ value: t.id, label: typeLabel(t, lang), count: count(t.id), group: g.id }))
      })).filter((g) => g.opts.length);
      return { groups, searchable: false };
    }
    // tasks in their own order (the way the Coverage page lists them), only the ones this page has
    if (f === 'job') {
      const opts = JOBS.filter((j) => pageHas(j.id)).map((j) => ({ value: j.id as string, label: nameOf(j, lang), count: count(j.id), group: '' }));
      return { groups: [{ label: tr('facetJob'), opts }], searchable: false };
    }
    if (f === 'stack') {
      const all = [...new Set(inPage.flatMap((e) => e.tech))].filter((v) => !n || v.toLowerCase().includes(n));
      const keys: Key[] = [...STACK_GROUPS.map((g) => g.key), 'stackTools'];
      const groups = keys.map((k) => ({
        label: tr(k),
        opts: all.filter((v) => stackGroupOf(v) === k).map((v) => ({ value: v, label: v, count: count(v), group: k }))
          .sort((a, b) => b.count - a.count || collator.compare(a.label, b.label))
      })).filter((g) => g.opts.length);
      return { groups, searchable: all.length > 12 || Boolean(n) };
    }
    // tags: the page language's tags; before you type, the ones used more than once and whatever is selected
    const tagCount = new Map<string, number>();
    for (const e of inPage) for (const t of e.tags) if (tagInLang(t, lang) || state.tag.has(t)) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
    let tags = [...tagCount.keys()];
    tags = n ? tags.filter((t) => t.toLowerCase().includes(n)) : tags.filter((t) => state.tag.has(t) || (tagCount.get(t) ?? 0) >= TAG_POPULAR);
    const opts = tags.map((v) => ({ value: v, label: v, count: count(v), group: '' }))
      .sort((a, b) => Number(state.tag.has(b.value)) - Number(state.tag.has(a.value)) || b.count - a.count || collator.compare(a.label, b.label));
    return { groups: [{ label: tr(n ? 'tagsFound' : 'tagsPopular'), opts }], searchable: true };
  }

  /* ---------- the popover (a sheet on a phone) ---------- */
  const pop = $('[data-facet-pop]');
  const popList = pop ? $('[data-pop-list]', pop) : null;
  const popSearch = pop ? $<HTMLInputElement>('[data-pop-search]', pop) : null;
  const popSearchWrap = pop ? $('[data-pop-search-wrap]', pop) : null;
  const popPeek = pop ? $('[data-pop-peek]', pop) : null;
  const popClear = pop ? $<HTMLButtonElement>('[data-pop-clear]', pop) : null;
  const popShow = pop ? $<HTMLButtonElement>('[data-pop-show]', pop) : null;
  const scrim = document.createElement('div');
  scrim.className = 'sh-pop-scrim';
  scrim.hidden = true;
  pop?.before(scrim);
  let openFacet: FacetId | null = null;
  let opener: HTMLButtonElement | null = null;

  function renderPop(f: FacetId, focusFirst: boolean) {
    if (!pop || !popList) return;
    const needle = popSearch?.value ?? '';
    const { groups, searchable } = optionsFor(f, needle);
    const name = tr(FACETS.find((x) => x.id === f)!.key);
    const titleEl = $('[data-pop-title]', pop);
    if (titleEl) titleEl.textContent = name;
    if (popSearchWrap && popSearch) {
      popSearchWrap.hidden = !searchable;
      popSearch.placeholder = tr(f === 'tag' ? 'findTag' : 'findStack');
      popSearch.setAttribute('aria-label', popSearch.placeholder);
    }
    if (popClear) {
      popClear.hidden = state[f].size === 0;
      popClear.setAttribute('aria-label', tr('clearFacet', { facet: name }));
    }
    const rows = groups.map((g, gi) => {
      const legend = groups.length > 1 || f === 'tag' ? `<legend class="sh-pop__group">${esc(g.label)}</legend>` : `<legend class="sh-visually-hidden">${esc(name)}</legend>`;
      const opts = g.opts.map((o) => {
        const on = state[f].has(o.value);
        return `<label class="sh-opt${!on && o.count === 0 ? ' is-empty' : ''}" data-opt="${esc(o.value)}">` +
          `<input type="checkbox" value="${esc(o.value)}"${on ? ' checked' : ''}>` +
          `<span class="sh-opt__box" aria-hidden="true"></span>` +
          `<span class="sh-opt__label">${esc(o.label)}</span><span class="sh-opt__n">${o.count}</span></label>`;
      }).join('');
      return `<fieldset class="sh-pop__set" data-group="${gi}">${legend}${opts}</fieldset>`;
    });
    popList.innerHTML = rows.join('') || `<p class="sh-pop__none">${esc(tr('facetNone'))}</p>`;
    if (popShow) {
      const n = matching().length;
      popShow.textContent = tr('showItems', { n, items: itemsWord(lang, n) });
    }
    if (popPeek) { popPeek.innerHTML = ''; popPeek.hidden = true; }
    if (focusFirst) {
      const target = searchable && popSearch ? popSearch : $<HTMLInputElement>('input[type="checkbox"]', popList);
      target?.focus({ preventScroll: true });
    }
  }
  // Mobbin's sneak peek: pointing at a value shows a few of its posters (and for a type, what the type is)
  function peek(f: FacetId, v: string) {
    if (!popPeek || d.narrow.matches) return;
    const base = baseFor(f).filter((e) => has(e, f, v) && e.poster).slice(0, 3);
    const aboutText = f === 'type' ? typeAbout(typeOf(v), lang) : f === 'job' ? aboutOf(jobOf(v), lang) : '';
    const about = aboutText ? `<p class="sh-pop__about">${esc(aboutText)}</p>` : '';
    popPeek.innerHTML = base.length || about ? `${about}<div class="sh-pop__thumbs">${base.map((e) => `<img src="${esc(e.poster!)}" alt="" loading="lazy" decoding="async">`).join('')}</div>` : '';
    popPeek.hidden = !popPeek.innerHTML;
  }
  function placePop() {
    if (!pop || !opener) return;
    if (d.narrow.matches) { pop.style.removeProperty('left'); pop.style.removeProperty('top'); pop.style.removeProperty('max-height'); return; }
    const r = opener.getBoundingClientRect();
    const w = pop.offsetWidth || 320;
    const left = Math.max(12, Math.min(r.left, innerWidth - w - 12));
    const top = r.bottom + 6;
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    pop.style.maxHeight = `${Math.max(240, innerHeight - top - 16)}px`;
  }
  function openPop(f: FacetId, btn: HTMLButtonElement) {
    if (!pop) return;
    if (openFacet === f) { closePop(); return; }
    closeSort();
    if (openFacet) closePop(false);
    openFacet = f;
    opener = btn;
    if (popSearch) popSearch.value = '';
    pop.classList.toggle('sh-pop--sheet', d.narrow.matches);
    pop.setAttribute('aria-modal', String(d.narrow.matches));
    scrim.hidden = !d.narrow.matches;
    pop.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    renderPop(f, true);
    placePop();
  }
  function closePop(returnFocus = true) {
    if (!pop || pop.hidden) return;
    pop.hidden = true;
    scrim.hidden = true;
    opener?.setAttribute('aria-expanded', 'false');
    if (returnFocus) opener?.focus({ preventScroll: true });
    openFacet = null;
    opener = null;
  }
  facetBtns.forEach((b) => b.addEventListener('click', () => openPop(b.dataset.facet as FacetId, b)));
  popList?.addEventListener('change', (e) => {
    const box = e.target as HTMLInputElement;
    if (!openFacet || box.type !== 'checkbox') return;
    if (box.checked) state[openFacet].add(box.value); else state[openFacet].delete(box.value);
    const keep = box.value;
    writeUrl();
    apply();
    $<HTMLInputElement>(`input[value="${CSS.escape(keep)}"]`, popList)?.focus({ preventScroll: true });
  });
  popList?.addEventListener('pointerover', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-opt]');
    if (row && openFacet) peek(openFacet, row.dataset.opt!);
  });
  popList?.addEventListener('focusin', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-opt]');
    if (row && openFacet) peek(openFacet, row.dataset.opt!);
  });
  popList?.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const boxes = $$<HTMLInputElement>('input[type="checkbox"]', popList);
    const i = boxes.indexOf(document.activeElement as HTMLInputElement);
    if (i < 0) return;
    e.preventDefault();
    boxes[(i + (e.key === 'ArrowDown' ? 1 : -1) + boxes.length) % boxes.length]?.focus();
  });
  popSearch?.addEventListener('input', () => openFacet && renderPop(openFacet, false));
  popSearch?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); $<HTMLInputElement>('input[type="checkbox"]', popList ?? document)?.focus(); }
  });
  popClear?.addEventListener('click', () => {
    if (!openFacet) return;
    state[openFacet].clear();
    writeUrl();
    apply();
    (popSearch && !popSearchWrap?.hidden ? popSearch : $<HTMLInputElement>('input[type="checkbox"]', popList ?? document))?.focus();
  });
  popShow?.addEventListener('click', () => closePop());
  scrim.addEventListener('click', () => closePop());
  pop?.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closePop(); } });
  // a row is a label, not a focusable thing: without this a click moves focus to <main> and the popover closes
  pop?.addEventListener('mousedown', (e) => { if (!(e.target as HTMLElement).closest('input, button, a')) e.preventDefault(); });
  pop?.addEventListener('focusout', (e) => {
    const to = e.relatedTarget as Node | null;
    if (!d.narrow.matches && to && !pop.contains(to) && to !== opener) closePop(false);
  });
  document.addEventListener('pointerdown', (e) => {
    const t = e.target as Node;
    if (pop && !pop.hidden && !d.narrow.matches && !pop.contains(t) && !opener?.contains(t)) closePop(false);
    if (sortMenu && !sortMenu.hidden && !sortMenu.contains(t) && !sortBtn?.contains(t)) closeSort(false);
  });
  addEventListener('resize', placePop);
  addEventListener('scroll', placePop, { passive: true });
  d.narrow.addEventListener('change', () => { if (openFacet && opener) { const f = openFacet, b = opener; closePop(false); openPop(f, b); } });

  /* ---------- the sort menu ---------- */
  const sortBtn = $<HTMLButtonElement>('[data-sort-trigger]');
  const sortMenu = $('[data-sort-menu]');
  const sortItems = sortMenu ? $$<HTMLButtonElement>('[role="menuitemradio"]', sortMenu) : [];
  function openSort() {
    if (!sortMenu || !sortBtn) return;
    closePop(false);
    sortMenu.hidden = false;
    sortBtn.setAttribute('aria-expanded', 'true');
    const r = sortBtn.getBoundingClientRect();
    sortMenu.style.top = `${r.bottom + 6}px`;
    sortMenu.style.right = `${Math.max(12, innerWidth - r.right)}px`;
    (sortItems.find((b) => b.getAttribute('aria-checked') === 'true') ?? sortItems[0])?.focus();
  }
  function closeSort(returnFocus = true) {
    if (!sortMenu || sortMenu.hidden) return;
    sortMenu.hidden = true;
    sortBtn?.setAttribute('aria-expanded', 'false');
    if (returnFocus) sortBtn?.focus();
  }
  sortBtn?.addEventListener('click', () => (sortMenu?.hidden ? openSort() : closeSort()));
  sortItems.forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.view) {
      state.view = b.dataset.view as ViewId;
      // shelves are rows of groups: with no groups, bring back the page's own grouping (sections, or tasks)
      if (state.view === 'shelves' && state.group === 'none') state.group = baseGroup !== 'none' ? baseGroup : groupings[0].id;
      d.store.set(viewKey, state.view === baseView ? null : state.view);
      d.store.set(groupKey, state.group === baseGroup ? null : state.group);
    } else if (b.dataset.group) {
      state.group = b.dataset.group as GroupId;
      // no groups means nothing to put on shelves
      if (state.group === 'none') state.view = 'grid';
      d.store.set(groupKey, state.group === baseGroup ? null : state.group);
      d.store.set(viewKey, state.view === baseView ? null : state.view);
    } else {
      state.sort = b.dataset.value as SortId;
      d.store.set('shelf:sort', state.sort === baseSort ? null : state.sort);
    }
    writeUrl();
    apply();
    closeSort();
  }));
  sortMenu?.addEventListener('keydown', (e) => {
    const i = sortItems.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sortItems[(i + (e.key === 'ArrowDown' ? 1 : -1) + sortItems.length) % sortItems.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); sortItems[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); sortItems[sortItems.length - 1]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSort(); }
    else if (e.key === 'Tab') closeSort(false);
  });

  /* ---------- quick chips, the query, clearing ---------- */
  $$<HTMLButtonElement>('[data-filter="tech"] .sh-chip').forEach((c) => c.addEventListener('click', () => {
    const v = c.dataset.value ?? '';
    if (state.stack.has(v)) state.stack.delete(v); else state.stack.add(v);
    writeUrl();
    apply();
  }));
  input?.addEventListener('input', () => { state.q = input.value; writeUrl(); apply(); });
  $$('[data-action="clear-filters"]').forEach((b) => b.addEventListener('click', () => {
    state.q = ''; state.type.clear(); state.job.clear(); state.stack.clear(); state.tag.clear();
    if (input) input.value = '';
    writeUrl();
    apply();
    (facetBtns[0] ?? input)?.focus();
  }));
  $('[data-empty-fixes]')?.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-drop-facet]');
    if (!b) return;
    state[b.dataset.dropFacet as FacetId].delete(b.dataset.dropValue ?? '');
    writeUrl();
    apply();
    (grid.querySelector<HTMLElement>('.sh-card:not([hidden]) .sh-card__thumb') ?? input)?.focus();
  });

  /* ---------- the collections shelf: the same kind of row as a shelf of cards ---------- */
  const railList = $('[data-rail-list]');
  const railPrev = $<HTMLButtonElement>('[data-rail-step="-1"]');
  const railNext = $<HTMLButtonElement>('[data-rail-step="1"]');
  if (railList && railPrev && railNext) {
    const sync = wireRow(railList, railPrev, railNext);
    addEventListener('resize', sync);
    sync();
  }

  writeUrl();
  apply();

  return {
    apply,
    visible: () => visible,
    suggest(q) {
      const n = q.trim().toLowerCase();
      if (n.length < 2) return [];
      const out: { facet: FacetId; value: string; label: string }[] = [];
      const inPage = entries.filter(inMode);
      if (hasFacet('type')) for (const t of TYPES) {
        const label = typeLabel(t, lang);
        if (inPage.some((e) => e.type === t.id) && label.toLowerCase().includes(n)) out.push({ facet: 'type', value: t.id, label });
      }
      for (const j of JOBS) {
        const label = nameOf(j, lang);
        if (inPage.some((e) => e.jobs.includes(j.id)) && label.toLowerCase().includes(n)) out.push({ facet: 'job', value: j.id, label });
      }
      for (const v of new Set(inPage.flatMap((e) => e.tech))) if (v.toLowerCase().includes(n)) out.push({ facet: 'stack', value: v, label: v });
      for (const v of new Set(inPage.flatMap((e) => e.tags))) if (tagInLang(v, lang) && v.toLowerCase().startsWith(n)) out.push({ facet: 'tag', value: v, label: v });
      return out.filter((o) => !state[o.facet].has(o.value)).slice(0, 4);
    },
    choose(facet, value) {
      state[facet].add(value);
      writeUrl();
      apply();
    }
  };
}
