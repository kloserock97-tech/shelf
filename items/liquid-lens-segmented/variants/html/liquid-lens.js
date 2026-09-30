// Liquid Lens Segmented. The thumb is a flat plate at rest. Pressed or dragged, it lifts into a glass lens:
// it grows, the plate turns clear, the labels under it are magnified and bent at the rim (an SVG displacement map
// drawn here, or a light blur where the browser can't run SVG filters on HTML), it rubber-bands past the ends,
// and on release it settles flat onto the nearest segment with a small squash. Keys move it without the lens.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  // springs: stiffness, damping ratio
  const X_K = 900, X_Z = 0.78; // position: a hint of overshoot
  const L_K = 520, L_Z = 0.9; // lift
  const S_K = 620, S_Z = 0.28; // squash: bouncy, dies in ~0.3 s
  const LIFT_SCALE = 0.15; // the lens grows by 15%
  const MAGNIFY = 0.12; // and magnifies what's under it by a further 12%
  const BLEED = 12; // px of content kept around the lens for the rim to bend in
  let uid = 0;

  // Displacement map for a capsule of w×h drawn inside a margin of `bleed` px. Near the rim each pixel samples from
  // further out, so what lies just past the edge is squeezed into a thin bent band, the way a thick rounded glass edge
  // shows it. R = x offset, G = y offset, 128 = none; the margin stays neutral (it is clipped anyway).
  function capsuleMap(w, h, band, bleed) {
    const s = 2;
    const W = w + bleed * 2;
    const H = h + bleed * 2;
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.round(W * s));
    c.height = Math.max(2, Math.round(H * s));
    const g = c.getContext('2d');
    const img = g.createImageData(c.width, c.height);
    const r = h / 2;
    for (let j = 0; j < c.height; j++) {
      for (let i = 0; i < c.width; i++) {
        const px = (i + 0.5) / s - bleed;
        const py = (j + 0.5) / s - bleed;
        const vx = px - clamp(px, r, w - r);
        const vy = py - r;
        const d = Math.hypot(vx, vy) || 1;
        const inward = r - d; // distance to the rim, px; negative outside the capsule
        const f = inward < 0 || inward >= band ? 0 : (1 - inward / band) ** 1.6;
        const k = (j * c.width + i) * 4;
        img.data[k] = 128 + (vx / d) * f * 127;
        img.data[k + 1] = 128 + (vy / d) * f * 127;
        img.data[k + 2] = 128;
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL();
  }

  function create(root, options = {}) {
    const segs = [...root.querySelectorAll('.lls-seg')];
    const n = segs.length;
    const id = `lls-${++uid}`;
    const mode = options.lens ?? root.dataset.lens ?? (/Apple/.test(navigator.vendor) ? 'blur' : 'refract');
    root.classList.add('lls');
    root.setAttribute('role', 'radiogroup');
    root.dataset.lens = mode;

    // The lens is its own small SVG: the labels are redrawn there as SVG text, so the filter works in the SVG's
    // own pixels (a CSS filter on HTML leaves the map's origin up to the browser).
    const NS = 'http://www.w3.org/2000/svg';
    const thumb = document.createElement('div');
    thumb.className = 'lls-thumb';
    thumb.setAttribute('aria-hidden', 'true');
    thumb.innerHTML = `<div class="lls-plate"></div><div class="lls-clip"><svg class="lls-lens" focusable="false">
        <filter id="${id}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
          <feImage result="map" x="0" y="0" preserveAspectRatio="none"/>
          <feDisplacementMap in="SourceGraphic" in2="map" scale="0" xChannelSelector="R" yChannelSelector="G"/>
        </filter>
        <g class="lls-glass"><rect class="lls-bleed"/><g class="lls-mirror"></g></g>
      </svg></div><div class="lls-rim"></div>`;
    root.appendChild(thumb);
    const lens = thumb.querySelector('.lls-lens');
    const glass = lens.querySelector('.lls-glass');
    const mirror = lens.querySelector('.lls-mirror');
    const bleedRect = lens.querySelector('.lls-bleed');
    const filter = lens.querySelector('filter');
    const feImage = lens.querySelector('feImage');
    const feDisp = lens.querySelector('feDisplacementMap');
    const texts = segs.map((b) => {
      const t = document.createElementNS(NS, 'text');
      t.textContent = b.textContent.trim();
      mirror.appendChild(t);
      return t;
    });

    let index = Math.max(0, segs.findIndex((b) => b.getAttribute('aria-checked') === 'true'));
    let segW = 0;
    let x = 0, vx = 0, tx = 0; // thumb offset from the first segment, px
    let lift = 0, vl = 0, lt = 0;
    let sq = 0, vs = 0;
    let dragging = null;
    let raf = 0;
    let last = 0;

    const maxX = () => (n - 1) * segW;
    const rubber = (v) => {
      const R = segW * 0.32;
      if (v < 0) return -R * (-v / (-v + R));
      if (v > maxX()) return maxX() + R * ((v - maxX()) / (v - maxX() + R));
      return v;
    };

    let thumbH = 0;
    function paint() {
      const motion = !reduce.matches;
      const over = x < 0 ? -x : x > maxX() ? x - maxX() : 0; // how far it is pulled past an end
      const stretch = Math.min(0.1, Math.abs(vx) / 5000) + (segW ? over / segW : 0) * 0.5;
      const s = 1 + (motion ? LIFT_SCALE * lift : 0);
      const sx = s * (1 + 0.5 * sq + stretch);
      const sy = s * (1 - 0.5 * sq - 0.6 * stretch);
      thumb.style.transform = `translateX(${x.toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
      thumb.style.setProperty('--lift', lift.toFixed(3));
      // the row of labels, magnified about the lens centre: row point P lands at centre + m·(P − (x + segW/2))
      const m = 1 + (motion ? MAGNIFY * lift : 0);
      const ox = BLEED + segW / 2 - m * (x + segW / 2);
      const oy = BLEED + thumbH / 2 - m * (thumbH / 2);
      mirror.setAttribute('transform', `translate(${ox.toFixed(2)} ${oy.toFixed(2)}) scale(${m.toFixed(4)})`);
      const on = lift > 0.02;
      if (mode === 'refract') {
        feDisp.setAttribute('scale', (lift * 0.5 * thumbH).toFixed(2));
        if (on) glass.setAttribute('filter', `url(#${id})`);
        else glass.removeAttribute('filter');
      } else {
        glass.style.filter = on ? `blur(${(0.5 * lift).toFixed(2)}px)` : '';
      }
    }

    function step(dt) {
      const spring = (p, v, target, k, z) => {
        const a = -k * (p - target) - 2 * Math.sqrt(k) * z * v;
        v += a * dt;
        return [p + v * dt, v];
      };
      [x, vx] = spring(x, vx, tx, X_K, X_Z);
      [lift, vl] = spring(lift, vl, lt, L_K, L_Z);
      [sq, vs] = spring(sq, vs, 0, S_K, S_Z);
      lift = clamp(lift, 0, 1.2);
    }
    const settled = () =>
      !dragging && Math.abs(x - tx) < 0.05 && Math.abs(vx) < 1 && Math.abs(lift - lt) < 0.002 && Math.abs(vl) < 0.02 && Math.abs(sq) < 0.001 && Math.abs(vs) < 0.02;

    function frame(now) {
      const dt = Math.min(1 / 30, (now - last) / 1000 || 1 / 60);
      last = now;
      // two half steps keep the stiff springs stable on slow frames
      step(dt / 2);
      step(dt / 2);
      if (settled()) {
        x = tx; vx = 0; lift = lt; vl = 0; sq = 0; vs = 0;
        paint();
        raf = 0;
        return;
      }
      paint();
      raf = requestAnimationFrame(frame);
    }
    function kick() {
      if (reduce.matches) {
        // no travel, no growth: the thumb jumps, the glass only fades in and out
        x = tx; vx = 0; sq = 0; vs = 0; lift = lt ? 0.6 : 0;
        paint();
        return;
      }
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    }

    function select(i, { focus = false, emit = true } = {}) {
      i = clamp(i, 0, n - 1);
      const changed = i !== index;
      index = i;
      segs.forEach((b, k) => {
        b.setAttribute('aria-checked', String(k === i));
        b.tabIndex = k === i ? 0 : -1;
      });
      tx = i * segW;
      if (focus) segs[i].focus({ preventScroll: true });
      if (changed && emit) root.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { index: i, value: segs[i].value || segs[i].textContent.trim() } }));
    }

    function measure() {
      segW = segs[0].offsetWidth;
      const h = segs[0].offsetHeight;
      thumbH = h;
      root.style.setProperty('--lls-seg-w', `${segW}px`);
      const W = segW + BLEED * 2;
      const H = h + BLEED * 2;
      lens.setAttribute('width', W);
      lens.setAttribute('height', H);
      lens.setAttribute('viewBox', `0 0 ${W} ${H}`);
      for (const [k, v] of Object.entries({ x: 0, y: 0, width: W, height: H })) {
        filter.setAttribute(k, v);
        feImage.setAttribute(k, v);
        bleedRect.setAttribute(k, v);
      }
      texts.forEach((t, k) => {
        t.setAttribute('x', ((k + 0.5) * segW).toFixed(2));
        t.setAttribute('y', (h / 2).toFixed(2));
      });
      if (mode === 'refract' && segW && h) {
        const url = capsuleMap(segW, h, Math.min(h * 0.42, 16), BLEED);
        feImage.setAttribute('href', url);
        feImage.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', url);
      }
      tx = index * segW;
      if (!dragging) { x = tx; vx = 0; }
      paint();
    }
    new ResizeObserver(measure).observe(root);

    // pointer: press lifts the lens, drag slides it, release drops it on the nearest segment
    const localX = (e) => e.clientX - root.getBoundingClientRect().left - root.clientLeft - parseFloat(getComputedStyle(root).paddingLeft);
    root.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || !segW) return;
      e.preventDefault(); // keep focus where it is until we choose the segment
      root.classList.add('is-pointer');
      root.setPointerCapture(e.pointerId);
      const px = localX(e);
      const onThumb = px >= x && px <= x + segW;
      dragging = { id: e.pointerId, off: onThumb ? px - x : segW / 2 };
      tx = rubber(px - dragging.off);
      lt = 1;
      kick();
    });
    root.addEventListener('pointermove', (e) => {
      if (!dragging || e.pointerId !== dragging.id) return;
      tx = rubber(localX(e) - dragging.off);
      if (reduce.matches) { x = clamp(tx, 0, maxX()); tx = x; paint(); } else kick();
    });
    const release = (e) => {
      if (!dragging || e.pointerId !== dragging.id) return;
      dragging = null;
      if (e.type === 'pointerup') {
        // aim where the finger put it (the thumb may still be catching up); a flick carries a little further
        const aim = clamp(tx + (reduce.matches ? 0 : vx * 0.06), 0, maxX());
        select(Math.round(aim / segW), { focus: true });
      } else {
        tx = index * segW; // the page took the gesture (a vertical scroll): go back, choose nothing
      }
      lt = 0;
      vs += reduce.matches ? 0 : 3.2;
      kick();
    };
    root.addEventListener('pointerup', release);
    root.addEventListener('pointercancel', release);
    root.addEventListener('lostpointercapture', release);

    // keyboard (and screen-reader clicks): the thumb slides flat, no lens
    root.addEventListener('keydown', (e) => {
      root.classList.remove('is-pointer');
      const k = e.key;
      let i = index;
      if (k === 'ArrowRight' || k === 'ArrowDown') i = (index + 1) % n;
      else if (k === 'ArrowLeft' || k === 'ArrowUp') i = (index - 1 + n) % n;
      else if (k === 'Home') i = 0;
      else if (k === 'End') i = n - 1;
      else return;
      e.preventDefault();
      lt = 0;
      select(i, { focus: true });
      kick();
    });
    root.addEventListener('click', (e) => {
      const b = e.target.closest('.lls-seg');
      if (!b || e.detail !== 0) return; // real pointer clicks are handled on release
      select(segs.indexOf(b), { focus: true });
      kick();
    });

    select(index, { emit: false });
    return {
      get index() { return index; },
      select(i) { lt = 0; select(i); kick(); },
      /** poster frames: hold the lens at a position (in segments) and lift */
      freeze(at, l = 1) {
        cancelAnimationFrame(raf);
        raf = 0;
        x = tx = at * segW; lift = lt = l; vx = vl = sq = vs = 0;
        root.classList.add('is-pointer');
        paint();
      }
    };
  }

  window.LiquidLens = { create };
  document.querySelectorAll('[data-liquid-lens]').forEach((el) => { el.liquidLens = create(el); });
})();
