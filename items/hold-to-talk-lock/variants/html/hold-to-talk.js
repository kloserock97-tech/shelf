// Hold-to-Talk with Slide Lock.
// Hold the mic and talk; release sends. Slide left past the threshold and release to cancel, slide up to lock and keep
// recording hands-free (then Send or the bin). The wave around the finger is the real microphone (getUserMedia →
// AnalyserNode); without a microphone, or with access denied, the wave is simulated and the bubble says so.
// SpeechRecognition fills the transcript where the browser has it. MediaRecorder keeps the clip.
// Mouse, touch and pen go through Pointer Events with capture; keyboard: hold Space or Enter, Arrow Up locks,
// Escape cancels. A click that came with no press (a screen reader's activation) starts a locked recording.
// Events on the root: "htt:start", "htt:lock", "htt:cancel", "htt:send" — detail { duration, levels, transcript,
// simulated, blob }. data-sound="off" on the root mutes the clicks.
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const MIN_MS = 400; // shorter than this is a tap: show the hint, keep nothing

  /* ---- Hash Kit (items/hash-kit): mixer and smooth value noise for the simulated voice ---- */
  const hashU = (x) => { x ^= x >>> 16; x = Math.imul(x, 0x3f9c86cb); x ^= x >>> 14; x = Math.imul(x, 0x1ae9dacf); x ^= x >>> 15; return x >>> 0; };
  const hash1 = (x, seed = 0) => hashU((Math.floor(x) + 0xb31c96c9 + Math.imul(seed, 0x9e37)) >>> 0) / 4294967296;
  const vnoise = (x, seed) => { const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f); return hash1(i, seed) * (1 - s) + hash1(i + 1, seed) * s; };
  // speech-like level: syllables ~4.5 per second, louder phrases, short pauses between them
  function simLevel(t) {
    const phrase = vnoise(t * 0.55, 3);
    const syll = Math.max(0, Math.sin(t * Math.PI * 4.6 + vnoise(t * 2, 5) * 4));
    const gate = phrase > 0.3 ? 1 : phrase / 0.3;
    return Math.min(1, (0.12 + 0.78 * syll * (0.5 + phrase)) * gate * (0.8 + 0.4 * vnoise(t * 9, 7)));
  }

  /* ---- sound: short synthesised cues, no files ---- */
  const sound = (() => {
    const AC = window.AudioContext || window.webkitAudioContext;
    let ctx = null, out = null, noise = null;
    function wake() {
      if (!AC) return null;
      if (!ctx) {
        ctx = new AC();
        out = ctx.createGain();
        out.gain.value = 0.5;
        out.connect(ctx.destination);
        const n = Math.round(ctx.sampleRate * 0.25);
        noise = ctx.createBuffer(1, n, ctx.sampleRate);
        const d = noise.getChannelData(0);
        let s = 29;
        for (let i = 0; i < n; i++) { s = (s + 0xb31c96c9) >>> 0; d[i] = hashU(s) / 2147483648 - 1; }
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function click(at, f, q, len, gain) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(gain, at + 0.0015);
      g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      src.connect(bp).connect(g).connect(out);
      src.start(at); src.stop(at + len + 0.02);
      return bp;
    }
    function tone(at, f0, f1, len, gain, type = 'sine') {
      const o = ctx.createOscillator();
      o.type = type;
      const g = ctx.createGain();
      o.frequency.setValueAtTime(f0, at);
      o.frequency.exponentialRampToValueAtTime(f1, at + len);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(gain, at + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      o.connect(g).connect(out);
      o.start(at); o.stop(at + len + 0.02);
    }
    const cues = {
      start(t) { tone(t, 560, 900, 0.09, 0.16); },
      armed(t) { click(t, 2600, 3, 0.03, 0.5); tone(t, 180, 120, 0.06, 0.18); },
      unarmed(t) { click(t, 3400, 4, 0.018, 0.22); },
      lock(t) { click(t, 3000, 4, 0.02, 0.45); click(t + 0.045, 2100, 4, 0.03, 0.5); },
      send(t) { const bp = click(t, 900, 1.6, 0.2, 0.35); bp.frequency.exponentialRampToValueAtTime(3600, t + 0.18); tone(t + 0.02, 660, 990, 0.12, 0.1); },
      cancel(t) { tone(t, 420, 170, 0.22, 0.16, 'triangle'); click(t, 1400, 2, 0.06, 0.25); },
      tap(t) { click(t, 2200, 3, 0.02, 0.25); }
    };
    return {
      wake,
      play(name) { if (!ctx || ctx.state !== 'running') return; cues[name]?.(ctx.currentTime); },
      get ctx() { return ctx; }
    };
  })();
  const buzz = (ms) => { if (navigator.vibrate && navigator.userActivation?.hasBeenActive !== false) try { navigator.vibrate(ms); } catch { /* not allowed */ } };

  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  function init(root) {
    if (root.holdToTalk) return root.holdToTalk;
    const mic = root.querySelector('.htt__mic');
    const del = root.querySelector('.htt__del');
    const timeEl = root.querySelector('.htt__time');
    const words = root.querySelector('.htt__words');
    const tlabel = root.querySelector('.htt__tlabel');
    const ring = root.querySelector('.htt__ring');
    const wave = root.querySelector('.htt__wave');
    const hint = root.querySelector('.htt__hint');
    const live = root.querySelector('.htt__live');
    const soundOn = () => root.dataset.sound !== 'off';
    const cue = (n) => { if (soundOn()) sound.play(n); };
    const say = (text) => { if (!live) return; live.textContent = ''; requestAnimationFrame(() => { live.textContent = text; }); };
    const RecCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

    let state = 'idle';
    let armed = false;
    let t0 = 0, lastSec = -1;
    let pointerId = null, x0 = 0, y0 = 0, byKey = false, lastRelease = 0;
    let cAccent = '', cRed = '';
    let target = { x: 0, y: 0 }, pos = { x: 0, y: 0 }, vel = { x: 0, y: 0 };
    let raf = 0, lastFrame = 0;
    let levels = [];          // one level per 50 ms, for the sent message
    let levelAcc = 0, levelN = 0, levelT = 0;
    let stream = null, actx = null, analyser = null, srcNode = null, td = null, fd = null;
    let recorder = null, chunks = [];
    let speech = null, finalText = '', interim = '';
    let simulated = true, micState = 'unknown'; // unknown | live | denied | none
    let session = 0;
    let frozen = null;

    const setVar = (k, v) => root.style.setProperty(k, v);
    const setState = (s) => { state = s; root.dataset.state = s; mic.setAttribute('aria-label', s === 'locked' ? 'Send voice message' : 'Record voice message'); };
    setState('idle');

    function setArmed(on) {
      if (on === armed) return;
      armed = on;
      root.toggleAttribute('data-armed', on);
      cue(on ? 'armed' : 'unarmed');
      if (on) { buzz(10); say('Release to cancel'); }
    }

    function showHint() {
      if (!hint) return;
      hint.classList.add('is-on');
      clearTimeout(showHint.t);
      showHint.t = setTimeout(() => hint.classList.remove('is-on'), 1600);
      say(hint.textContent);
    }

    function setTranscriptLabel() {
      if (!tlabel) return;
      root.toggleAttribute('data-sim', simulated);
      if (simulated) tlabel.textContent = micState === 'denied' ? 'Simulated wave · mic blocked' : micState === 'none' ? 'Simulated wave · no mic' : 'Waiting for the mic…';
      else tlabel.textContent = RecCtor ? 'Live transcript' : 'Recording · no transcript here';
      if (words) words.dataset.placeholder = simulated && micState !== 'unknown' ? 'No transcript without a microphone' : RecCtor || simulated ? 'Listening…' : 'Your voice is being recorded';
    }
    function renderWords() {
      if (!words) return;
      words.textContent = finalText;
      if (interim) { const i = document.createElement('i'); i.textContent = (finalText ? ' ' : '') + interim; words.append(i); }
    }

    /* ---- microphone ---- */
    async function openMic(my) {
      if (!navigator.mediaDevices?.getUserMedia) { micState = 'none'; setTranscriptLabel(); return; }
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (my !== session || state === 'idle') { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        actx = sound.wake() || new (window.AudioContext || window.webkitAudioContext)();
        analyser = actx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.55;
        srcNode = actx.createMediaStreamSource(stream);
        srcNode.connect(analyser);
        // a silent tail to the output keeps the analyser pulled in every engine
        const mute = actx.createGain();
        mute.gain.value = 0;
        analyser.connect(mute).connect(actx.destination);
        td = new Float32Array(analyser.fftSize);
        fd = new Uint8Array(analyser.frequencyBinCount);
        simulated = false; micState = 'live';
        if (window.MediaRecorder) {
          try { recorder = new MediaRecorder(stream); chunks = []; recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data); recorder.start(); } catch { recorder = null; }
        }
        startSpeech();
      } catch (err) {
        micState = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError') ? 'denied' : 'none';
      }
      setTranscriptLabel();
    }
    function closeMic() {
      try { speech?.stop(); } catch { /* already stopped */ }
      speech = null;
      srcNode?.disconnect();
      srcNode = null; analyser = null;
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    function startSpeech() {
      if (!RecCtor) return;
      try {
        speech = new RecCtor();
        speech.lang = root.lang || document.documentElement.lang || 'en-US';
        speech.interimResults = true;
        speech.continuous = true;
        speech.onresult = (e) => {
          let fin = '', mid = '';
          for (let i = 0; i < e.results.length; i++) {
            const r = e.results[i];
            if (r.isFinal) fin += r[0].transcript; else mid += r[0].transcript;
          }
          finalText = fin.trim(); interim = mid.trim();
          renderWords();
        };
        speech.onerror = () => {};
        speech.start();
      } catch { speech = null; }
    }

    /* ---- the level and the shape of the wave ---- */
    function readLevel(t) {
      if (frozen) return simLevel(frozen.t);
      if (analyser) {
        analyser.getFloatTimeDomainData(td);
        let sum = 0;
        for (let i = 0; i < td.length; i++) sum += td[i] * td[i];
        return Math.min(1, Math.sqrt(sum / td.length) * 5.5);
      }
      return simLevel(t);
    }
    // n values 0…1 around the circle, mirrored left/right so the blob stays balanced
    function bands(n, level, t) {
      const half = n / 2, out = new Array(n);
      if (analyser && !frozen) {
        analyser.getByteFrequencyData(fd);
        const top = Math.floor(fd.length * 0.45);
        for (let i = 0; i < half; i++) {
          const a = Math.floor((i / half) * top), b = Math.max(a + 1, Math.floor(((i + 1) / half) * top));
          let m = 0;
          for (let k = a; k < b; k++) m = Math.max(m, fd[k]);
          out[i] = out[n - 1 - i] = m / 255;
        }
      } else {
        for (let i = 0; i < half; i++) out[i] = out[n - 1 - i] = level * (0.35 + 0.65 * vnoise(i * 0.9 + t * 6, 11));
      }
      // soften neighbours twice, so the outline stays a blob and not a star
      for (let pass = 0; pass < 2; pass++) {
        const c = out.slice();
        for (let i = 0; i < n; i++) out[i] = c[(i + n - 1) % n] * 0.25 + c[i] * 0.5 + c[(i + 1) % n] * 0.25;
      }
      return out;
    }

    const dpr = () => Math.min(2, window.devicePixelRatio || 1);
    function fit(canvas) {
      const r = dpr(), w = Math.round(canvas.clientWidth * r), h = Math.round(canvas.clientHeight * r);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      return r;
    }
    const colour = (name) => getComputedStyle(root).getPropertyValue(name).trim();
    const readColours = () => { cAccent = colour('--htt-accent'); cRed = colour('--htt-red'); };

    function drawRing(level, t) {
      if (!ring) return;
      const r = fit(ring), g = ring.getContext('2d');
      const W = ring.width, H = ring.height, cx = W / 2, cy = H / 2;
      g.clearRect(0, 0, W, H);
      const col = armed ? cRed : cAccent;
      const base = (state === 'rec' && !reduced.matches ? 40 : 25) * r; // the mic's radius at its current scale
      if (reduced.matches) {
        g.globalAlpha = 0.15 + level * 0.5;
        g.fillStyle = col;
        g.beginPath(); g.arc(cx, cy, base + 18 * r, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1;
        return;
      }
      const n = 40, b = bands(n, level, t), pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const rr = base + (4 + b[i] * 26 + level * 8) * r;
        pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
      }
      const path = () => {
        g.beginPath();
        for (let i = 0; i <= n; i++) {
          const p = pts[i % n], q = pts[(i + 1) % n], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
          if (i === 0) g.moveTo(mx, my); else g.quadraticCurveTo(p[0], p[1], mx, my);
        }
        g.closePath();
      };
      g.fillStyle = col;
      g.globalAlpha = 0.16 + level * 0.14;
      path(); g.fill();
      g.globalAlpha = 0.55;
      g.lineWidth = 1.5 * r;
      g.strokeStyle = col;
      path(); g.stroke();
      g.globalAlpha = 1;
    }

    function drawWave() {
      if (!wave || state !== 'locked') return;
      const r = fit(wave), g = wave.getContext('2d');
      const W = wave.width, H = wave.height, step = 4 * r, bw = 2 * r;
      g.clearRect(0, 0, W, H);
      g.fillStyle = cAccent;
      const count = Math.floor(W / step);
      if (reduced.matches) {
        const l = levels[levels.length - 1] || 0;
        for (let i = 0; i < count; i++) { g.globalAlpha = i / count < l ? 1 : 0.25; g.fillRect(i * step, H / 2 - r, bw, 2 * r); }
        g.globalAlpha = 1;
        return;
      }
      const from = Math.max(0, levels.length - count);
      for (let i = from; i < levels.length; i++) {
        const h = Math.max(2 * r, levels[i] * H);
        const x = W - (levels.length - i) * step;
        g.beginPath();
        g.roundRect ? g.roundRect(x, (H - h) / 2, bw, h, bw / 2) : g.rect(x, (H - h) / 2, bw, h);
        g.fill();
      }
    }

    /* ---- the loop: runs only while recording or while the puck springs home ---- */
    function frame(now) {
      raf = 0;
      const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000);
      lastFrame = now;
      const t = (now - t0) / 1000;
      let moving = false;
      if (!reduced.matches) {
        // critically damped spring toward the finger
        const k = 520, c = 2 * Math.sqrt(k) * 0.9;
        for (const ax of ['x', 'y']) {
          vel[ax] += ((target[ax] - pos[ax]) * k - vel[ax] * c) * dt;
          pos[ax] += vel[ax] * dt;
          if (Math.abs(target[ax] - pos[ax]) > 0.3 || Math.abs(vel[ax]) > 3) moving = true;
          else { pos[ax] = target[ax]; vel[ax] = 0; }
        }
        setVar('--tx', `${pos.x.toFixed(1)}px`);
        setVar('--ty', `${pos.y.toFixed(1)}px`);
      }
      if (state !== 'idle') {
        const level = readLevel(t);
        levelAcc += level; levelN++;
        if (t - levelT >= 0.05) { levels.push(levelAcc / levelN); levelAcc = 0; levelN = 0; levelT = t; }
        drawRing(level, t);
        drawWave();
        const sec = Math.floor(t);
        if (sec !== lastSec) { lastSec = sec; timeEl.textContent = fmt(sec); }
      }
      if (state !== 'idle' || moving) raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf && !frozen) { lastFrame = 0; raf = requestAnimationFrame(frame); } };

    /* ---- lifecycle ---- */
    function start() {
      if (state !== 'idle') return;
      session++;
      sound.wake();
      readColours();
      setState('rec');
      root.classList.remove('is-latched');
      armed = false; root.removeAttribute('data-armed');
      t0 = performance.now(); lastSec = -1; levels = []; levelAcc = 0; levelN = 0; levelT = 0;
      finalText = ''; interim = ''; renderWords();
      simulated = true; recorder = null; chunks = [];
      setVar('--cancel', 0); setVar('--lock', 0);
      timeEl.textContent = '0:00';
      setTranscriptLabel();
      cue('start'); buzz(6);
      say('Recording. Release to send, slide left to cancel, up to lock.');
      openMic(session);
      kick();
      root.dispatchEvent(new CustomEvent('htt:start'));
    }
    function lock() {
      if (state !== 'rec') return;
      setArmed(false);
      root.classList.add('is-latched');
      setState('locked');
      target = { x: 0, y: 0 };
      setVar('--cancel', 0); setVar('--lock', 1);
      cue('lock'); buzz(12);
      say('Recording locked. Send or delete when done.');
      kick();
      root.dispatchEvent(new CustomEvent('htt:lock'));
    }
    function result() {
      const duration = (performance.now() - t0) / 1000;
      return { duration, levels: levels.slice(), transcript: (finalText + (interim ? ' ' + interim : '')).trim(), simulated };
    }
    function finish(kind) {
      if (state === 'idle') return;
      const detail = result();
      const rec = recorder;
      closeMic();
      setState('idle');
      armed = false; root.removeAttribute('data-armed');
      root.classList.remove('is-latched');
      target = { x: 0, y: 0 };
      setVar('--cancel', 0); setVar('--lock', 0);
      pointerId = null; byKey = false;
      kick();
      if (kind === 'tap') { cue('tap'); showHint(); return; }
      if (kind === 'cancel') {
        cue('cancel'); buzz(8);
        say('Recording cancelled');
        rec?.state === 'recording' && rec.stop();
        root.dispatchEvent(new CustomEvent('htt:cancel', { detail }));
        return;
      }
      cue('send');
      say(`Voice message sent, ${Math.max(1, Math.round(detail.duration))} seconds`);
      const emit = (blob) => root.dispatchEvent(new CustomEvent('htt:send', { detail: { ...detail, blob } }));
      if (rec && rec.state === 'recording') {
        rec.onstop = () => emit(chunks.length ? new Blob(chunks, { type: rec.mimeType || 'audio/webm' }) : null);
        rec.stop();
      } else emit(null);
    }
    function release() {
      if (state === 'rec') {
        if (armed) finish('cancel');
        else if (performance.now() - t0 < MIN_MS) finish('tap');
        else finish('send');
      }
      pointerId = null; byKey = false;
    }

    /* ---- pointer ---- */
    const CANCEL = () => Math.min(140, Math.max(90, root.clientWidth * 0.32));
    const LOCK = 84;
    mic.addEventListener('pointerdown', (e) => {
      if (state === 'locked' || pointerId !== null || e.button > 0) return;
      e.preventDefault();
      pointerId = e.pointerId;
      try { mic.setPointerCapture(e.pointerId); } catch { /* fine */ }
      x0 = e.clientX; y0 = e.clientY;
      start();
    });
    mic.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointerId || state !== 'rec') return;
      const dx = Math.min(0, e.clientX - x0), dy = Math.min(0, e.clientY - y0);
      const horiz = -dx > -dy;
      // past the cancel threshold the puck follows on a rubber band, so it never covers the strip
      const C = CANCEL(), band = (d) => (-d <= C ? d : -C - (-d - C) * 0.25);
      target = horiz ? { x: band(dx), y: 0 } : { x: 0, y: dy };
      const c = Math.min(1, -dx / C), l = horiz ? 0 : Math.min(1, -dy / LOCK);
      setVar('--cancel', c.toFixed(3));
      setVar('--lock', l.toFixed(3));
      if (l >= 1) { lock(); return; }
      if (c >= 1) setArmed(true);
      else if (armed && c < 0.88) setArmed(false);
      kick();
    });
    const up = (e) => { if (e.pointerId !== pointerId) return; lastRelease = performance.now(); if (e.type === 'pointercancel' && state === 'rec') { finish('cancel'); pointerId = null; return; } release(); };
    mic.addEventListener('pointerup', up);
    mic.addEventListener('pointercancel', up);
    mic.addEventListener('lostpointercapture', (e) => { if (e.pointerId === pointerId && state === 'rec') release(); });
    mic.addEventListener('contextmenu', (e) => e.preventDefault());

    // click: Send when locked; a click with no press before it (assistive tech) starts a hands-free recording
    mic.addEventListener('click', (e) => {
      if (performance.now() - lastRelease < 400) return; // the click that ends a press (or the lock gesture)
      if (state === 'locked') { finish('send'); return; }
      start(); lock();
      e.preventDefault();
    });
    del?.addEventListener('click', () => { if (state === 'locked') { finish('cancel'); mic.focus(); } });

    /* ---- keyboard: hold Space or Enter ---- */
    mic.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (e.repeat) return;
        if (state === 'locked') { finish('send'); return; }
        if (state === 'idle') { byKey = true; start(); }
      } else if (e.key === 'ArrowUp' && state === 'rec') { e.preventDefault(); lock(); }
    });
    mic.addEventListener('keyup', (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault(); // no synthetic click from the keyboard: keydown already did the work
      if (byKey) { if (state === 'rec') release(); byKey = false; }
    });
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state !== 'idle') { e.preventDefault(); finish('cancel'); mic.focus(); } });
    for (const type of ['pointerdown', 'keydown']) root.addEventListener(type, () => soundOn() && sound.wake(), { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden && state !== 'idle') finish('cancel'); });

    const api = {
      get state() { return state; },
      start, lock,
      send: () => finish('send'),
      cancel: () => finish('cancel'),
      /** a still frame for previews: { t, dx, dy, locked, transcript, label } — no mic, no loop */
      freeze(o = {}) {
        frozen = { t: o.t ?? 6.4 };
        readColours();
        setState(o.locked ? 'locked' : 'rec');
        const c = Math.min(1, -(o.dx || 0) / CANCEL()), l = Math.min(1, -(o.dy || 0) / LOCK);
        pos = target = { x: o.dx || 0, y: o.dy || 0 };
        setVar('--tx', `${pos.x}px`); setVar('--ty', `${pos.y}px`);
        setVar('--cancel', c); setVar('--lock', o.locked ? 1 : l);
        if (c >= 1) { armed = true; root.setAttribute('data-armed', ''); }
        simulated = !!o.simulated; micState = o.simulated ? 'none' : 'live';
        setTranscriptLabel();
        if (o.label && tlabel) tlabel.textContent = o.label;
        finalText = o.transcript || ''; interim = o.interim || ''; renderWords();
        timeEl.textContent = fmt(Math.floor(frozen.t));
        levels = Array.from({ length: Math.floor(frozen.t * 20) }, (_, i) => simLevel(i / 20));
        const lv = simLevel(frozen.t);
        drawRing(lv, frozen.t); drawWave();
      }
    };
    root.holdToTalk = api;
    return api;
  }

  window.HoldToTalk = { init };
  const boot = () => document.querySelectorAll('[data-hold-to-talk]').forEach((el) => init(el));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
