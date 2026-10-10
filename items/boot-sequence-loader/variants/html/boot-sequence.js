/* Boot Sequence Loader — loading shown as an old computer starting up.
   Every log line is a real step of your loading (fonts, data, scene…): the line types out when the step starts,
   its bracket counts the step's own percent and turns into a green [ OK ] when the step's promise resolves.
   A rejected step prints [FAIL] with its code and waits for R (or the Retry button). When everything is ready the
   screen folds into a line and a dot like a picture tube switching off, and the content underneath opens.

     import { createBootSequence } from './boot-sequence.js';
     const boot = createBootSequence(document.querySelector('.bsl'), {
       content: document.querySelector('#app'),              // inert and aria-busy until ready
       header: ['NIGHTJAR BIOS 4.06', 'Memory 16384 MB OK'],
       steps: [
         { label: 'Loading fonts', run: () => document.fonts.ready },
         { label: 'Fetching data', run: (progress) => loadData(progress) },   // progress(0…1)
       ],
       onReady: (timings) => {}
     });
     boot.start();      // boot.skip(), boot.retry(), boot.restart()

   A failing step rejects with an Error; `error.code` (E_NET_TIMEOUT) and `error.message` go into the log.
   Any key (or a click on the screen) skips the show: lines appear whole, the screen opens as soon as the real steps are
   done. prefers-reduced-motion: no typing, no fold — the screen fades. */

const COLS = 40;            // width of a step line: label, dot leaders, [ OK ]
const BAR = 22;             // cells in the total progress bar
const SPIN = ['|', '/', '-', '\\'];
const SKIP_IGNORED = new Set(['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Escape']);

