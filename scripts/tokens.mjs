// design/tokens.json (the Shelf design system) -> src/styles/tokens.css
// Light palette on :root, dark palette for the system setting and for an explicit data-theme="dark".
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const T = JSON.parse(fs.readFileSync(path.join(root, 'design/tokens.json'), 'utf8'));
const first = T.color.themes[0].id;

const resolve = (value, theme) => {
  const v = typeof value === 'string' ? value : value[theme] ?? value[first];
  return v.replace(/^\{(.+)\}$/, 'var(--$1)');
};
const differs = (value, theme) => typeof value === 'object' && value[theme] !== undefined && value[theme] !== value[first];

const themed = [...T.color.tokens, ...T.shadow.tokens];
const plain = ['spacing', 'radius', 'size', 'material', 'duration', 'easing', 'zIndex'].flatMap((k) => T[k]?.tokens ?? []);

const fontStack = {
  sans: `"Onest Variable", ${T.type.families.sans}`,
  mono: `"JetBrains Mono Variable", ${T.type.families.mono}`
};

let css = '/* Generated from design/tokens.json by scripts/tokens.mjs. Edit the tokens, not this file. */\n\n';
css += ':root {\n  color-scheme: light;\n';
for (const t of themed) css += `  --${t.name}: ${resolve(t.value, first)};\n`;
for (const t of plain) css += `  --${t.name}: ${t.value};\n`;
css += `  --font-sans: ${fontStack.sans};\n  --font-mono: ${fontStack.mono};\n}\n\n`;

const dark = themed.filter((t) => differs(t.value, 'dark'));
const darkBody = dark.map((t) => `  --${t.name}: ${resolve(t.value, 'dark')};`).join('\n');
css += `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n    color-scheme: dark;\n${darkBody.replace(/^/gm, '  ')}\n  }\n}\n\n`;
css += `:root[data-theme="dark"] {\n  color-scheme: dark;\n${darkBody}\n}\n`;

fs.writeFileSync(path.join(root, 'src/styles/tokens.css'), css);
console.log(`tokens.css: ${themed.length} themed, ${plain.length} plain, ${dark.length} dark overrides`);
