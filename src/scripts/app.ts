// Shelf in the browser: theme, copy, favourites, the grid, Quick Look, the ⌘K palette and the item page.
import MiniSearch from 'minisearch';
import { ArrowRight, Bookmark, Box, Check, CodeXml, Contrast, Copy, CornerDownLeft, Hash, Keyboard, Languages, MessageSquareCode, PanelLeft, Search, Shapes, Shuffle, Target, TriangleAlert, X } from 'lucide-static';
import { cleanSvg } from '../lib/svg';
import { t, langOf, type Key } from '../lib/i18n';
import { initLibrary, type LibApi } from './library';
import { initFinder, type FinderAction, type FinderApi, type FinderIcon } from './finder';
import { initFace } from './face';

interface Entry {
  slug: string; title: string; type: string; typeLabel: string; tech: string[]; tags: string[]; jobs: string[]; collections: string[]; status: string;
  summary: string; notes: string; url: string; poster: string | null; loop: string | null; demo: string | null;
  external: boolean; bg: 'auto' | 'light' | 'dark'; grid: boolean; added: string; updated: string; private: boolean;
}

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T | null;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll(sel)) as T[];
const html = document.documentElement;
const BASE = document.body.dataset.base ?? '/';
const L = langOf(html.lang);
const tr = (k: Key, vars?: Record<string, string | number>) => t(L, k, vars);
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage may be blocked */ } }
};
const readList = (k: string): string[] => { try { const v = JSON.parse(store.get(k) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
// Lists carry the index inline: their filters need it before the first paint. Item pages load it from one shared
// file instead (inline it was up to a third of each page), cached from page to page; what needs it waits for it.
const INDEX: Entry[] = JSON.parse($('#shelf-index')?.textContent || '[]');
const BY_SLUG = new Map(INDEX.map((e) => [e.slug, e]));
const indexReady: Promise<void> = INDEX.length || !html.dataset.index ? Promise.resolve() : fetch(html.dataset.index)
  .then((r) => (r.ok ? r.json() : []))
  .then((list: Entry[]) => {
    INDEX.push(...list);
    for (const e of list) BY_SLUG.set(e.slug, e);
    search = null;
  })
  .catch(() => {});
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
  toastEl.classList.remove('is-leaving');
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastEl.classList.add('is-leaving');
    toastTimer = window.setTimeout(() => (toastEl.hidden = true), 200);
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
  if (label) label.textContent = tr('copied');
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
    toast(tr('copyFail', { keys: isMac ? '⌘C' : 'Ctrl+C' }), false);
  }
}

/* ---------- theme ---------- */
const THEMES = [null, 'light', 'dark'] as const;
let themeSeg: ReturnType<typeof wireSeg> = null;
function applyTheme(t: string | null) {
  if (t === 'light' || t === 'dark') html.dataset.theme = t;
  else delete html.dataset.theme;
  themeSeg?.select(t === 'light' ? 1 : t === 'dark' ? 2 : 0, false);
}
function setTheme(t: string | null, announce = true) {
  store.set('shelf:theme', t);
  applyTheme(t);
  if (announce) {
    const v = tr(t === 'light' ? 'themeLight' : t === 'dark' ? 'themeDark' : 'themeSystem');
    toast(tr('appearanceToast', { v: L === 'ru' ? v.toLowerCase() : v }));
  }
}
function cycleTheme() {
  const cur = store.get('shelf:theme');
  setTheme(THEMES[(THEMES.indexOf(cur as (typeof THEMES)[number]) + 1) % THEMES.length]);
}
applyTheme(store.get('shelf:theme'));

/* ---------- sidebar: rail on desktop (⌘B), sheet on phones ---------- */
const sidebar = $('#sidebar');
const SB_MIN = 216;
const SB_MAX = 320;
const isRail = () => html.classList.contains('sidebar-rail') && !narrow.matches;
const fmtKbd = (spec: string) => spec.replace('mod+', isMac ? '⌘' : 'Ctrl ');

// The toggle says what it will do next, in its name and in its tooltip.
function nameToggle(label: string) {
  const b = $('.sh-sb__toggle');
  b?.setAttribute('aria-label', label);
  b?.setAttribute('data-tip', label);
}
function setRail(on: boolean) {
  html.classList.toggle('sidebar-rail', on);
  store.set('shelf:sidebar', on ? 'rail' : null);
  const label = tr(on ? 'expandSidebar' : 'collapseSidebar');
  nameToggle(label);
  $$('[data-sidebar-label]').forEach((el) => (el.textContent = label));
  hideTip();
}
let sheetReturn: HTMLElement | null = null;
function setSheet(open: boolean) {
  html.classList.toggle('sidebar-open', open);
  nameToggle(tr(open ? 'closeSidebar' : 'collapseSidebar'));
  lockScroll(open);
  if (open) {
    sheetReturn = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => sidebar?.querySelector<HTMLElement>('.sh-sb__row')?.focus());
  } else {
    sheetReturn?.focus?.();
  }
}
function toggleSidebar() {
  closeMenu(false);
  if (narrow.matches) setSheet(!html.classList.contains('sidebar-open'));
  else setRail(!html.classList.contains('sidebar-rail'));
}