export function createBootSequence(root, opts = {}) {
  const o = {
    header: [], steps: [], content: null, cps: 110, readyText: 'All systems ready.', holdMs: 420,
    retryHint: 'Press R to retry', onReady: null, ...opts
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  root.classList.add('bsl');
  root.innerHTML = `
    <div class="bsl__screen">
      <div class="bsl__log" aria-hidden="true"></div>
      <div class="bsl__foot">
        <span class="bsl__bar" role="progressbar" aria-label="Loading" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">[<span class="bsl__fill"></span><span class="bsl__rest"></span>]</span>
        <button class="bsl__btn" type="button" data-act="skip">Press any key to skip</button>
      </div>
      <p class="bsl__sr" role="status"></p>
    </div>
    <span class="bsl__dot" aria-hidden="true"></span>`;
  const screen = root.querySelector('.bsl__screen');
  const log = root.querySelector('.bsl__log');
  const bar = root.querySelector('.bsl__bar');
  const barFill = bar.querySelector('.bsl__fill');
  const barRest = bar.querySelector('.bsl__rest');
  const btn = root.querySelector('.bsl__btn');
  const sr = root.querySelector('.bsl__sr');
  const dot = root.querySelector('.bsl__dot');
  const cursor = document.createElement('span');
  cursor.className = 'bsl__cur';

  let run = 0;              // generation: restart() bumps it so stale awaits stop
  let fast = false;         // skipped: no typing, no hold
  let failedAt = -1;
  let doneSteps = 0;
  let stepFrac = 0;
  let typing = null;        // { el, text, from, t0, resolve }
  let raf = 0;
  let spinTimer = 0;
  let fold = null;
  let timings = [];

  // ---------- typing ----------
  function tick(now) {
    raf = 0;
    if (!typing) return;
    const t = typing;
    const n = fast || reduce.matches ? t.text.length : Math.min(t.text.length, Math.floor((now - t.t0) * o.cps / 1000));
    t.el.textContent = t.text.slice(0, n);
    if (n >= t.text.length) { typing = null; t.resolve(); return; }
    raf = requestAnimationFrame(tick);
  }
  function type(el, text) {
    if (!text || fast || reduce.matches) { el.textContent = text; return Promise.resolve(); }
    return new Promise((resolve) => {
      typing = { el, text, t0: performance.now(), resolve };
      raf ||= requestAnimationFrame(tick);
    });
  }
  function flushTyping() {
    if (!typing) return;
    const t = typing; typing = null;
    t.el.textContent = t.text; t.resolve();
  }

  function newLine(kind = '') {
    const line = document.createElement('div');
    line.className = 'bsl__line' + (kind ? ` bsl__line--${kind}` : '');
    const txt = document.createElement('span');
    txt.className = 'bsl__txt';
    line.append(txt, cursor);
    log.append(line);
    log.scrollTop = log.scrollHeight;
    return { line, txt };
  }
  async function printLine(text, kind) {
    const { line, txt } = newLine(kind);
    await type(txt, text);
    return line;
  }
  const leaders = (label) => {
    const room = COLS - 7 - label.length;
    return room > 1 ? `${label} ${'.'.repeat(room - 1)} ` : `${label.slice(0, COLS - 9)}… `;
  };

  // ---------- status bracket and total bar ----------
  function setStatus(line, state, frac = 0) {
    let st = line.querySelector('.bsl__st');
    if (!st) { st = document.createElement('span'); line.insertBefore(st, cursor.parentNode === line ? cursor : null); }
    st.className = `bsl__st bsl__st--${state}`;
    if (state === 'ok') st.textContent = '[ OK ]';
    else if (state === 'fail') st.textContent = '[FAIL]';
    else {
      const pct = Math.round(frac * 100);
      st.textContent = pct > 0 ? `[${String(pct).padStart(3, ' ')}%]` : `[  ${SPIN[(performance.now() / 110 | 0) % 4]} ]`;
    }
  }
  function drawBar() {
    const total = o.steps.length || 1;
    const f = Math.min(1, (doneSteps + stepFrac) / total);
    const cells = Math.round(f * BAR);
    const pct = Math.round(f * 100);
    barFill.textContent = '█'.repeat(cells);
    barRest.textContent = '░'.repeat(BAR - cells);
    bar.lastChild.textContent = `] ${String(pct).padStart(3, ' ')}%`;
    bar.setAttribute('aria-valuenow', String(pct));
  }

  // ---------- the boot ----------
  async function boot(gen, from) {
    if (from === 0) {
      for (const h of o.header) { await printLine(h, 'head'); if (gen !== run) return; }
      if (o.header.length) await printLine('');
    }
    for (let i = from; i < o.steps.length; i++) {
      const step = o.steps[i];
      const { line, txt } = newLine('step');
      stepFrac = 0;
      let frac = 0;
      let shown = false;    // the bracket appears once the label is typed out
      clearInterval(spinTimer);
      const t0 = performance.now();
      const typed = type(txt, leaders(step.label)).then(() => {
        if (gen !== run) return;
        shown = true;
        setStatus(line, 'run', frac);
        spinTimer = setInterval(() => setStatus(line, 'run', frac), 110);
      });
      let error = null;
      try {
        await Promise.all([typed, Promise.resolve().then(() => step.run((p) => {
          if (gen !== run) return;
          frac = Math.max(0, Math.min(1, +p || 0));
          stepFrac = frac; drawBar();
          if (shown) setStatus(line, 'run', frac);
        }))]);
      } catch (e) { error = e || new Error('Unknown error'); }
      clearInterval(spinTimer);
      if (gen !== run) return;
      await typed;
      clearInterval(spinTimer);
      if (error) {
        setStatus(line, 'fail');
        failedAt = i;
        const code = error.code || 'E_STEP';
        await printLine(`  ${code}: ${error.message || 'step failed'}`, 'err');
        if (gen !== run) return;
        await printLine(o.retryHint, 'hint');
        root.classList.add('is-failed');
        btn.dataset.act = 'retry';
        btn.textContent = 'Retry (R)';
        announce(`${step.label} failed: ${code}. ${o.retryHint}.`, true);
        return;
      }
      timings[i] = { label: step.label, ms: Math.round(performance.now() - t0) };
      doneSteps = i + 1; stepFrac = 0; drawBar();
      setStatus(line, 'ok');
    }
    await printLine(o.readyText, 'ready');
    if (gen !== run) return;
    announce('Ready.');
    if (!fast && !reduce.matches) await new Promise((r) => setTimeout(r, o.holdMs));
    if (gen !== run) return;
    open();
  }

  function announce(text, urgent = false) {
    sr.setAttribute('aria-live', urgent ? 'assertive' : 'polite');
    sr.textContent = text;
  }

  // ---------- the fold: a picture tube switching off ----------
  function open() {
    removeEventListener('keydown', onKey, true);
    btn.hidden = true;
    const finish = () => {
      root.hidden = true;
      root.classList.remove('is-folding');
      if (o.content) { o.content.inert = false; o.content.removeAttribute('aria-busy'); }
      const hadFocus = root.contains(document.activeElement) || document.activeElement === document.body;
      if (hadFocus && o.focus) o.focus.focus({ preventScroll: true });
      o.onReady?.(timings.slice());
    };
    if (reduce.matches) {
      fold = screen.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, fill: 'forwards' });
    } else {
      root.classList.add('is-folding');
      fold = screen.animate([
        { transform: 'scale(1, 1)', filter: 'brightness(1)' },
        { transform: 'scale(1, 0.006)', filter: 'brightness(2.4)', offset: 0.46, easing: 'cubic-bezier(.5,0,.9,.5)' },
        { transform: 'scale(0.004, 0.006)', filter: 'brightness(3.5)', offset: 0.8 },
        { transform: 'scale(0, 0)', filter: 'brightness(3.5)' }
      ], { duration: fast ? 380 : 620, easing: 'cubic-bezier(.6,0,.4,1)', fill: 'forwards' });
      dot.animate([
        { opacity: 0, transform: 'scale(0.4)' }, { opacity: 0, offset: 0.5 }, { opacity: 1, transform: 'scale(1)', offset: 0.74 },
        { opacity: 0, transform: 'scale(0.2)' }
      ], { duration: fast ? 560 : 900, easing: 'ease-out', fill: 'forwards' });
    }
    root.style.background = 'transparent';
    fold.finished.then(() => setTimeout(finish, reduce.matches ? 0 : 160), () => {});
  }

  // ---------- input ----------
  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || SKIP_IGNORED.has(e.key)) return;
    if (failedAt >= 0) {
      if (e.key === 'r' || e.key === 'R') { e.preventDefault(); retry(); }
      return;
    }
    if (e.target.closest?.('input, textarea, select, [contenteditable]') && !root.contains(e.target)) return;
    skip();
  }
  function onClick(e) {
    if (e.target.closest('[data-act="retry"]')) retry();
    else if (failedAt < 0) skip();
  }

  function skip() {
    if (fast) return;
    fast = true;
    root.classList.add('is-fast');
    flushTyping();
    btn.textContent = 'Skipping…';
  }

  function retry() {
    if (failedAt < 0) return;
    const from = failedAt;
    failedAt = -1;
    root.classList.remove('is-failed');
    [...log.querySelectorAll('.bsl__line--hint')].pop()?.remove();
    btn.dataset.act = 'skip';
    btn.textContent = fast ? 'Skipping…' : 'Press any key to skip';
    announce('Retrying.');
    boot(run, from);
  }

  function reset() {
    run++;
    cancelAnimationFrame(raf); raf = 0; typing = null;
    clearInterval(spinTimer);
    fold?.cancel(); fold = null;
    dot.getAnimations().forEach((a) => a.cancel());
    fast = false; failedAt = -1; doneSteps = 0; stepFrac = 0; timings = [];
    root.hidden = false;
    root.style.background = '';
    root.classList.remove('is-failed', 'is-fast', 'is-folding');
    log.textContent = '';
    btn.hidden = false; btn.dataset.act = 'skip'; btn.textContent = 'Press any key to skip';
    if (o.content) { o.content.inert = true; o.content.setAttribute('aria-busy', 'true'); }
    drawBar();
  }

  function start() {
    reset();
    announce('Loading.');
    addEventListener('keydown', onKey, true);
    boot(run, 0);
  }

  screen.addEventListener('click', onClick);
  reset();

  return {
    start,
    restart: start,
    skip,
    retry,
    get failed() { return failedAt >= 0; },
    /** freezes the fold at 0…1 (posters) */
    pauseFold(t) { if (fold) { fold.pause(); fold.currentTime = t * fold.effect.getTiming().duration; } }
  };
}
