/* Error Fix Capsule.
   <form class="efc" novalidate> with .efc-field > label + .efc-input (+ .efc-mark), a .efc__foot with .efc__send and
   .efc-capsule, and one .efc-hint. Checks per field come from data-check: email | phone | url-ish (plus native
   required/type). Each check returns a message and, where it can, a one-tap fix. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const ANCHORS = CSS.supports('anchor-name: --a') && CSS.supports('position-area: bottom');
  const HINT = (() => { const d = document.createElement('div'); d.setAttribute('popover', 'hint'); return d.popover === 'hint'; })();

  // Damped spring, sampled into a CSS linear() easing (bounce 0..1).
  function spring(bounce = 0.32, n = 40) {
    const z = 1 - bounce, w0 = 4.6 / z, wd = w0 * Math.sqrt(Math.max(1e-4, 1 - z * z));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push(+(1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t))).toFixed(3));
    }
    pts[n] = 1;
    return `linear(${pts.join(', ')})`;
  }
  const SPRING = spring();

  // Edit distance: insert, delete, replace, and a swap of two neighbours counts as one edit ("gmial" → "gmail").
  function distance(a, b) {
    const m = a.length, n = b.length;
    let pp = null, p = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const c = [i];
      for (let j = 1; j <= n; j++) {
        let v = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (pp && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, pp[j - 2] + 1);
        c.push(v);
      }
      pp = p; p = c;
    }
    return p[n];
  }

  const DOMAINS = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'proton.me', 'live.com', 'aol.com', 'gmx.net', 'mail.com', 'yandex.ru', 'me.com'];
  function nearDomain(domain) {
    if (!domain || DOMAINS.includes(domain)) return null;
    let best = null, bestD = Infinity;
    for (const d of DOMAINS) {
      const k = distance(domain, d);
      if (k < bestD) { best = d; bestD = k; }
    }
    return bestD > 0 && bestD <= 2 && bestD < best.length / 3 ? best : null;
  }

  // Each check: (input, value) → null when fine, or { msg, fix?: { label, value }, keep?: true }
  const CHECKS = {
    email(input, v) {
      const at = v.lastIndexOf('@');
      if (/\s/.test(v)) return { msg: 'Email addresses can’t contain spaces.', fix: { label: 'Remove spaces', value: v.replace(/\s+/g, '') } };
      if (at < 1 || !/\.[a-z]{2,}$/i.test(v.slice(at))) return { msg: 'Enter an email like name@example.com.' };
      const domain = v.slice(at + 1).toLowerCase();
      if (input.dataset.kept === domain) return null;
      const near = nearDomain(domain);
      if (near) return { msg: 'Looks like a typo in the domain.', fix: { from: domain, label: near, value: v.slice(0, at + 1) + near }, keep: domain };
      return null;
    },
    phone(input, v) {
      const code = input.dataset.countryCode || '';
      if (/[^\d\s()+.-]/.test(v)) return { msg: 'Use digits only.' };
      const digits = v.replace(/\D/g, '');
      if (/^\s*00/.test(v)) return { msg: 'Use + instead of 00 before the country code.', fix: { label: 'Use +', value: v.replace(/^\s*00/, '+') } };
      if (v.trim().startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? null : { msg: 'This number looks too short.' };
      if (digits.length < 8) return { msg: 'This number looks too short.' };
      if (!code) return { msg: 'Add the country code, like +31.' };
      const local = v.trim().replace(/^0/, '');
      return { msg: 'Add the country code.', fix: { label: `Add ${code}`, value: `${code} ${local}` } };
    },
    web(input, v) {
      if (/\s/.test(v)) return { msg: 'Web addresses can’t contain spaces.', fix: { label: 'Remove spaces', value: v.replace(/\s+/g, '') } };
      if (!/\.[a-z]{2,}(\/|$)/i.test(v.replace(/^https?:\/\//i, ''))) return { msg: 'Add the ending, like .com or .nl.' };
      return null;
    }
  };

  function init(form) {
    form.style.setProperty('--efc-spring', SPRING);
    const fields = [...form.querySelectorAll('.efc-input')];
    const send = form.querySelector('.efc__send');
    const capsule = form.querySelector('.efc-capsule');
    const label = capsule.querySelector('.efc-capsule__label');
    const num = capsule.querySelector('.efc-num');
    const nextBtn = capsule.querySelector('.efc-capsule__next');
    const nextText = nextBtn.querySelector('span');
    const live = form.querySelector('.efc__live');
    const hint = form.querySelector('.efc-hint');
    const hintMsg = hint.querySelector('.efc-hint__msg');
    const hintActs = hint.querySelector('.efc-hint__acts');
    hint.setAttribute('popover', HINT ? 'hint' : 'manual');

    const problems = new Map(); // input → problem
    let tried = false, current = null, last = null, count = -1, doneTimer = 0;

    const say = (t) => { live.textContent = t; };
    const wrap = (input) => input.closest('.efc-field');

    function check(input) {
      const v = input.value;
      let p = null;
      input.setCustomValidity('');
      if (input.validity.valueMissing) p = { msg: input.dataset.missing || 'This field is required.' };
      else if (v.trim() && CHECKS[input.dataset.check]) p = CHECKS[input.dataset.check](input, v.trim());
      else if (!input.validity.valid) p = { msg: input.validationMessage };
      input.setCustomValidity(p ? p.msg : '');
      if (p) problems.set(input, p); else problems.delete(input);
      input.setAttribute('aria-invalid', String(!!p && wrap(input).classList.contains('is-flagged')));
      return p;
    }

    // --- the hint popover ---
    function place() {
      if (ANCHORS || !current || !hint.matches(':popover-open')) return;
      const r = current.getBoundingClientRect(), h = hint.getBoundingClientRect();
      const below = r.bottom + 6 + h.height < innerHeight - 8;
      hint.style.margin = '0';
      hint.style.left = `${Math.max(8, Math.min(r.left, innerWidth - h.width - 8))}px`;
      hint.style.top = `${below ? r.bottom + 6 : r.top - 6 - h.height}px`;
    }

    function showHint(input, p) {
      if (current && current !== input) current.style.removeProperty('anchor-name');
      current = input;
      input.style.setProperty('anchor-name', '--efc-field');
      if (hint.parentElement !== wrap(input)) {
        if (hint.matches(':popover-open')) hint.hidePopover();
        wrap(input).append(hint); // right after the field in tab order: Tab from the field reaches the fix
      }
      clearTimeout(doneTimer);
      hint.classList.remove('is-done');
      hintMsg.textContent = p.msg;
      hintActs.replaceChildren();
      if (p.fix) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'efc-fix';
        b.innerHTML = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6.3l2.3 2.3 4.7-5"/></svg>';
        if (p.fix.from) {
          b.append(Object.assign(document.createElement('s'), { textContent: p.fix.from }), ` → ${p.fix.label}?`);
          b.setAttribute('aria-label', `Change ${p.fix.from} to ${p.fix.label}`);
        } else {
          b.append(`${p.fix.label}: ${p.fix.value}`);
        }
        b.addEventListener('click', () => applyFix(input, p.fix.value));
        hintActs.append(b);
      }
      if (p.keep) {
        const k = document.createElement('button');
        k.type = 'button';
        k.className = 'efc-keep';
        k.textContent = 'Keep as typed';
        k.addEventListener('click', () => { input.dataset.kept = p.keep; refresh(input); input.focus(); });
        hintActs.append(k);
      }
      input.setAttribute('aria-describedby', hintMsg.id);
      if (!hint.matches(':popover-open')) {
        try { hint.showPopover(); } catch { /* not connected */ }
      }
      place();
    }

    function hideHint() {
      clearTimeout(doneTimer);
      if (hint.matches(':popover-open')) hint.hidePopover();
    }

    function applyFix(input, value) {
      input.focus(); // first, so the fix button leaving the hint does not count as focus leaving it
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      try { input.setSelectionRange(value.length, value.length); } catch { /* email and some other types have no caret API */ }
    }

    // --- the capsule ---
    function roll(n) {
      if (n === count) return;
      const up = n < count;
      const old = num.firstElementChild;
      const el = document.createElement('span');
      el.textContent = String(n);
      num.append(el);
      if (old && count >= 0 && !reduce.matches) {
        const d = up ? 1 : -1;
        old.animate([{ translate: '0 0', opacity: 1 }, { translate: `0 ${-d * 100}%`, opacity: 0 }], { duration: 260, easing: 'cubic-bezier(.4,0,.6,1)' }).finished.then(() => old.remove(), () => old.remove());
        el.animate([{ translate: `0 ${d * 100}%`, opacity: 0 }, { translate: '0 0', opacity: 1 }], { duration: 520, easing: SPRING });
        capsule.classList.remove('is-bump');
        void capsule.offsetWidth;
        capsule.classList.add('is-bump');
      } else if (old) old.remove();
      count = n;
    }

    function paintCapsule() {
      if (!tried) return;
      const n = problems.size;
      roll(n);
      const clear = n === 0;
      capsule.classList.toggle('is-clear', clear);
      label.textContent = clear ? 'All fixed' : n === 1 ? 'field to fix' : 'fields to fix';
      num.hidden = clear;
      nextText.textContent = clear ? (send.textContent.trim() || 'Send') : 'Next';
      nextBtn.setAttribute('aria-label', clear ? send.textContent.trim() : 'Go to the next field to fix');
    }

    function refresh(input) {
      const before = problems.has(input);
      const p = check(input);
      const w = wrap(input);
      if (p) {
        w.classList.remove('is-fixed');
        if (document.activeElement === input || hint.contains(document.activeElement)) w.classList.contains('is-flagged') && showHint(input, p);
      } else if (before) {
        w.classList.add('is-fixed');
        if (current === input && hint.matches(':popover-open')) {
          hint.classList.add('is-done');
          hintMsg.textContent = 'Fixed';
          hintActs.replaceChildren();
          doneTimer = setTimeout(hideHint, 700);
        }
        if (tried) say(problems.size ? `Fixed. ${problems.size} left.` : 'All fixed. Ready to send.');
      }
      paintCapsule();
    }

    function order() { return fields.filter((f) => problems.has(f)); }

    function goNext() {
      const list = order();
      if (!list.length) { form.requestSubmit(send); return; }
      // the next field to fix after the one the person was last in, in form order, wrapping round
      const from = fields.indexOf(last);
      const target = list.find((f) => fields.indexOf(f) > from) || list[0];
      target.scrollIntoView({ block: 'center', behavior: reduce.matches ? 'auto' : 'smooth' });
      target.focus({ preventScroll: true });
    }

    // --- events ---
    form.addEventListener('submit', (e) => {
      fields.forEach(check);
      if (!problems.size) {
        if (tried) { capsule.hidden = true; form.classList.remove('has-capsule'); }
        hideHint();
        return; // valid: let the page handle the submit event
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      tried = true;
      fields.forEach((f) => { if (problems.has(f)) { wrap(f).classList.add('is-flagged'); f.setAttribute('aria-invalid', 'true'); } });
      form.classList.add('has-capsule');
      capsule.hidden = false;
      paintCapsule();
      say(`${problems.size} ${problems.size === 1 ? 'field needs' : 'fields need'} a fix.`);
      const first = order()[0];
      first.scrollIntoView({ block: 'center', behavior: reduce.matches ? 'auto' : 'smooth' });
      first.focus({ preventScroll: true });
    });

    nextBtn.addEventListener('click', goNext);

    fields.forEach((input) => {
      input.addEventListener('focus', () => {
        last = input;
        const p = problems.get(input) || null;
        if (p && wrap(input).classList.contains('is-flagged')) showHint(input, p);
        else if (current !== input) hideHint();
      });
      input.addEventListener('input', () => {
        if (wrap(input).classList.contains('is-flagged') || tried) refresh(input);
      });
      input.addEventListener('blur', (e) => {
        if (hint.contains(e.relatedTarget)) return;
        // leaving the field is the moment to judge it (:user-invalid follows the same rule)
        if (input.value.trim() || tried) {
          check(input);
          if (problems.has(input)) { wrap(input).classList.add('is-flagged'); input.setAttribute('aria-invalid', 'true'); }
          paintCapsule();
        }
        if (current === input && !hint.classList.contains('is-done')) hideHint();
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideHint(); });
      // textarea grows with its text: field-sizing does it natively, the script otherwise
      if (input.tagName === 'TEXTAREA' && !CSS.supports('field-sizing: content')) {
        const grow = () => { input.style.height = 'auto'; input.style.height = `${input.scrollHeight + 2}px`; };
        input.addEventListener('input', grow);
        grow();
      }
    });
    hint.addEventListener('focusout', (e) => {
      if (!hint.contains(e.relatedTarget) && e.relatedTarget !== current) hideHint();
    });
    addEventListener('resize', place);
    addEventListener('scroll', place, { passive: true });

    form.efc = {
      // show the state after a send attempt: optional values first, then the field to open
      attempt(values = {}, focusId) {
        for (const [id, v] of Object.entries(values)) { const el = form.querySelector(`#${id}`); if (el) el.value = v; }
        form.requestSubmit(send);
        if (focusId) form.querySelector(`#${focusId}`)?.focus();
      },
      reset() {
        tried = false; count = -1; last = null; problems.clear(); hideHint();
        form.reset();
        fields.forEach((f) => { f.setCustomValidity(''); f.removeAttribute('aria-invalid'); delete f.dataset.kept; wrap(f).classList.remove('is-flagged', 'is-fixed'); });
        num.replaceChildren();
        capsule.hidden = true;
        form.classList.remove('has-capsule');
      }
    };
  }

  const boot = () => document.querySelectorAll('form.efc').forEach((f) => f.efc || init(f));
  boot();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
})();