// Sections remember whether they are folded.
function initSections() {
  const closed = new Set(readList('shelf:sections'));
  $$('[data-section]').forEach((sec) => {
    const id = sec.dataset.section!;
    html.classList.remove(`sec-closed-${id}`);
    $('.sh-sb__heading', sec)?.setAttribute('aria-expanded', String(!closed.has(id)));
  });
}
function toggleSection(heading: HTMLElement) {
  const id = heading.closest<HTMLElement>('[data-section]')?.dataset.section;
  if (!id) return;
  const open = heading.getAttribute('aria-expanded') !== 'true';
  heading.setAttribute('aria-expanded', String(open));
  const closed = new Set(readList('shelf:sections'));
  if (open) closed.delete(id); else closed.add(id);
  store.set('shelf:sections', JSON.stringify([...closed]));
}

// Tooltips name the icons while the sidebar is a rail; the collapse button always has one.
const tip = $('#tip');
let tipTimer = 0;
let tipClosedAt = -1e9;
function showTip(el: HTMLElement, delay: number) {
  if (!tip || !el.dataset.tip) return;
  if (!isRail() && !el.classList.contains('sh-sb__toggle')) return;
  clearTimeout(tipTimer);
  const warm = !tip.hidden || performance.now() - tipClosedAt < 600;
  tip.toggleAttribute('data-instant', warm);
  tipTimer = window.setTimeout(() => {
    const kbd = el.dataset.tipKbd ? `<kbd class="sh-kbd">${esc(fmtKbd(el.dataset.tipKbd))}</kbd>` : '';
    tip.innerHTML = `<span></span>${kbd}`;
    (tip.firstElementChild as HTMLElement).textContent = el.dataset.tip!;
    const r = el.getBoundingClientRect();
    tip.style.left = `${Math.round(r.right + 10)}px`;
    tip.style.top = `${Math.round(r.top + r.height / 2)}px`;
    tip.hidden = false;
  }, warm ? 0 : delay);
}
function hideTip() {
  clearTimeout(tipTimer);
  if (tip && !tip.hidden) { tip.hidden = true; tipClosedAt = performance.now(); }
}

