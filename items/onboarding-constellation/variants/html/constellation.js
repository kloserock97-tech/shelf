/* Onboarding Constellation — onboarding progress drawn as a constellation.
   Every step is a star. A finished step lights its star, and lines run to the steps it unlocks; steps that are still
   locked are dim, with dotted lines. Finish them all and the lines close into the product's sign.
   The graph is plain JSON: steps with positions (0…1 of the sky) and the steps they come after.

     import { createConstellation } from './constellation.js';
     const oc = createConstellation(document.querySelector('.oc'), graph, { done: ['account'] });
     oc.complete('profile');   oc.undo('profile');   oc.open('workspace');   oc.close();
     root.addEventListener('constellationchange', (e) => e.detail.done);   // array of ids

   graph = { title, name, steps: [{ id, label, text, action?, x, y, after: [ids] }] }
   Stars are real buttons over an SVG of lines: Tab reaches the current star, arrows move to the nearest star in that
   direction, Enter opens its card, Esc closes it. Narrow skies (under 520 px) turn the figure a quarter turn and put
   the card under the sky. Nothing runs at rest: lines draw and stars ignite with Web Animations, then stop. */

const SVG = 'http://www.w3.org/2000/svg';
const NARROW = 520;
const TURN = { right: 'above', left: 'below', above: 'left', below: 'right' };   // a quarter turn of the figure

