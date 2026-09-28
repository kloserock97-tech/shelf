// Flip aria-checked; CSS does the motion.
document.querySelectorAll('.toggle').forEach((el) => {
  el.addEventListener('click', () => {
    const on = el.getAttribute('aria-checked') !== 'true';
    el.setAttribute('aria-checked', String(on));
    el.dispatchEvent(new CustomEvent('toggle', { detail: on }));
  });
});
