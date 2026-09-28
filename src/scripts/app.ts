// Shelf in the browser: theme, copy, favourites, recent, the grid, Quick Look, the ⌘K palette and the item page.
import MiniSearch from 'minisearch';
import { Check, Contrast, Copy, MessageSquareCode, PanelLeft, TriangleAlert } from 'lucide-static';
import { cleanSvg } from '../lib/svg';

interface Entry {
  slug: string; title: string; type: string; typeLabel: string; tech: string[]; tags: string[]; status: string;
  summary: string; notes: string; url: string; poster: string | null; loop: string | null; demo: string | null;
  external: boolean; bg: 'auto' | 'light' | 'dark'; grid: boolean; added: string; private: boolean;
}

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T | null;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll(sel)) as T[];
const html = document.documentElement;
const BASE = document.body.dataset.base ?? '/';
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage may be blocked */ } }
};
const readList = (k: string): string[] => { try { const v = JSON.parse(store.get(k) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const INDEX: Entry[] = JSON.parse($('#shelf-index')?.textContent || '[]');
const BY_SLUG = new Map(INDEX.map((e) => [e.slug, e]));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const narrow = matchMedia('(max-width: 900px)');
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const CHECK = cleanSvg(Check);
const ALERT = cleanSvg(TriangleAlert);

/* ---------- toast ---------- */
const toastEl = $('#toast');
let toastTimer = 0;
function toast(text: string, ok = true) {
  if (!toastEl) return;
  toastEl.innerHTML = `<span class="sh-i">${ok ? CHECK : ALERT}</span><span></span>`;
  (toastEl.lastElementChild as HTMLElement).textContent = text;
  toastEl.hidden = false;
  toastEl.classList.remove('is-in', 'is-out');
  void toastEl.offsetWidth;
  toastEl.classList.add('is-in');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastEl.classList.add('is-out');
    toastTimer = window.setTimeout(() => (toastEl.hidden = true), 180);
  }, 1400);
}

/* ---------- copy ---------- */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}
function flash(btn: HTMLElement) {
  const label = btn.querySelector<HTMLElement>('.sh-btn__label');
  const ic = btn.querySelector<HTMLElement>('.sh-i');
  if (btn.dataset.orig === undefined) {
    btn.dataset.orig = label?.textContent ?? '';
    btn.dataset.origIcon = ic?.innerHTML ?? '';
  }
  if (label) label.textContent = 'Copied';
  if (ic) ic.innerHTML = CHECK;
  btn.classList.add('is-done');
  clearTimeout(Number(btn.dataset.timer || 0));
  btn.dataset.timer = String(window.setTimeout(() => {
    if (label) label.textContent = btn.dataset.orig ?? '';
    if (ic) ic.innerHTML = btn.dataset.origIcon ?? '';
    btn.classList.remove('is-done');
  }, 1600));
}
async function copyFrom(btn: HTMLElement | null, text: string, message: string) {
  if (await copyText(text)) {
    if (btn) flash(btn);
    toast(message);
  } else {
    toast('Couldn’t copy. Select the text and press ' + (isMac ? '⌘C' : 'Ctrl+C'), false);
  }
}

/* ---------- theme and sidebar ---------- */
const THEMES = [null, 'light', 'dark'] as const;
function applyTheme(t: string | null) {
  if (t === 'light' || t === 'dark') html.dataset.theme = t;
  else delete html.dataset.theme;
  const btn = $('[data-action="theme"]');
  btn?.setAttribute('aria-label', `Appearance: ${t ? t[0].toUpperCase() + t.slice(1) : 'follow the system'}`);
}
function cycleTheme() {
  const cur = store.get('shelf:theme');
  const next = THEMES[(THEMES.indexOf(cur as (typeof THEMES)[number]) + 1) % THEMES.length];
  store.set('shelf:theme', next);
  applyTheme(next);
  toast(`Appearance: ${next ? next[0].toUpperCase() + next.slice(1) : 'System'}`);
}
function toggleSidebar() {
  if (narrow.matches) {
    html.classList.toggle('sidebar-open');
    return;
  }
  const hidden = html.classList.toggle('sidebar-hidden');
  store.set('shelf:sidebar', hidden ? 'hidden' : null);
}
applyTheme(store.get('shelf:theme'));

