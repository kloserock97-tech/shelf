/* Interest Contact Card.
   Markup: <a class="icc-mention" interestfor="card-id"> + <span class="icc-card" id="card-id" popover="hint">.
   Where the browser has interest invokers, it handles the delays, hover hand-off, focus and long press itself;
   this script only fills in the local time and the copy button. Elsewhere it runs its own small controller:
   pointer hover with delays, keyboard focus, press-and-hold on touch, Escape, tap outside. */
(() => {
  const OPEN_DELAY = 400;
  const CLOSE_DELAY = 250;
  const HOLD = 480;

  const NATIVE_INTEREST = 'interestForElement' in HTMLAnchorElement.prototype || 'interestForElement' in HTMLButtonElement.prototype;
  const HAS_POPOVER = typeof HTMLElement.prototype.showPopover === 'function';
  const HAS_HINT = (() => { const d = document.createElement('div'); d.setAttribute('popover', 'hint'); return d.popover === 'hint'; })();
  const HAS_ANCHOR = typeof CSS !== 'undefined' && CSS.supports('position-area: block-end span-inline-end');

  /* data-icc-now="2026-10-14T13:20:00Z" on the root pins the clock (screenshots, tests) */
  const clockNow = (card) => {
    const pin = card.closest("[data-icc-now]")?.dataset.iccNow;
    return pin ? new Date(pin) : new Date();
  };

  /* minutes east of UTC for an IANA zone at a moment */
  const fmtCache = new Map();
  function zoneOffset(tz, date) {
    let f = fmtCache.get(tz);
    if (!f) {
      f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
      fmtCache.set(tz, f);
    }
    const p = {};
    for (const part of f.formatToParts(date)) p[part.type] = Number(part.value);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
    return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  }
  function spanText(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return (h ? `${h} h` : '') + (h && m ? ' ' : '') + (m ? `${m} min` : '');
  }

  function renderTime(card, now = clockNow(card)) {
    const row = card.querySelector('.icc-time');
    const tz = card.dataset.tz;
    if (!row || !tz) return;
    const clock = new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(now);
    const theirs = zoneOffset(tz, now);
    const mine = -now.getTimezoneOffset();
    const diff = theirs - mine;
    const rel = diff === 0 ? 'same time as you' : `${spanText(Math.abs(diff))} ${diff > 0 ? 'ahead of' : 'behind'} you`;
    // working hours "9-18", Monday to Friday, in their zone
    const [from, to] = (card.dataset.hours || '9-18').split('-').map(Number);
    const local = new Date(now.getTime() + theirs * 60000);
    const hour = local.getUTCHours() + local.getUTCMinutes() / 60;
    const day = local.getUTCDay();
    const working = day > 0 && day < 6 && hour >= from && hour < to;
    row.toggleAttribute('data-working', working);
    const city = card.dataset.city ? ` in ${card.dataset.city}` : '';
    row.querySelector('.icc-time__clock').textContent = clock;
    row.querySelector('.icc-time__rest').textContent = `${city} · ${rel}`;
    const sr = row.querySelector('.icc-time__sr');
    if (sr) sr.textContent = working ? ', working hours' : ', outside working hours';
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.append(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
      return ok;
    }
  }

  function wireCard(card) {
    if (card.iccWired) return;
    card.iccWired = true;
    let minuteTimer = 0;
    const tick = () => {
      renderTime(card);
      const now = Date.now();
      minuteTimer = setTimeout(tick, 60000 - (now % 60000) + 50);
    };
    card.addEventListener('toggle', (e) => {
      clearTimeout(minuteTimer);
      if (e.newState === 'open') tick();
    });
    renderTime(card);

    const copy = card.querySelector('[data-icc="copy"]');
    const status = card.querySelector('[role="status"]');
    let doneTimer = 0;
    copy?.addEventListener('click', async () => {
      const email = card.dataset.email;
      const ok = await copyText(email);
      if (!ok) { location.href = `mailto:${email}`; return; }
      const label = copy.querySelector('.icc-btn__label');
      copy.setAttribute('data-done', '');
      if (label) label.textContent = 'Copied';
      if (status) status.textContent = `${email} copied`;
      clearTimeout(doneTimer);
      doneTimer = setTimeout(() => {
        copy.removeAttribute('data-done');
        if (label) label.textContent = 'Copy email';
        if (status) status.textContent = '';
      }, 1600);
      card.dispatchEvent(new CustomEvent('copied', { bubbles: true, detail: { email } }));
    });
  }

  /* ---------- own controller where interest invokers are missing ---------- */
  function fallback(root, mentions) {
    let current = null; // { mention, card }
    let showTimer = 0;
    let hideTimer = 0;
    let anchorN = 0;
    let quiet = null; // the mention that gets focus back after Escape: no re-open
    const isOpen = (card) => (HAS_POPOVER ? card.matches(':popover-open') : card.classList.contains('icc-open'));

    function place(mention, card) {
      if (HAS_ANCHOR) return;
      const r = mention.getBoundingClientRect();
      const w = card.offsetWidth;
      const h = card.offsetHeight;
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      let left = Math.min(Math.max(12, r.left), vw - w - 12);
      let top = r.bottom + 10;
      if (top + h > vh - 12 && r.top - 10 - h > 12) top = r.top - 10 - h;
      card.style.left = `${left}px`;
      card.style.top = `${top}px`;
    }
    function show(mention) {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      const card = document.getElementById(mention.dataset.iccTarget);
      if (!card) return;
      if (current && current.mention !== mention) hide();
      if (HAS_ANCHOR) {
        if (!mention.style.anchorName) mention.style.anchorName = `--icc-a${++anchorN}`;
        card.style.positionAnchor = mention.style.anchorName;
      }
      if (!isOpen(card)) {
        if (HAS_POPOVER) {
          try { card.showPopover({ source: mention }); } catch { card.showPopover(); }
        } else {
          card.classList.add('icc-open');
          card.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'open' }));
        }
      }
      mention.classList.add('icc-on');
      current = { mention, card };
      place(mention, card);
    }
    function hide() {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      if (!current) return;
      const { mention, card } = current;
      current = null;
      mention.classList.remove('icc-on');
      if (HAS_POPOVER) { if (card.matches(':popover-open')) card.hidePopover(); }
      else {
        card.classList.remove('icc-open');
        card.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'closed' }));
      }
    }
    const later = (fn, ms) => { clearTimeout(showTimer); showTimer = setTimeout(fn, ms); };
    const hideLater = () => { clearTimeout(hideTimer); hideTimer = setTimeout(() => hide(), CLOSE_DELAY); };
    const inside = (node, card) => !!node && (card.contains(node));

    for (const mention of mentions) {
      const card = document.getElementById(mention.dataset.iccTarget);
      if (!card) continue;
      mention.setAttribute('aria-details', card.id);

      mention.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'touch') return;
        clearTimeout(hideTimer);
        if (current?.mention === mention) return;
        later(() => show(mention), OPEN_DELAY);
      });
      mention.addEventListener('pointerleave', (e) => {
        if (e.pointerType === 'touch') return;
        clearTimeout(showTimer);
        if (current?.mention === mention) hideLater();
      });
      mention.addEventListener('focus', () => {
        if (quiet === mention) { quiet = null; return; }
        if (!mention.matches(':focus-visible')) return;
        later(() => show(mention), OPEN_DELAY);
      });
      mention.addEventListener('blur', (e) => {
        clearTimeout(showTimer);
        if (current?.mention === mention && !inside(e.relatedTarget, card)) hideLater();
      });

      /* press and hold on touch */
      let hold = 0;
      let held = false;
      let start = null;
      mention.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'touch') return;
        held = false;
        start = { x: e.clientX, y: e.clientY };
        clearTimeout(hold);
        hold = setTimeout(() => { held = true; show(mention); navigator.vibrate?.(8); }, HOLD);
      });
      mention.addEventListener('pointermove', (e) => {
        if (!start || e.pointerType !== 'touch') return;
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) { clearTimeout(hold); start = null; }
      });
      const endHold = () => { clearTimeout(hold); start = null; };
      mention.addEventListener('pointerup', endHold);
      mention.addEventListener('pointercancel', endHold);
      mention.addEventListener('contextmenu', (e) => { if (held || start) e.preventDefault(); });
      mention.addEventListener('click', (e) => {
        if (held) { e.preventDefault(); held = false; }
      });

      card.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') clearTimeout(hideTimer); });
      card.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch' && current?.card === card) hideLater(); });
      card.addEventListener('focusout', (e) => {
        if (current?.card !== card) return;
        if (!inside(e.relatedTarget, card) && e.relatedTarget !== mention) hideLater();
      });
      card.addEventListener('focusin', () => clearTimeout(hideTimer));
    }

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !current) return;
      const { mention, card } = current;
      const back = card.contains(document.activeElement);
      hide();
      if (back) { quiet = mention; mention.focus(); }
    });
    document.addEventListener('pointerdown', (e) => {
      if (!current) return;
      if (current.card.contains(e.target) || current.mention.contains(e.target)) return;
      hide();
    }, true);
    const follow = () => { if (current) place(current.mention, current.card); };
    window.addEventListener('scroll', follow, { passive: true, capture: true });
    window.addEventListener('resize', follow);

    root.icc = { show, hide: () => hide(), native: false };
  }

  function init(root) {
    if (root.icc) return root.icc;
    const mentions = [...root.querySelectorAll('.icc-mention[interestfor], .icc-mention[data-icc-target]')];
    const forced = root.hasAttribute('data-icc-fallback');
    const native = NATIVE_INTEREST && HAS_POPOVER && !forced;
    for (const m of mentions) {
      if (!m.dataset.iccTarget) m.dataset.iccTarget = m.getAttribute('interestfor');
      if (!native) m.removeAttribute('interestfor');
    }
    for (const card of root.querySelectorAll('.icc-card')) {
      if (!HAS_POPOVER) card.removeAttribute('popover');
      else if (!HAS_HINT) card.setAttribute('popover', native ? 'auto' : 'manual');
      else if (!native) card.setAttribute('popover', 'manual');
      wireCard(card);
    }
    if (native) {
      root.icc = {
        native: true,
        show(mention) {
          const card = document.getElementById(mention.dataset.iccTarget);
          if (card && !card.matches(':popover-open')) {
            try { card.showPopover({ source: mention }); } catch { card.showPopover(); }
          }
        },
        hide() { for (const c of root.querySelectorAll('.icc-card:popover-open')) c.hidePopover(); }
      };
    } else {
      fallback(root, mentions);
    }
    return root.icc;
  }

  const boot = () => document.querySelectorAll('.icc').forEach(init);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  window.InterestContactCard = { init };
})();
