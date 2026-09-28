// Phone fan: number the phones for the CSS layout and open a phone on its own when clicked.
(() => {
  document.querySelectorAll('.fan').forEach((fan) => {
    const phones = [...fan.querySelectorAll('.fan-phone')];
    fan.style.setProperty('--n', phones.length);
    phones.forEach((p, i) => p.style.setProperty('--i', i));
  });

  const view = document.querySelector('.fan-view');
  if (!view) return;
  const img = view.querySelector('img');
  const cap = view.querySelector('p');
  document.querySelectorAll('.fan-phone').forEach((phone) => phone.addEventListener('click', () => {
    const src = phone.querySelector('img');
    img.src = src.currentSrc || src.src;
    img.alt = src.alt;
    img.classList.toggle('is-device', phone.classList.contains('is-device'));
    cap.textContent = src.alt;
    view.showModal();
  }));
  view.querySelector('button').addEventListener('click', () => view.close());
  // a click on the dimmed field closes, a click on the phone itself doesn't
  view.addEventListener('click', (e) => { if (e.target === view) view.close(); });
})();
