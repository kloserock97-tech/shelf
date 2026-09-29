// The search overlay, after Mobbin's search bar: one dark glass panel to find anything on the shelf or browse it.
// Above, recent picks as chips (popular filters on a first visit). On the left, tabs: New, Kinds, Tasks, Collections,
// Stack & tags; Tab and Shift+Tab switch them, as at Mobbin. On the right, tiles with covers. Typing turns every tab
// into matches for the words, the first one into Top results with "Show all for …" on top.
// A kind, a task, a technology or a tag opens All items with that filter (on All items it is added in place, so
// filters layer); a collection opens its page, an item its page. The input keeps focus: arrows move through the tiles
// by where they stand on screen (aria-activedescendant), Enter picks, Esc closes.
import { GROUPS, TYPES, typeLabel, groupLabel } from '../lib/taxonomy';
import { JOBS, COLLECTIONS, nameOf } from '../lib/curation';
import { STACK_GROUPS, stackGroupOf, tagInLang, type FacetId } from '../lib/facets';
import type { Key, Lang } from '../lib/i18n';

export interface FinderEntry {
  slug: string; title: string; type: string; typeLabel: string; tech: string[]; tags: string[];
  jobs: string[]; collections: string[]; poster: string | null; url: string; added: string;
}
export interface FinderAction { label: string; icon: string; key?: string; run: () => void }
export type FinderIcon = 'kind' | 'task' | 'collection' | 'stack' | 'tag' | 'item' | 'query' | 'go' | 'clear' | 'arrow';
export interface FinderDeps {
  lang: Lang;
  tr: (k: Key, vars?: Record<string, string | number>) => string;
  index: FinderEntry[];
  find: (q: string) => string[];
  actions: () => FinderAction[];
  places: () => { label: string; href: string; icon: string }[];
  icons: Record<FinderIcon, string>;
  /** on All items: add a filter value in place, so filters layer */
  choose: ((facet: FacetId, value: string) => void) | null;
  /** on All items: put the words into the list search */
  query: ((q: string) => void) | null;
  allItemsUrl: () => string;
  collectionUrl: (id: string) => string;
  store: { get: (k: string) => string | null; set: (k: string, v: string | null) => void };
  lock: (on: boolean) => void;
}
export interface FinderApi { open: (initial?: string) => void; close: () => void; isOpen: () => boolean }

type TabId = 'new' | 'kinds' | 'tasks' | 'collections' | 'stack';
type Pick = { k: 'type' | 'job' | 'collection' | 'stack' | 'tag' | 'item' | 'q'; v: string };
type Group = { id: string; label: string; members: FinderEntry[]; group?: string; pick?: readonly string[] };

const TABS: TabId[] = ['new', 'kinds', 'tasks', 'collections', 'stack'];
const RECENT = 'shelf:recent';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

