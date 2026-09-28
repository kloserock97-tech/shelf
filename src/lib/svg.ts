// Lucide ships 24px SVGs with stroke-width 2. Shelf draws them at 1.75 and sizes them with CSS.
export const cleanSvg = (svg: string, stroke = 1.75) =>
  svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/ class="[^"]*"/, '')
    .replace(/ width="24"/, '')
    .replace(/ height="24"/, '')
    .replace(/stroke-width="2"/, `stroke-width="${stroke}"`)
    .replace('<svg', '<svg aria-hidden="true" focusable="false"')
    .replace(/>\s+</g, '><')
    .trim();
