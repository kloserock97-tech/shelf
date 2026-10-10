/* Empty Search Recovery — a zero-result search that says which constraints clash and offers the smallest ways out,
   each with its own count. Clicking one applies it and the results slide in by FLIP.

   EmptySearchRecovery.mount(root, {
     products: [{ id, name, price, words: ['olive', 'rain', 'jacket', …], <flag>: true, shape?, color? }],
     filters: [
       { id: 'price', type: 'max', field: 'price', steps: [40, 60, 80], label: (v) => `Under €${v}`, widen: (v) => `Up to €${v}`,
         clear: 'Any price', miss: (p, v) => `€${p.price - v} over` },
       { id: 'waterproof', type: 'flag', label: 'Waterproof', miss: 'Not waterproof' }
     ],
     swapWords: ['jacket', 'poncho', 'boots'],   // nouns the search may try instead of the typed one
     query: 'rain jacket', active: { price: 40, waterproof: true },
     limit: 6, noun: ['result', 'results'], price: (v) => `€${v}`
   })
   root.esr exposes { set(state), state(), apply(index) }. */
(() => {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const tokenize = (s) => String(s).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];

  // A spring folded into linear(): a damped oscillator x(t) = 1 − e^(−ζωt)(cos ω_d t + ζω/ω_d · sin ω_d t).
  const SPRING = (() => {
    const zeta = 0.74, w = 15, wd = w * Math.sqrt(1 - zeta * zeta), dur = 0.62, n = 30;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * dur;
      const x = i === n ? 1 : 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t));
      pts.push(x.toFixed(4));
    }
    const ok = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('transition-timing-function', 'linear(0, 1)');
    return { easing: ok ? `linear(${pts.join(', ')})` : 'cubic-bezier(0.2, 0.9, 0.25, 1)', duration: dur * 1000 };
  })();

  // Optimal string alignment distance: insert, delete, replace, swap two neighbours. Gives up past `max`.
  function editDistance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev2 = null;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let rowMin = i;
      for (let j = 1; j <= b.length; j++) {
        let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
        cur.push(v);
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      prev2 = prev;
      prev = cur;
    }
    return prev[b.length];
  }

  /* ---------- the search and its ways out ---------- */
  function createEngine(products, filters, swapWords) {
    const vocab = new Map();
    for (const p of products) for (const w of new Set(p.words)) vocab.set(w, (vocab.get(w) || 0) + 1);
    const swaps = (swapWords || []).filter((w) => vocab.has(w));

    const hit = (p, t) => p.words.some((w) => w.startsWith(t) || (t.length > 3 && t.endsWith('s') && w.startsWith(t.slice(0, -1))));
    const known = (t) => products.some((p) => hit(p, t));
    const isOn = (f, v) => v != null && v !== false;

    function test(p, s, use) {
      if ((!use || use.has('q')) && !s.tokens.every((t) => hit(p, t))) return false;
      for (const f of filters) {
        const v = s.active[f.id];
        if (!isOn(f, v) || (use && !use.has(f.id))) continue;
        if (f.type === 'max' ? !(p[f.field] <= v) : !p[f.field || f.id]) return false;
      }
      return true;
    }
    const run = (s, use) => products.filter((p) => test(p, s, use));
    const count = (s, use) => products.reduce((n, p) => n + (test(p, s, use) ? 1 : 0), 0);
    const clone = (s) => ({ tokens: [...s.tokens], active: { ...s.active } });

    // the closest known word: whole words, and word starts of the same length for half-typed words
    function fuzzy(t) {
      const max = t.length <= 4 ? 1 : 2;
      let best = null, bestD = max + 1, bestN = 0;
      for (const [w, n] of vocab) {
        let d = editDistance(t, w, max);
        if (t.length >= 4 && w.length > t.length) d = Math.min(d, editDistance(t, w.slice(0, t.length), max));
        if (d < bestD || (d === bestD && n > bestN)) { best = w; bestD = d; bestN = n; }
      }
      return bestD <= max ? best : null;
    }

    // the smallest set of constraints that already gives nothing (filter-only sets first)
    function clash(s) {
      const ids = [...(s.tokens.length ? ['q'] : []), ...filters.filter((f) => isOn(f, s.active[f.id])).map((f) => f.id)];
      const sets = [];
      const walk = (start, pick) => {
        if (pick.length) sets.push([...pick]);
        for (let i = start; i < ids.length; i++) { pick.push(ids[i]); walk(i + 1, pick); pick.pop(); }
      };
      walk(0, []);
      sets.sort((a, b) => a.length - b.length || a.includes('q') - b.includes('q'));
      return sets.find((set) => count(s, new Set(set)) === 0) || ids;
    }

    function moves(base) {
      const out = [];
      const active = filters.filter((f) => isOn(f, base.active[f.id]));
      for (const f of active) {
        if (f.type !== 'max') continue;
        for (const step of f.steps.filter((v) => v > base.active[f.id])) {
          const s = clone(base);
          s.active[f.id] = step;
          const n = count(s);
          if (n) { out.push({ kind: 'widen', label: f.widen(step), n, state: s, rank: 0 }); break; }
        }
      }
      for (const f of active) {
        const s = clone(base);
        delete s.active[f.id];
        const n = count(s);
        if (n) out.push({ kind: 'remove', label: f.type === 'max' ? f.clear : `Remove ${f.label}`, n, state: s, rank: 1 });
      }
      base.tokens.forEach((t, i) => {
        if (!swaps.includes(t)) return;
        let best = null;
        for (const w of swaps) {
          if (base.tokens.includes(w)) continue;
          const s = clone(base);
          s.tokens[i] = w;
          const n = count(s);
          if (n && (!best || n > best.n)) best = { kind: 'swap', label: `Try “${s.tokens.join(' ')}”`, n, state: s, rank: 2 };
        }
        if (best) out.push(best);
      });
      // drop one of several words
      if (base.tokens.length > 1) base.tokens.forEach((t, i) => {
        const s = clone(base);
        s.tokens.splice(i, 1);
        const n = count(s);
        if (n) out.push({ kind: 'clear', label: `Search “${s.tokens.join(' ')}”`, n, state: s, rank: 3 });
      });
      if (!out.length) {
        // nothing works alone: two filters at once, then the bare query, then the bare filters
        for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
          const s = clone(base);
          delete s.active[active[i].id];
          delete s.active[active[j].id];
          const n = count(s);
          const name = (f) => (f.type === 'max' ? f.label(base.active[f.id]) : f.label);
          if (n) out.push({ kind: 'remove', label: `Remove ${name(active[i])} and ${name(active[j])}`, n, state: s, rank: 1 });
        }
      }
      if (!out.length && base.tokens.length) {
        const s = clone(base);
        s.tokens = [];
        const n = count(s);
        if (n) out.push({ kind: 'clear', label: 'Clear the search words', n, state: s, rank: 3 });
      }
      if (!out.length && active.length) {
        const s = clone(base);
        s.active = {};
        const n = count(s);
        if (n) out.push({ kind: 'remove', label: 'Clear all filters', n, state: s, rank: 3 });
      }
      return out.sort((a, b) => a.rank - b.rank || b.n - a.n).slice(0, 4);
    }

    // the products that fail the fewest constraints, and by the least
    function nearest(base, take) {
      const active = filters.filter((f) => isOn(f, base.active[f.id]));
      const ranked = products
        .map((p) => {
          const words = base.tokens.filter((t) => hit(p, t)).length;
          const misses = [];
          const missed = [];
          let cost = (base.tokens.length - words) * 3;
          for (const t of base.tokens) if (!hit(p, t)) misses.push(`Not “${t}”`);
          for (const f of active) {
            const v = base.active[f.id];
            if (f.type === 'max') {
              if (p[f.field] > v) { misses.push(typeof f.miss === 'function' ? f.miss(p, v) : f.miss); missed.push(f.id); cost += 1 + (p[f.field] - v) / v; }
            } else if (!p[f.field || f.id]) { misses.push(f.miss || `Not ${f.label.toLowerCase()}`); missed.push(f.id); cost += 1; }
          }
          return { p, cost, misses, words, key: `${base.tokens.length - words}:${missed.join('+')}` };
        })
        .filter((x) => !base.tokens.length || x.words > 0)
        .sort((a, b) => a.cost - b.cost || a.p.price - b.p.price);
      // take turns between kinds of miss, so the strip shows every way the near ones fall short
      // (only among the ones that miss a single thing, while there are enough of them)
      const misses = (x) => x.misses.length;
      const fewest = Math.min(...ranked.map(misses));
      const groups = new Map();
      for (const x of ranked.filter((x) => misses(x) === fewest)) {
        if (!groups.has(x.key)) groups.set(x.key, []);
        groups.get(x.key).push(x);
      }
      const lists = [...groups.values()];
      const out = [];
      for (let i = 0; out.length < take && lists.some((l) => i < l.length); i++) {
        for (const l of lists) if (l[i] && out.length < take) out.push(l[i]);
      }
      for (const x of ranked) if (out.length < take && !out.includes(x)) out.push(x);
      return out;
    }

    function diagnose(s) {
      const results = run(s);
      if (results.length) return { results };
      // unknown words first: read them as the closest known word, or leave them out
      const fixes = [];
      const tokens = [];
      for (const t of s.tokens) {
        if (known(t)) { tokens.push(t); continue; }
        const to = fuzzy(t);
        fixes.push({ from: t, to });
        if (to) tokens.push(to);
      }
      const base = { tokens, active: { ...s.active } };
      if (fixes.length && count(base)) {
        const label = fixes.every((f) => f.to) && tokens.length ? `Did you mean “${tokens.join(' ')}”?` : (tokens.length ? `Search “${tokens.join(' ')}”` : 'Clear the search words');
        return { results, fixes, base, clash: null, moves: [{ kind: 'typo', label, n: count(base), state: base, rank: 0 }], nearest: nearest(base, 6) };
      }
      return { results, fixes, base, clash: clash(base), moves: moves(base), nearest: nearest(base, 6) };
    }

    return { diagnose, run };
  }

  /* ---------- drawing ---------- */
  const ICON = {
    widen: '<path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/>',
    remove: '<path d="M7 7l10 10M17 7L7 17"/>',
    swap: '<path d="M4 9h14l-3.5-3.5M20 15H6l3.5 3.5"/>',
    typo: '<path d="M4 20h4.5L19.5 9 15 4.5 4 15.5z"/><path d="M13 6.5l4.5 4.5"/>',
    clear: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="M15 15l5 5"/>'
  };
  const icon = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICON[k] || ICON.clear}</svg>`;
  // simple product silhouettes in a 48×48 box
  const SHAPE = {
    jacket: '<path d="M18 6.5c2.6-1.8 9.4-1.8 12 0l2.6 4.7 7.6 3.9 4 18.4-5.8 1.9-3.1-11V43H12.7V24.4l-3.1 11-5.8-1.9 4-18.4 7.6-3.9z"/><path class="esr-ink" d="M24 12v31"/>',
    fleece: '<path d="M17.5 9l6.5 3.5L30.5 9l9.3 4.6 4 19.5-5.8 1.9-3-10.5V42H13V24.5l-3 10.5-5.8-1.9 4-19.5z"/><path class="esr-ink" d="M20 12.2l4 6 4-6"/>',
    poncho: '<path d="M24 5.5c4.2 0 6.4 3 6.6 7.2L44 37c-6.2 4-13 5.3-20 5.3S10.2 41 4 37l13.4-24.3c.2-4.2 2.4-7.2 6.6-7.2z"/><path class="esr-ink" d="M19 19.5h10"/>',
    boots: '<path d="M13 6h11v24.5l9.4 4.1c3 1.3 4.1 3.2 4.1 6V43H13z"/><path class="esr-ink" d="M13 36h24"/>',
    pants: '<path d="M14.5 5.5h19l3.2 37h-9.4L24 19.8l-3.3 22.7h-9.4z"/><path class="esr-ink" d="M14.6 10h18.8"/>'
  };
  const tile = (p) => `<div class="esr-card__tile" style="--esr-c:${esc(p.color || '#8a8a8e')}" aria-hidden="true">${
    SHAPE[p.shape] ? `<svg viewBox="0 0 48 48" focusable="false">${SHAPE[p.shape]}</svg>` : ''}</div>`;

  function mount(root, opts) {
    if (root.esr) return root.esr;
    const filters = opts.filters;
    const engine = createEngine(opts.products, filters, opts.swapWords);
    const limit = opts.limit || 6;
    const [one, many] = opts.noun || ['result', 'results'];
    const money = opts.price || ((v) => `€${v}`);
    const plural = (n) => `${n} ${n === 1 ? one : many}`;
    const label = (f, v) => (f.type === 'max' ? f.label(v) : f.label);
    let query = opts.query || '';
    let active = { ...(opts.active || {}) };
    let expanded = false;
    let last = null;

    root.classList.add('esr');
    root.innerHTML = `
      <label class="esr__search">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICON.clear}</svg>
        <input class="esr__input" type="search" autocomplete="off" spellcheck="false" enterkeyhint="search" aria-label="${esc(opts.searchLabel || 'Search the catalog')}">
      </label>
      <div class="esr__chips" role="group" aria-label="Filters"></div>
      <p class="esr__status" role="status" aria-live="polite"></p>
      <div class="esr__body"><div class="esr__inner"></div></div>
      <div class="esr__ghosts" aria-hidden="true"></div>`;
    const input = root.querySelector('.esr__input');
    const chips = root.querySelector('.esr__chips');
    const status = root.querySelector('.esr__status');
    const body = root.querySelector('.esr__body');
    const inner = root.querySelector('.esr__inner');
    const ghosts = root.querySelector('.esr__ghosts');
    input.value = query;

    const chipEls = filters.map((f) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'esr-chip';
      b.dataset.filter = f.id;
      b.addEventListener('click', () => {
        const v = active[f.id];
        if (v != null && v !== false) delete active[f.id];
        else active[f.id] = f.type === 'max' ? f.steps[0] : true;
        update({ say: true });
      });
      chips.appendChild(b);
      return b;
    });

    let typing = 0;
    input.addEventListener('input', () => {
      clearTimeout(typing);
      typing = setTimeout(() => { query = input.value; update({ say: true }); }, 160);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { clearTimeout(typing); query = input.value; update({ say: true }); }
    });

    inner.addEventListener('click', (e) => {
      const fix = e.target.closest('.esr-fix');
      if (fix) return apply(Number(fix.dataset.i));
      if (e.target.closest('.esr-more')) { expanded = true; update({ keepExpanded: true }); }
    });

    function card(p, miss) {
      const flags = filters.filter((f) => f.type !== 'max' && p[f.field || f.id]).map((f) => f.label).slice(0, 2).join(' · ');
      return `<li class="esr-card" data-pid="${esc(p.id)}">${tile(p)}
        <div class="esr-card__name">${esc(p.name)}</div>
        <div class="esr-card__meta"><b>${esc(money(p.price))}</b>${
          miss ? `<span class="esr-card__miss">${esc(miss)}</span>` : flags ? `<span>${esc(flags)}</span>` : ''}</div></li>`;
    }

    function renderEmpty(d) {
      const qText = query.trim();
      const tag = (t, warn) => `<span class="esr-tag${warn ? ' is-warn' : ''}">${esc(t)}</span>`;
      let why = '';
      if (d.clash) {
        const parts = d.clash.map((id) => (id === 'q' ? `“${d.base.tokens.join(' ')}”` : label(filters.find((f) => f.id === id), d.base.active[id])));
        why = parts.length === 1
          ? `${tag(parts[0], true)} matches nothing.`
          : `${parts.map((t) => tag(t, true)).join(' + ')} match nothing together.`;
      }
      const typo = (d.fixes || []).map((f) => (f.to
        ? `No product has “${esc(f.from)}”, read as “${esc(f.to)}”.`
        : `No product has “${esc(f.from)}”.`)).join(' ');
      const bundled = (d.fixes || []).length && d.clash;
      const fixes = d.moves.map((m, i) => `<li><button type="button" class="esr-fix" data-i="${i}" aria-label="${esc(m.label)}: ${plural(m.n)}">
          <span class="esr-fix__icon">${icon(m.kind)}</span>
          <span class="esr-fix__label">${esc(m.label)}${bundled ? `<small>as “${esc(d.base.tokens.join(' '))}”</small>` : ''}</span>
          <span class="esr-fix__n">${m.n}</span>
          <svg class="esr-fix__go" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 6l6 6-6 6"/></svg>
        </button></li>`).join('');
      const nearTitle = d.clash ? 'Nearest matches' : d.base.tokens.length ? `Results for “${esc(d.base.tokens.join(' '))}”` : 'Results without the search words';
      const near = d.nearest.length
        ? `<div class="esr-near"><h3 class="esr-near__title">${nearTitle}</h3>
            <ul class="esr-near__strip" tabindex="0" aria-label="${nearTitle}">${d.nearest.map((x) => card(x.p, x.misses[0] || '')).join('')}</ul></div>`
        : '';
      return `<div class="esr-empty">
        <div class="esr-empty__head">
          <span class="esr-empty__badge" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><circle cx="10.5" cy="10.5" r="5.5"/><path d="M15 15l5 5M8 8l5 5"/></svg></span>
          <div>
            <h3 class="esr-empty__title">No results${qText ? ` for “${esc(qText)}”` : ''}</h3>
            ${typo ? `<p class="esr-empty__why">${typo}</p>` : ''}
            ${why ? `<p class="esr-empty__why">${why}</p>` : ''}
          </div>
        </div>
        ${fixes ? `<ul class="esr-fixes" aria-label="Ways to widen the search">${fixes}</ul>` : ''}
        ${near}
      </div>`;
    }

    function renderResults(list) {
      const sorted = [...list].sort((a, b) => a.price - b.price);
      const shown = expanded || sorted.length <= limit + 2 ? sorted : sorted.slice(0, limit);
      const more = list.length - shown.length;
      return `<ul class="esr-grid" aria-label="Results">${shown.map((p) => card(p)).join('')}</ul>${
        more > 0 ? `<button type="button" class="esr-more">Show all ${list.length}</button>` : ''}`;
    }

    function snapshot() {
      const map = new Map();
      for (const el of root.querySelectorAll('.esr__inner [data-pid]')) {
        const r = el.getBoundingClientRect();
        if (r.width) map.set(el.dataset.pid, { r, el });
      }
      return map;
    }

    function update({ say = false, keepExpanded = false } = {}) {
      if (!keepExpanded) expanded = false;
      const before = last ? snapshot() : null;
      const h0 = body.getBoundingClientRect().height;
      const d = engine.diagnose({ tokens: tokenize(query), active });
      last = d;

      chipEls.forEach((b, i) => {
        const f = filters[i];
        const v = active[f.id];
        const on = v != null && v !== false;
        b.setAttribute('aria-pressed', String(on));
        b.textContent = label(f, on ? v : f.steps?.[0]);
        b.classList.toggle('is-clash', !d.results.length && !!d.clash && d.clash.includes(f.id));
      });
      root.classList.toggle('is-empty', !d.results.length);
      inner.innerHTML = d.results.length ? renderResults(d.results) : renderEmpty(d);
      const text = d.results.length
        ? plural(d.results.length)
        : `No ${many}. ${d.moves.length ? `${d.moves.length} way${d.moves.length > 1 ? 's' : ''} to widen the search.` : ''}`;
      if (say || status.textContent === '') status.textContent = text;
      if (before) animate(before, h0);
    }

    function animate(before, h0) {
      const h1 = body.getBoundingClientRect().height;
      const still = reduce.matches;
      if (!still && Math.abs(h1 - h0) > 1) {
        body.animate([{ height: `${h0}px` }, { height: `${h1}px` }], { duration: SPRING.duration, easing: SPRING.easing });
      }
      const box = root.getBoundingClientRect();
      const seen = new Set();
      let fresh = 0;
      for (const el of inner.querySelectorAll('[data-pid]')) {
        const now = el.getBoundingClientRect();
        const was = before.get(el.dataset.pid);
        seen.add(el.dataset.pid);
        if (still) {
          if (!was) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
          continue;
        }
        if (was) {
          const s = was.r.width / now.width;
          const dx = was.r.left - now.left, dy = was.r.top - now.top;
          if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(s - 1) < 0.01) continue;
          el.animate([{ transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${s})` }, { transformOrigin: '0 0', transform: 'none' }],
            { duration: SPRING.duration, easing: SPRING.easing });
        } else {
          el.animate([{ opacity: 0, transform: 'translateY(10px) scale(0.98)' }, { opacity: 1, transform: 'none' }],
            { duration: 320, delay: Math.min(fresh++, 8) * 28, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' });
        }
      }
      // what left: the old node fades out where it stood
      if (still) return;
      for (const [id, { r, el }] of before) {
        if (seen.has(id)) continue;
        Object.assign(el.style, { position: 'absolute', left: `${r.left - box.left}px`, top: `${r.top - box.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: '0' });
        ghosts.appendChild(el);
        el.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(0.96)' }], { duration: 180, easing: 'ease-in', fill: 'forwards' }).finished
          .then(() => el.remove(), () => el.remove());
      }
    }

    function apply(i) {
      const m = last && last.moves && last.moves[i];
      if (!m) return;
      const typed = query;
      query = m.state.tokens.join(' ');
      if (tokenize(typed).join(' ') !== query) input.value = query;
      active = { ...m.state.active };
      update({ say: false });
      status.textContent = `${m.label}: ${plural(m.n)}.`;
      // keep the keyboard somewhere sensible: the search field stays, the list is right below it
      if (document.activeElement === document.body || !root.contains(document.activeElement)) input.focus({ preventScroll: true });
    }

    update();
    root.esr = {
      set(state) {
        if ('query' in state) { query = state.query; input.value = query; }
        if ('active' in state) active = { ...state.active };
        update({ say: true });
      },
      state: () => ({ query, active: { ...active } }),
      apply,
      engine
    };
    return root.esr;
  }

  window.EmptySearchRecovery = { mount, editDistance };
})();
