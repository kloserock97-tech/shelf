// Build-time syntax highlighting. Two Shiki themes are generated from the code-* tokens of the design system,
// so the code panel and the design system stay one palette.
import { createHighlighter, type Highlighter } from 'shiki';
import tokens from '../../design/tokens.json';

type Palette = Record<'text' | 'comment' | 'keyword' | 'string' | 'number' | 'type' | 'function' | 'tag' | 'attr' | 'punct', string>;

const pick = (theme: 'light' | 'dark'): Palette => {
  const get = (name: string) => {
    const t = tokens.color.tokens.find((x) => x.name === name);
    const v = t?.value as string | Record<string, string> | undefined;
    if (!v) throw new Error(`Missing token ${name}`);
    return typeof v === 'string' ? v : v[theme] ?? v.light;
  };
  return {
    text: get('code-text'), comment: get('code-comment'), keyword: get('code-keyword'), string: get('code-string'),
    number: get('code-number'), type: get('code-type'), function: get('code-function'), tag: get('code-tag'),
    attr: get('code-attr'), punct: get('code-punct')
  };
};

const theme = (name: string, type: 'light' | 'dark', c: Palette) => ({
  name,
  type,
  colors: { 'editor.background': '#00000000', 'editor.foreground': c.text },
  tokenColors: [
    { settings: { foreground: c.text } },
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: c.comment } },
    { scope: ['keyword', 'storage', 'storage.type', 'storage.modifier', 'keyword.control', 'keyword.operator.new', 'keyword.operator.expression', 'variable.language', 'constant.language'], settings: { foreground: c.keyword } },
    { scope: ['string', 'string.quoted', 'string.template', 'punctuation.definition.string', 'string.regexp'], settings: { foreground: c.string } },
    { scope: ['constant.numeric', 'constant.other.color', 'keyword.other.unit'], settings: { foreground: c.number } },
    { scope: ['entity.name.type', 'entity.name.class', 'support.class', 'support.type', 'entity.other.inherited-class', 'storage.type.primitive', 'support.type.primitive'], settings: { foreground: c.type } },
    { scope: ['entity.name.function', 'support.function', 'meta.function-call entity.name.function', 'variable.function'], settings: { foreground: c.function } },
    { scope: ['entity.name.tag', 'support.class.component'], settings: { foreground: c.tag } },
    { scope: ['entity.other.attribute-name', 'support.type.property-name', 'meta.object-literal.key', 'support.type.vendored.property-name'], settings: { foreground: c.attr } },
    { scope: ['punctuation', 'meta.brace', 'keyword.operator', 'punctuation.definition.tag', 'punctuation.separator'], settings: { foreground: c.punct } }
  ]
});

const LANG: Record<string, string> = {
  html: 'html', htm: 'html', css: 'css', js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  ts: 'typescript', tsx: 'tsx', vue: 'vue', svelte: 'svelte', glsl: 'glsl', vert: 'glsl', frag: 'glsl', wgsl: 'wgsl',
  json: 'json', md: 'markdown', sh: 'bash'
};
export const langOf = (file: string) => LANG[file.split('.').pop()?.toLowerCase() ?? ''] ?? 'text';

let highlighter: Promise<Highlighter> | undefined;

// Tokens share a dozen colour pairs. A short class per pair instead of an inline style on every token makes a
// code-heavy page several times lighter; codeStyles() prints the pairs once per page. The English and Russian
// twins of an item page highlight the same files, so results are kept by content.
const PAIRS = new Map<string, string>();
const DONE = new Map<string, string>();
export const codeStyles = () => [...PAIRS].map(([style, cls]) => `.${cls}{${style}}`).join('');

export async function highlight(code: string, file: string) {
  const key = `${file}\u0000${code}`;
  const hit = DONE.get(key);
  if (hit) return hit;
  highlighter ??= createHighlighter({
    themes: [theme('shelf-light', 'light', pick('light')), theme('shelf-dark', 'dark', pick('dark'))],
    langs: [...new Set(Object.values(LANG))].filter((l) => l !== 'text')
  });
  const h = await highlighter;
  const html = h
    .codeToHtml(code.replace(/\s+$/, ''), { lang: langOf(file), themes: { light: 'shelf-light', dark: 'shelf-dark' }, defaultColor: false })
    .replace(/<span style="([^"]+)">/g, (_, style: string) => {
      let cls = PAIRS.get(style);
      if (!cls) { cls = `k${PAIRS.size.toString(36)}`; PAIRS.set(style, cls); }
      return `<span class="${cls}">`;
    });
  DONE.set(key, html);
  return html;
}
