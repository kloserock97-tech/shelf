/* Weighted Decision Matrix.
   Markup: .wcm with range inputs .wcm-range[data-key] (0–10 weights) and an <ol class="wcm-list"> of .wcm-row
   items carrying data-<key>="0…10" scores. Score = Σ wᵢ·sᵢ / Σ wᵢ, on the same 0–10 scale.
   Rows re-sort by FLIP on the Web Animations API; the score number is an animated @property integer. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const hasProperty = typeof CSS !== 'undefined' && 'registerProperty' in CSS;
  const fmt = (x) => (Math.round(x * 10) / 10).toFixed(1);

  function init(root) {
    if (root.wcm) return;
    const ranges = [...root.querySelectorAll('.wcm-range')];
    const keys = ranges.map((r) => r.dataset.key);
    const labels = Object.fromEntries(ranges.map((r) => [r.dataset.key, (r.labels[0]?.textContent || r.dataset.key).trim()]));
    // the colour as written (var(--wcm-c1)), so the bar follows a light/dark switch
    const colors = Object.fromEntries(ranges.map((r) => [r.dataset.key, (r.closest('[style*="--wcm-c"]') || r).style.getPropertyValue('--wcm-c') || 'currentColor']));
    const list = root.querySelector('.wcm-list');
    const status = root.querySelector('.wcm-status');
    if (!hasProperty) root.classList.add('wcm--plain');

    // build the parts of each row once: rank, score, stacked bar, a text for screen readers
    const rows = [...list.children].map((li, index) => {
      const scores = Object.fromEntries(keys.map((k) => [k, Number(li.dataset[k]) || 0]));
      const rank = document.createElement('span');
      rank.className = 'wcm-rank';
      rank.setAttribute('aria-hidden', 'true');
      const score = document.createElement('span');
      score.className = 'wcm-score';
      score.setAttribute('aria-hidden', 'true');
      const stack = document.createElement('div');
      stack.className = 'wcm-stack';
      stack.setAttribute('aria-hidden', 'true');
      const segs = keys.map((k) => {
        const seg = document.createElement('i');
        seg.style.setProperty('--wcm-c', colors[k]);
        stack.appendChild(seg);
        return seg;
      });
      const badge = document.createElement('span');
      badge.className = 'wcm-badge';
      badge.setAttribute('aria-hidden', 'true');
      badge.textContent = 'New leader';
      const name = li.querySelector('.wcm-name');
      name.appendChild(badge);
      const sr = document.createElement('span');
      sr.className = 'wcm-sr';
      li.prepend(rank);
      li.append(score, stack, sr);
      return { li, index, id: li.dataset.id || String(index), title: name.firstChild.textContent.trim(), scores, rank, score, segs, sr, total: 0 };
    });

    let leader = null;
    let said = null;
    let badgeTimer = 0;
    let sayTimer = 0;

    function weights() {
      return Object.fromEntries(ranges.map((r) => [r.dataset.key, Number(r.value)]));
    }

    function paintRanges() {
      for (const r of ranges) {
        const pct = ((r.value - r.min) / (r.max - r.min)) * 100;
        r.style.setProperty('--fill', `${pct}%`);
        const out = root.querySelector(`output[for="${r.id}"]`);
        if (out) out.textContent = r.value;
      }
    }

    function flip(order, animate) {
      const before = new Map(rows.map((r) => [r, r.li.getBoundingClientRect().top]));
      for (const r of rows) r.li.getAnimations().forEach((a) => a.cancel());
      order.forEach((r) => list.appendChild(r.li));
      if (!animate) return;
      for (const r of order) {
        const dy = before.get(r) - r.li.getBoundingClientRect().top;
        if (Math.abs(dy) < 0.5) continue;
        r.li.style.zIndex = dy > 0 ? 1 : 0; // the row climbing up passes over the others
        r.li.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 460, easing: 'cubic-bezier(0.2, 0.9, 0.25, 1.06)' })
          .finished.then(() => (r.li.style.zIndex = ''), () => {});
      }
    }

    function update({ animate = true, announce = true } = {}) {
      paintRanges();
      const w = weights();
      const sum = keys.reduce((s, k) => s + w[k], 0);
      for (const r of rows) {
        const parts = keys.map((k) => (sum ? (w[k] * r.scores[k]) / sum : 0));
        r.total = parts.reduce((a, b) => a + b, 0);
        r.parts = parts;
        r.segs.forEach((seg, i) => seg.style.setProperty('--p', (parts[i] * 10).toFixed(2)));
        const tenths = Math.round(r.total * 10);
        r.score.style.setProperty('--wcm-n', tenths);
        if (!hasProperty) r.score.textContent = fmt(r.total);
      }
      const order = [...rows].sort((a, b) => b.total - a.total || a.index - b.index);
      const moved = order.some((r, i) => r.li !== list.children[i]);
      order.forEach((r, i) => {
        r.rank.textContent = i + 1;
        const bits = keys.map((k, j) => `${labels[k].toLowerCase()} ${fmt(r.parts[j])}`).join(', ');
        r.sr.textContent = `, ${fmt(r.total)} out of 10. Made of ${bits}.`;
      });
      if (moved) flip(order, animate && !reduce.matches);

      if (!sum) {
        if (status) status.textContent = 'Give at least one criterion some weight.';
        return;
      }
      const top = order[0];
      if (leader && top !== leader) {
        rows.forEach((r) => r.li.classList.toggle('is-new-leader', r === top));
        clearTimeout(badgeTimer);
        badgeTimer = setTimeout(() => top.li.classList.remove('is-new-leader'), 2600);
      }
      leader = top;
      // the live region speaks once the slider rests, not on every step
      const say = () => {
        if (!status) return;
        status.textContent = said && said !== top
          ? `${top.title} is now first, ahead of ${said.title}.`
          : `${top.title} leads with ${fmt(top.total)}.`;
        said = top;
      };
      clearTimeout(sayTimer);
      if (announce) sayTimer = setTimeout(say, 450);
      else say();
    }

    for (const r of ranges) r.addEventListener('input', () => update());

    // first paint without motion: the score starts at its value, not counting up from 0
    rows.forEach((r) => (r.score.style.transition = 'none'));
    update({ animate: false, announce: false });
    requestAnimationFrame(() => requestAnimationFrame(() => rows.forEach((r) => (r.score.style.transition = ''))));

    root.wcm = {
      set(values, opts) {
        for (const r of ranges) if (values[r.dataset.key] != null) r.value = values[r.dataset.key];
        update(opts);
      },
      hold() { clearTimeout(badgeTimer); }
    };
  }

  const boot = () => document.querySelectorAll('.wcm').forEach(init);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
