/* DOM → Canvas 2D masks: draws the text and boxes of live elements into a canvas at any scale, in the same place
   as on screen, so a shader can treat them as occluders or surfaces. Text goes word by word: a Range per word
   gives its box, the element's computed font gives the glyphs. */

/** Draws el's text into ctx. origin: the canvas's top-left in client px; scale: canvas px per css px. */
export function drawText(ctx, el, origin, scale, fill) {
  const cs = getComputedStyle(el);
  const size = parseFloat(cs.fontSize) * scale;
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${size}px ${cs.fontFamily}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : `${parseFloat(cs.letterSpacing) * scale}px`;
  ctx.fillStyle = fill;
  ctx.textBaseline = 'alphabetic';
  const transform = cs.textTransform;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue;
    const re = /\S+/g;
    let m;
    while ((m = re.exec(text))) {
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const r = range.getClientRects()[0];
      if (!r || !r.width) continue;
      let word = m[0];
      if (transform === 'uppercase') word = word.toUpperCase();
      else if (transform === 'lowercase') word = word.toLowerCase();
      const mt = ctx.measureText(word);
      const asc = mt.fontBoundingBoxAscent ?? size * 0.8;
      const desc = mt.fontBoundingBoxDescent ?? size * 0.2;
      const h = r.height * scale;
      const x = (r.left - origin.x) * scale;
      const y = (r.top - origin.y) * scale + (h - (asc + desc)) / 2 + asc;
      ctx.fillText(word, x, y);
    }
  }
}

/** Fills el's border box with its border-radius. inset: css px to shrink by. */
export function drawBox(ctx, el, origin, scale, fill, inset = 0) {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const rad = Math.max(0, parseFloat(cs.borderTopLeftRadius) - inset) * scale;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect((r.left - origin.x + inset) * scale, (r.top - origin.y + inset) * scale,
    (r.width - inset * 2) * scale, (r.height - inset * 2) * scale, Math.min(rad, (r.height * scale) / 2));
  ctx.fill();
}
