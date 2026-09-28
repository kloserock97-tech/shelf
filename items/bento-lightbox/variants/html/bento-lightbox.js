/* Bento grid + full-screen viewer. Ported from Portfolio 3D TS2 (src/ui/caseStoryView.ts: bento, lightbox).
   Scale and shift live in the picture's own transform, so the page never recalculates layout while a finger moves.
   Wheel and pinch zoom around the cursor or the fingers, a double click toggles 2.6×, a zoomed frame drags.
   Added on the shelf: ← / → go through the screens of the same grid, + / − / 0 zoom, focus returns to the tile. */
(function () {
  var MAX = 6; /* past this the file has no more pixels to show */

  function mount(root) {
    var tiles = [].slice.call(root.querySelectorAll('[data-zoom]'));
    var box = root.querySelector('.lb');
    if (!box || !tiles.length) return;
    var view = box.querySelector('.lb-view');
    var img = view.querySelector('img');
    var cap = box.querySelector('.lb-cap');
    var prev = box.querySelector('.lb-prev');
    var next = box.querySelector('.lb-next');
    var scale = 1, tx = 0, ty = 0, index = 0, opener = null;

    function apply(ease) {
      img.classList.toggle('is-eased', !!ease);
      img.style.transform = 'translate(' + tx.toFixed(1) + 'px, ' + ty.toFixed(1) + 'px) scale(' + scale.toFixed(3) + ')';
      view.classList.toggle('is-zoom', scale > 1.01);
    }
    /* the frame can't be dragged past its edge: the shift is limited to what sticks out of the view */
    function hold() {
      var r = view.getBoundingClientRect();
      var mx = Math.max(0, (img.clientWidth * scale - r.width) / 2);
      var my = Math.max(0, (img.clientHeight * scale - r.height) / 2);
      tx = Math.min(mx, Math.max(-mx, tx));
      ty = Math.min(my, Math.max(-my, ty));
    }
    /* zoom k times around (cx, cy): the spot under the cursor or between the fingers stays put */
    function zoomAt(k, cx, cy, ease) {
      var r = view.getBoundingClientRect();
      var px = cx - r.left - r.width / 2, py = cy - r.top - r.height / 2;
      var to = Math.min(MAX, Math.max(1, scale * k));
      var f = to / scale;
      tx = px - (px - tx) * f;
      ty = py - (py - ty) * f;
      scale = to;
      if (scale <= 1.001) { scale = 1; tx = 0; ty = 0; }
      hold();
      apply(ease);
    }
    function reset() { scale = 1; tx = 0; ty = 0; apply(false); }
    function zoomCentre(k) { var r = view.getBoundingClientRect(); zoomAt(k, r.left + r.width / 2, r.top + r.height / 2, true); }

    function show(i) {
      index = (i + tiles.length) % tiles.length;
      var im = tiles[index].querySelector('img');
      /* the frame fills the screen here, so the largest file of the set is wanted */
      img.srcset = im.srcset;
      img.sizes = im.srcset ? '100vw' : '';
      img.src = im.src;
      img.alt = im.alt;
      cap.textContent = '';
      if (tiles.length > 1) {
        var n = document.createElement('span');
        n.textContent = index + 1 + ' / ' + tiles.length;
        cap.appendChild(n);
      }
      cap.appendChild(document.createTextNode(im.alt));
      reset();
    }

    tiles.forEach(function (t, i) {
      t.addEventListener('click', function () {
        opener = t;
        show(i);
        if (prev) prev.hidden = tiles.length < 2;
        if (next) next.hidden = tiles.length < 2;
        box.showModal();
      });
    });
    box.addEventListener('close', function () {
      reset();
      if (opener) opener.focus({ preventScroll: true });
    });
    box.querySelector('.lb-close').addEventListener('click', function () { box.close(); });
    if (prev) prev.addEventListener('click', function () { show(index - 1); });
    if (next) next.addEventListener('click', function () { show(index + 1); });
    /* a click on the field around the frame closes; on the frame itself it doesn't, or a double click could never
       happen. Checked by coordinates: with pointer capture on the view the click target is the view either way. */
    box.addEventListener('click', function (e) {
      if (e.target === box) { box.close(); return; }
      if (e.target !== view && e.target !== img) return;
      if (scale > 1.01) return;
      var r = img.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) box.close();
    });
    /* Escape closes natively (dialog) */
    box.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft' && tiles.length > 1) { e.preventDefault(); show(index - 1); }
      else if (e.key === 'ArrowRight' && tiles.length > 1) { e.preventDefault(); show(index + 1); }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomCentre(1.6); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomCentre(1 / 1.6); }
      else if (e.key === '0') { e.preventDefault(); scale = 1; tx = 0; ty = 0; apply(true); }
    });

    view.addEventListener('wheel', function (e) {
      e.preventDefault();
      zoomAt(Math.exp(-e.deltaY * 0.0018), e.clientX, e.clientY);
    }, { passive: false });
    view.addEventListener('dblclick', function (e) {
      e.preventDefault();
      zoomAt(scale > 1.01 ? 1 / scale : 2.6, e.clientX, e.clientY, true);
    });

    /* fingers and mouse take one road: two points pinch, one point drags a zoomed frame */
    var pts = new Map(), span = 0, dragging = false;
    var pair = function () { return Array.from(pts.values()); };
    var gap = function () { var p = pair(); return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); };
    var mid = function () { var p = pair(); return { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }; };
    view.addEventListener('pointerdown', function (e) {
      view.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { span = gap(); dragging = false; }
      else if (scale > 1.01) { dragging = true; view.classList.add('is-drag'); }
    });
    view.addEventListener('pointermove', function (e) {
      var p = pts.get(e.pointerId);
      if (!p) return;
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 2) {
        var d = gap();
        if (span > 0) { var c = mid(); zoomAt(d / span, c.x, c.y); }
        span = d;
      } else if (dragging) {
        tx += dx; ty += dy;
        hold();
        apply();
      }
    });
    function liftOff(e) {
      pts.delete(e.pointerId);
      if (pts.size < 2) span = 0;
      if (pts.size === 0) { dragging = false; view.classList.remove('is-drag'); }
    }
    view.addEventListener('pointerup', liftOff);
    view.addEventListener('pointercancel', liftOff);
    return { open: function (i) { tiles[i || 0].click(); } };
  }

  window.BentoLightbox = { mount: mount };
  var auto = function () { [].forEach.call(document.querySelectorAll('.bento'), mount); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
})();
