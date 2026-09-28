/* Contents capsule: scroll-spy, reading ring, sheet with the page map, nested entries that open <details>.
   Ported from Portfolio 3D TS2 (src/ui/caseStoryView.ts, mountStory). Mounts every .toc-capsule[aria-controls];
   options come from data-offset (px left above a jump target, default 84) and data-edge (a heading above this line
   is "being read", default 150). TocCapsule.mount(button, { scroller }) mounts one by hand, e.g. inside a scrolling box. */
(function () {
  var docOrder = function (a, b) { return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1; };

  function mount(btn, opts) {
    opts = opts || {};
    var offset = opts.offset != null ? opts.offset : Number(btn.dataset.offset || 84);
    var edge = opts.edge != null ? opts.edge : Number(btn.dataset.edge || 150);
    var sc = opts.scroller || null; /* null — the window scrolls */
    var sheet = document.getElementById(btn.getAttribute('aria-controls'));
    var panel = sheet.querySelector('.toc-panel');
    var links = [].slice.call(sheet.querySelectorAll('.toc-list a[href^="#"]'));
    var nowN = btn.querySelector('.toc-now b');
    var nowL = btn.querySelector('.toc-now em');
    var start = { n: nowN.textContent, l: nowL.textContent };
    var reduced = matchMedia('(prefers-reduced-motion: reduce)');
    var target = function (a) { return document.getElementById(decodeURIComponent(a.hash.slice(1))); };
    var isDive = function (el) { return el.tagName === 'DETAILS'; };
    var targets = links.map(target).filter(Boolean).sort(docOrder);

    var viewTop = function () { return sc ? sc.getBoundingClientRect().top : 0; };
    var scrolled = function () { return sc ? sc.scrollTop : window.scrollY; };
    var maxScroll = function () { return sc ? sc.scrollHeight - sc.clientHeight : document.documentElement.scrollHeight - window.innerHeight; };
    var jump = function (el) {
      (sc || window).scrollTo({ top: el.getBoundingClientRect().top - viewTop() + scrolled() - offset, behavior: reduced.matches ? 'auto' : 'smooth' });
    };

    /* The current section is the last heading that rose above the line. Measured on scroll, not observed:
       after a jump the heading stops right under the top and never crosses an IntersectionObserver band.
       A deep dive counts only while it is open. */
    var last;
    function mark() {
      var line = viewTop() + edge;
      var cur = null;
      for (var i = 0; i < targets.length; i++) {
        if (targets[i].getBoundingClientRect().top > line) break;
        if (!isDive(targets[i]) || targets[i].open) cur = targets[i];
      }
      if (cur === last) return;
      last = cur;
      var on = null;
      links.forEach(function (a) { var hit = !!cur && target(a) === cur; a.classList.toggle('is-on', hit); if (hit) on = a; });
      /* the capsule names the top-level entry: a deep dive shows the section it lives in */
      var top = on && on.closest('.toc-list > li').querySelector('a');
      nowN.textContent = top ? top.dataset.n || '' : start.n;
      nowL.textContent = top ? (top.querySelector('em') || top).textContent : start.l;
    }

    var raf = 0;
    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        var max = maxScroll();
        btn.style.setProperty('--p', (max > 0 ? Math.min(1, scrolled() / max) : 0).toFixed(4));
        mark();
      });
    }
    (sc || window).addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    function open() {
      sheet.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      var cur = sheet.querySelector('.toc-list a.is-on') || links[0];
      if (cur) { cur.focus({ preventScroll: true }); cur.scrollIntoView({ block: 'nearest' }); }
    }
    function close(restoreFocus) {
      if (sheet.hidden) return;
      sheet.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (restoreFocus !== false) btn.focus({ preventScroll: true });
    }
    btn.addEventListener('click', function () { if (sheet.hidden) open(); else close(); });
    sheet.querySelector('.toc-close').addEventListener('click', function () { close(); });
    sheet.addEventListener('click', function (e) { if (e.target === sheet) close(); });
    sheet.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      var f = [].slice.call(panel.querySelectorAll('a[href], button'));
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });

    links.forEach(function (a) {
      a.addEventListener('click', function (e) {
        var el = target(a);
        if (!el) return;
        e.preventDefault();
        if (isDive(el)) el.open = true;
        close(false);
        /* keyboard users continue from the section they picked */
        var focusEl = isDive(el) ? el.querySelector('summary') : el;
        if (focusEl && !isDive(el) && !focusEl.hasAttribute('tabindex')) focusEl.setAttribute('tabindex', '-1');
        if (focusEl) focusEl.focus({ preventScroll: true });
        requestAnimationFrame(function () { jump(el); });
      });
    });

    /* a deep dive opened by hand puts its id in the address; closing it takes the address back */
    targets.filter(isDive).forEach(function (d) {
      d.addEventListener('toggle', function () {
        var mine = location.hash === '#' + d.id;
        if (d.open && !mine) history.replaceState(null, '', '#' + d.id);
        if (!d.open && mine) history.replaceState(null, '', location.pathname + location.search);
        last = undefined;
        onScroll();
      });
    });
    var arrived = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (arrived && isDive(arrived) && targets.indexOf(arrived) >= 0) { arrived.open = true; requestAnimationFrame(function () { jump(arrived); }); }

    onScroll();
    return { open: open, close: close };
  }

  window.TocCapsule = { mount: mount };
  var auto = function () { [].forEach.call(document.querySelectorAll('.toc-capsule[aria-controls]'), function (b) { mount(b); }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
})();
