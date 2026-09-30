// Intent Quick Add: a single field that reads the line as you type (intent-parse.js) and shows it back in place.
// The textarea keeps the caret, selection, IME and undo; a mirror under it draws the same text with chips.
// Backspace right after a chip keeps those words as plain text; Esc switches reading off and on; Enter creates.
(() => {
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let uid = 0;

  function create(root, options = {}) {
    const o = {
      label: root.dataset.label ?? 'New task',
      placeholder: root.dataset.placeholder ?? 'Add a task, e.g. Lunch with @ben friday 1pm',
      people: [],
      projects: [],
      now: () => new Date(),
      ...options
    };
    const id = `iqa-${++uid}`;
    root.classList.add('iqa');
    root.innerHTML = `
      <div class="iqa-field">
        <div class="iqa-mirror" aria-hidden="true"></div>
        <textarea class="iqa-input" rows="1" spellcheck="false" autocomplete="off" autocapitalize="sentences"
          enterkeyhint="done" aria-describedby="${id}-hint"></textarea>
        <button class="iqa-add" type="button" disabled>Add</button>
        <div class="iqa-float" aria-hidden="true"></div>
      </div>
      <p class="iqa-ghost" aria-hidden="true"></p>
      <p class="iqa-sr" id="${id}-hint">Dates, @people, #projects and euro amounts are read as you type. Backspace right after one keeps it as text. Escape turns reading off. Enter adds.</p>
      <p class="iqa-sr" aria-live="polite"></p>`;
    const field = root.querySelector('.iqa-field');
    const mirror = root.querySelector('.iqa-mirror');
    const input = root.querySelector('.iqa-input');
    const add = root.querySelector('.iqa-add');
    const float = root.querySelector('.iqa-float');
    const ghost = root.querySelector('.iqa-ghost');
    const live = root.querySelectorAll('.iqa-sr')[1];
    input.setAttribute('aria-label', o.label);
    input.placeholder = o.placeholder;

    let literal = []; // [start, end) ranges kept as text
    let raw = false;
    let prev = '';
    let result = null;
    let shown = new Set();
    let speak = 0;

    // keep the literal ranges on the same words while the text around them changes
    function shiftLiteral(before, after) {
      let a = 0;
      while (a < before.length && a < after.length && before[a] === after[a]) a++;
      let b = 0;
      while (b < before.length - a && b < after.length - a && before[before.length - 1 - b] === after[after.length - 1 - b]) b++;
      const endOld = before.length - b;
      const delta = after.length - before.length;
      literal = literal.flatMap(([s, e]) => {
        if (e <= a) return [[s, e]]; // edit after the range
        if (s >= endOld) return [[s + delta, e + delta]]; // edit before it
        if (s <= a && endOld <= e) return e + delta > s ? [[s, e + delta]] : []; // edit inside it
        return []; // edit cut through it: read it again
      });
    }

    function render() {
      const text = input.value;
      result = window.IntentParse.parse(text, { now: o.now(), people: o.people, projects: o.projects, literal });
      const chips = raw ? [] : result.chips;
      // mirror
      let html = '';
      let at = 0;
      const next = new Set();
      for (const c of chips) {
        const key = `${c.type}:${c.start}`;
        next.add(key);
        html += esc(text.slice(at, c.start));
        html += `<mark class="iqa-chip${shown.has(key) || reduce.matches ? '' : ' is-new'}" data-type="${c.type}" data-start="${c.start}">${esc(text.slice(c.start, c.end))}</mark>`;
        at = c.end;
      }
      mirror.innerHTML = html + esc(text.slice(at));
      shown = next;
      // ghost line
      const title = raw ? text.trim() : result.title;
      let said = [];
      if (!text.trim()) ghost.innerHTML = '';
      else if (raw) {
        ghost.innerHTML = `<span class="iqa-kind">Task</span><span class="iqa-title">${esc(title)}</span><span class="iqa-off">Reading off · Esc to turn it on</span>`;
        said = ['Task', title];
      } else {
        const [kind, ...meta] = window.IntentParse.summary(result);
        ghost.innerHTML = `<span class="iqa-kind">${esc(kind)}</span>${title ? `<span class="iqa-title">${esc(title)}</span>` : '<span class="iqa-off">Add a title</span>'}${meta.map((m) => `<span>${esc(m)}</span>`).join('')}`;
        said = [kind, title || 'no title yet', ...meta];
      }
      add.disabled = !title;
      root.classList.toggle('is-raw', raw);
      placeFloat();
      clearTimeout(speak);
      speak = setTimeout(() => { live.textContent = said.length ? `Will create: ${said.join(', ')}` : ''; }, 900);
      root.dispatchEvent(new CustomEvent('parse', { detail: value() }));
    }

    function chipAtCaret() {
      if (raw || !result || document.activeElement !== input || input.selectionStart !== input.selectionEnd) return null;
      const p = input.selectionStart;
      return result.chips.find((c) => c.start <= p && p <= c.end) ?? null;
    }
    function placeFloat() {
      const c = chipAtCaret();
      const el = c && mirror.querySelector(`.iqa-chip[data-start="${c.start}"]`);
      if (!el) { float.classList.remove('is-on'); return; }
      float.innerHTML = `${esc(c.label)}${c.note ? `<small>${esc(c.note)}</small>` : ''}`;
      const f = field.getBoundingClientRect();
      const rects = el.getClientRects();
      const r = rects[0];
      const w = float.offsetWidth;
      const x = Math.min(Math.max(r.left - f.left + r.width / 2 - w / 2, 4), f.width - w - 4);
      // always above the first line, so it never covers words when the chip wraps to a later line
      const firstLine = mirror.getBoundingClientRect().top - f.top + parseFloat(getComputedStyle(mirror).paddingTop);
      float.style.transform = `translate(${x.toFixed(1)}px, ${(firstLine - float.offsetHeight - 6).toFixed(1)}px)`;
      float.classList.add('is-on');
    }

    function value() {
      const r = result;
      const title = raw ? input.value.trim() : r.title;
      if (raw) return { text: input.value, kind: 'Task', title, due: null, hasTime: false, end: null, repeat: null, people: [], project: null, amount: null, priority: null, duration: null };
      const { chips, dueLabel, ...rest } = r;
      return { text: input.value, ...rest, title, dueLabel };
    }

    function submit() {
      const v = value();
      if (!v.title) return;
      root.dispatchEvent(new CustomEvent('submit', { detail: v, bubbles: true }));
      input.value = '';
      prev = '';
      literal = [];
      raw = false;
      render();
      live.textContent = `Added: ${v.title}`;
    }

    input.addEventListener('input', () => {
      if (/[\r\n]/.test(input.value)) {
        // one line only: pasted line breaks become spaces
        const p = input.selectionStart;
        input.value = input.value.replace(/\r?\n/g, ' ');
        input.setSelectionRange(p, p);
      }
      shiftLiteral(prev, input.value);
      prev = input.value;
      render();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        submit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        raw = !raw;
        render();
        live.textContent = raw ? 'Reading off: plain text' : 'Reading on';
      } else if (e.key === 'Backspace' && !raw && input.selectionStart === input.selectionEnd) {
        const p = input.selectionStart;
        const c = result?.chips.find((x) => x.end === p);
        if (c) {
          e.preventDefault();
          literal.push([c.start, c.end]);
          render();
          live.textContent = `Kept “${c.text}” as text`;
        }
      }
    });
    const onSelection = () => { if (document.activeElement === input) placeFloat(); };
    document.addEventListener('selectionchange', onSelection);
    input.addEventListener('blur', () => float.classList.remove('is-on'));
    input.addEventListener('focus', placeFloat);
    add.addEventListener('click', () => { submit(); input.focus(); });
    new ResizeObserver(() => placeFloat()).observe(field);

    render();
    return {
      get value() { return value(); },
      set(text, caret = text.length) {
        input.value = text;
        prev = text;
        literal = [];
        raw = false;
        // chips set from code land without the flash
        shown = new Set(window.IntentParse.parse(text, { now: o.now(), people: o.people, projects: o.projects }).chips.map((c) => `${c.type}:${c.start}`));
        input.setSelectionRange(caret, caret);
        render();
      },
      focus() { input.focus(); },
      input
    };
  }

  window.IntentQuickAdd = { create };
})();