// Drag the right edge to resize, drag far left to fold into the rail, click it to toggle, double-click to reset.
function initEdge() {
  const edge = $('.sh-sb__edge');
  if (!edge || !sidebar) return;
  edge.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebar.getBoundingClientRect().width;
    const wasRail = isRail();
    let moved = false;
    edge.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (!moved && Math.abs(dx) < 3) return;
      if (!moved) { moved = true; html.classList.add('sb-resizing'); hideTip(); }
      if (wasRail) { if (dx > 48 && isRail()) { html.classList.remove('sb-resizing'); setRail(false); } return; }
      const w = startW + dx;
      if (w < SB_MIN - 56) { if (!isRail()) { html.classList.remove('sb-resizing'); setRail(true); } return; }
      if (isRail()) setRail(false);
      html.style.setProperty('--sidebar-width', `${Math.max(SB_MIN, Math.min(SB_MAX, Math.round(w)))}px`);
    };
    const up = () => {
      edge.removeEventListener('pointermove', move);
      edge.removeEventListener('pointerup', up);
      edge.removeEventListener('pointercancel', up);
      html.classList.remove('sb-resizing');
      if (!moved) { toggleSidebar(); return; }
      const w = parseInt(getComputedStyle(html).getPropertyValue('--sidebar-width'), 10);
      store.set('shelf:sidebar-width', Number.isFinite(w) && w !== 248 ? String(w) : null);
    };
    edge.addEventListener('pointermove', move);
    edge.addEventListener('pointerup', up);
    edge.addEventListener('pointercancel', up);
  });
  edge.addEventListener('dblclick', () => {
    html.style.removeProperty('--sidebar-width');
    store.set('shelf:sidebar-width', null);
    syncEdge();
  });
  const widthNow = () => parseInt(getComputedStyle(html).getPropertyValue('--sidebar-width'), 10) || 248;
  const syncEdge = () => edge.setAttribute('aria-valuenow', String(isRail() ? 64 : widthNow()));
  const setWidth = (w: number) => {
    const px = Math.max(SB_MIN, Math.min(SB_MAX, Math.round(w)));
    html.style.setProperty('--sidebar-width', `${px}px`);
    store.set('shelf:sidebar-width', px !== 248 ? String(px) : null);
  };
  edge.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 32 : 16;
    if (e.key === 'ArrowLeft') { if (!isRail() && widthNow() <= SB_MIN) setRail(true); else if (!isRail()) setWidth(widthNow() - step); }
    else if (e.key === 'ArrowRight') { if (isRail()) setRail(false); else setWidth(widthNow() + step); }
    else if (e.key === 'Home') { if (isRail()) setRail(false); setWidth(SB_MIN); }
    else if (e.key === 'End') { if (isRail()) setRail(false); setWidth(SB_MAX); }
    else if (e.key === 'Enter' || e.key === ' ') toggleSidebar();
    else return;
    e.preventDefault();
    syncEdge();
  });
  syncEdge();
}