export function createConstellation(root, graph, opts = {}) {
  const steps = graph.steps.map((s, i) => ({ ...s, index: i, after: s.after ?? [] }));
  const byId = new Map(steps.map((s) => [s.id, s]));
  const done = new Set(opts.done ?? []);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const uid = `oc${Math.random().toString(36).slice(2, 7)}`;
  let openId = null;
  let focusId = null;
  let narrow = false;
  let size = { w: 1, h: 1 };

  // edges run from a step's prerequisite to the step
  const edges = [];
  for (const s of steps) for (const a of s.after) if (byId.has(a)) edges.push({ from: byId.get(a), to: s });

  root.classList.add('oc');
  root.innerHTML = `
    <header class="oc__head">
      <h2 class="oc__title" id="${uid}-t"></h2>
      <p class="oc__count" aria-hidden="true"></p>
    </header>
    <div class="oc__body">
    <div class="oc__sky" role="group" aria-labelledby="${uid}-t" aria-describedby="${uid}-c">
      <svg class="oc__svg" aria-hidden="true" focusable="false">
        <defs>
          <filter id="${uid}-bloom" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="near"/>
            <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="far"/>
            <feMerge><feMergeNode in="far"/><feMergeNode in="near"/></feMerge>
          </filter>
        </defs>
        <g class="oc__field"></g>
        <g class="oc__glow" filter="url(#${uid}-bloom)"></g>
        <g class="oc__lines"></g>
      </svg>
      <p class="oc__name" aria-hidden="true"></p>
      <div class="oc__stars"></div>
    </div>
    <section class="oc__card" id="${uid}-card" hidden aria-labelledby="${uid}-ct"></section>
    </div>
    <p class="oc__sr" id="${uid}-c"></p>
    <p class="oc__sr" role="status"></p>`;
  const sky = root.querySelector('.oc__sky');
  const svg = root.querySelector('.oc__svg');
  const field = root.querySelector('.oc__field');
  const glowG = root.querySelector('.oc__glow');
  const lineG = root.querySelector('.oc__lines');
  const starsEl = root.querySelector('.oc__stars');
  const card = root.querySelector('.oc__card');
  const nameEl = root.querySelector('.oc__name');
  const titleEl = root.querySelector('.oc__title');
  const countEl = root.querySelector('.oc__count');
  const [descEl, statusEl] = root.querySelectorAll('.oc__sr');
  nameEl.textContent = graph.name ?? '';

  for (const e of edges) {
    e.glow = document.createElementNS(SVG, 'line');
    e.line = document.createElementNS(SVG, 'line');
    glowG.append(e.glow);
    lineG.append(e.line);
  }
  for (const s of steps) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'oc__star';
    b.tabIndex = -1;
    b.dataset.id = s.id;
    b.setAttribute('aria-controls', card.id);
    b.innerHTML = `<span class="oc__core" aria-hidden="true"></span><span class="oc__label" aria-hidden="true"></span>`;
    b.querySelector('.oc__label').textContent = s.label;
    b.addEventListener('click', () => (openId === s.id ? close() : open(s.id)));
    b.addEventListener('focus', () => { focusId = s.id; rove(); });
    starsEl.append(b);
    s.btn = b;
  }

  // ---------- state ----------
  const stateOf = (s) => (done.has(s.id) ? 'done' : s.after.every((a) => done.has(a)) ? 'open' : 'locked');
  const edgeState = (e) => (done.has(e.from.id) && done.has(e.to.id) ? 'lit' : done.has(e.from.id) && stateOf(e.to) === 'open' ? 'next' : 'dim');
  const blockers = (s) => s.after.filter((a) => !done.has(a)).map((a) => byId.get(a));
  const dependents = (s) => steps.filter((t) => t.after.includes(s.id) && done.has(t.id));

  function paint() {
    const n = done.size, total = steps.length, complete = n === total;
    root.classList.toggle('is-complete', complete);
    titleEl.textContent = complete ? (graph.doneTitle ?? 'All set') : (graph.title ?? 'Get set up');
    countEl.textContent = complete ? `You drew the ${graph.name ?? 'figure'}` : `${n} of ${total} stars lit`;
    descEl.textContent = `${n} of ${total} steps done.` + (complete ? '' : ` Next: ${steps.filter((s) => stateOf(s) === 'open').map((s) => s.label).join(', ')}.`);
    for (const s of steps) {
      const st = stateOf(s);
      s.btn.dataset.state = st;
      s.btn.setAttribute('aria-label', `Step ${s.index + 1} of ${total}: ${s.label}. ${st === 'done' ? 'Done' : st === 'open' ? 'Ready to start' : 'Locked'}.`);
      s.btn.setAttribute('aria-expanded', String(openId === s.id));
      s.btn.classList.toggle('is-open', openId === s.id);
    }
    for (const e of edges) {
      const st = edgeState(e);
      e.line.setAttribute('class', `oc__edge oc__edge--${st}`);
      e.glow.setAttribute('class', `oc__edge-glow oc__edge-glow--${st}`);
    }
    if (openId) fillCard();
  }

  // ---------- geometry ----------
  const pos = (s) => {
    const x = narrow ? s.y : s.x, y = narrow ? 1 - s.x : s.y;  // a quarter turn on narrow skies
    return { x: x * size.w, y: y * size.h };
  };
  function layout() {
    const r = sky.getBoundingClientRect();
    size = { w: Math.max(1, r.width), h: Math.max(1, r.height) };
    svg.setAttribute('viewBox', `0 0 ${size.w} ${size.h}`);
    for (const s of steps) {
      const p = pos(s);
      s.px = p;
      s.btn.style.left = `${p.x}px`;
      s.btn.style.top = `${p.y}px`;
      // label side: from the graph ("above", "below", "left", "right"), turned with the figure on narrow skies
      let side = s.labelSide ?? (s.y > 0.9 ? 'above' : 'below');
      if (narrow) side = TURN[side];
      const lw = s.btn.querySelector('.oc__label').offsetWidth;
      if ((side === 'right' && p.x + 15 + lw > size.w - 6) || (side === 'left' && p.x - 15 - lw < 6)) side = p.y > size.h * 0.85 ? 'above' : 'below';
      if (side === 'above' && p.y < 34) side = 'below';
      s.btn.dataset.label = side;
      s.btn.classList.toggle('is-edge-l', p.x < size.w * 0.14);
      s.btn.classList.toggle('is-edge-r', p.x > size.w * 0.86);
    }
    for (const e of edges) {
      for (const el of [e.line, e.glow]) {
        el.setAttribute('x1', e.from.px.x); el.setAttribute('y1', e.from.px.y);
        el.setAttribute('x2', e.to.px.x); el.setAttribute('y2', e.to.px.y);
      }
      e.len = Math.hypot(e.to.px.x - e.from.px.x, e.to.px.y - e.from.px.y);
    }
    drawField();
    if (openId) placeCard();
  }

  // faint background stars, seeded (Hash Kit mixer) so they never jump on resize
  function hashU(x) {
    x ^= x >>> 16; x = Math.imul(x, 0x3f9c86cb);
    x ^= x >>> 14; x = Math.imul(x, 0x1ae9dacf);
    x ^= x >>> 15;
    return x >>> 0;
  }
  function drawField() {
    field.textContent = '';
    const count = Math.round(Math.min(140, size.w * size.h / 4200));
    let seed = 7;
    const rnd = () => (seed = (seed + 0xb31c96c9) >>> 0, hashU(seed) / 4294967296);
    for (let i = 0; i < count; i++) {
      const c = document.createElementNS(SVG, 'circle');
      const big = rnd() > 0.93;
      c.setAttribute('cx', (rnd() * size.w).toFixed(1));
      c.setAttribute('cy', (rnd() * size.h).toFixed(1));
      c.setAttribute('r', big ? 1.3 : 0.4 + rnd() * 0.6);
      c.setAttribute('opacity', (0.18 + rnd() * (big ? 0.5 : 0.35)).toFixed(2));
      field.append(c);
    }
  }

  // ---------- card ----------
  function fillCard() {
    const s = byId.get(openId);
    const st = stateOf(s);
    const deps = dependents(s);
    const blocked = blockers(s);
    card.dataset.state = st;
    card.innerHTML = `
      <p class="oc__kicker">Step ${s.index + 1} of ${steps.length} · ${st === 'done' ? 'Done' : st === 'open' ? 'Ready' : 'Locked'}</p>
      <h3 class="oc__ct" id="${uid}-ct"></h3>
      <p class="oc__text"></p>
      <div class="oc__actions"></div>
      <button class="oc__x" type="button" aria-label="Close"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>`;
    card.querySelector('.oc__ct').textContent = s.label;
    card.querySelector('.oc__text').textContent = s.text ?? '';
    const actions = card.querySelector('.oc__actions');
    const add = (label, cls, fn, disabled) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = cls; b.textContent = label;
      if (disabled) b.disabled = true;
      b.addEventListener('click', fn);
      actions.append(b);
      return b;
    };
    if (st === 'open') add(s.action ?? 'Mark as done', 'oc__btn oc__btn--primary', () => complete(s.id, true));
    else if (st === 'done') {
      const u = add('Undo', 'oc__btn', () => undo(s.id, true), deps.length > 0);
      if (deps.length) {
        u.setAttribute('aria-describedby', `${uid}-why`);
        const why = document.createElement('p');
        why.className = 'oc__why'; why.id = `${uid}-why`;
        why.textContent = `${deps.map((d) => d.label).join(', ')} ${deps.length > 1 ? 'build' : 'builds'} on this.`;
        actions.append(why);
      }
    } else {
      const why = document.createElement('p');
      why.className = 'oc__why';
      why.textContent = 'Finish first:';
      actions.append(why);
      for (const b of blocked) add(b.label, 'oc__btn oc__btn--link', () => { open(b.id); b.btn.focus(); });
    }
    card.querySelector('.oc__x').addEventListener('click', () => { const id = openId; close(); byId.get(id)?.btn.focus(); });
  }
  function placeCard() {
    if (narrow) { card.style.left = card.style.top = ''; return; }
    const s = byId.get(openId);
    const cw = card.offsetWidth, ch = card.offsetHeight, gap = 26;
    let x = s.px.x + gap;
    if (x + cw > size.w - 10) x = s.px.x - gap - cw;
    x = Math.max(10, Math.min(size.w - cw - 10, x));
    const y = Math.max(10, Math.min(size.h - ch - 10, s.px.y - ch / 2));
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
  }
  function open(id) {
    if (!byId.has(id)) return;
    openId = id;
    focusId = id;
    card.hidden = false;
    paint();
    placeCard();
    rove();
    if (!reduce.matches) card.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'ease-out' });
  }
  function close() {
    openId = null;
    card.hidden = true;
    paint();
  }

  // ---------- actions ----------
  function complete(id, fromCard = false) {
    const s = byId.get(id);
    if (!s || done.has(id) || stateOf(s) !== 'open') return;
    const before = new Set(steps.filter((t) => stateOf(t) === 'open').map((t) => t.id));
    done.add(id);
    paint();
    ignite(s);
    const opened = steps.filter((t) => stateOf(t) === 'open' && !before.has(t.id) && t.id !== id);
    const all = done.size === steps.length;
    announce(all ? `${s.label} done. All ${steps.length} steps done: you drew the ${graph.name ?? 'figure'}.`
      : `${s.label} done.${opened.length ? ` Now open: ${opened.map((t) => t.label).join(', ')}.` : ''}`);
    if (all) finale();
    if (fromCard) s.btn.focus();
    emit();
  }
  function undo(id, fromCard = false) {
    const s = byId.get(id);
    if (!s || !done.has(id) || dependents(s).length) return;
    done.delete(id);
    paint();
    announce(`${s.label} marked as not done.`);
    if (fromCard) s.btn.focus();
    emit();
  }
  function emit() {
    root.dispatchEvent(new CustomEvent('constellationchange', { detail: { done: [...done] } }));
  }
  function announce(t) { statusEl.textContent = t; }

  // lines from finished prerequisites draw toward the star, then it ignites
  function ignite(s) {
    if (reduce.matches) return;
    const incoming = edges.filter((e) => e.to === s && done.has(e.from.id));
    const drawMs = 620;
    for (const e of incoming) {
      for (const el of [e.line, e.glow]) {
        el.animate([{ strokeDasharray: `${e.len} ${e.len}`, strokeDashoffset: e.len }, { strokeDasharray: `${e.len} ${e.len}`, strokeDashoffset: 0 }],
          { duration: drawMs, easing: 'cubic-bezier(.3,.1,.2,1)' });
      }
    }
    const delay = incoming.length ? drawMs * 0.82 : 0;
    s.btn.querySelector('.oc__core').animate([
      { transform: 'scale(0.3)', filter: 'brightness(1)', offset: 0 },
      { transform: 'scale(0.3)', filter: 'brightness(1)', offset: delay / (delay + 700) },
      { transform: 'scale(1.6)', filter: 'brightness(1.8)', offset: (delay + 220) / (delay + 700) },
      { transform: 'scale(1)', filter: 'brightness(1)' }
    ], { duration: delay + 700, easing: 'ease-out' });
    // newly opened stars and their dashed lines fade in after
    for (const e of edges) {
      if (e.from === s && edgeState(e) !== 'lit') {
        e.line.animate([{ opacity: 0 }, { opacity: 0, offset: 0.6 }, { opacity: 1 }], { duration: delay + 900 });
      }
    }
  }
  function finale() {
    if (reduce.matches) return;
    for (const e of edges) e.glow.animate([{ strokeWidth: '5px' }, { strokeWidth: '13px', offset: 0.35 }, { strokeWidth: '5px' }], { duration: 1600, delay: 500, easing: 'ease-in-out' });
    nameEl.animate([{ opacity: 0, letterSpacing: '0.5em' }, { opacity: 1, letterSpacing: '0.32em' }], { duration: 1400, delay: 700, easing: 'ease-out', fill: 'backwards' });
  }

  // ---------- keyboard: roving tabindex over the stars ----------
  function rove() {
    const target = focusId ?? openId ?? (steps.find((s) => stateOf(s) === 'open') ?? steps[0]).id;
    for (const s of steps) s.btn.tabIndex = s.id === target ? 0 : -1;
  }
  const DIRS = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
  function nearest(from, [dx, dy]) {
    let best = null, bestScore = Infinity;
    for (const s of steps) {
      if (s === from) continue;
      const vx = s.px.x - from.px.x, vy = s.px.y - from.px.y;
      const along = vx * dx + vy * dy;
      if (along <= 1) continue;
      const across = Math.abs(vx * dy - vy * dx);
      const score = along + across * 2.2;   // prefer stars straight ahead
      if (score < bestScore) { bestScore = score; best = s; }
    }
    return best;
  }
  starsEl.addEventListener('keydown', (ev) => {
    const cur = byId.get(ev.target.closest('.oc__star')?.dataset.id);
    if (!cur) return;
    let next = null;
    if (DIRS[ev.key]) next = nearest(cur, DIRS[ev.key]);
    else if (ev.key === 'Home') next = steps[0];
    else if (ev.key === 'End') next = steps[steps.length - 1];
    else if (ev.key === 'Escape' && openId) { ev.preventDefault(); close(); return; }
    else return;
    ev.preventDefault();
    if (!next) return;
    focusId = next.id;
    rove();
    next.btn.focus();
    if (openId) open(next.id);
  });
  card.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    const id = openId;
    close();
    byId.get(id)?.btn.focus();
  });

  // ---------- size ----------
  const ro = new ResizeObserver(() => {
    const was = narrow;
    narrow = root.getBoundingClientRect().width < NARROW;
    root.classList.toggle('is-narrow', narrow);
    if (was !== narrow) requestAnimationFrame(layout);
    layout();
  });
  ro.observe(root);
  narrow = root.getBoundingClientRect().width < NARROW;
  root.classList.toggle('is-narrow', narrow);
  layout();
  paint();
  rove();

  return {
    complete, undo, open, close,
    reset(ids = []) { done.clear(); ids.forEach((i) => done.add(i)); openId = null; card.hidden = true; paint(); rove(); emit(); },
    get done() { return [...done]; },
    destroy() { ro.disconnect(); root.textContent = ''; }
  };
}
