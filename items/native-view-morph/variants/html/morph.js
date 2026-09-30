/* Native View Morph — which elements morph into which, across a page load.
   Load it as a plain script in <head> on both pages (pagereveal fires before the first paint, a module would be late).

   List page:   <a href="case.html?p=ledger" data-morph-card> with parts inside:
                  data-morph="bg" (the card surface), data-morph="media", data-morph="title"
   Detail page: <section data-morph-hero> with the same parts.

   Only one element may hold a view-transition-name at a time, so the cards get names at the last moment:
   · pageswap (the old page, just before its snapshot): the card whose link is being followed is named;
   · pagereveal (the new page, before its first frame): coming back, the card of the page we came from is named,
     and the names are cleared when the morph ends.
   The hero's parts are always named. Corners: each part says its radius in --morph-radius; the old page leaves its
   radii in sessionStorage and the new page animates ::view-transition-group(morph-*) from those to its own.
   Types for CSS: morph-open (card → hero), morph-close (hero → list), morph-next (hero → another hero). */
(() => {
  if (!('onpagereveal' in window)) return; // no cross-document view transitions: plain navigation, nothing to do

  const KEY = 'morph:from';
  const hero = () => document.querySelector('[data-morph-hero]');
  const cards = () => [...document.querySelectorAll('[data-morph-card]')];
  const key = (url) => { const u = new URL(url, location.href); return u.origin + u.pathname + u.search; };
  const cardFor = (url) => (url ? cards().find((c) => key(c.href ?? c.dataset.morphCard) === key(url)) : null);
  const parts = (scope) => [...scope.querySelectorAll('[data-morph]')];
  const name = (scope, on) => {
    for (const el of parts(scope)) el.style.viewTransitionName = on ? `morph-${el.dataset.morph}` : '';
  };
  const radii = (scope) => Object.fromEntries(parts(scope).map((el) =>
    [el.dataset.morph, getComputedStyle(el).getPropertyValue('--morph-radius').trim() || '0px']));

  // hero parts are named up front (CSS could do it too; here the markup needs no extra rules)
  const nameHero = () => { const h = hero(); if (h) name(h, true); };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', nameHero); else nameHero();

  addEventListener('pageswap', (e) => {
    if (!e.viewTransition) return;
    for (const c of cards()) name(c, false);
    const to = e.activation?.entry?.url;
    const card = cardFor(to);
    const scope = card ?? hero();
    if (!scope) return; // nothing shared: the pages simply cross-fade
    if (card) { const h = hero(); if (h) name(h, false); name(card, true); } // one owner per name
    else nameHero();
    const data = { url: location.href, from: card ? 'card' : 'hero', radii: radii(scope) };
    try { sessionStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage off */ }
  });

  addEventListener('pagereveal', async (e) => {
    const vt = e.viewTransition;
    let from = {};
    try { from = JSON.parse(sessionStorage.getItem(KEY) || '{}'); sessionStorage.removeItem(KEY); } catch { /* storage off */ }
    if (!vt) return;

    const h = hero();
    let scope = h;
    if (h) {
      nameHero();
    } else {
      for (const c of cards()) name(c, false);
      scope = cardFor(navigation?.activation?.from?.url ?? from.url);
      if (scope) name(scope, true);
    }
    const type = !h ? 'morph-close' : from.from === 'hero' ? 'morph-next' : 'morph-open';
    try { vt.types?.add(type); } catch { /* types unsupported */ }
    if (!scope) return;

    const to = radii(scope);
    try { await vt.ready; } catch { return; } // skipped (e.g. another navigation started): nothing to animate
    const cs = getComputedStyle(document.documentElement);
    const duration = parseFloat(cs.getPropertyValue('--morph-duration')) || 480;
    const easing = cs.getPropertyValue('--morph-ease').trim() || 'ease';
    for (const [part, r] of Object.entries(to)) {
      const start = from.radii?.[part] ?? r;
      document.documentElement.animate(
        { borderRadius: [start, r] },
        { duration, easing, fill: 'both', pseudoElement: `::view-transition-group(morph-${part})` }
      );
    }
    if (!h) vt.finished.finally(() => name(scope, false));
  });
})();