// Profile menu: appearance, sidebar, shortcuts, source.
const menu = $('#profile-menu');
const profileBtn = $<HTMLButtonElement>('[data-action="profile-menu"]');
const menuItems = () => (menu ? $$<HTMLElement>('.sh-seg__opt, .sh-menu__item', menu) : []);
function placeMenu() {
  if (!menu || !profileBtn) return;
  const r = profileBtn.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.round(r.left))}px`;
  menu.style.bottom = `${Math.round(innerHeight - r.top + 6)}px`;
}
function openMenu() {
  if (!menu || !profileBtn) return;
  hideTip();
  placeMenu();
  menu.hidden = false;
  menu.classList.remove('is-in');
  void menu.offsetWidth;
  menu.classList.add('is-in');
  profileBtn.setAttribute('aria-expanded', 'true');
  menuItems()[0]?.focus();
}
function closeMenu(returnFocus = true) {
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  profileBtn?.setAttribute('aria-expanded', 'false');
  if (returnFocus) profileBtn?.focus();
}

// Sidebar style: the floating panel of macOS 26 or the edge-to-edge sidebar of macOS 27.
// The switch morphs the panel through a view transition; the phone sheet always floats.
let styleSeg: ReturnType<typeof wireSeg> = null;
function setSidebarStyle(style: string, animate = true) {
  const attached = style === 'attached';
  store.set('shelf:sidebar-style', attached ? 'attached' : null);
  styleSeg?.select(attached ? 1 : 0, false);
  const flip = () => {
    html.classList.add('sb-noanim');
    html.classList.toggle('sb-attached', attached);
    placeMenu();
    requestAnimationFrame(() => requestAnimationFrame(() => html.classList.remove('sb-noanim')));
  };
  if (animate && !reduceMotion.matches && document.startViewTransition) document.startViewTransition(flip);
  else flip();
}

// Keyboard shortcuts sheet.
const shortcuts = $('#shortcuts');
// Surprise me: any piece on the shelf but the one on screen, each as likely as the next.
function openRandom() {
  if (!INDEX.length) { void indexReady.then(() => { if (INDEX.length) openRandom(); }); return; }
  const pool = INDEX.filter((e) => e.slug !== html.dataset.itemPage);
  const pick = pool[Math.floor(Math.random() * pool.length)];
  if (pick) location.href = pick.url;
}
function openShortcuts() {
  if (!shortcuts) return;
  closeMenu(false);
  shortcuts.hidden = false;
  lockScroll(true);
  $<HTMLElement>('[data-action="shortcuts-close"]', shortcuts)?.focus();
}
function closeShortcuts() {
  if (!shortcuts || shortcuts.hidden) return;
  shortcuts.hidden = true;
  lockScroll(false);
}

/* ---------- language ---------- */
function switchLang(to: 'en' | 'ru') {
  store.set('shelf:lang', to);
  const alt = html.dataset.alt;
  if (to !== L && alt) location.href = alt + location.search + location.hash;
}

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

/* ---------- favourites ---------- */
const favs = new Set(readList('shelf:favorites'));
function renderFavs() {
  $$('[data-fav]').forEach((b) => {
    const on = favs.has(b.dataset.fav!);
    b.setAttribute('aria-pressed', String(on));
    const title = BY_SLUG.get(b.dataset.fav!)?.title ?? tr('thisItem');
    b.setAttribute('aria-label', tr(on ? 'favRemove' : 'favAdd', { title }));
  });
  const count = $('[data-count="favorites"]');
  if (count) count.textContent = favs.size ? String(favs.size) : '';
}
function toggleFav(slug: string) {
  const on = !favs.has(slug);
  if (on) favs.add(slug); else favs.delete(slug);
  store.set('shelf:favorites', JSON.stringify([...favs]));
  renderFavs();
  toast(tr(on ? 'favAdded' : 'favRemoved'));
  gridApi?.apply();
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
let libApi: LibApi | null = null;

function initGrid(grid: HTMLElement) {
  const cards = $$('.sh-card', grid);
  const bySlug = new Map(cards.map((c) => [c.dataset.slug!, c]));

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

  cards.forEach((c) => { const t = $('.sh-card__thumb', c); if (t) wireLoop(t); });

  // filter, sort, the URL and the empty state live in library.ts
  libApi = initLibrary(grid, { lang: L, tr, index: BY_SLUG, find, store, favs, narrow });
  gridApi = { apply: libApi.apply, visible: libApi.visible };

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
  list.forEach((c, j) => c.toggleAttribute('data-selected', j === selected));
  $('.sh-card__thumb', list[selected])?.focus({ preventScroll: false });
}
// The card straight above or below: sections can leave a row half full, and a shelf scrolls sideways, so go by
// where the cards are on screen, not by index.
function rowStep(list: HTMLElement[], i: number, dir: 1 | -1) {
  const from = list[i];
  if (!from) return 0;
  const f = from.getBoundingClientRect();
  const cx = f.left + f.width / 2;
  let best = i;
  let bestDy = Infinity;
  let bestDx = Infinity;
  list.forEach((c, j) => {
    const r = c.getBoundingClientRect();
    const dy = (r.top - f.top) * dir;
    if (dy <= 4) return;
    const dx = Math.abs(r.left + r.width / 2 - cx);
    if (dy < bestDy - 4 || (Math.abs(dy - bestDy) <= 4 && dx < bestDx)) { best = j; bestDy = dy; bestDx = dx; }
  });
  return best;
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
function openQuickLook(slug: string, fromKeyboard = false) {
  if (!ql) return;
  if (!BY_SLUG.has(slug)) { if (!INDEX.length) void indexReady.then(() => { if (BY_SLUG.has(slug)) openQuickLook(slug, fromKeyboard); }); return; }
  qlReturn = document.activeElement as HTMLElement | null;
  showQuickLook(slug);
  ql.hidden = false;
  ql.classList.remove('is-in');
  if (!fromKeyboard) { void ql.offsetWidth; ql.classList.add('is-in'); }
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
    frame.title = tr('liveDemo', { title: e.title });
    frame.allow = 'fullscreen; clipboard-write; xr-spatial-tracking; autoplay';
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

/* ---------- ⌘K: search, after Mobbin's search bar (finder.ts) ---------- */
const pal = $('#palette');
let finder: FinderApi | null = null;
function paletteActions(): FinderAction[] {
  const actions: FinderAction[] = [
    { label: tr('randomItem'), icon: PAL_ICON.shuffle, key: 'R', run: openRandom },
    { label: tr('actAppearance'), icon: PAL_ICON.contrast, run: cycleTheme },
    { label: tr('actLanguage'), icon: PAL_ICON.lang, run: () => switchLang(L === 'en' ? 'ru' : 'en') },
    { label: tr(isRail() ? 'expandSidebar' : 'collapseSidebar'), icon: PAL_ICON.panel, key: fmtKbd('mod+B'), run: toggleSidebar },
    { label: tr('shortcuts'), icon: PAL_ICON.keyboard, key: '?', run: openShortcuts }
  ];
  if (itemApi) {
    actions.unshift(
      { label: tr('copyCode'), icon: PAL_ICON.copy, key: 'C', run: () => itemApi?.copyCode() },
      { label: tr('copyPrompt'), icon: PAL_ICON.prompt, key: 'P', run: () => itemApi?.copyPrompt() }
    );
  }
  return actions;
}
const PAL_ICON = {
  contrast: cleanSvg(Contrast),
  panel: cleanSvg(PanelLeft),
  copy: cleanSvg(Copy),
  prompt: cleanSvg(MessageSquareCode),
  keyboard: cleanSvg(Keyboard),
  lang: cleanSvg(Languages),
  shuffle: cleanSvg(Shuffle)
};
const FINDER_ICONS: Record<FinderIcon, string> = {
  kind: cleanSvg(Shapes),
  task: cleanSvg(Target),
  collection: cleanSvg(Bookmark),
  stack: cleanSvg(CodeXml),
  tag: cleanSvg(Hash),
  item: cleanSvg(Box),
  query: cleanSvg(Search),
  go: cleanSvg(CornerDownLeft),
  clear: cleanSvg(X),
  arrow: cleanSvg(ArrowRight)
};
// Sidebar rows are the places: All items, Favorites, the kinds, the collections, Coverage
const places = () => $$<HTMLAnchorElement>('#sidebar .sh-sb__row[href]')
  .map((a) => ({ label: a.querySelector('.sh-sb__label')?.textContent?.trim() ?? '', href: a.href, icon: a.querySelector('.sh-i')?.innerHTML ?? '' }));
function initFinderOnce() {
  if (!pal || finder) return;
  const onAllItems = $('#grid')?.dataset.mode === 'all';
  finder = initFinder(pal, {
    lang: L,
    tr,
    index: INDEX,
    find,
    actions: paletteActions,
    places,
    icons: FINDER_ICONS,
    choose: onAllItems ? (facet, value) => libApi?.choose(facet, value) : null,
    query: onAllItems ? (q) => { const i = $<HTMLInputElement>('#search'); if (i) { i.value = q; i.dispatchEvent(new Event('input')); i.focus(); } } : null,
    allItemsUrl: () => $<HTMLAnchorElement>('#sidebar a[data-nav="all"]')?.href ?? BASE,
    collectionUrl: (id) => `${BASE}${L === 'ru' ? 'ru/' : ''}collection/${id}/`,
    store,
    lock: lockScroll
  });
}
function openPalette(initial = '') {
  if (!INDEX.length) { void indexReady.then(() => { if (INDEX.length) openPalette(initial); }); return; }
  initFinderOnce();
  finder?.open(initial);
}
function closePalette() { finder?.close(); }
ql?.addEventListener('click', (e) => { if (e.target === ql) closeQuickLook(); });

/* ---------- the item page ---------- */
let itemApi: { copyCode: () => void; copyPrompt: () => void; slug: string } | null = null;

function initItem(article: HTMLElement) {
  const slug = article.dataset.item!;

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
      const v = tr(next === 'light' ? 'bgLight' : next === 'dark' ? 'bgDark' : 'bgAuto');
      bgBtn.setAttribute('aria-label', tr('background', { v }));
      toast(tr('background', { v }));
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
      stage.requestFullscreen?.().catch(() => toast(tr('noFullscreen'), false));
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
    const pick = (i: number, focus = false) => {
      tabs.forEach((x, j) => { x.setAttribute('aria-selected', String(i === j)); x.tabIndex = i === j ? 0 : -1; });
      panes.forEach((p, j) => (p.hidden = i !== j));
      if (focus) tabs[i].focus();
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => pick(i));
      tab.addEventListener('keydown', (e) => {
        const n = tabs.length;
        const to = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
        if (to < 0) return;
        e.preventDefault();
        e.stopPropagation();
        pick(to, true);
      });
    });
  }
  const currentPane = () => {
    const v = variants.find((x) => !x.hidden);
    return v ? $$('.sh-code__body', v).find((p) => !p.hidden) ?? null : null;
  };
  const rawOf = (pane: HTMLElement) => ($<HTMLTemplateElement>('template[data-raw]', pane)?.content.textContent ?? '');
  const copyCode = (btn?: HTMLElement | null) => {
    const pane = currentPane();
    if (pane) copyFrom(btn ?? null, rawOf(pane), tr('fileCopied', { file: pane.dataset.name ?? '' }));
  };
  const copyPrompt = (btn?: HTMLElement | null) => {
    const text = $<HTMLTemplateElement>('#prompt-text')?.content.textContent ?? '';
    copyFrom(btn ?? null, text, tr('promptCopied'));
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
  $$('[data-copy-link]').forEach((b) => b.addEventListener('click', () => copyFrom(b, location.href.split('#')[0], tr('linkCopied'))));

  itemApi = {
    slug,
    copyCode: () => copyCode($('.sh-code__variant:not([hidden]) [data-copy-code]')),
    copyPrompt: () => copyPrompt($('[data-copy-prompt]'))
  };
  return { variantSeg, ids };
}

/* ---------- the way back: an item page remembers the list you opened it from ---------- */
// A list page (All items, Favorites, a kind) writes itself down as you leave it: which list, its address with the
// filters and sort, and how far you had scrolled. The item page reads that back: the inline script in Sidebar.astro
// keeps that list selected, and here the matching breadcrumb returns to it exactly.
interface ListVisit { nav: string; url: string; y: number }
const LIST_NAV = /^(all|favorites|type:[\w-]+|collection:[\w-]+)$/;
const readSession = <T>(k: string): T | null => { try { return JSON.parse(sessionStorage.getItem(k) || 'null') as T | null; } catch { return null; } };
const writeSession = (k: string, v: unknown) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* storage may be blocked */ } };
function rememberList() {
  writeSession('shelf:list', { nav: html.dataset.nav, url: location.pathname + location.search, y: Math.round(scrollY) } satisfies ListVisit);
}
// The previous entry in this tab's history, when the browser can tell.
function previousUrl() {
  const nav = (window as unknown as { navigation?: { currentEntry?: { index: number } | null; entries(): { url: string | null }[] } }).navigation;
  const i = nav?.currentEntry?.index ?? -1;
  if (nav && i > 0) return nav.entries()[i - 1]?.url ?? '';
  return document.referrer;
}
function initCrumbs() {
  const list = readSession<ListVisit>('shelf:list');
  if (!list || !html.dataset.from) return;
  $$<HTMLAnchorElement>('[data-crumb-nav]').forEach((a) => {
    if (a.dataset.crumbNav !== list.nav) return;
    a.href = list.url;
    a.addEventListener('click', (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      // Straight back to the page you left: the browser brings it back as it was, scroll and all.
      if (previousUrl() === a.href) { e.preventDefault(); history.back(); return; }
      writeSession('shelf:restore', { url: list.url, y: list.y });
    });
  });
}
// Arriving at a list through its breadcrumb (not Back): scroll to where you were.
function restoreListScroll() {
  const r = readSession<{ url: string; y: number }>('shelf:restore');
  if (!r) return;
  try { sessionStorage.removeItem('shelf:restore'); } catch { /* ignore */ }
  if (r.url === location.pathname + location.search && r.y > 0) requestAnimationFrame(() => scrollTo({ top: r.y, behavior: 'instant' }));
}

/* ---------- wiring ---------- */
document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  if (menu && !menu.hidden && !t.closest('#profile-menu') && !t.closest('[data-action="profile-menu"]')) closeMenu(false);
  const fav = t.closest<HTMLElement>('[data-fav]');
  if (fav) { e.preventDefault(); toggleFav(fav.dataset.fav!); return; }
  const copy = t.closest<HTMLElement>('[data-copy]');
  if (copy) { copyFrom(copy, copy.dataset.copy ?? '', copy.dataset.toast ?? tr('copied')); return; }
  const look = t.closest<HTMLElement>('[data-quicklook]');
  if (look) { openQuickLook(look.dataset.quicklook!); return; }
  const target = t.closest<HTMLElement>('[data-action]');
  const action = target?.dataset.action;
  if (action === 'theme') cycleTheme();
  else if (action === 'sidebar-toggle') toggleSidebar();
  else if (action === 'sidebar-close') setSheet(false);
  else if (action === 'palette') { if (narrow.matches) setSheet(false); openPalette(''); }
  else if (action === 'profile-menu') { if (menu?.hidden) openMenu(); else closeMenu(); }
  else if (action === 'section-toggle' && target) toggleSection(target);
  else if (action === 'shortcuts') openShortcuts();
  else if (action === 'shortcuts-close') closeShortcuts();
  else if (action === 'ql-close') closeQuickLook();
});
shortcuts?.addEventListener('click', (e) => { if (e.target === shortcuts) closeShortcuts(); });

if (sidebar) {
  sidebar.addEventListener('pointerover', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
    if (el && sidebar.contains(el)) showTip(el, 120);
  });
  sidebar.addEventListener('pointerout', (e) => {
    const to = (e.relatedTarget as HTMLElement | null)?.closest?.('[data-tip]');
    if (!to) hideTip();
  });
  sidebar.addEventListener('focusin', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
    if (el) showTip(el, 0);
  });
  sidebar.addEventListener('focusout', hideTip);
  $('.sh-sb__body', sidebar)?.addEventListener('scroll', hideTip, { passive: true });
}
$$('[data-mod-kbd]').forEach((k) => (k.textContent = isMac ? `⌘${k.dataset.modKbd}` : `Ctrl ${k.dataset.modKbd}`));
wireSeg($('[data-lang-switch]'), (v) => switchLang(v === 'ru' ? 'ru' : 'en'));
themeSeg = wireSeg($('[data-theme-switch]'), (v) => setTheme(v === 'system' ? null : v));
applyTheme(store.get('shelf:theme'));
styleSeg = wireSeg($('[data-sidebar-style]'), (v) => setSidebarStyle(v));
styleSeg?.select(html.classList.contains('sb-attached') ? 1 : 0, false);
setRail(html.classList.contains('sidebar-rail'));
initSections();
initEdge();
initFace();

const searchInput = $<HTMLInputElement>('#search');
const grid = $('#grid');
if (grid) initGrid(grid);
if (grid && LIST_NAV.test(html.dataset.nav ?? '')) {
  restoreListScroll();
  addEventListener('pagehide', rememberList);
  document.addEventListener('click', (e) => { if ((e.target as Element).closest?.('a[href]')) rememberList(); }, true);
}
const article = $('[data-item]');
const itemCtl = article ? initItem(article) : null;
if (article) initCrumbs();
renderFavs();
requestAnimationFrame(() => requestAnimationFrame(() => html.classList.remove('sb-noanim')));

document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') { e.preventDefault(); toggleSidebar(); return; }
  if (menu && !menu.hidden) {
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = menuItems();
      const i = items.indexOf(document.activeElement as HTMLElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (e.key === 'Tab') closeMenu(false);
    return;
  }
  if (shortcuts && !shortcuts.hidden) {
    if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); closeShortcuts(); }
    return;
  }
  if (html.classList.contains('sidebar-open') && sidebar) {
    if (e.key === 'Escape') { e.preventDefault(); setSheet(false); return; }
    if (e.key === 'Tab') {
      const focusable = $$<HTMLElement>('a[href], button:not([disabled]), input', sidebar).filter((el) => el.offsetParent !== null);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      return;
    }
  }
  if (mod && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (finder?.isOpen()) closePalette();
    else { closeQuickLook(); openPalette(searchInput?.value ?? ''); }
    return;
  }
  // the search overlay handles its own keys (finder.ts); nothing on the page reacts under it
  if (finder?.isOpen()) return;
  if (ql && !ql.hidden) {
    if (e.key === 'Escape' || (e.key === ' ' && !isTyping(e.target))) { e.preventDefault(); closeQuickLook(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); stepQuickLook(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); stepQuickLook(-1); }
    return;
  }
  if (isTyping(e.target)) {
    if (e.key === 'Escape') (e.target as HTMLElement).blur();
    return;
  }
  if (mod || e.altKey) return;
  if (e.key === '?') { e.preventDefault(); openShortcuts(); return; }
  if (e.key.toLowerCase() === 'r') { e.preventDefault(); openRandom(); return; }
  if (e.key === '/') {
    e.preventDefault();
    if (searchInput) { searchInput.focus(); searchInput.select(); } else openPalette('');
    return;
  }

  if (gridApi) {
    const list = gridApi.visible();
    const cur = currentCard();
    const i = cur ? list.indexOf(cur) : -1;
    if (e.key === 'ArrowRight') { e.preventDefault(); selectCard(i + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); selectCard(i < 0 ? 0 : i - 1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); selectCard(i < 0 ? 0 : rowStep(list, i, 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selectCard(i < 0 ? 0 : rowStep(list, i, -1)); }
    else if (e.key === ' ' && cur) { e.preventDefault(); openQuickLook(cur.dataset.slug!, true); }
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