/* ---------- segmented control ---------- */
function wireSeg(seg: HTMLElement | null, onChange?: (value: string, index: number) => void) {
  if (!seg) return null;
  const opts = $$<HTMLButtonElement>('.sh-seg__opt', seg);
  seg.style.setProperty('--n', String(opts.length));
  const select = (i: number, emit = true) => {
    seg.style.setProperty('--i', String(i));
    opts.forEach((o, j) => o.setAttribute('aria-pressed', String(i === j)));
    if (emit) onChange?.(opts[i].dataset.value ?? '', i);
  };
  opts.forEach((o, i) => o.addEventListener('click', () => select(i)));
  seg.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const cur = opts.findIndex((o) => o.getAttribute('aria-pressed') === 'true');
    const next = Math.min(opts.length - 1, Math.max(0, cur + (e.key === 'ArrowRight' ? 1 : -1)));
    select(next);
    opts[next].focus();
    e.preventDefault();
    e.stopPropagation();
  });
  const initial = Math.max(0, opts.findIndex((o) => o.getAttribute('aria-pressed') === 'true'));
  select(initial, false);
  return { select, opts };
}

/* ---------- favourites and recent ---------- */
const favs = new Set(readList('shelf:favorites'));
function renderFavs() {
  $$('[data-fav]').forEach((b) => {
    const on = favs.has(b.dataset.fav!);
    b.setAttribute('aria-pressed', String(on));
    const title = BY_SLUG.get(b.dataset.fav!)?.title;
    b.setAttribute('aria-label', `${on ? 'Remove' : 'Add'} ${title ?? 'this item'} ${on ? 'from' : 'to'} Favorites`);
  });
  const count = $('[data-count="favorites"]');
  if (count) count.textContent = favs.size ? String(favs.size) : '';
}
function toggleFav(slug: string) {
  const on = !favs.has(slug);
  if (on) favs.add(slug); else favs.delete(slug);
  store.set('shelf:favorites', JSON.stringify([...favs]));
  renderFavs();
  toast(on ? 'Added to Favorites' : 'Removed from Favorites');
  gridApi?.apply();
}
function rememberRecent(slug: string) {
  const list = [slug, ...readList('shelf:recent').filter((s) => s !== slug && BY_SLUG.has(s))].slice(0, 24);
  store.set('shelf:recent', JSON.stringify(list));
}

/* ---------- search ---------- */
let search: MiniSearch<Entry> | null = null;
function searcher() {
  if (search) return search;
  search = new MiniSearch<Entry>({
    idField: 'slug',
    fields: ['title', 'tags', 'tech', 'typeLabel', 'summary', 'notes'],
    storeFields: ['slug'],
    extractField: (doc, field) => {
      const v = (doc as unknown as Record<string, unknown>)[field];
      return Array.isArray(v) ? v.join(' ') : String(v ?? '');
    },
    searchOptions: { prefix: true, fuzzy: 0.2, boost: { title: 4, tags: 2.5, tech: 2, typeLabel: 1.5 }, combineWith: 'AND' }
  });
  search.addAll(INDEX);
  return search;
}
const find = (q: string) => searcher().search(q).map((r) => String(r.id));

/* ---------- hover loops on posters ---------- */
function wireLoop(thumb: HTMLElement) {
  const src = thumb.dataset.loop;
  if (!src) return;
  let timer = 0;
  let video: HTMLVideoElement | null = null;
  const saveData = () => Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
  const start = () => {
    if (reduceMotion.matches || saveData()) return;
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (!video) {
        video = document.createElement('video');
        video.className = 'sh-card__video';
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.setAttribute('aria-hidden', 'true');
        video.src = src;
        video.addEventListener('playing', () => video?.classList.add('is-playing'));
        thumb.insertBefore(video, thumb.firstElementChild?.nextSibling ?? null);
      }
      video.play().catch(() => {});
    }, 300);
  };
  const stop = () => {
    clearTimeout(timer);
    if (video) {
      video.pause();
      video.classList.remove('is-playing');
    }
  };
  thumb.addEventListener('pointerenter', start);
  thumb.addEventListener('pointerleave', stop);
  thumb.addEventListener('focus', start);
  thumb.addEventListener('blur', stop);
}

