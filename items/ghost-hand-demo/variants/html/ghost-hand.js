/* Ghost Hand Demo — an empty state that teaches by doing.
   A drawn hand plays the first action on the real interface, leaves a ghost result and hands over the moment the
   person moves: the ghost turns into a drop target that reads "Your turn".
   Paths are keyframes over element anchors ({ el, x, y } in the element's box), resolved every frame, so the
   gesture follows the layout at any width. The state is a pure function of time: seek(t) draws any moment. */

const HAND_SVG = `<svg viewBox="0 0 48 56" aria-hidden="true">
  <path class="gh-hand__skin" d="M12 5.5A4.5 4.5 0 0 1 21 5.5V21A4 4 0 0 1 29 22.5A3.8 3.8 0 0 1 36.4 24.5A3.5 3.5 0 0 1 43 27.5V38C43 46 38 51 31 51H22C17 51 14 48 11.4 44.3L4.8 34.6A3.4 3.4 0 0 1 10 30.2L12 32.4Z"/>
  <path class="gh-hand__crease" d="M21 21V29M29 22.5V30M36.4 24.5V31"/>
</svg>`;
// The fingertip is the hot spot: (16.5, 1.6) in the 48 × 56 drawing, scaled to the size CSS gives the hand.
const TIP = { x: 16.5 / 48, y: 1.6 / 56 };
const RING_MS = 520;
const MOVE_TRAVEL = 24; // px of pointer travel that counts as "the person moved"

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoother = (t) => t * t * t * (t * (6 * t - 15) + 10); // zero speed and acceleration at both ends
const settle = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
const lerp = (a, b, t) => a + (b - a) * t;

let layer = null;
function getLayer() {
  if (layer && layer.isConnected) return layer;
  layer = document.createElement('div');
  layer.className = 'gh-layer';
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);
  return layer;
}

function find(root, el) {
  return typeof el === 'string' ? root.querySelector(el) : el;
}

/** Point of an anchor { el, x = .5, y = .5, dx = 0, dy = 0 } in viewport pixels. */
function anchorPoint(root, a) {
  const el = find(root, a.el);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width * (a.x ?? 0.5) + (a.dx ?? 0), y: r.top + r.height * (a.y ?? 0.5) + (a.dy ?? 0) };
}

/** A lifeless copy of an element for the hand to carry or the ghost to show. */
function copyOf(el) {
  const c = el.cloneNode(true);
  c.removeAttribute('id');
  c.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  c.querySelectorAll('button, a, input, [tabindex]').forEach((n) => n.setAttribute('tabindex', '-1'));
  c.setAttribute('aria-hidden', 'true');
  c.inert = true;
  return c;
}

/** Lays steps out on a timeline: each gets a start s and an end e in ms. */
function compile(loops) {
  let t = 0;
  return loops.map((steps) => {
    const s0 = t;
    const ops = steps.map((step) => {
      const o = { ...step, s: t, e: t + (step.dur ?? 0) };
      t = o.e;
      return o;
    });
    return { s: s0, e: t, ops };
  });
}

