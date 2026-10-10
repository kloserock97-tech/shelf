// Live-Preview Interest Picker.
// Markup: form.lpo[data-live-preview] with input.lpo-chip__in[type=checkbox][value=<topic>] + label.lpo-chip pairs
// (chip colour in --c on the label),
// a .lpo__feed list, and template.lpo-cards holding every possible card: li.lpo-card[data-topic][data-shape].
// Each pick rebuilds the feed from the template: the newest topic leads, the others follow round-robin, up to
// data-max cards (4 by default). The reshuffle runs inside a View Transition, so cards slide to their new places,
// new ones drop in and dropped ones fade. Counter and button state are CSS (:has); the script keeps aria in step.
// Events: "lpo:change" (detail: { topics }) on every pick, "lpo:continue" (detail: { topics }) on a valid submit.
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const canVT = typeof document.startViewTransition === 'function';
  let uid = 0;

  function init(root) {
    if (root.livePreview) return root.livePreview;
    const id = ++uid;
    const min = Number(root.dataset.min) || 3;
    const max = Number(root.dataset.max) || 4;
    const feed = root.querySelector('.lpo__feed');
    const tuned = root.querySelector('.lpo__tuned');
    const go = root.querySelector('.lpo__go');
    const inputs = [...root.querySelectorAll('.lpo-chip__in')];
    const status = root.querySelector('.lpo__status');
    const byTopic = new Map();
    root.querySelectorAll('template.lpo-cards').forEach((tpl) => {
      tpl.content.querySelectorAll('.lpo-card').forEach((card, i) => {
        const t = card.dataset.topic;
        if (!byTopic.has(t)) byTopic.set(t, []);
        card.dataset.key = `${t}-${byTopic.get(t).length}`;
        byTopic.get(t).push(card);
      });
    });
    const chipOf = (topic) => inputs.find((i) => i.value === topic)?.labels?.[0];
    const colourOf = (topic) => chipOf(topic)?.style.getPropertyValue('--c').trim() || '';
    const nameOf = (topic) => chipOf(topic)?.textContent.trim() || topic;
    // the order topics were picked in; pre-checked chips count as picked in document order
    const order = inputs.filter((i) => i.checked).map((i) => i.value);
    let running = null;

    const say = (text) => { if (!status) return; status.textContent = ''; requestAnimationFrame(() => { status.textContent = text; }); };
    const leftToPick = () => Math.max(0, min - order.length);

    function cardsFor() {
      const topics = [...order].reverse(); // newest first
      const list = [];
      for (let round = 0; list.length < max && round < 8; round++) {
        let added = false;
        for (const t of topics) {
          const c = byTopic.get(t)?.[round];
          if (c && list.length < max) { list.push(c); added = true; }
        }
        if (!added) break;
      }
      return list;
    }

    function ghost(i) {
      const li = document.createElement('li');
      li.className = 'lpo-card lpo-card--ghost';
      li.setAttribute('aria-hidden', 'true');
      li.innerHTML = '<span class="lpo-card__art"></span><span class="lpo-card__text"><i></i><i></i></span>';
      li.style.viewTransitionName = `lpo${id}-ghost-${i}`;
      return li;
    }

    function paint() {
      const list = cardsFor();
      const nodes = list.length
        ? list.map((c, k) => {
            const n = c.cloneNode(true);
            n.style.setProperty('--c', colourOf(c.dataset.topic));
            n.style.viewTransitionName = `lpo${id}-${n.dataset.key}`;
            n.classList.toggle('is-lead', k === 0);
            return n;
          })
        : Array.from({ length: max }, (_, i) => ghost(i));
      feed.replaceChildren(...nodes);
      const newest = order[order.length - 1];
      if (newest) root.style.setProperty('--lpo-accent', colourOf(newest));
      else root.style.removeProperty('--lpo-accent');
      if (tuned) {
        tuned.innerHTML = order.length
          ? [...order].reverse().map((t) => `<em style="--c:${colourOf(t)}">${nameOf(t)}</em>`).join(' · ')
          : 'Nothing picked yet';
      }
      const ok = order.length >= min;
      go?.setAttribute('aria-disabled', String(!ok));
    }

    function update() {
      if (!canVT || reduced.matches || document.visibilityState === 'hidden') { paint(); return; }
      if (running) running.skipTransition();
      const html = document.documentElement;
      html.classList.add('lpo-vt');
      const vt = document.startViewTransition(paint);
      running = vt;
      vt.finished.finally(() => {
        if (running === vt) { running = null; html.classList.remove('lpo-vt'); }
      });
    }

    root.addEventListener('change', (e) => {
      const input = e.target.closest?.('.lpo-chip__in');
      if (!input) return;
      const at = order.indexOf(input.value);
      if (input.checked && at < 0) order.push(input.value);
      if (!input.checked && at >= 0) order.splice(at, 1);
      update();
      const left = leftToPick();
      say(`${nameOf(input.value)} ${input.checked ? 'added' : 'removed'}. ${left ? `Pick ${left} more.` : `${order.length} topics picked, you can continue.`}`);
      root.dispatchEvent(new CustomEvent('lpo:change', { detail: { topics: [...order] } }));
    });

    root.addEventListener('submit', (e) => {
      e.preventDefault();
      const left = leftToPick();
      if (left) {
        say(`Pick ${left} more to continue.`);
        if (go && !reduced.matches) { go.classList.remove('is-nudge'); void go.offsetWidth; go.classList.add('is-nudge'); }
        inputs.find((i) => !i.checked)?.focus();
        return;
      }
      root.dispatchEvent(new CustomEvent('lpo:continue', { detail: { topics: [...order] } }));
    });

    paint();
    const api = {
      get topics() { return [...order]; },
      /** pick topics in this order, without animation (used for a preset state) */
      set(topics) {
        order.length = 0;
        for (const i of inputs) i.checked = false;
        for (const t of topics) { const i = inputs.find((x) => x.value === t); if (i) { i.checked = true; order.push(t); } }
        paint();
      }
    };
    root.livePreview = api;
    return api;
  }

  window.LivePreview = { init };
  const boot = () => document.querySelectorAll('[data-live-preview]').forEach((el) => init(el));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
