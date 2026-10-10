/* Earcon Kit panel: the three brand settings, a grid with the waveform of every sound, volume, mute and
   "Export settings". Waveforms come from offline renders of the same scores the speakers get, and are re-rendered
   whenever a setting moves. Nothing plays until a sound card is pressed. */
import { createEarconKit, SOUND_NAMES, KEYS, TIMBRES } from './earcon-kit.js';

const LABEL = {
  tap: 'Tap', 'toggle-on': 'Toggle on', 'toggle-off': 'Toggle off', success: 'Success', error: 'Error', warning: 'Warning',
  notification: 'Notification', delete: 'Delete', undo: 'Undo', send: 'Send', received: 'Received'
};
let uid = 0;

const SPEAKER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.2L11.5 6v12l-4.3-3.5H4z"/><path class="ek__wave1" d="M14.6 9.4a3.8 3.8 0 0 1 0 5.2"/><path class="ek__wave2" d="M17 7.2a7 7 0 0 1 0 9.6"/><path class="ek__x" d="m15 9.8 4.4 4.4m0-4.4L15 14.2"/></svg>';

/**
 * Builds the panel inside `root` and returns { kit, refresh() }. options: everything createEarconKit takes, plus
 * audition — the sound played after a setting changes, once the visitor has played something (null to switch off).
 */