/** Everything on screen at time t of one loop. */
function evaluate(root, loop, t, calm) {
  const st = { pos: null, alpha: 0, press: 0, ring: -1, carry: null, drop: null, fly: null, ghost: null, ghostAlpha: 0 };
  let at = null; // anchor the hand rests on
  let grabAt = null;
  for (const o of loop.ops) {
    if (t < o.s) break;
    const p = o.e > o.s ? clamp01((t - o.s) / (o.e - o.s)) : 1;
    const e = smoother(p);
    switch (o.do) {
      case 'enter': {
        at = o.at;
        const q = anchorPoint(root, at);
        if (!q) break;
        const k = calm ? 0 : 1 - settle(p);
        st.pos = { x: q.x + 18 * k, y: q.y + 26 * k };
        st.alpha = p;
        break;
      }
      case 'move': {
        const a = anchorPoint(root, at);
        const b = anchorPoint(root, o.to);
        if (!a || !b) break;
        if (calm) {
          // no travel: the hand fades out here and in there
          st.pos = p < 0.5 ? a : b;
          st.alpha = Math.abs(1 - 2 * p);
        } else {
          // a gentle arc, the way a hand moves, bulging away from the straight line by 10% of the distance
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const bow = Math.sin(Math.PI * e) * 0.1;
          st.pos = { x: lerp(a.x, b.x, e) - dy * bow, y: lerp(a.y, b.y, e) + dx * bow };
        }
        if (p >= 1) { at = o.to; st.alpha = 1; }
        break;
      }
      case 'press':
        st.press = clamp01(p * 1.8);
        st.ring = (t - o.s) / RING_MS;
        if (o.grab) { grabAt = at; st.carry = { src: o.grab, lift: e }; }
        break;
      case 'release':
        st.press = 1 - e;
        if (st.carry && calm) { st.ghost = st.carry.src; st.ghostAlpha = p; st.carry = null; }
        else if (st.carry) {
          st.drop = { src: st.carry.src, p: e };
          if (p >= 1) { st.ghost = st.carry.src; st.ghostAlpha = 1; st.drop = null; }
          st.carry = p >= 1 ? null : st.carry;
        }
        break;
      case 'tap': {
        // finger down for the first 30%, then a copy of `ghost` hops from its card into the slot
        const k = 0.3;
        st.press = p < k ? p / k : clamp01(1 - (p - k) / 0.25);
        st.ring = (t - o.s) / RING_MS;
        if (o.ghost && p >= k) {
          const f = clamp01((p - k) / (1 - k));
          if (calm) { st.ghost = o.ghost; st.ghostAlpha = f; }
          else if (f < 1) st.fly = { src: o.ghost, p: smoother(f) };
          else { st.ghost = o.ghost; st.ghostAlpha = 1; }
        }
        break;
      }
      case 'leave':
        st.alpha = 1 - p;
        break;
      case 'clear':
        st.ghostAlpha = 1 - e;
        break;
      default:
        break;
    }
    if (o.do !== 'enter' && o.do !== 'move' && o.do !== 'leave' && at) st.pos = anchorPoint(root, at);
  }
  if (!st.pos && at) st.pos = anchorPoint(root, at);
  st.grabAt = grabAt;
  return st;
}

/**
 * ghostHand({ root, slot, loops, ... }) plays the loops once each, then hands over.
 *   loops    — arrays of steps: { do: 'enter', at }, { do: 'move', to }, { do: 'press', grab }, { do: 'release' },
 *              { do: 'tap', ghost }, { do: 'wait' }, { do: 'leave' }, { do: 'clear' }, each with dur in ms.
 *   slot     — the element where the result lands; its data-state goes idle → ghost → turn.
 *   onHandOff(reason) — 'moved' (the person moved), 'done' (loops ran out) or 'skipped'.
 */
