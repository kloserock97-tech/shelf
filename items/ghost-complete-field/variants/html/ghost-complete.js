// Ghost Complete Field: inline completion for ordinary inputs and textareas.
// The rest of a likely phrase is drawn in grey right after the caret (a mirror under the field holds the same text).
// Tab takes it all, Ctrl/⌘ + → takes one word, typing the same letters uses it up, a tap on the grey text takes it
// up to that word, Esc hides it. Suggestions come from a local phrase list at once, or from an async source
// (a model, a server) with a faint shimmer while it thinks. An empty field shows a rotating example instead.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  /** The rest of the best phrase for the end of `text`: the longest typed tail that starts a phrase wins. */
  function fromPhrases(text, phrases) {
    let best = null;
    const from = Math.max(0, text.length - 80);
    for (let k = from; k < text.length; k++) {
      if (k > 0 && !/\s/.test(text[k - 1])) continue; // tails start at a word
      const tail = text.slice(k);
      if (tail.length < (k === 0 ? 1 : 2) || /^\s/.test(tail)) continue;
      const low = tail.toLowerCase();
      for (const p of phrases) {
        if (p.length > tail.length && p.toLowerCase().startsWith(low)) {
          if (!best || tail.length > best.len) best = { len: tail.length, rest: p.slice(tail.length) };
          break; // list order is priority
        }
      }
      if (best) break; // the first (longest) tail that matches is the one
    }
    return best ? best.rest : null;
  }

  function attach(input, options = {}) {
    const o = { phrases: [], source: null, examples: [], wait: 130, every: 3600, ...options };
    const line = input.tagName === 'INPUT';
    const wrap = document.createElement('div');
    wrap.className = `gcf ${line ? 'is-line' : 'is-multi'}`;
    input.parentNode.insertBefore(wrap, input);
    wrap.innerHTML = `<div class="gcf-mirror" aria-hidden="true"><span class="gcf-mirror-in"><span class="gcf-typed"></span><span class="gcf-wait"></span><span class="gcf-ghost"></span><kbd class="gcf-key"></kbd></span></div><div class="gcf-ph" aria-hidden="true"></div><p class="gcf-sr" aria-live="polite"></p>`;
    wrap.insertBefore(input, wrap.querySelector('.gcf-ph'));
    input.classList.add('gcf-input');
    input.setAttribute('autocomplete', 'off');
    // the rotating example replaces the native placeholder; a blank one keeps :placeholder-shown working,
    // so the example also hides when the value is set from code
    if (input.placeholder.trim() && !(options.examples && options.examples.length !== 0)) o.examples = [input.placeholder];
    input.placeholder = ' ';
    const inner = wrap.querySelector('.gcf-mirror-in');
    const typed = wrap.querySelector('.gcf-typed');
    const ghostEl = wrap.querySelector('.gcf-ghost');
    const waitEl = wrap.querySelector('.gcf-wait');
    const key = wrap.querySelector('.gcf-key');
    const ph = wrap.querySelector('.gcf-ph');
    const live = wrap.querySelector('.gcf-sr');
    const hint = document.createElement('p');
    hint.className = 'gcf-sr';
    hint.id = `gcf-${Math.random().toString(36).slice(2, 8)}`;
    hint.textContent = `Suggestions appear after the caret. Tab accepts, ${mac ? 'Command' : 'Control'} plus Right Arrow accepts one word, Escape hides it.`;
    wrap.appendChild(hint);
    input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), hint.id].filter(Boolean).join(' '));

    let ghost = ''; // the suggested rest
    let prev = input.value;
    let waiting = false;
    let dismissed = false;
    let ctrl = null;
    let timer = 0;
    let speak = 0;

    const atEnd = () => document.activeElement === input && input.selectionStart === input.selectionEnd && input.selectionEnd === input.value.length;

    function render() {
      const text = input.value;
      const show = atEnd() && !dismissed;
      typed.textContent = text;
      ghostEl.textContent = show ? ghost : '';
      key.textContent = show && ghost ? 'Tab' : '';
      waitEl.classList.toggle('is-on', show && waiting && !ghost);
      waitEl.style.display = show && waiting && !ghost ? '' : 'none';
      wrap.classList.toggle('has-text', text.length > 0);
      if (line) inner.style.transform = `translateX(${-input.scrollLeft}px)`;
    }
    function announce() {
      clearTimeout(speak);
      speak = setTimeout(() => { live.textContent = ghost && atEnd() ? `Suggestion: ${ghost.trim()}. Tab to accept.` : ''; }, 700);
    }

    function suggest({ remote = true } = {}) {
      clearTimeout(timer);
      ctrl?.abort();
      ctrl = null;
      waiting = false;
      const text = input.value;
      ghost = (text.trim() && fromPhrases(text, o.phrases)) || '';
      if (!ghost && remote && o.source && text.trim()) {
        const c = (ctrl = new AbortController());
        // a short pause first, so fast typing doesn't send a request per key
        timer = setTimeout(async () => {
          waiting = true;
          render();
          try {
            const rest = await o.source(text, { signal: c.signal });
            if (c.signal.aborted || input.value !== text) return;
            ghost = rest || '';
            announce();
          } catch (err) {
            if (err?.name !== 'AbortError') ghost = '';
          } finally {
            if (ctrl === c) { waiting = false; ctrl = null; render(); }
          }
        }, o.wait);
      }
      render();
      if (ghost) announce();
    }

    function insert(str) {
      // execCommand keeps the insertion in the field's own undo history; setRangeText is the fallback
      input.focus();
      if (!document.execCommand?.('insertText', false, str)) {
        input.setRangeText(str, input.selectionStart, input.selectionEnd, 'end');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    const nextWord = (g) => (g.match(/^\s*[^\s]+[.,;:!?)]*/) || [g])[0];

    input.addEventListener('input', () => {
      const text = input.value;
      dismissed = false;
      const added = text.startsWith(prev) ? text.slice(prev.length) : null;
      prev = text;
      if (added && ghost && ghost.toLowerCase().startsWith(added.toLowerCase())) {
        // typed (or accepted) what the ghost said: use it up instead of asking again
        ghost = ghost.slice(added.length);
        if (!ghost) suggest();
        else render();
        return;
      }
      suggest({ remote: added != null && added.length > 0 });
    });
    input.addEventListener('keydown', (e) => {
      if (!ghost || !atEnd() || dismissed || e.isComposing) return;
      if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        insert(ghost);
      } else if (e.key === 'ArrowRight' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        insert(nextWord(ghost));
      } else if (e.key === 'Escape') {
        e.preventDefault();
        dismissed = true;
        clearTimeout(timer);
        ctrl?.abort();
        waiting = false;
        render();
        live.textContent = 'Suggestion hidden';
      }
    });
    // a tap or click on the grey text takes the suggestion up to that word
    input.addEventListener('pointerdown', (e) => {
      const node = ghostEl.firstChild;
      if (!node || !ghost) return;
      const r = document.createRange();
      const re = /\s*[^\s]+/g;
      let m;
      while ((m = re.exec(ghost))) {
        r.setStart(node, m.index);
        r.setEnd(node, m.index + m[0].length);
        const hit = [...r.getClientRects()].some((b) => e.clientX >= b.left - 2 && e.clientX <= b.right + 2 && e.clientY >= b.top - 3 && e.clientY <= b.bottom + 3);
        if (hit) {
          e.preventDefault();
          insert(ghost.slice(0, m.index + m[0].length));
          return;
        }
      }
    });
    const onSel = () => { if (document.activeElement === input) render(); };
    document.addEventListener('selectionchange', onSel);
    input.addEventListener('scroll', render);
    input.addEventListener('focus', () => { if (input.value.trim() && !ghost) suggest(); else render(); });
    input.addEventListener('blur', () => { clearTimeout(timer); ctrl?.abort(); waiting = false; render(); });

    // the rotating example, taken fresh each time so it can follow the context
    let exIndex = -1;
    let rot = 0;
    const examples = () => (typeof o.examples === 'function' ? o.examples() : o.examples) || [];
    function rotate(first = false) {
      const list = examples();
      if (!list.length) { ph.textContent = ''; return; }
      exIndex = (exIndex + 1) % list.length;
      const next = list[exIndex];
      if (first || reduce.matches || input.value) { ph.textContent = next; return; }
      ph.classList.add('is-out');
      setTimeout(() => {
        ph.textContent = next;
        ph.classList.remove('is-out');
        ph.classList.add('is-in');
        ph.getBoundingClientRect(); // commit the start position before easing in
        ph.classList.remove('is-in');
      }, 220);
    }
    function loop() {
      clearInterval(rot);
      rot = setInterval(() => { if (!input.value && !document.hidden) rotate(); }, o.every);
    }
    rotate(true);
    loop();
    if (!input.getAttribute('aria-label') && !input.labels?.length) input.setAttribute('aria-label', 'Text');

    render();
    return {
      /** show the next example now (e.g. after the context changed) */
      refreshExamples() { exIndex = -1; rotate(true); loop(); },
      /** put text in the field and ask for a suggestion, as if typed */
      set(text) { input.value = text; prev = text; dismissed = false; input.focus(); input.setSelectionRange(text.length, text.length); suggest(); },
      get suggestion() { return ghost; },
      input
    };
  }

  window.GhostComplete = { attach, fromPhrases };
})();
