/* Spot gallery: a point and its decision card light up together, from either side.
   Ported from Portfolio 3D TS2 (src/ui/caseStoryView.ts: spot). There a point click scrolls to its decision and
   flashes it for 1.6 s; here the card sits next to the screen, and a card also points back at its dot. */
(function () {
  var reduced = matchMedia('(prefers-reduced-motion: reduce)');
  /* fully in view? if not, bring it in */
  function reveal(el) {
    var r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight) el.scrollIntoView({ block: 'center', behavior: reduced.matches ? 'auto' : 'smooth' });
  }

  function mount(root) {
    var dots = [].slice.call(root.querySelectorAll('.spot-dot'));
    var cards = [].slice.call(root.querySelectorAll('.spot-card'));
    var dotOf = function (n) { return root.querySelector('.spot-dot[data-spot="' + n + '"]'); };
    var cardOf = function (n) { return root.querySelector('.spot-card[data-spot="' + n + '"]'); };
    var timer = 0;

    /* the hint lines up with the point near the screen's edges (TS2: x > 66 / x < 34) and opens downwards near the top */
    dots.forEach(function (d) {
      var x = parseFloat(d.style.getPropertyValue('--x')), y = parseFloat(d.style.getPropertyValue('--y'));
      d.classList.toggle('is-right', x > 66);
      d.classList.toggle('is-left', x < 34);
      d.classList.toggle('is-below', y < 24);
    });

    function hot(n) {
      dots.forEach(function (d) { d.classList.toggle('is-hot', d.dataset.spot === n); });
      cards.forEach(function (c) { c.classList.toggle('is-hot', c.dataset.spot === n); });
    }
    function flash(el) {
      cards.forEach(function (c) { c.classList.remove('is-flash'); });
      clearTimeout(timer);
      el.classList.add('is-flash');
      timer = setTimeout(function () { el.classList.remove('is-flash'); }, 1600);
    }

    dots.forEach(function (d) {
      var n = d.dataset.spot;
      d.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') hot(n); });
      d.addEventListener('pointerleave', function () { hot(null); });
      d.addEventListener('focus', function () { hot(n); });
      d.addEventListener('blur', function () { hot(null); });
      d.addEventListener('click', function () {
        var c = cardOf(n);
        if (!c) return;
        flash(c);
        reveal(c);
      });
    });
    cards.forEach(function (c) {
      var n = c.dataset.spot, b = c.querySelector('button');
      c.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') hot(n); });
      c.addEventListener('pointerleave', function () { hot(null); });
      b.addEventListener('focus', function () { hot(n); });
      b.addEventListener('blur', function () { hot(null); });
      /* a card points back: its dot lights up and, on a phone where the screen is above, comes into view */
      b.addEventListener('click', function () {
        var d = dotOf(n);
        if (!d) return;
        hot(n);
        flash(c);
        reveal(d.closest('.spot-stage') || d);
        clearTimeout(d._t);
        d._t = setTimeout(function () { if (document.activeElement !== b) hot(null); }, 1600);
      });
    });
  }

  window.SpotGallery = { mount: mount };
  var auto = function () { [].forEach.call(document.querySelectorAll('.spot'), mount); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
})();