/* ---------- the grid ---------- */
const ZOOM = [180, 232, 320];
let gridApi: { apply: () => void; visible: () => HTMLElement[] } | null = null;

function initGrid(grid: HTMLElement) {
  const mode = grid.dataset.mode ?? 'all';
  const cards = $$('.sh-card', grid);
  const bySlug = new Map(cards.map((c) => [c.dataset.slug!, c]));
  const countEl = $('[data-count="visible"]');
  const input = $<HTMLInputElement>('#search');
  const params = new URLSearchParams(location.search);
  let query = params.get('q') ?? '';
  let tech = params.get('tech') ?? '';
  let sort = store.get('shelf:sort') === 'name' ? 'name' : 'new';
  let visible: HTMLElement[] = cards;
  if (input && query) input.value = query;

  const chips = $('[data-filter="tech"]');
  const chipEls = chips ? $$<HTMLButtonElement>('.sh-chip', chips) : [];
  const syncChips = () => chipEls.forEach((c) => c.setAttribute('aria-pressed', String((c.dataset.value ?? '') === tech)));
  if (tech && !chipEls.some((c) => c.dataset.value === tech)) tech = '';
  syncChips();
  chipEls.forEach((c) => c.addEventListener('click', () => { tech = c.dataset.value ?? ''; syncChips(); apply(); }));

  const sortSeg = wireSeg($('[data-sort]'), (v) => { sort = v === 'name' ? 'name' : 'new'; store.set('shelf:sort', sort); apply(); });
  sortSeg?.select(sort === 'name' ? 1 : 0, false);

  const zoom = $<HTMLInputElement>('[data-zoom]');
  if (zoom) {
    const saved = ZOOM.indexOf(Number(store.get('shelf:zoom')));
    zoom.value = String(saved >= 0 ? saved : 1);
    const setZoom = () => {
      const px = ZOOM[Number(zoom.value)] ?? 232;
      html.style.setProperty('--card-min-width', `${px}px`);
      zoom.style.setProperty('--p', `${(Number(zoom.value) / 2) * 100}%`);
      store.set('shelf:zoom', px === 232 ? null : String(px));
    };
    zoom.addEventListener('input', setZoom);
    setZoom();
  }

  const writeUrl = () => {
    const p = new URLSearchParams(location.search);
    if (query) p.set('q', query); else p.delete('q');
    if (tech) p.set('tech', tech); else p.delete('tech');
    const qs = p.toString();
    history.replaceState(history.state, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
  };

  function apply() {
    let list = cards.slice();
    if (mode === 'favorites') list = list.filter((c) => favs.has(c.dataset.slug!));
    if (mode === 'recent') list = readList('shelf:recent').map((s) => bySlug.get(s)).filter((c): c is HTMLElement => Boolean(c));
    if (tech) list = list.filter((c) => (c.dataset.tech ?? '').split('|').includes(tech));
    const q = query.trim();
    if (q) {
      const hits = find(q);
      const rank = new Map(hits.map((s, i) => [s, i]));
      list = list.filter((c) => rank.has(c.dataset.slug!));
      if (mode !== 'recent') list.sort((a, b) => rank.get(a.dataset.slug!)! - rank.get(b.dataset.slug!)!);
    } else if (mode !== 'recent') {
      list.sort(sort === 'name'
        ? (a, b) => (a.dataset.title ?? '').localeCompare(b.dataset.title ?? '')
        : (a, b) => (b.dataset.added ?? '').localeCompare(a.dataset.added ?? '') || (a.dataset.title ?? '').localeCompare(b.dataset.title ?? ''));
    }
    const keep = new Set(list);
    cards.forEach((c) => { c.hidden = !keep.has(c); if (c.hidden) c.removeAttribute('aria-selected'); });
    list.forEach((c) => grid.append(c));
    visible = list;
    if (countEl) countEl.textContent = String(list.length);
    const empty = list.length ? '' : q || tech ? 'search' : mode === 'favorites' ? 'favorites' : mode === 'recent' ? 'recent' : 'none';
    $$('[data-empty]').forEach((el) => (el.hidden = el.dataset.empty !== empty));
    const qEl = $('[data-empty-query]');
    if (qEl) qEl.textContent = q || tech;
    grid.hidden = list.length === 0;
  }

  input?.addEventListener('input', () => { query = input.value; writeUrl(); apply(); });
  $('[data-action="clear-filters"]')?.addEventListener('click', () => {
    query = ''; tech = '';
    if (input) input.value = '';
    syncChips(); writeUrl(); apply();
  });
  chipEls.forEach((c) => c.addEventListener('click', writeUrl));
  cards.forEach((c) => { const t = $('.sh-card__thumb', c); if (t) wireLoop(t); });

  apply();
  gridApi = { apply, visible: () => visible };

  if (location.hash.length > 1) {
    const slug = decodeURIComponent(location.hash.slice(1));
    if (bySlug.has(slug)) openQuickLook(slug);
  }
}

/* ---------- keyboard selection in the grid ---------- */
let selected = -1;
function selectCard(i: number) {
  const list = gridApi?.visible() ?? [];
  if (!list.length) return;
  selected = Math.max(0, Math.min(list.length - 1, i));
  list.forEach((c, j) => c.toggleAttribute('aria-selected', j === selected));
  $('.sh-card__thumb', list[selected])?.focus({ preventScroll: false });
}
function columns(list: HTMLElement[]) {
  if (list.length < 2) return 1;
  const top = list[0].offsetTop;
  const n = list.findIndex((c) => c.offsetTop !== top);
  return n < 0 ? list.length : n;
}
function currentCard(): HTMLElement | null {
  const list = gridApi?.visible() ?? [];
  const focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.sh-card');
  if (focused && list.includes(focused)) return focused;
  return selected >= 0 ? list[selected] ?? null : null;
}

/* ---------- Quick Look ---------- */
const ql = $('#quicklook');
let qlSlug = '';
let qlReturn: HTMLElement | null = null;
function lockScroll(on: boolean) { document.documentElement.style.overflow = on ? 'hidden' : ''; }
function openQuickLook(slug: string) {
  if (!ql || !BY_SLUG.has(slug)) return;
  qlReturn = document.activeElement as HTMLElement | null;
  showQuickLook(slug);
  ql.hidden = false;
  ql.classList.remove('is-in');
  void ql.offsetWidth;
  ql.classList.add('is-in');
  lockScroll(true);
  history.replaceState(history.state, '', `${location.pathname}${location.search}#${encodeURIComponent(slug)}`);
  $<HTMLElement>('#ql-open')?.focus();
}
function showQuickLook(slug: string) {
  const e = BY_SLUG.get(slug);
  if (!e || !ql) return;
  qlSlug = slug;
  $('#ql-title')!.textContent = e.title;
  $('#ql-sub')!.textContent = [e.typeLabel, ...e.tech.slice(0, 2)].join(' · ');
  const open = $<HTMLAnchorElement>('#ql-open')!;
  open.href = e.url;
  const demoLink = $<HTMLAnchorElement>('#ql-demo')!;
  demoLink.hidden = !e.demo;
  if (e.demo) demoLink.href = e.demo;
  const stage = $('#ql-stage')!;
  if (!e.external && e.bg !== 'auto') stage.dataset.bg = e.bg;
  else if (e.external) stage.dataset.bg = 'dark';
  else delete stage.dataset.bg;
  if (e.grid && !e.external) stage.dataset.grid = 'on'; else delete stage.dataset.grid;
  const poster = $<HTMLImageElement>('#ql-poster')!;
  // A local demo is transparent and loads at once; a light poster under it would show through in dark mode.
  const showPoster = Boolean(e.poster && (e.external || !e.demo));
  poster.hidden = !showPoster;
  if (showPoster) poster.src = e.poster!;
  const viewport = $('#ql-viewport')!;
  viewport.querySelector('iframe')?.remove();
  const status = $('#ql-status')!;
  status.hidden = !e.demo;
  if (e.demo) {
    const frame = document.createElement('iframe');
    frame.className = 'sh-stage__frame';
    frame.title = `${e.title}, live demo`;
    frame.allow = 'fullscreen; clipboard-write; xr-spatial-tracking';
    frame.addEventListener('load', () => { frame.classList.add('is-ready'); status.hidden = true; });
    frame.src = e.demo;
    viewport.append(frame);
  }
}
function stepQuickLook(dir: number) {
  const list = (gridApi?.visible() ?? []).map((c) => c.dataset.slug!);
  const i = list.indexOf(qlSlug);
  if (i < 0 || list.length < 2) return;
  const next = list[(i + dir + list.length) % list.length];
  showQuickLook(next);
  history.replaceState(history.state, '', `${location.pathname}${location.search}#${encodeURIComponent(next)}`);
  selectCard((gridApi?.visible() ?? []).findIndex((c) => c.dataset.slug === next));
  $<HTMLElement>('#ql-open')?.focus();
}
function closeQuickLook() {
  if (!ql || ql.hidden) return;
  ql.hidden = true;
  $('#ql-viewport')?.querySelector('iframe')?.remove(); // frees the WebGL context
  lockScroll(false);
  history.replaceState(history.state, '', `${location.pathname}${location.search}`);
  qlReturn?.focus?.();
}

/* ---------- ⌘K palette ---------- */
const pal = $('#palette');
const palInput = $<HTMLInputElement>('#palette-input');
const palList = $('#palette-list');
let palRows: { el: HTMLElement; run: () => void }[] = [];
let palSel = 0;

function highlightMatch(text: string, q: string) {
  const terms = q.toLowerCase().split(/\s+/).filter((t) => t.length > 0);
  let out = esc(text);
  for (const t of terms) {
    const i = text.toLowerCase().indexOf(t);
    if (i >= 0) {
      const safe = esc(text.slice(i, i + t.length));
      out = out.replace(safe, `<mark>${safe}</mark>`);
    }
  }
  return out;
}
function paletteActions(): { label: string; icon: string; key?: string; run: () => void }[] {
  const actions: { label: string; icon: string; key?: string; run: () => void }[] = [
    { label: 'Change appearance', icon: 'contrast', run: cycleTheme },
    { label: html.classList.contains('sidebar-hidden') ? 'Show sidebar' : 'Hide sidebar', icon: 'panel', run: toggleSidebar }
  ];
  if (itemApi) {
    actions.unshift(
      { label: 'Copy code', icon: 'copy', key: 'C', run: () => itemApi?.copyCode() },
      { label: 'Copy prompt', icon: 'prompt', key: 'P', run: () => itemApi?.copyPrompt() }
    );
  }
  return actions;
}
const PAL_ICON: Record<string, string> = {
  contrast: cleanSvg(Contrast),
  panel: cleanSvg(PanelLeft),
  copy: cleanSvg(Copy),
  prompt: cleanSvg(MessageSquareCode)
};
function renderPalette() {
  if (!palList || !palInput) return;
  const q = palInput.value.trim();
  const rows: string[] = [];
  const runs: (() => void)[] = [];
  const add = (markup: string, run: () => void) => { rows.push(markup); runs.push(run); };

  const recent = readList('shelf:recent').map((s) => BY_SLUG.get(s)).filter((e): e is Entry => Boolean(e));
  const items = q ? find(q).map((s) => BY_SLUG.get(s)!).slice(0, 8) : [...recent, ...INDEX.filter((e) => !recent.includes(e))].slice(0, 6);
  if (items.length) rows.push(`<div class="sh-palette__group">${q ? 'Items' : 'Jump to'}</div>`);
  for (const e of items) {
    add(
      `<span class="sh-palette__thumb">${e.poster ? `<img src="${esc(e.poster)}" alt="" loading="lazy">` : ''}</span>` +
        `<span class="sh-palette__text"><span class="sh-palette__title">${highlightMatch(e.title, q)}</span>` +
        `<span class="sh-palette__sub">${esc([e.typeLabel, ...e.tech.slice(0, 2)].join(' · '))}</span></span>`,
      () => { location.href = e.url; }
    );
  }
  const places = $$<HTMLAnchorElement>('.sh-nav__row').map((a) => ({ label: a.childNodes[1]?.textContent?.trim() || a.textContent!.trim(), href: a.href, icon: a.querySelector('.sh-i')?.innerHTML ?? '' }));
  const matchedPlaces = places.filter((p) => !q || p.label.toLowerCase().includes(q.toLowerCase()));
  if (matchedPlaces.length && q) {
    rows.push('<div class="sh-palette__group">Go to</div>');
    for (const p of matchedPlaces) add(`<span class="sh-palette__icon"><span class="sh-i">${p.icon}</span></span><span class="sh-palette__text"><span class="sh-palette__title">${highlightMatch(p.label, q)}</span></span>`, () => { location.href = p.href; });
  }
  const actions = paletteActions().filter((a) => !q || a.label.toLowerCase().includes(q.toLowerCase()));
  if (actions.length) {
    rows.push('<div class="sh-palette__group">Actions</div>');
    for (const a of actions) {
      add(
        `<span class="sh-palette__icon"><span class="sh-i">${PAL_ICON[a.icon] ?? ''}</span></span><span class="sh-palette__text"><span class="sh-palette__title">${highlightMatch(a.label, q)}</span></span>` +
          (a.key ? `<span class="sh-palette__trail"><kbd class="sh-kbd">${a.key}</kbd></span>` : ''),
        () => { closePalette(); a.run(); }
      );
    }
  }
  if (!runs.length) rows.push(`<div class="sh-palette__empty">No results for “${esc(q)}”</div>`);

  let n = 0;
  palList.innerHTML = rows.map((r) => (r.startsWith('<div') ? r : `<div class="sh-palette__item" role="option" id="pal-${n++}">${r}</div>`)).join('');
  palRows = $$('.sh-palette__item', palList).map((el, i) => ({ el, run: runs[i] }));
  palRows.forEach((r, i) => {
    r.el.addEventListener('mousemove', () => { if (palSel !== i) selectPal(i); });
    r.el.addEventListener('click', () => r.run());
  });
  selectPal(0);
}
function selectPal(i: number) {
  if (!palRows.length) return;
  palSel = (i + palRows.length) % palRows.length;
  palRows.forEach((r, j) => r.el.setAttribute('aria-selected', String(j === palSel)));
  palRows[palSel].el.scrollIntoView({ block: 'nearest' });
  palInput?.setAttribute('aria-activedescendant', palRows[palSel].el.id);
}
function openPalette(initial = '') {
  if (!pal || !palInput) return;
  pal.hidden = false;
  pal.classList.remove('is-in');
  void pal.offsetWidth;
  pal.classList.add('is-in');
  palInput.value = initial;
  renderPalette();
  palInput.focus();
  palInput.select();
  lockScroll(true);
}
function closePalette() {
  if (!pal || pal.hidden) return;
  pal.hidden = true;
  lockScroll(false);
}
palInput?.addEventListener('input', renderPalette);
pal?.addEventListener('click', (e) => { if (e.target === pal) closePalette(); });
ql?.addEventListener('click', (e) => { if (e.target === ql) closeQuickLook(); });

/* ---------- the item page ---------- */
let itemApi: { copyCode: () => void; copyPrompt: () => void; slug: string } | null = null;

function initItem(article: HTMLElement) {
  const slug = article.dataset.item!;
  rememberRecent(slug);

  const stage = $('#stage');
  const frame = $<HTMLIFrameElement>('#demo-frame');
  const status = $('#stage-status');
  if (frame) {
    const ready = () => { frame.classList.add('is-ready'); if (status) status.hidden = true; };
    frame.addEventListener('load', ready);
    if (frame.contentDocument?.readyState === 'complete' && frame.contentWindow?.location.href !== 'about:blank') ready();
  }
  if (stage) {
    wireSeg($('[data-device-switch]', stage), (v) => { stage.dataset.device = v; });
    const bgs = ['auto', 'light', 'dark'];
    const bgBtn = $('[data-action="stage-bg"]', stage);
    bgBtn?.addEventListener('click', () => {
      const cur = stage.dataset.bg ?? 'auto';
      const next = bgs[(bgs.indexOf(cur) + 1) % bgs.length];
      if (next === 'auto') delete stage.dataset.bg; else stage.dataset.bg = next;
      const label = next[0].toUpperCase() + next.slice(1);
      bgBtn.setAttribute('aria-label', `Background: ${label}`);
      toast(`Background: ${label}`);
    });
    const gridBtn = $('[data-action="stage-grid"]', stage);
    gridBtn?.addEventListener('click', () => {
      const on = stage.dataset.grid !== 'on';
      if (on) stage.dataset.grid = 'on'; else delete stage.dataset.grid;
      gridBtn.setAttribute('aria-pressed', String(on));
    });
    $('[data-action="stage-reload"]', stage)?.addEventListener('click', () => {
      if (!frame) return;
      frame.classList.remove('is-ready');
      if (status) status.hidden = false;
      const src = frame.src;
      frame.src = 'about:blank';
      requestAnimationFrame(() => { frame.src = src; });
    });
    $('[data-action="stage-fullscreen"]', stage)?.addEventListener('click', () => {
      stage.requestFullscreen?.().catch(() => toast('Fullscreen is not available here', false));
    });
  }

  const code = $('#code');
  const variants = code ? $$('.sh-code__variant', code) : [];
  const ids = variants.map((v) => v.dataset.variant!);
  const showVariant = (id: string) => {
    variants.forEach((v) => (v.hidden = v.dataset.variant !== id));
    store.set('shelf:variant', id);
  };
  const variantSeg = wireSeg($('[data-variant-switch]'), (id) => showVariant(id));
  const preferred = store.get('shelf:variant');
  if (preferred && ids.includes(preferred) && variantSeg) {
    variantSeg.select(ids.indexOf(preferred), false);
    variants.forEach((v) => (v.hidden = v.dataset.variant !== preferred));
  }
  for (const v of variants) {
    const tabs = $$<HTMLButtonElement>('.sh-code__file', v);
    const panes = $$('.sh-code__body', v);
    tabs.forEach((t, i) => t.addEventListener('click', () => {
      tabs.forEach((x, j) => x.setAttribute('aria-selected', String(i === j)));
      panes.forEach((p, j) => (p.hidden = i !== j));
    }));
  }
  const currentPane = () => {
    const v = variants.find((x) => !x.hidden);
    return v ? $$('.sh-code__body', v).find((p) => !p.hidden) ?? null : null;
  };
  const rawOf = (pane: HTMLElement) => ($<HTMLTemplateElement>('template[data-raw]', pane)?.content.textContent ?? '');
  const copyCode = (btn?: HTMLElement | null) => {
    const pane = currentPane();
    if (pane) copyFrom(btn ?? null, rawOf(pane), `${pane.dataset.name} copied`);
  };
  const copyPrompt = (btn?: HTMLElement | null) => {
    const text = $<HTMLTemplateElement>('#prompt-text')?.content.textContent ?? '';
    copyFrom(btn ?? null, text, 'Prompt copied');
  };
  $$('[data-copy-code]').forEach((b) => b.addEventListener('click', () => copyCode(b)));
  $$('[data-copy-prompt]').forEach((b) => b.addEventListener('click', () => copyPrompt(b)));
  $$('[data-action="download"]').forEach((b) => b.addEventListener('click', () => {
    const pane = currentPane();
    if (!pane) return;
    const blob = new Blob([rawOf(pane)], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = pane.dataset.name ?? 'code.txt';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }));
  $$('[data-copy-link]').forEach((b) => b.addEventListener('click', () => copyFrom(b, location.href.split('#')[0], 'Link copied')));

  itemApi = {
    slug,
    copyCode: () => copyCode($('.sh-code__variant:not([hidden]) [data-copy-code]')),
    copyPrompt: () => copyPrompt($('[data-copy-prompt]'))
  };
  return { variantSeg, ids };
}

/* ---------- wiring ---------- */
document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const fav = t.closest<HTMLElement>('[data-fav]');
  if (fav) { e.preventDefault(); toggleFav(fav.dataset.fav!); return; }
  const copy = t.closest<HTMLElement>('[data-copy]');
  if (copy) { copyFrom(copy, copy.dataset.copy ?? '', copy.dataset.toast ?? 'Copied'); return; }
  const action = t.closest<HTMLElement>('[data-action]')?.dataset.action;
  if (action === 'theme') cycleTheme();
  else if (action === 'sidebar-toggle') toggleSidebar();
  else if (action === 'sidebar-close') html.classList.remove('sidebar-open');
  else if (action === 'ql-close') closeQuickLook();
});