export function ghostHand({ root = document, slot, loops, delay = 600, onHandOff, reducedMotion } = {}) {
  const slotEl = find(root, slot);
  const ghostBox = slotEl?.querySelector('.gh-slot__ghost');
  const timeline = compile(loops);
  const total = timeline.length ? timeline[timeline.length - 1].e : 0;
  const calm = reducedMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
  const host = getLayer();

  const hand = document.createElement('div');
  hand.className = 'gh-hand';
  hand.innerHTML = HAND_SVG;
  const ring = document.createElement('div');
  ring.className = 'gh-ring';
  host.append(ring, hand);
  const tipX = TIP.x * hand.offsetWidth;
  const tipY = TIP.y * hand.offsetHeight;
  hand.style.transformOrigin = `${tipX}px ${tipY}px`;

  let carried = null; // { src, el }
  let ghostSrc = null;
  let raf = 0;
  let t0 = 0;
  let timer = 0;
  let handed = false;
  let travel = 0;
  let last = null;

  function carryEl(src) {
    if (carried?.src === src) return carried.el;
    carried?.el.remove();
    const s = find(root, src);
    const el = copyOf(s);
    el.classList.add('gh-carry');
    el.style.width = `${s.getBoundingClientRect().width}px`;
    host.insertBefore(el, ring);
    carried = { src, el };
    return el;
  }

  function showGhost(src, alpha) {
    if (!ghostBox) return;
    if (src !== ghostSrc) {
      ghostBox.replaceChildren();
      if (src) ghostBox.append(copyOf(find(root, src)));
      ghostSrc = src;
    }
    slotEl.style.setProperty('--gh-ghost', alpha.toFixed(3));
    slotEl.dataset.state = src && alpha > 0 ? 'ghost' : 'idle';
  }

  function draw(t) {
    const loop = timeline.find((l) => t < l.e) ?? timeline[timeline.length - 1];
    if (!loop) return;
    const st = evaluate(root, loop, t, calm);

    if (st.pos) {
      hand.style.opacity = st.alpha.toFixed(3);
      hand.style.transform = `translate(${st.pos.x - tipX}px, ${st.pos.y - tipY}px) scale(${1 - 0.08 * st.press})`;
      hand.style.setProperty('--gh-press', st.press.toFixed(3));
      const r = st.ring;
      if (r >= 0 && r < 1) {
        ring.style.opacity = (calm ? 1 - r : (1 - r) * 0.9).toFixed(3);
        ring.style.transform = `translate(${st.pos.x}px, ${st.pos.y}px) scale(${calm ? 1 : 0.4 + 0.9 * settle(r)})`;
      } else ring.style.opacity = '0';
    } else hand.style.opacity = '0';

    // the carried copy follows the fingertip, keeping the point where it was picked up
    const moving = st.carry || st.drop || st.fly;
    if (moving && !calm) {
      const el = carryEl(moving.src);
      const src = find(root, moving.src).getBoundingClientRect();
      const to = slotEl.getBoundingClientRect();
      const toY = to.top + (to.height - src.height) / 2;
      let x, y, s, rot, a;
      if (st.fly) {
        const k = st.fly.p;
        const hop = Math.sin(Math.PI * k);
        x = lerp(src.left, to.left, k);
        y = lerp(src.top, toY, k) - 18 * hop;
        s = lerp(1, to.width / src.width, k) * (1 + 0.03 * hop);
        rot = -2 * hop;
        a = lerp(0.94, 0.55, k);
      } else {
        const g = anchorPoint(root, st.grabAt);
        const lift = st.carry ? st.carry.lift : 1;
        x = st.pos.x - (g.x - src.left);
        y = st.pos.y - (g.y - src.top);
        s = 1 + 0.03 * lift;
        rot = -2 * lift;
        a = 0.94;
        if (st.drop) {
          const k = st.drop.p;
          x = lerp(x, to.left, k);
          y = lerp(y, toY, k);
          s = lerp(s, to.width / src.width, k);
          rot = lerp(rot, 0, k);
          a = lerp(a, 0.55, k);
        }
      }
      el.style.opacity = a.toFixed(3);
      el.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${s})`;
      el.dataset.lifted = st.drop || (st.fly && st.fly.p > 0.8) ? 'false' : 'true';
    } else if (carried) {
      carried.el.remove();
      carried = null;
    }

    showGhost(st.ghost, st.ghost ? st.ghostAlpha : 0);
  }

  function frame(now) {
    const t = now - t0;
    if (t >= total) { handOff('done'); return; }
    draw(t);
    raf = requestAnimationFrame(frame);
  }

  // Any real input ends the show at once: press, key, wheel, or 24px of pointer travel.
  function onMove(e) {
    if (last) travel += Math.hypot(e.clientX - last.x, e.clientY - last.y);
    last = { x: e.clientX, y: e.clientY };
    if (travel > MOVE_TRAVEL) handOff('moved');
  }
  function onInput() { handOff('moved'); }
  const inputs = ['pointerdown', 'keydown', 'wheel', 'touchstart'];

  function listen(on) {
    const m = on ? 'addEventListener' : 'removeEventListener';
    window[m]('pointermove', onMove, { passive: true });
    for (const type of inputs) window[m](type, onInput, { passive: true, capture: true });
  }

  function handOff(reason) {
    if (handed) return;
    handed = true;
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    listen(false);
    hand.classList.add('is-gone');
    ring.style.opacity = '0';
    carried?.el.remove();
    carried = null;
    // the ghost becomes the target: "Your turn"
    slotEl.dataset.state = 'turn';
    onHandOff?.(reason);
  }

  return {
    /** Start after `delay` ms; the first real input hands over. */
    play() {
      travel = 0;
      last = null;
      listen(true);
      timer = setTimeout(() => {
        t0 = performance.now();
        raf = requestAnimationFrame(frame);
      }, delay);
    },
    /** Draw one moment and stay there (posters, tests). */
    seek(t) { draw(Math.max(0, Math.min(total - 1, t))); },
    skip() { handOff('skipped'); },
    destroy() {
      handOff('skipped');
      hand.remove();
      ring.remove();
    },
    get duration() { return total; }
  };
}

/**
 * dragToList({ root, items, list, onDrop }) — the person's own drag: pointer, touch and pen.
 * Items are [data-gh-item]; a drop inside the list (8px slack) calls onDrop(item, rectOfTheCopy).
 * A drop elsewhere flies the copy home. Keyboard people use the page's own Add buttons.
 */
export function dragToList({ root = document, items = '[data-gh-item]', list, onDrop }) {
  const listEl = find(root, list);
  let d = null;

  const over = (x, y) => {
    const r = listEl.getBoundingClientRect();
    return x > r.left - 8 && x < r.right + 8 && y > r.top - 8 && y < r.bottom + 8;
  };

  function start(e) {
    const r = d.item.getBoundingClientRect();
    d.off = { x: d.x0 - r.left, y: d.y0 - r.top };
    d.home = r;
    d.copy = copyOf(d.item);
    d.copy.classList.add('gh-carry');
    d.copy.dataset.lifted = 'true';
    d.copy.style.width = `${r.width}px`;
    getLayer().append(d.copy);
    d.item.classList.add('is-dragging');
    listEl.dataset.dragging = 'true';
    d.live = true;
    move(e);
  }

  function move(e) {
    d.copy.style.transform = `translate(${e.clientX - d.off.x}px, ${e.clientY - d.off.y}px) rotate(-2deg) scale(1.03)`;
    listEl.dataset.over = String(over(e.clientX, e.clientY));
  }

  function end(e, cancelled) {
    const cur = d;
    d = null;
    listEl.dataset.dragging = 'false';
    listEl.dataset.over = 'false';
    if (!cur.live) return;
    cur.item.classList.remove('is-dragging');
    if (!cancelled && over(e.clientX, e.clientY)) {
      const rect = cur.copy.getBoundingClientRect();
      cur.copy.remove();
      onDrop?.(cur.item, rect);
      return;
    }
    // home again
    const c = cur.copy;
    c.dataset.lifted = 'false';
    c.style.transition = 'transform 260ms cubic-bezier(.23,1,.32,1), opacity 260ms';
    c.style.transform = `translate(${cur.home.left}px, ${cur.home.top}px)`;
    c.style.opacity = '0';
    setTimeout(() => c.remove(), 280);
  }

  root.addEventListener('pointerdown', (e) => {
    const item = e.target.closest?.(items);
    if (!item || e.button > 0 || e.target.closest('button, a, input')) return;
    if (item.getAttribute('aria-disabled') === 'true') return;
    d = { item, id: e.pointerId, x0: e.clientX, y0: e.clientY, live: false };
    item.setPointerCapture(e.pointerId);
  });
  root.addEventListener('pointermove', (e) => {
    if (!d || e.pointerId !== d.id) return;
    if (!d.live) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) return;
      start(e);
      return;
    }
    move(e);
  });
  root.addEventListener('pointerup', (e) => { if (d && e.pointerId === d.id) end(e, false); });
  root.addEventListener('pointercancel', (e) => { if (d && e.pointerId === d.id) end(e, true); });
}
