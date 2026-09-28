// Experiments deck: scroll through the section deals the cards out as a fan.
// One card = one step of scroll; near every card the deck slows down (dwell), between cards it moves faster.
// Layout is measured on load and resize; a scroll frame only computes and writes changed transforms.
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ease = (x) => x * x * (3 - 2 * x);
  const ramp = (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  const pad = (n) => String(n).padStart(2, '0');
  /** Soft stop at every card: speed is 1 − k·cos(2πf), at k = 0.5 half the average speed at a card, no stops or jerks */
  const dwell = (x, k = 0.5) => {
    const i = Math.floor(x);
    const f = x - i;
    return i + f - (k / (2 * Math.PI)) * Math.sin(2 * Math.PI * f);
  };

  // Window height from a 100vh probe: the phone address bar moves innerHeight but not vh
  const probe = document.createElement('i');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100vh;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  const viewH = () => probe.offsetHeight || innerHeight;

  document.querySelectorAll('.deck').forEach((deck) => {
    const cards = [...deck.querySelectorAll('.deck-card')];
    const info = deck.querySelector('.deck-info');
    const now = deck.querySelector('.deck-now');
    const of = deck.querySelector('.deck-of');
    const steps = [...deck.querySelectorAll('.deck-step')];
    const n = cards.length;
    if (!n) return;

    // scroll length in screens: optional entry, (n − 1) steps, then the deck leaves
    const STEP = Number(deck.dataset.step) || 0.7;
    const LEAD = Number(deck.dataset.lead) || 0;
    const TAIL = 0.6;
    const S = LEAD + (n - 1) * STEP + TAIL;
    const runFrom = LEAD / S;
    const runTo = (LEAD + (n - 1) * STEP) / S;
    deck.style.setProperty('--screens', S.toFixed(2));
    if (of) of.textContent = `/ ${pad(n)}`;

    let top = 0;
    let span = 1;
    let fanNear = 120;
    let current = -1;
    let visible = false;
    const last = [];

    const measure = () => {
      const r = deck.getBoundingClientRect();
      top = r.top + scrollY;
      span = Math.max(1, r.height - viewH());
      // the portfolio fans by 120 px (far cards +40 px) at a ~360 px card; on a narrow card the same share
      fanNear = Math.min(120, cards[0].offsetWidth * 0.34);
      last.length = 0;
      frame();
    };

    const setCurrent = (idx) => {
      if (idx === current) return;
      current = idx;
      if (now) now.textContent = pad(idx + 1);
      if (steps[0]) steps[0].disabled = idx <= 0;
      if (steps[1]) steps[1].disabled = idx >= n - 1;
      if (info) {
        info.classList.remove('is-in');
        info.innerHTML = cards[idx].querySelector('.deck-body')?.innerHTML ?? '';
        requestAnimationFrame(() => info.classList.add('is-in'));
      }
    };

    /** page scroll at which card i is on top */
    const topForCard = (i) => top + span * (runFrom + (runTo - runFrom) * (i / Math.max(1, n - 1)));
    const goTo = (i) => {
      const idx = Math.max(0, Math.min(n - 1, i));
      scrollTo({ top: topForCard(idx), behavior: reduced ? 'instant' : 'smooth' });
    };
    steps.forEach((b) => b.addEventListener('click', () => goTo(current + Number(b.dataset.d))));
    addEventListener('keydown', (e) => {
      if (!visible || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el?.isContentEditable) return;
      e.preventDefault();
      goTo(current + (e.key === 'ArrowRight' ? 1 : -1));
    });

    let raf = 0;
    function frame() {
      raf = 0;
      const p = Math.min(1, Math.max(0, (scrollY - top) / span));
      visible = scrollY > top - viewH() && scrollY < top + span + viewH() * 0.5;
      const enter = LEAD ? ease(ramp(p, 0, runFrom)) : 1;
      const leave = ease(ramp(p, runTo + 0.25 / S, 1));
      deck.style.setProperty('--leave', leave.toFixed(3));
      const run = ramp(p, runFrom, runTo) * (n - 1);
      const a = reduced ? run : dwell(run);
      const spread = reduced ? 0 : 1;
      cards.forEach((card, i) => {
        const d = i - a;
        const ad = Math.abs(d);
        // the nearest neighbour steps out by fanNear, the far ones are packed tighter so the fan stays on screen
        const near = Math.max(-1, Math.min(1, d));
        const fanX = (near * fanNear + (d - near) * fanNear / 3) * spread;
        const tr = `translate3d(${fanX.toFixed(1)}px, ${(Math.min(ad, 2) * 20 + (1 - enter) * 160).toFixed(1)}px, 0) rotate(${((near * 7 + (d - near) * 3) * spread).toFixed(2)}deg) scale(${(1 - Math.min(ad, 3) * 0.07).toFixed(3)})`;
        const o = Math.max(0, Math.min(1, 3.2 - ad)) * enter;
        const key = tr + o.toFixed(3);
        if (last[i] === key) return;
        last[i] = key;
        card.style.transform = tr;
        card.style.opacity = o.toFixed(3);
        card.style.zIndex = String(100 - Math.round(ad * 10));
        card.style.visibility = o < 0.002 ? 'hidden' : 'visible';
        card.classList.toggle('is-active', ad < 0.5);
      });
      setCurrent(Math.round(a));
    }

    addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(frame); }, { passive: true });
    addEventListener('resize', measure);
    measure();
  });
})();
