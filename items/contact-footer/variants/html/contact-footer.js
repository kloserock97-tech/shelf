// Contact Footer behaviour (Portfolio 3D TS2, src/ui/footer.ts): the address copies itself,
// and the footer comes in with a cascade the first time it is on screen.
(function () {
  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand && document.execCommand('copy');
      ta.remove();
      if (!ok) throw e;
    }
  }

  function initFooter(footer, opts = {}) {
    if (!footer || footer.dataset.footerReady) return;
    footer.dataset.footerReady = 'true';
    const text = Object.assign({ copy: 'Copy the address', copied: 'Address copied' }, opts.labels);

    const copy = footer.querySelector('.sf-copy');
    if (copy) {
      const label = copy.querySelector('.sf-copy-l');
      const mail = copy.dataset.copy || '';
      const status = document.createElement('span');
      status.className = 'sf-status';
      status.setAttribute('role', 'status');
      copy.after(status);
      let back = 0;
      const rest = () => {
        copy.classList.remove('is-done');
        if (label) label.textContent = mail;
        copy.setAttribute('aria-label', `${text.copy}: ${mail}`);
        status.textContent = '';
      };
      rest();
      copy.addEventListener('click', async () => {
        try {
          await copyText(mail);
        } catch (e) {
          location.href = `mailto:${mail}`; // the clipboard is closed: open the mail app instead
          return;
        }
        copy.classList.add('is-done');
        if (label) label.textContent = text.copied;
        status.textContent = text.copied;
        clearTimeout(back);
        back = setTimeout(rest, 1800);
      });
    }

    // entrance: once, when a quarter of the footer is in view
    if (!('IntersectionObserver' in window)) { footer.classList.add('is-on'); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        footer.classList.add('is-on');
        io.disconnect();
      }
    }, { threshold: 0.25 });
    io.observe(footer);
  }

  document.querySelectorAll('.site-footer').forEach((f) => initFooter(f));
  window.initFooter = initFooter;
})();
