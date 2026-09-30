// Multi Pull: an overscroll gesture menu. Pull the list down from its top edge; each mark passed opens the next
// action and moves the choice to it, sideways drift moves the choice along the row, release runs it.
// Usage: multiPull(root, { onAction: async (name) => { … } })   // Refresh waits for the promise with a spinner
//        keyboard: at the top of the list, Up arrow opens the row; Left / Right, Enter, Escape

const MARKS = [64, 116, 168]; // pull depth (px, after resistance) that opens each action
const SIDE_SLOP = 22;         // sideways travel before drift takes over from depth
const SIDE_STEP = 60;         // sideways travel per action
const HOLD = 72;              // where the list waits while a refresh runs
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
// resistance: follows the finger at first, then stiffens; never quite stops
const resist = (raw) => (raw * 0.74) / (1 + raw / 1300);

export function multiPull(root, { onAction = () => {}, sound = true } = {}) {
  const scroller = root.querySelector('.mp__scroller');
  const row = root.querySelector('.mp__row');
  const items = [...root.querySelectorAll('.mp__item')];
  const names = items.map((el) => el.dataset.action);
  const labels = items.map((el) => el.textContent.trim());
  const live = root.querySelector('.mp__live');
  let index = -1;
  let depth = 0;
  let gesture = null; // { x0, y0, anchor, side, base }
  let busy = false;
  let soundOn = sound;

  // ---------- sound: a short synthesized tick, pitched per action ----------
  let audio = null;
  const wake = () => {
    if (!soundOn) return;
    audio ||= new AudioContext();
    if (audio.state === 'suspended') audio.resume();
  };
  function blip(freq, len = 0.045, level = 0.08, drop = 0.55) {
    if (!soundOn || !audio || audio.state !== 'running') return;
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * drop, t + len);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(level, t + 0.004);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + len);
    osc.connect(amp).connect(audio.destination);
    osc.start(t);
    osc.stop(t + len + 0.01);
  }
  const buzz = () => {
    if (navigator.vibrate && navigator.userActivation?.hasBeenActive !== false) navigator.vibrate(8);
  };

  // ---------- drawing ----------
  function setDepth(d) {
    depth = d;
    scroller.style.translate = `0 ${d}px`;
    row.style.translate = `0 ${d / 2 - 36}px`;
    root.style.setProperty('--mp-wind', `${Math.min(d / MARKS[0], 1) * 300}deg`);
  }

  function setIndex(i, opened) {
    items.forEach((el, k) => el.classList.toggle('is-open', k < opened || k === i));
    if (i === index) return;
    index = i;
    root.dataset.index = String(i);
    items.forEach((el, k) => el.classList.toggle('is-on', k === i));
    if (i >= 0) {
      items[i].classList.remove('is-pop');
      void items[i].offsetWidth; // restart the pop
      items[i].classList.add('is-pop');
      blip(1250 + i * 240);
      buzz();
      say(labels[i]);
      if (gesture) gesture.chose = true;
    }
  }
  const say = (text) => { if (live) live.textContent = text; };

  function track(x, y) {
    const g = gesture;
    const d = resist(Math.max(0, y - g.y0));
    setDepth(d);
    const opened = MARKS.filter((m) => d >= m).length;
    if (!opened) {
      g.side = false;
      g.anchor = null;
      return setIndex(-1, 0);
    }
    g.anchor ??= x;
    if (!g.side && Math.abs(x - g.anchor) > SIDE_SLOP) {
      g.side = true;
      g.base = opened - 1;
    }
    const i = g.side ? clamp(g.base + Math.round((x - g.anchor) / SIDE_STEP), 0, names.length - 1) : opened - 1;
    setIndex(i, opened);
  }

  function begin(x, y) {
    gesture = { x0: x, y0: y, anchor: null, side: false, base: 0, chose: false };
    root.dataset.state = 'pulling';
    scroller.scrollTop = 0;
  }

  async function finish() {
    const i = index;
    const chose = gesture?.chose;
    gesture = null;
    if (i < 0) {
      if (chose) say('Cancelled');
      return settle();
    }
    const name = names[i];
    blip(740, 0.09, 0.07, 1.5);
    if (name === 'refresh') {
      busy = true;
      root.dataset.state = 'busy';
      setDepth(HOLD);
      try { await onAction(name); } finally {
        busy = false;
        settle();
      }
    } else {
      settle();
      onAction(name);
    }
  }

  function settle() {
    root.dataset.state = 'settling';
    setDepth(0);
    setIndex(-1, 0);
    clearTimeout(settle.t);
    settle.t = setTimeout(() => { if (root.dataset.state === 'settling') root.dataset.state = 'idle'; }, 460);
  }

  // ---------- touch: take over only at the top edge, only downwards ----------
  let touch = null;
  scroller.addEventListener('touchstart', (e) => {
    if (busy || e.touches.length !== 1) return (touch = null);
    const t = e.touches[0];
    touch = { x: t.clientX, y: t.clientY, atTop: scroller.scrollTop <= 0, pulling: false };
  }, { passive: true });
  scroller.addEventListener('touchmove', (e) => {
    if (!touch) return;
    const t = e.touches[0];
    const dy = t.clientY - touch.y;
    if (!touch.pulling) {
      if (!touch.atTop || scroller.scrollTop > 0 || dy < -4 || !e.cancelable) return (touch = null);
      if (dy < 4) return;
      touch.pulling = true;
      begin(touch.x, touch.y);
    }
    if (e.cancelable) e.preventDefault(); // no rubber band, no native pull-to-refresh
    track(t.clientX, t.clientY);
  }, { passive: false });
  const touchEnd = () => {
    wake(); // touchend counts as a user gesture: sound works from here on
    if (touch?.pulling) finish();
    touch = null;
  };
  scroller.addEventListener('touchend', touchEnd);
  scroller.addEventListener('touchcancel', touchEnd);

  // ---------- mouse: the same pull with a drag ----------
  let mouse = null;
  let clickGuard = 0;
  scroller.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || busy || scroller.scrollTop > 0) return;
    if (e.target.closest('input, textarea, select, [contenteditable]')) return;
    wake();
    mouse = { id: e.pointerId, x: e.clientX, y: e.clientY, pulling: false };
    addEventListener('pointermove', mouseMove);
    addEventListener('pointerup', mouseUp);
    addEventListener('pointercancel', mouseUp);
  });
  function mouseMove(e) {
    if (!mouse || e.pointerId !== mouse.id) return;
    if (!mouse.pulling) {
      if (e.clientY - mouse.y < 6) return;
      mouse.pulling = true;
      begin(mouse.x, mouse.y);
      getSelection()?.removeAllRanges();
    }
    track(e.clientX, e.clientY);
  }
  function mouseUp(e) {
    if (!mouse || e.pointerId !== mouse.id) return;
    removeEventListener('pointermove', mouseMove);
    removeEventListener('pointerup', mouseUp);
    removeEventListener('pointercancel', mouseUp);
    if (mouse.pulling) {
      clickGuard = performance.now() + 80;
      finish();
    }
    mouse = null;
  }
  scroller.addEventListener('click', (e) => {
    if (performance.now() < clickGuard) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  // ---------- keyboard: Up at the top opens the row ----------
  scroller.addEventListener('keydown', (e) => {
    if (busy || e.target !== scroller) return;
    const open = root.dataset.state === 'keys';
    if (!open) {
      if (e.key !== 'ArrowUp' || scroller.scrollTop > 0) return;
      e.preventDefault();
      wake();
      root.dataset.state = 'keys';
      setDepth(MARKS[2] + 12);
      setIndex(0, names.length);
      say(`${labels[0]}. Left and right arrows to choose, Enter to run, Escape to close.`);
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      setIndex(clamp(index + (e.key === 'ArrowRight' ? 1 : -1), 0, names.length - 1), names.length);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      finish();
    } else if (e.key === 'Escape' || e.key === 'ArrowDown' || e.key === 'Tab') {
      if (e.key !== 'Tab') e.preventDefault();
      say('Closed');
      settle();
    }
  });
  scroller.addEventListener('blur', () => root.dataset.state === 'keys' && settle());

  root.dataset.state = 'idle';
  root.dataset.index = '-1';

  return {
    // call from a click or key handler: turning sound on also unlocks audio, which needs a user gesture
    setSound(on) {
      soundOn = on;
      if (on) wake();
    },
    // a frozen mid-pull state for posters: depth in px, the chosen action's index
    freeze(d, i) {
      root.dataset.state = 'pulling';
      setDepth(d);
      setIndex(i, MARKS.filter((m) => d >= m).length);
    }
  };
}