$$('[data-shortcut="palette"]').forEach((k) => {
  k.textContent = isMac ? '⌘K' : 'Ctrl K';
  k.style.cursor = 'pointer';
  k.addEventListener('click', (e) => { e.preventDefault(); openPalette($<HTMLInputElement>('#search')?.value ?? ''); });
});

const searchInput = $<HTMLInputElement>('#search');
const grid = $('#grid');
if (grid) initGrid(grid);
else searchInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && searchInput.value.trim()) location.href = `${BASE}?q=${encodeURIComponent(searchInput.value.trim())}`;
});
const article = $('[data-item]');
const itemCtl = article ? initItem(article) : null;
renderFavs();

document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (pal?.hidden === false) closePalette();
    else { closeQuickLook(); openPalette(searchInput?.value ?? ''); }
    return;
  }
  if (pal && !pal.hidden) {
    if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); selectPal(palSel + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selectPal(palSel - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); palRows[palSel]?.run(); }
    return;
  }
  if (ql && !ql.hidden) {
    if (e.key === 'Escape' || (e.key === ' ' && !isTyping(e.target))) { e.preventDefault(); closeQuickLook(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); stepQuickLook(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); stepQuickLook(-1); }
    return;
  }
  if (e.key === 'Escape' && html.classList.contains('sidebar-open')) { html.classList.remove('sidebar-open'); return; }
  if (isTyping(e.target)) {
    if (e.key === 'Escape') (e.target as HTMLElement).blur();
    return;
  }
  if (mod || e.altKey) return;
  if (e.key === '/') { e.preventDefault(); searchInput?.focus(); searchInput?.select(); return; }

  if (gridApi) {
    const list = gridApi.visible();
    const cols = columns(list);
    const cur = currentCard();
    const i = cur ? list.indexOf(cur) : -1;
    if (e.key === 'ArrowRight') { e.preventDefault(); selectCard(i + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); selectCard(i < 0 ? 0 : i - 1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); selectCard(i < 0 ? 0 : i + cols); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selectCard(i < 0 ? 0 : i - cols); }
    else if (e.key === ' ' && cur) { e.preventDefault(); openQuickLook(cur.dataset.slug!); }
    else if (e.key.toLowerCase() === 'f' && cur) { e.preventDefault(); toggleFav(cur.dataset.slug!); }
    else if (e.key === '[' || e.key === ']') {
      const z = $<HTMLInputElement>('[data-zoom]');
      if (z) { z.value = String(Math.max(0, Math.min(2, Number(z.value) + (e.key === ']' ? 1 : -1)))); z.dispatchEvent(new Event('input')); }
    }
    return;
  }

  if (itemApi) {
    const k = e.key.toLowerCase();
    if (k === 'c') { e.preventDefault(); itemApi.copyCode(); }
    else if (k === 'p') { e.preventDefault(); itemApi.copyPrompt(); }
    else if (k === 'f') { e.preventDefault(); toggleFav(itemApi.slug); }
    else if (/^[1-9]$/.test(e.key) && itemCtl?.variantSeg) {
      const n = Number(e.key) - 1;
      if (n < itemCtl.ids.length) { e.preventDefault(); itemCtl.variantSeg.select(n); }
    }
  }
});

addEventListener('resize', () => { if (!narrow.matches) html.classList.remove('sidebar-open'); });
