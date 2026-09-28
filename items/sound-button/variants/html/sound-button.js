// Sound Button + cue() bus, from Portfolio 3D TS2 (src/ui/soundToggle.ts, src/audio/bus.ts).
// - Browsers do not play sound without a gesture, and scrolling is not one. Sound turns on by the button,
//   by the M key, or by the first click / tap / key on the page, unless it was switched off before
//   (localStorage) or the visitor asked to save data (Save-Data).
// - The AudioContext is created right inside the gesture handler (iOS wants resume() synchronously);
//   the engine (sound-engine.js) is loaded only after that, so a silent page pays nothing for sound.
(function () {
  const SCRIPT_URL = document.currentScript ? document.currentScript.src : location.href;

  // Bus: call SoundBus.cue('press') from anywhere. Until sound is on it is an empty call.
  let impl = null;
  const SoundBus = {
    cue: (name, volume) => { if (impl) impl(name, volume); },
    setImpl: (fn) => { impl = fn; },
  };
  window.SoundBus = SoundBus;

  const LABELS = {
    on: 'Sound is on',
    off: 'Turn sound on',
    ariaOn: 'Sound is on. Turn it off',
    ariaOff: 'Sound is off. Turn it on',
  };

  function initSoundButton(btn, opts = {}) {
    if (btn.dataset.soundReady) return null;
    btn.dataset.soundReady = 'true';
    const key = opts.storageKey || btn.dataset.storageKey || 'sound';
    const base = opts.sfx || btn.dataset.sfx || 'sfx/';
    const engineUrl = opts.engine || new URL('sound-engine.js', SCRIPT_URL).href;
    const text = Object.assign({}, LABELS, opts.labels);
    const label = btn.querySelector('[data-sound-label]');
    const read = () => { try { return localStorage.getItem(key); } catch (e) { return null; } };
    const save = (v) => { try { localStorage.setItem(key, v); } catch (e) { /* private mode */ } };
    const saveData = !!(navigator.connection && navigator.connection.saveData);

    let ctx = null;
    let engine = null;
    let loading = null;
    let enabled = false;
    let tellTimer = 0;

    const paint = () => {
      btn.setAttribute('aria-pressed', String(enabled));
      btn.setAttribute('aria-label', enabled ? text.ariaOn : text.ariaOff);
      if (label) label.textContent = enabled ? text.on : text.off;
    };
    const endIntro = () => btn.classList.remove('is-intro');
    // the label opens for three seconds on every change, so people see where the sound came from
    const tell = () => {
      endIntro();
      btn.classList.remove('is-new');
      btn.classList.add('is-tell');
      clearTimeout(tellTimer);
      tellTimer = setTimeout(() => btn.classList.remove('is-tell'), 3200);
    };

    // the engine is a separate file, loaded by the first "on"
    const loadEngine = () => {
      if (!loading) {
        loading = new Promise((resolve, reject) => {
          if (window.createSoundEngine) return resolve();
          const s = document.createElement('script');
          s.src = engineUrl;
          s.onload = () => resolve();
          s.onerror = reject;
          document.head.appendChild(s);
        }).then(() => { engine = window.createSoundEngine(ctx, { base, bus: SoundBus }); });
      }
      return loading;
    };

    const enable = (announce) => {
      if (enabled) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!ctx) ctx = new AC({ latencyHint: 'playback' }); // inside the same synchronous gesture handler
      void ctx.resume();
      enabled = true;
      paint();
      tell();
      btn.dispatchEvent(new CustomEvent('soundchange', { detail: true, bubbles: true }));
      loadEngine().then(() => {
        if (!enabled || !engine) return;
        engine.fadeIn();
        // wait for this one file: a cue whose file is not loaded yet is skipped
        if (announce) engine.load('toggle-on').then(() => { if (enabled) SoundBus.cue('toggle-on', 0.8); });
      }).catch((e) => console.warn('sound engine did not load', e));
    };
    const disable = () => {
      if (!enabled) return;
      enabled = false;
      paint();
      tell();
      btn.dispatchEvent(new CustomEvent('soundchange', { detail: false, bubbles: true }));
      if (engine) engine.fadeOut();
      setTimeout(() => { if (!enabled && ctx) void ctx.suspend(); }, 700);
    };

    // the first gesture anywhere turns sound on, unless it was switched off
    const first = (e) => {
      const t = e.target;
      if (t && t.closest && t.closest('.sound-fab')) return; // the button handles its own click
      if (e.type === 'keydown' && (e.key === 'm' || e.key === 'M')) return;
      stopFirst();
      enable(false);
    };
    const stopFirst = () => {
      removeEventListener('pointerup', first, true);
      removeEventListener('keydown', first, true);
    };
    // an explicit choice (button or M) ends the first-gesture rule for good
    const toggle = () => {
      stopFirst();
      if (enabled) { disable(); save('off'); } else { enable(true); save('on'); }
    };

    paint();
    if (read() === null) btn.classList.add('is-new');
    btn.classList.add('is-intro');
    btn.addEventListener('animationend', (e) => { if (e.animationName === 'sound-intro') endIntro(); });
    btn.addEventListener('pointerenter', endIntro);
    btn.addEventListener('focus', endIntro);
    btn.addEventListener('click', (e) => { e.preventDefault(); toggle(); });
    addEventListener('keydown', (e) => {
      if (e.key !== 'm' && e.key !== 'M') return;
      const t = e.target;
      if ((t && t.closest && t.closest('input, textarea, select, [contenteditable]')) || e.metaKey || e.ctrlKey || e.altKey) return;
      toggle();
    });
    if (read() !== 'off' && !saveData) {
      addEventListener('pointerup', first, true);
      addEventListener('keydown', first, true);
    }
    // a hidden tab puts the context to sleep
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) void ctx.suspend();
      else if (enabled) void ctx.resume();
    });

    return { enable: () => enable(true), disable, get enabled() { return enabled; } };
  }

  document.querySelectorAll('.sound-fab').forEach((btn) => initSoundButton(btn));
  window.initSoundButton = initSoundButton;
})();