export function initFinder(root: HTMLElement, d: FinderDeps): FinderApi {
  const { tr, lang, icons } = d;
  const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as T | null;
  const input = $<HTMLInputElement>('.sh-finder__input')!;
  const list = $('[data-finder-list]')!;
  const panel = $('[data-finder-panel]')!;
  const phone = matchMedia('(max-width: 760px)');
  const touch = matchMedia('(hover: none)');
  const recentRow = $('[data-finder-recent]')!;
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-tab]')];

  /* ---------- what there is to show: groups of items, newest first inside each ---------- */
  const byNew = [...d.index].sort((a, b) => b.added.localeCompare(a.added) || a.title.localeCompare(b.title));
  const bySlug = new Map(d.index.map((e) => [e.slug, e]));
  const fill = (id: string, label: string, test: (e: FinderEntry) => boolean, group?: string): Group => ({ id, label, members: byNew.filter(test), group });
  const kinds = TYPES.map((t) => fill(t.id, typeLabel(t, lang), (e) => e.type === t.id, t.group)).filter((g) => g.members.length);
  const tasks = JOBS.map((j) => fill(j.id, nameOf(j, lang), (e) => e.jobs.includes(j.id))).filter((g) => g.members.length);
  // a collection's tile shows its hand-picked cover first, as on All items
  const colls = COLLECTIONS.map((c) => ({ ...fill(c.id, nameOf(c, lang), (e) => e.collections.includes(c.id)), pick: c.cover })).filter((g) => g.members.length);
  const techs = [...new Set(d.index.flatMap((e) => e.tech))]
    .map((v) => fill(v, v, (e) => e.tech.includes(v), stackGroupOf(v)))
    .sort((a, b) => b.members.length - a.members.length || a.label.localeCompare(b.label));
  const tagCount = new Map<string, number>();
  for (const e of d.index) for (const t of e.tags) if (tagInLang(t, lang)) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  const tags = [...tagCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
  const byCount = (a: Group, b: Group) => b.members.length - a.members.length;

  // Covers for a tile: from different kinds where possible, so a tile shows the range of what it holds
  const covers = (g: Group, n: number) => {
    const out: FinderEntry[] = [];
    for (const s of g.pick ?? []) { const e = bySlug.get(s); if (e?.poster && out.length < n && !out.includes(e)) out.push(e); }
    for (const e of g.members) if (e.poster && out.length < n && !out.some((x) => x.type === e.type)) out.push(e);
    for (const e of g.members) if (e.poster && out.length < n && !out.includes(e)) out.push(e);
    return out.map((e) => e.poster!);
  };

  /* ---------- state ---------- */
  let tab: TabId = 'new';
  let opts: { id: string; run: () => void }[] = [];
  let active = -1;
  let returnTo: HTMLElement | null = null;
  let seq = 0;

  const recent = (): Pick[] => {
    try { const v = JSON.parse(d.store.get(RECENT) ?? '[]'); return Array.isArray(v) ? v.filter((p) => p && typeof p.k === 'string' && typeof p.v === 'string') : []; } catch { return []; }
  };
  const remember = (p: Pick) => {
    const rest = recent().filter((x) => !(x.k === p.k && x.v === p.v));
    d.store.set(RECENT, JSON.stringify([p, ...rest].slice(0, 8)));
  };
  const labelOf = (p: Pick): { label: string; icon: string } | null => {
    const find = (gs: Group[]) => gs.find((g) => g.id === p.v)?.label;
    switch (p.k) {
      case 'type': { const l = find(kinds); return l ? { label: l, icon: icons.kind } : null; }
      case 'job': { const l = find(tasks); return l ? { label: l, icon: icons.task } : null; }
      case 'collection': { const l = find(colls); return l ? { label: l, icon: icons.collection } : null; }
      case 'stack': return techs.some((g) => g.id === p.v) ? { label: p.v, icon: icons.stack } : null;
      case 'tag': return tagCount.has(p.v) ? { label: p.v, icon: icons.tag } : null;
      case 'item': { const e = bySlug.get(p.v); return e ? { label: e.title, icon: icons.item } : null; }
      case 'q': return { label: `«${p.v}»`, icon: icons.query };
    }
    return null;
  };

  /* ---------- picking ---------- */
  function go(p: Pick) {
    remember(p);
    const facet: FacetId | null = p.k === 'type' ? 'type' : p.k === 'job' ? 'job' : p.k === 'stack' ? 'stack' : p.k === 'tag' ? 'tag' : null;
    if (p.k === 'item') { location.href = bySlug.get(p.v)?.url ?? location.href; return; }
    if (p.k === 'collection') { location.href = d.collectionUrl(p.v); return; }
    if (p.k === 'q' && d.query) { close(false); d.query(p.v); return; }
    if (facet && d.choose) { close(false); d.choose(facet, p.v); return; }
    const u = new URL(d.allItemsUrl(), location.href);
    u.search = '';
    u.searchParams.set(p.k === 'q' ? 'q' : facet!, p.v);
    location.href = u.toString().replace(/%2C/g, ',');
  }

  /* ---------- markup ---------- */
  const optId = () => `fo-${seq}-${opts.length}`;
  const add = (run: () => void) => { const id = optId(); opts.push({ id, run }); return id; };
  const mark = (text: string, q: string) => {
    if (!q) return esc(text);
    const i = norm(text).indexOf(norm(q));
    return i < 0 ? esc(text) : `${esc(text.slice(0, i))}<mark>${esc(text.slice(i, i + q.length))}</mark>${esc(text.slice(i + q.length))}`;
  };
  const section = (head: string, inner: string, cls: string) =>
    inner ? `<div class="sh-finder__section" role="group" aria-label="${esc(head)}">${head ? `<div class="sh-finder__head" aria-hidden="true">${esc(head)}</div>` : ''}<div class="${cls}">${inner}</div></div>` : '';
  const app = (e: FinderEntry, q = '') => {
    const id = add(() => go({ k: 'item', v: e.slug }));
    return `<div class="sh-finder__app" role="option" id="${id}" aria-selected="false" aria-label="${esc(e.title)}, ${esc(e.typeLabel)}">` +
      `<span class="sh-finder__app-img">${e.poster ? `<img src="${esc(e.poster)}" alt="" loading="lazy" decoding="async">` : ''}</span>` +
      `<span class="sh-finder__app-label" aria-hidden="true">${mark(e.title, q)}</span></div>`;
  };
  const tile = (g: Group, pick: Pick, q = '', o: { wide?: boolean; small?: boolean } = {}) => {
    const id = add(() => go(pick));
    const art = covers(g, o.wide ? 3 : 2).map((src) => `<img src="${esc(src)}" alt="" loading="lazy" decoding="async">`).join('');
    return `<div class="sh-finder__tile${o.wide ? ' sh-finder__tile--wide' : ''}${o.small ? ' sh-finder__tile--small' : ''}" role="option" id="${id}" aria-selected="false" aria-label="${esc(g.label)}, ${g.members.length}">` +
      `<span class="sh-finder__tile-head" aria-hidden="true"><span class="sh-finder__tile-title">${mark(g.label, q)}</span><span class="sh-finder__tile-n">${g.members.length}</span></span>` +
      `<span class="sh-finder__art" aria-hidden="true">${art}</span></div>`;
  };
  const chip = (label: string, icon: string, run: () => void, labelHtml = esc(label), sub = '') => {
    const id = add(run);
    return `<div class="sh-finder__chip" role="option" id="${id}" aria-selected="false" aria-label="${esc(label)}${sub ? `, ${esc(sub)}` : ''}">` +
      `<span class="sh-i" aria-hidden="true">${icon}</span><span class="sh-finder__chip-label" aria-hidden="true">${labelHtml}</span>${sub ? `<span class="sh-finder__chip-sub" aria-hidden="true">${esc(sub)}</span>` : ''}</div>`;
  };
  const row = (label: string, icon: string, run: () => void, labelHtml = esc(label), trail = '', cls = '') => {
    const id = add(run);
    return `<div class="sh-finder__row${cls}" role="option" id="${id}" aria-selected="false" aria-label="${esc(label)}">` +
      `<span class="sh-finder__row-icon sh-i" aria-hidden="true">${icon}</span><span class="sh-finder__row-label" aria-hidden="true">${labelHtml}</span>${trail}</div>`;
  };
  const kindTile = (g: Group, q = '') => tile(g, { k: 'type', v: g.id }, q);
  const taskTile = (g: Group, q = '') => tile(g, { k: 'job', v: g.id }, q);
  const collTile = (g: Group, q = '') => tile(g, { k: 'collection', v: g.id }, q, { wide: true });
  const techTile = (g: Group, q = '') => tile(g, { k: 'stack', v: g.id }, q, { small: true });
  const tagChip = (t: string, q = '') => chip(t, icons.tag, () => go({ k: 'tag', v: t }), mark(t, q));

  const appsRow = () => (phone.matches ? 8 : 6);

  /* ---------- the chips row: recent picks, or popular filters on a first visit ---------- */
  function renderRecent(q: string) {
    if (q) { recentRow.hidden = true; recentRow.innerHTML = ''; return []; }
    const picks = recent().map((p) => ({ p, l: labelOf(p) })).filter((x) => x.l) as { p: Pick; l: { label: string; icon: string } }[];
    const ids: string[] = [];
    const before = opts.length;
    let html = '';
    if (picks.length) {
      html += picks.map(({ p, l }) => chip(l.label, l.icon, () => go(p))).join('');
      html += chip(tr('finderClearRecent'), icons.clear, () => { d.store.set(RECENT, null); render(); });
    } else {
      const popular: { p: Pick; label: string; icon: string }[] = [
        ...[...kinds].sort(byCount).slice(0, 3).map((g) => ({ p: { k: 'type', v: g.id } as Pick, label: g.label, icon: icons.kind })),
        ...[...tasks].sort(byCount).slice(0, 2).map((g) => ({ p: { k: 'job', v: g.id } as Pick, label: g.label, icon: icons.task })),
        ...techs.slice(0, 2).map((g) => ({ p: { k: 'stack', v: g.id } as Pick, label: g.label, icon: icons.stack }))
      ];
      html += popular.map((x) => chip(x.label, x.icon, () => go(x.p))).join('');
    }
    recentRow.innerHTML = html;
    recentRow.hidden = false;
    for (let i = before; i < opts.length; i++) ids.push(opts[i].id);
    return ids;
  }

  /* ---------- tabs ---------- */
  function browse(t: TabId) {
    if (t === 'new') {
      return section(tr('finderNewItems'), byNew.slice(0, appsRow()).map((e) => app(e)).join(''), 'sh-finder__apps') +
        section(tr('finderPopularKinds'), [...kinds].sort(byCount).slice(0, 6).map((g) => kindTile(g)).join(''), 'sh-finder__tiles') +
        section(tr('finderPopularTasks'), [...tasks].sort(byCount).slice(0, 4).map((g) => taskTile(g)).join(''), 'sh-finder__tiles');
    }
    if (t === 'kinds') return GROUPS.map((g) => section(groupLabel(g, lang), kinds.filter((k) => k.group === g.id).map((k) => kindTile(k)).join(''), 'sh-finder__tiles')).join('');
    if (t === 'tasks') return section(tr('finderTasksHead'), tasks.map((g) => taskTile(g)).join(''), 'sh-finder__tiles');
    if (t === 'collections') return section(tr('finderCollectionsHead'), colls.map((g) => collTile(g)).join(''), 'sh-finder__tiles sh-finder__tiles--wide');
    const stackGroups: [string, Key][] = [...STACK_GROUPS.map((g) => [g.key, g.key] as [string, Key]), ['stackTools', 'stackTools']];
    return stackGroups.map(([key, label]) => section(tr(label), techs.filter((g) => g.group === key).map((g) => techTile(g)).join(''), 'sh-finder__tiles sh-finder__tiles--small')).join('') +
      section(tr('finderPopularTags'), tags.slice(0, 18).map((t) => tagChip(t)).join(''), 'sh-finder__chips');
  }

  function search(t: TabId, q: string, m: ReturnType<typeof matches>) {
    const none = `<p class="sh-finder__none">${esc(tr('finderNone', { q }))}</p>`;
    if (t === 'new') {
      // built in the order they stand on screen, so the first option is the one Enter picks: Show all
      const all = section('', row(tr('finderShowAll', { q }), icons.query, () => go({ k: 'q', v: q }), esc(tr('finderShowAll', { q })), `<span class="sh-finder__row-n">${m.items.length}</span><span class="sh-i sh-finder__row-arrow" aria-hidden="true">${icons.arrow}</span>`, ' sh-finder__row--all'), 'sh-finder__rows');
      const items = section(tr('palItems'), m.items.slice(0, appsRow()).map((e) => app(e, q)).join(''), 'sh-finder__apps');
      const filters = section(tr('filters'), [
        ...m.kinds.map((g) => chip(g.label, icons.kind, () => go({ k: 'type', v: g.id }), mark(g.label, q), tr('facetType'))),
        ...m.tasks.map((g) => chip(g.label, icons.task, () => go({ k: 'job', v: g.id }), mark(g.label, q), tr('facetJob'))),
        ...m.colls.map((g) => chip(g.label, icons.collection, () => go({ k: 'collection', v: g.id }), mark(g.label, q), tr('finderCollections'))),
        ...m.techs.map((g) => chip(g.label, icons.stack, () => go({ k: 'stack', v: g.id }), mark(g.label, q), tr('facetStack'))),
        ...m.tags.slice(0, 6).map((v) => chip(v, icons.tag, () => go({ k: 'tag', v }), mark(v, q), tr('facetTagOne')))
      ].join(''), 'sh-finder__chips');
      const places = section(tr('palGoTo'), m.places.map((p) => row(p.label, p.icon, () => { location.href = p.href; }, mark(p.label, q))).join(''), 'sh-finder__rows');
      const actions = section(tr('palActions'), m.actions.map((x) => row(x.label, x.icon, () => { close(false); x.run(); }, mark(x.label, q), x.key ? `<kbd class="sh-kbd">${esc(x.key)}</kbd>` : '')).join(''), 'sh-finder__rows');
      return all + items + filters + places + actions;
    }
    if (t === 'kinds') return m.kinds.length ? section(tr('finderKinds'), m.kinds.map((g) => kindTile(g, q)).join(''), 'sh-finder__tiles') : none;
    if (t === 'tasks') return m.tasks.length ? section(tr('finderTasksHead'), m.tasks.map((g) => taskTile(g, q)).join(''), 'sh-finder__tiles') : none;
    if (t === 'collections') return m.colls.length ? section(tr('finderCollectionsHead'), m.colls.map((g) => collTile(g, q)).join(''), 'sh-finder__tiles sh-finder__tiles--wide') : none;
    return m.techs.length || m.tags.length
      ? section(tr('facetStack'), m.techs.map((g) => techTile(g, q)).join(''), 'sh-finder__tiles sh-finder__tiles--small') +
        section(tr('facetTag'), m.tags.slice(0, 24).map((v) => tagChip(v, q)).join(''), 'sh-finder__chips')
      : none;
  }

  function matches(q: string) {
    const n = norm(q);
    const hit = (s: string) => norm(s).includes(n);
    const items = d.find(q).map((s) => bySlug.get(s)).filter((e): e is FinderEntry => Boolean(e));
    return {
      items,
      kinds: kinds.filter((g) => hit(g.label) || hit(g.id)),
      tasks: tasks.filter((g) => hit(g.label)),
      colls: colls.filter((g) => hit(g.label)),
      techs: techs.filter((g) => hit(g.label)),
      tags: tags.filter((t) => hit(t)),
      places: d.places().filter((p) => hit(p.label)),
      actions: d.actions().filter((a) => hit(a.label))
    };
  }

  /* ---------- render ---------- */
  function render(keep = false) {
    const q = input.value.trim();
    const prev = keep && active >= 0 ? active : 0;
    seq++;
    opts = [];
    active = -1;
    const chipIds = renderRecent(q);
    const m = q ? matches(q) : null;
    list.innerHTML = m ? search(tab, q, m) : browse(tab);
    if (chipIds.length) list.setAttribute('aria-owns', chipIds.join(' ')); else list.removeAttribute('aria-owns');
    panel.scrollTop = 0;
    panel.setAttribute('aria-labelledby', `ftab-${tab}`);
    // tabs: labels and counts follow the words
    for (const b of tabs) {
      const id = b.dataset.tab as TabId;
      b.setAttribute('aria-selected', String(id === tab));
      const label = b.querySelector('[data-tab-label]');
      if (label && id === 'new') label.textContent = tr(q ? 'finderTop' : 'finderNew');
      const n = b.querySelector('[data-tab-n]');
      if (n) {
        const count = !m ? 0 : id === 'new' ? m.items.length : id === 'kinds' ? m.kinds.length : id === 'tasks' ? m.tasks.length : id === 'collections' ? m.colls.length : m.techs.length + m.tags.length;
        n.textContent = m ? String(count) : '';
        b.classList.toggle('is-empty', Boolean(m) && count === 0);
      }
    }
    // the first result of the panel is ready for Enter; recent chips come before it in the order but not by default
    const firstPanel = opts.findIndex((o) => !chipIds.includes(o.id));
    setActive(keep ? Math.min(prev, opts.length - 1) : Math.max(0, firstPanel));
  }

  function setActive(i: number) {
    if (!opts.length) { active = -1; input.removeAttribute('aria-activedescendant'); return; }
    active = Math.max(0, Math.min(opts.length - 1, i));
    for (const [j, o] of opts.entries()) document.getElementById(o.id)?.setAttribute('aria-selected', String(j === active));
    const el = document.getElementById(opts[active].id);
    input.setAttribute('aria-activedescendant', opts[active].id);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // The option straight up, down, left or right of the active one, by where the tiles stand on screen
  function move(dir: 'up' | 'down' | 'left' | 'right') {
    const cur = opts[active] && document.getElementById(opts[active].id);
    if (!cur) { setActive(0); return; }
    const r = cur.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = -1, score = Infinity;
    for (const [j, o] of opts.entries()) {
      if (j === active) continue;
      const b = document.getElementById(o.id)?.getBoundingClientRect();
      if (!b || !b.width) continue;
      const bx = b.left + b.width / 2, by = b.top + b.height / 2;
      let main = 0, side = 0;
      if (dir === 'down') { if (b.top < r.bottom - 2) continue; main = b.top - r.bottom; side = Math.abs(bx - cx); }
      else if (dir === 'up') { if (b.bottom > r.top + 2) continue; main = r.top - b.bottom; side = Math.abs(bx - cx); }
      else if (dir === 'right') { if (b.left < r.right - 2 || b.bottom < r.top || b.top > r.bottom) continue; main = b.left - r.right; side = Math.abs(by - cy); }
      else { if (b.right > r.left + 2 || b.bottom < r.top || b.top > r.bottom) continue; main = r.left - b.right; side = Math.abs(by - cy); }
      const s = main * 3 + side;
      if (s < score) { score = s; best = j; }
    }
    if (best >= 0) setActive(best);
    else if (dir === 'right') setActive(active + 1);
    else if (dir === 'left') setActive(active - 1);
  }

  function switchTab(step: number) {
    tab = TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length];
    render();
  }

  /* ---------- open, close, keys ---------- */
  function open(initial = '') {
    returnTo = document.activeElement as HTMLElement | null;
    root.hidden = false;
    root.dataset.nav = touch.matches ? 'pointer' : 'key';
    input.value = initial;
    input.placeholder = tr(phone.matches ? 'search' : 'finderPlaceholder');
    tab = 'new';
    render();
    input.focus();
    input.select();
    d.lock(true);
  }
  function close(restore = true) {
    if (root.hidden) return;
    root.hidden = true;
    d.lock(false);
    if (restore) returnTo?.focus?.();
  }

  input.addEventListener('input', () => render());
  // the panel scrolls with the arrows through the field; if it takes focus (a click on its gap), typing goes on
  panel.addEventListener('focus', () => input.focus());
  tabs.forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab as TabId; render(); input.focus(); }));
  root.addEventListener('click', (e) => {
    if (e.target === root || (e.target as HTMLElement).closest('[data-finder-close]')) { close(); return; }
    const opt = (e.target as HTMLElement).closest<HTMLElement>('[role="option"]');
    const i = opt ? opts.findIndex((o) => o.id === opt.id) : -1;
    if (i >= 0) { setActive(i); opts[i].run(); }
  });
  // Who leads, the pointer or the keys: the ring on the option Enter picks shows only for the keys (see shelf.css).
  // Only a real move counts: content scrolling under a resting mouse must not take the lead from the arrows.
  let px = -1, py = -1;
  root.addEventListener('pointermove', (e) => {
    if (e.clientX === px && e.clientY === py) return;
    px = e.clientX; py = e.clientY;
    root.dataset.nav = 'pointer';
    const opt = (e.target as HTMLElement).closest<HTMLElement>('[role="option"]');
    const i = opt ? opts.findIndex((o) => o.id === opt.id) : -1;
    if (i >= 0 && i !== active) {
      active = i;
      for (const [j, o] of opts.entries()) document.getElementById(o.id)?.setAttribute('aria-selected', String(j === i));
      input.setAttribute('aria-activedescendant', opts[i].id);
    }
  });
  root.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    root.dataset.nav = 'key';
    const caret = input.selectionStart === input.selectionEnd ? input.selectionStart ?? 0 : -1;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); switchTab(e.shiftKey ? -1 : 1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); move('down'); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); move('up'); }
    else if (e.key === 'ArrowRight' && (!input.value || caret === input.value.length)) { e.preventDefault(); e.stopPropagation(); move('right'); }
    else if (e.key === 'ArrowLeft' && (!input.value || caret === 0)) { e.preventDefault(); e.stopPropagation(); move('left'); }
    else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (active >= 0) opts[active].run(); }
  });

  return { open, close: () => close(), isOpen: () => !root.hidden };
}