export function createEarconPanel(root, options = {}) {
  const { audition = 'notification', ...kitOptions } = options;
  const kit = createEarconKit(kitOptions);
  const id = `ek${++uid}`;
  const s0 = kit.settings;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  root.classList.add('ek');
  root.dataset.timbre = s0.timbre;
  root.innerHTML = `
    <div class="ek__controls">
      <fieldset class="ek__field">
        <legend class="ek__lab">Timbre</legend>
        <div class="ek__seg">${Object.entries(TIMBRES).map(([k, t]) => `
          <label><input type="radio" name="${id}-timbre" value="${k}"${k === s0.timbre ? ' checked' : ''}><span>${t.label}</span></label>`).join('')}
        </div>
      </fieldset>
      <label class="ek__field"><span class="ek__lab">Key</span>
        <select class="ek__key">${KEYS.map((k) => `<option${k === s0.key ? ' selected' : ''}>${k}</option>`).join('')}</select>
      </label>
      <label class="ek__field ek__char"><span class="ek__lab">Character</span>
        <input type="range" class="ek__range" min="0" max="100" value="${Math.round(s0.character * 100)}" aria-valuetext="">
        <span class="ek__ends" aria-hidden="true"><span>Restrained</span><span>Playful</span></span>
      </label>
    </div>
    <ul class="ek__grid" role="list">${SOUND_NAMES.map((n) => `
      <li><button type="button" class="ek__sound" data-sound="${n}">
        <span class="ek__name">${LABEL[n]}</span><span class="ek__dur"></span>
        <span class="ek__scope" aria-hidden="true"><canvas></canvas><i class="ek__head"></i></span>
      </button></li>`).join('')}
    </ul>
    <div class="ek__foot">
      <button type="button" class="ek__mute" aria-pressed="false">${SPEAKER}<span>Mute</span></button>
      <label class="ek__vol"><span class="ek__sr">Volume</span><input type="range" class="ek__range" min="0" max="100" value="${Math.round(kit.volume * 100)}"></label>
      <button type="button" class="ek__export">Export settings</button>
    </div>
    <p class="ek__sr" role="status"></p>`;

  const $ = (s) => root.querySelector(s);
  const cards = new Map([...root.querySelectorAll('.ek__sound')].map((b) => [b.dataset.sound, b]));
  const status = $('[role="status"]');
  const charInput = $('.ek__char input');
  const waves = new Map(); // name → { samples, duration }
  let gen = 0, pending = 0, played = false;

  const say = (t) => { status.textContent = ''; setTimeout(() => (status.textContent = t), 30); };
  const charText = (v) => (v < 34 ? 'restrained' : v < 67 ? 'balanced' : 'playful') + `, ${v} of 100`;
  charInput.setAttribute('aria-valuetext', charText(+charInput.value));

  function drawWave(name) {
    const w = waves.get(name), card = cards.get(name);
    if (!w || !card) return;
    const canvas = card.querySelector('canvas');
    const dpr = Math.min(devicePixelRatio || 1, 2);
    // whole css pixels, so the bars sit on the device pixel grid instead of blurring in stripes
    const cssW = Math.max(1, Math.floor(canvas.parentElement.getBoundingClientRect().width));
    canvas.style.width = `${cssW}px`;
    const W = Math.round(cssW * dpr), H = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, W, H);
    g.fillStyle = getComputedStyle(root).getPropertyValue('--ek-wave').trim() || '#888';
    // bars of 2 device px with a 1 px gap (3 + 2 on dense screens): a card that lands on a half pixel still reads
    const bw = dpr >= 1.5 ? 3 : 2, pitch = bw + (dpr >= 1.5 ? 2 : 1);
    const s = w.samples, cols = Math.floor(W / pitch), per = s.length / cols;
    let peak = 1e-4;
    for (let i = 0; i < s.length; i++) peak = Math.max(peak, Math.abs(s[i]));
    for (let c = 0; c < cols; c++) {
      let m = 0;
      for (let i = Math.floor(c * per), e = Math.floor((c + 1) * per); i < e; i++) m = Math.max(m, Math.abs(s[i]));
      // a gentle curve, so quiet tails still show
      const h = Math.max(bw, Math.round(Math.pow(m / peak, 0.7) * (H - 2 * bw) / 2) * 2);
      g.fillRect(c * pitch, (H - h) / 2, bw, h);
    }
    card.querySelector('.ek__dur').textContent = `${Math.round(w.duration * 1000)} ms`;
  }

  // offline renders of all eleven; a newer request makes older results moot
  async function renderAll() {
    const mine = ++gen;
    const results = await Promise.all(SOUND_NAMES.map((n) => kit.render(n).then((r) => [n, r]).catch(() => [n, null])));
    if (mine !== gen) return;
    results.forEach(([n, r]) => { if (r) { waves.set(n, r); drawWave(n); } });
  }
  const schedule = () => { clearTimeout(pending); pending = setTimeout(renderAll, 60); };

  function play(name) {
    const card = cards.get(name);
    const dur = kit.play(name) || kit.compose(name).duration;
    played = played || kit.started;
    if (!card) return;
    card.classList.add('is-playing');
    const head = card.querySelector('.ek__head');
    head.getAnimations().forEach((a) => a.cancel());
    const w = waves.get(name);
    const span = w ? w.samples.length / w.sampleRate : dur;
    if (!reduce.matches) {
      const x = card.querySelector('.ek__scope').clientWidth;
      head.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${x}px)` }], { duration: span * 1000, easing: 'linear' });
    }
    clearTimeout(card._t);
    card._t = setTimeout(() => card.classList.remove('is-playing'), span * 1000 + 60);
  }

  const changed = (patch, quiet) => {
    kit.set(patch);
    root.dataset.timbre = kit.settings.timbre;
    schedule();
    if (!quiet && played && audition && !kit.muted) setTimeout(() => play(audition), 90);
  };

  cards.forEach((b, n) => b.addEventListener('click', () => play(n)));
  root.querySelectorAll(`input[name="${id}-timbre"]`).forEach((r) =>
    r.addEventListener('change', () => { changed({ timbre: r.value }); requestAnimationFrame(() => waves.forEach((_, n) => drawWave(n))); }));
  $('.ek__key').addEventListener('change', (e) => changed({ key: e.target.value }));
  charInput.addEventListener('input', () => { charInput.setAttribute('aria-valuetext', charText(+charInput.value)); changed({ character: charInput.value / 100 }, true); });
  charInput.addEventListener('change', () => changed({ character: charInput.value / 100 }));
  const mute = $('.ek__mute');
  mute.addEventListener('click', () => {
    const m = !kit.muted;
    kit.setMuted(m);
    mute.setAttribute('aria-pressed', String(m));
    say(m ? 'Sound muted' : 'Sound on');
  });
  $('.ek__vol input').addEventListener('input', (e) => kit.setVolume(e.target.value / 100));
  $('.ek__export').addEventListener('click', () => {
    const data = kit.exportSettings();
    const s = kit.settings;
    const file = `earcons-${s.timbre}-${s.key.replace('♭', 'b').replace(/\s+/g, '-').toLowerCase()}.json`;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: file });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say(`Exported ${file}`);
  });

  const ro = new ResizeObserver(() => waves.forEach((_, n) => drawWave(n)));
  ro.observe($('.ek__grid'));
  const scheme = matchMedia('(prefers-color-scheme: dark)');
  const onScheme = () => waves.forEach((_, n) => drawWave(n));
  scheme.addEventListener('change', onScheme);
  renderAll();

  return {
    kit,
    play,
    refresh: () => waves.forEach((_, n) => drawWave(n)),
    destroy() { ro.disconnect(); scheme.removeEventListener('change', onScheme); kit.destroy(); root.innerHTML = ''; }
  };
}
