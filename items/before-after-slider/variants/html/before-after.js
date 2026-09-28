/* Before / after slider. Ported from Portfolio 3D TS2 (src/ui/caseStoryView.ts: compare).
   The position lives in one CSS variable (--pos) on the box: it clips the "before" layer and moves the handle.
   Drag anywhere on the box (pointer capture keeps the drag when the finger leaves it); arrows, Page Up/Down, Home and
   End work through the hidden range input. */
(function () {
  function mount(box) {
    var range = box.querySelector('.ba-range');
    var a = box.querySelector('.ba-label--a'), b = box.querySelector('.ba-label--b');
    var names = [a ? a.textContent : 'Before', b ? b.textContent : 'After'];
    function set(v) {
      v = Math.round(Math.min(100, Math.max(0, v)));
      box.style.setProperty('--pos', v + '%');
      range.value = String(v);
      range.setAttribute('aria-valuetext', v + '% ' + names[0] + ', ' + (100 - v) + '% ' + names[1]);
    }
    range.addEventListener('input', function () { set(Number(range.value)); });

    var down = false;
    function move(e) {
      if (!down) return;
      var r = box.getBoundingClientRect();
      set(((e.clientX - r.left) / r.width) * 100);
    }
    box.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      e.preventDefault(); /* no text selection, and the mousedown that follows won't pull focus to the body */
      down = true;
      box.setPointerCapture(e.pointerId);
      range.focus({ preventScroll: true }); /* after a drag the arrow keys carry on from here */
      move(e);
    });
    box.addEventListener('pointermove', move);
    box.addEventListener('pointerup', function () { down = false; });
    box.addEventListener('pointercancel', function () { down = false; });
    set(Number(range.value));
    return { set: set };
  }

  window.BeforeAfter = { mount: mount };
  var auto = function () { [].forEach.call(document.querySelectorAll('.ba-box'), mount); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
})();
