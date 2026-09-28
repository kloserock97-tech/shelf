// Object card: the light follows the cursor (--mx, --my) and the object leans after it (--px, --py, −1…1).
// In a row, --tilt (−1…1) is the card's distance from the row centre: the object leans out the way the card faces.
document.querySelectorAll('.case').forEach((card) => {
  card.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = card.getBoundingClientRect();
    const mx = (e.clientX - r.left) / r.width;
    const my = (e.clientY - r.top) / r.height;
    card.style.setProperty('--mx', `${(mx * 100).toFixed(1)}%`);
    card.style.setProperty('--my', `${(my * 100).toFixed(1)}%`);
    card.style.setProperty('--px', (mx * 2 - 1).toFixed(3));
    card.style.setProperty('--py', (my * 2 - 1).toFixed(3));
  });
  card.addEventListener('pointerleave', () => {
    card.style.setProperty('--px', '0');
    card.style.setProperty('--py', '0');
  });
});

document.querySelectorAll('[data-case-row]').forEach((row) => {
  const cards = [...row.querySelectorAll('.case')];
  let raf = 0;
  const paint = () => {
    raf = 0;
    const box = row.getBoundingClientRect();
    const mid = box.left + box.width / 2;
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      const d = (r.left + r.width / 2 - mid) / (r.width + gap);
      c.style.setProperty('--tilt', Math.max(-1, Math.min(1, d)).toFixed(3));
    }
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(paint); };
  row.addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', kick);
  paint();
});
