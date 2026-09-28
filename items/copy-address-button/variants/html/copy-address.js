// Copy Address Button (Portfolio 3D TS2, src/ui/footer.ts, v27): the address itself is the button.
// Click: the address goes to the clipboard, the label says so for 1.8 s. If the browser keeps the clipboard
// closed, the mail app opens instead, so the click is never lost.
(function () {
  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch (e) {
      // older browsers, plain http, a frame without clipboard-write: a hidden field and execCommand
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

  function initCopyAddress(btn, opts = {}) {
    if (btn.dataset.copyReady) return;
    btn.dataset.copyReady = 'true';
    const mail = btn.dataset.copy || '';
    const label = btn.querySelector('.copy-address__label');
    const text = Object.assign({ copy: 'Copy the address', copied: 'Address copied' }, opts.labels);
    const status = document.createElement('span');
    status.className = 'copy-address__status';
    status.setAttribute('role', 'status');
    btn.after(status);
    let back = 0;

    const rest = () => {
      btn.classList.remove('is-done');
      if (label) label.textContent = mail;
      btn.setAttribute('aria-label', `${text.copy}: ${mail}`);
      status.textContent = '';
    };
    rest();

    btn.addEventListener('click', async () => {
      try {
        await copyText(mail);
      } catch (e) {
        location.href = `mailto:${mail}`;
        return;
      }
      btn.classList.add('is-done');
      if (label) label.textContent = text.copied;
      status.textContent = text.copied;
      btn.dispatchEvent(new CustomEvent('copied', { detail: mail, bubbles: true }));
      clearTimeout(back);
      back = setTimeout(rest, 1800);
    });
  }

  document.querySelectorAll('.copy-address[data-copy]').forEach((btn) => initCopyAddress(btn));
  window.initCopyAddress = initCopyAddress;
})();
