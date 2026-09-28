// Side Project Card: one card, several pages (Portfolio 3D TS2, src/ui/fieldNote.ts, v28 → v79).
// Pager ‹ 01/04 ›, finger swipe, arrow keys while focus is inside. A looping preview clip plays over its
// poster only while the card is visible; reduced motion and Save-Data keep the poster.
// The chevron opens the description; near the bottom of the window the card rises (--note-lift),
// then gives up to 38% of its picture (--note-shrink), then the description scrolls inside (.is-tight).
(function () {
  const pad = (n) => String(n).padStart(2, '0');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function initProjectCard(card, notes, opts = {}) {
    if (!card || !notes || !notes.length || card.dataset.cardReady) return null;
    card.dataset.cardReady = 'true';
    const q = (sel) => card.querySelector(sel);
    const knob = q('.note-knob');
    const more = q('.note-more');
    const inner = q('.note-more__in');
    const img = q('[data-note-img]');
    const video = q('[data-note-video]');
    const title = q('[data-note-title]');
    const label = q('[data-note-label]');
    const kind = q('[data-note-kind]');
    const meta = q('[data-note-meta]');
    const stats = q('[data-note-stats]');
    const glyph = q('[data-note-glyph]');
    const points = q('[data-note-points]');
    const links = q('[data-note-links]');
    const demo = q('[data-note-demo]');
    const count = q('.note-deck__count');
    const steps = [...card.querySelectorAll('.note-deck__btn')];
    const text = Object.assign({ open: 'Open note: {title}', close: 'Close note', go: 'Open demo', repo: 'Source on GitHub ↗' }, opts.labels);
    const ceilingGap = opts.ceiling ?? 16; // how close to the top of the window the card may rise, px

    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches || !!(navigator.connection && navigator.connection.saveData);
    // on phones the clip does not play by itself (on the site it sat over a live WebGL canvas)
    const phone = matchMedia('(hover: none) and (pointer: coarse)').matches;
    const narrow = matchMedia('(max-width: 900px)');
    let index = 0;
    let swapTimer = 0;
    let inView = true;
    const isOpen = () => card.classList.contains('is-open');

    const syncVideo = () => {
      if (!video || !video.dataset.note) return;
      const want = (!phone || opts.playOnTouch) && inView && !document.hidden;
      if (want && video.paused) video.play().catch(() => {});
      else if (!want && !video.paused) video.pause();
    };

    // Where the open card grows. Narrow screens: down, the page scrolls as usual.
    // Wide: down; if the bottom leaves the window, the card rises, but not above the ceiling;
    // then the picture gives up to 38% of its height; then the description scrolls inside.
    const fit = () => {
      if (narrow.matches || !isOpen()) {
        card.style.setProperty('--note-lift', '0');
        card.style.setProperty('--note-shrink', '0px');
        card.classList.remove('is-tight');
        card.style.removeProperty('--note-max');
        return;
      }
      const cs = getComputedStyle(card);
      // rest position without the lift: the rect includes the negative margin, even mid-transition
      const restTop = card.getBoundingClientRect().top - (parseFloat(cs.marginTop) || 0);
      // closed height and picture from the unit, not from offsetHeight, which lies mid-transition
      const u = parseFloat(cs.getPropertyValue('--u')) || 1;
      const figure = 246 * u;
      const closed = (12 + 246 + 46) * u;
      const full = inner.scrollHeight;
      const overflow = restTop + closed + full + ceilingGap - innerHeight;
      const room = Math.max(0, restTop - ceilingGap);
      card.style.setProperty('--note-lift', Math.max(0, Math.min(overflow, room)).toFixed(1));
      const shrink = Math.max(0, Math.min(overflow - room, figure * 0.38));
      card.style.setProperty('--note-shrink', `${shrink.toFixed(1)}px`);
      const tight = overflow - room - shrink > 1;
      card.classList.toggle('is-tight', tight);
      if (tight) card.style.setProperty('--note-max', `${Math.max(120, Math.floor(innerHeight - ceilingGap * 2 - closed + shrink))}px`);
      else card.style.removeProperty('--note-max');
    };

    const set = (open) => {
      const changed = open !== isOpen();
      card.classList.toggle('is-open', open);
      knob.setAttribute('aria-expanded', String(open));
      knob.setAttribute('aria-label', open ? text.close : text.open.replace('{title}', notes[index].title));
      more.setAttribute('aria-hidden', String(!open));
      fit();
      // the code link inside is reachable from the keyboard only while the description is open
      if (links) links.querySelectorAll('a').forEach((a) => { a.tabIndex = open ? 0 : -1; });
      if (changed) card.dispatchEvent(new CustomEvent('notetoggle', { detail: open, bubbles: true }));
    };

    const paint = () => {
      const n = notes[index];
      card.dataset.note = n.id;
      if (title) title.textContent = n.title;
      if (label) label.textContent = n.label;
      if (img) {
        if (img.getAttribute('src') !== n.image) img.src = n.image;
        img.alt = n.alt || '';
      }
      if (video) {
        // a clip that will never play is not attached at all, so it is not downloaded either
        const clip = calm || (phone && !opts.playOnTouch) ? null : n.video;
        if (clip && video.dataset.note !== n.id) {
          card.classList.remove('is-playing');
          video.dataset.note = n.id;
          video.poster = n.image;
          video.innerHTML = (clip.webm ? `<source src="${esc(clip.webm)}" type="video/webm">` : '') + (clip.mp4 ? `<source src="${esc(clip.mp4)}" type="video/mp4">` : '');
          video.load();
        } else if (!clip && video.dataset.note) {
          card.classList.remove('is-playing');
          video.pause();
          delete video.dataset.note;
          video.removeAttribute('poster');
          video.innerHTML = '';
          video.load();
        }
        syncVideo();
      }
      if (kind) kind.textContent = n.kind;
      if (meta) meta.textContent = n.meta;
      if (stats) {
        stats.innerHTML = '';
        (n.stats || []).slice(0, 3).forEach(([value, what]) => {
          const cell = document.createElement('div');
          const dd = document.createElement('dd');
          const dt = document.createElement('dt');
          dd.textContent = value;
          dt.textContent = what;
          cell.append(dd, dt);
          stats.appendChild(cell);
        });
      }
      if (glyph) glyph.innerHTML = n.glyph ? `<svg viewBox="0 0 64 64" aria-hidden="true">${n.glyph}</svg>` : '';
      if (points) {
        points.innerHTML = '';
        (n.points || []).forEach((t) => { const p = document.createElement('p'); p.textContent = t; points.appendChild(p); });
      }
      if (demo) {
        // the link lives on the title and is never hidden; a note without a demo just loses the address
        card.classList.toggle('has-demo', !!n.demo);
        if (n.demo) demo.href = n.demo; else demo.removeAttribute('href');
        demo.setAttribute('aria-label', `${text.go}: ${n.title}`);
      }
      if (links) {
        links.hidden = !n.repo;
        links.innerHTML = n.repo ? `<a href="${esc(n.repo)}" target="_blank" rel="noopener">${esc(text.repo)}</a>` : '';
        links.querySelectorAll('a').forEach((a) => { a.tabIndex = isOpen() ? 0 : -1; });
      }
      if (count) count.innerHTML = `<b>${pad(index + 1)}</b>/${pad(notes.length)}`;
      knob.setAttribute('aria-label', isOpen() ? text.close : text.open.replace('{title}', n.title));
      fit();
    };

    // Page change: picture and caption fade and shift toward the flip while text and picture change.
    // An open card stays open: people flip to read the next project, not to close the description.
    const go = (step) => {
      const next = (index + step + notes.length) % notes.length;
      if (next === index) return;
      const wasOpen = isOpen();
      card.style.setProperty('--swap-dir', String(Math.sign(step)));
      card.classList.add('is-swapping');
      clearTimeout(swapTimer);
      swapTimer = setTimeout(() => {
        index = next;
        paint();
        if (wasOpen) set(true);
        card.dispatchEvent(new CustomEvent('notechange', { detail: index, bubbles: true }));
        // wait for the new picture to decode, but not forever: on an error the card comes back anyway
        let shown = false;
        const reveal = () => {
          if (shown) return;
          shown = true;
          requestAnimationFrame(() => card.classList.remove('is-swapping'));
        };
        if (img && !(img.complete && img.naturalWidth)) {
          img.addEventListener('load', reveal, { once: true });
          img.addEventListener('error', reveal, { once: true });
          setTimeout(reveal, 900);
        } else reveal();
      }, 200);
    };

    // neighbours' pictures load ahead, in idle time: flipping does not wait for the network
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1500));
    idle(() => notes.slice(1).forEach((n) => { const pre = new Image(); pre.src = n.image; }));

    steps.forEach((btn) => btn.addEventListener('click', (e) => { e.stopPropagation(); go(Number(btn.dataset.step)); }));
    knob.addEventListener('click', (e) => { e.stopPropagation(); set(!isOpen()); });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    });

    // Swipe (touch and pen). touch-action: pan-y leaves vertical scrolling to the page. Picture and caption
    // follow the finger with resistance, so the flip is visible before the finger lifts.
    let startX = 0, startY = 0, tracking = false, dragging = false, swipedAt = 0;
    const drop = () => {
      tracking = dragging = false;
      card.classList.remove('is-dragging');
      card.style.removeProperty('--drag');
    };
    card.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || e.target.closest('a, button')) return;
      tracking = true;
      startX = e.clientX;
      startY = e.clientY;
    });
    card.addEventListener('pointermove', (e) => {
      if (!tracking) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (!dragging) {
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
        dragging = true;
        card.classList.add('is-dragging');
      }
      card.style.setProperty('--drag', (Math.sign(dx) * Math.min(56, Math.abs(dx) * 0.45)).toFixed(1));
    });
    card.addEventListener('pointerup', (e) => {
      if (!tracking) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (dragging) swipedAt = performance.now();
      drop();
      if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.4) go(dx < 0 ? 1 : -1);
    });
    card.addEventListener('pointercancel', drop);

    // The whole picture opens the demo. A swipe is not a tap; the pager, chevron and the link itself do their own job.
    const hero = q('.note-hero');
    if (hero) hero.addEventListener('click', (e) => {
      if (dragging || performance.now() - swipedAt < 400 || !demo || !demo.getAttribute('href')) return;
      if (e.target.closest('a, button')) return;
      demo.click();
    });

    addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
    addEventListener('click', (e) => { if (!card.contains(e.target)) set(false); });
    if (video) video.addEventListener('playing', () => { if (video.dataset.note === notes[index].id) card.classList.add('is-playing'); });
    if ('IntersectionObserver' in window) new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; syncVideo(); }).observe(card);
    document.addEventListener('visibilitychange', syncVideo);
    addEventListener('resize', fit);
    narrow.addEventListener('change', fit);
    if (document.fonts) document.fonts.ready.then(fit).catch(() => {});
    paint();
    return { go, open: () => set(true), close: () => set(false), get index() { return index; } };
  }

  window.initProjectCard = initProjectCard;
})();
