// What people call a thing, in English and in Russian. A word of a group in the query finds what any word of the group
// would ("модалка" finds the overlays, "онбординг" the task Onboarding), like the "also called" lists of
// component.gallery. A word can sit in two groups ("слайдер" is a carousel and a range); then both count.
// Shared by the list search and ⌘K (app.ts builds one searcher for both; finder.ts matches tile names with it).
// Russian words lose their case endings before indexing and searching (stem), so "модалку" and "модалки" meet.

export const SYNONYMS: string[][] = [
  ['modal', 'dialog', 'модалка', 'модальное окно', 'диалог', 'диалоговое окно', 'lightbox', 'лайтбокс', 'popup', 'попап', 'всплывающее окно', 'overlay', 'оверлей'],
  ['sheet', 'bottom sheet', 'drawer', 'шторка', 'лист', 'нижний лист', 'выдвижная панель'],
  ['toast', 'snackbar', 'notification', 'уведомление', 'тост', 'снэкбар', 'alert', 'оповещение'],
  ['tooltip', 'подсказка', 'hint', 'тултип', 'coach mark', 'коучмарк', 'popover', 'поповер'],
  ['skeleton', 'скелетон', 'заглушка', 'placeholder', 'плейсхолдер'],
  ['loader', 'загрузчик', 'preloader', 'прелоадер', 'spinner', 'спиннер', 'загрузка', 'loading', 'progress', 'прогресс'],
  ['carousel', 'карусель', 'slider', 'слайдер', 'листалка', 'pager', 'swipe', 'свайп'],
  ['range', 'slider', 'слайдер', 'ползунок', 'scrubber', 'скраб'],
  ['tabs', 'вкладки', 'табы', 'segmented control', 'сегментированный переключатель', 'сегмент'],
  ['chart', 'график', 'диаграмма', 'graph', 'plot', 'sparkline', 'спарклайн', 'dashboard', 'дашборд'],
  ['empty state', 'пустое состояние', 'zero state', 'пустой экран'],
  ['onboarding', 'онбординг', 'первые шаги', 'обучение', 'tutorial', 'туториал', 'walkthrough', 'coach mark', 'first run'],
  ['toggle', 'switch', 'переключатель', 'тумблер', 'свитч'],
  ['button', 'кнопка', 'cta', 'призыв'],
  ['menu', 'меню', 'dropdown', 'выпадающее', 'выпадающее меню', 'mega menu'],
  ['navigation', 'навигация', 'navbar', 'навбар', 'tab bar', 'таббар', 'dock', 'док'],
  ['accordion', 'аккордеон', 'collapsible', 'disclosure', 'раскрытие', 'details', 'подробнее', 'спойлер'],
  ['card', 'карточка', 'плитка', 'tile'],
  ['gallery', 'галерея', 'masonry', 'grid', 'сетка'],
  ['scroll', 'прокрутка', 'скролл', 'scrolling'],
  ['parallax', 'параллакс', 'depth', 'глубина'],
  ['cursor', 'курсор', 'pointer', 'указатель', 'mouse', 'мышь'],
  ['glass', 'стекло', 'glassmorphism', 'стеклянный', 'liquid glass', 'frosted'],
  ['blur', 'размытие', 'bokeh', 'боке'],
  ['noise', 'шум', 'grain', 'зерно'],
  ['3d', '3д', 'webgl', 'three.js', 'трёхмерный', 'объём'],
  ['shader', 'шейдер', 'glsl', 'wgsl'],
  ['background', 'фон', 'backdrop', 'задник', 'обои', 'wallpaper'],
  ['transition', 'переход', 'page transition', 'view transitions'],
  ['typography', 'типографика', 'шрифт', 'font', 'text effect', 'текстовый эффект', 'kinetic type'],
  ['sound', 'звук', 'audio', 'аудио', 'озвучка'],
  ['input', 'поле ввода', 'text field', 'инпут', 'textarea', 'форма', 'form'],
  ['filter', 'фильтр', 'facets', 'фасеты', 'поиск', 'search'],
  ['drag and drop', 'перетаскивание', 'drag', 'dnd', 'перетащить'],
  ['undo', 'отмена', 'отменить', 'откат', 'rewind'],
  ['error', 'ошибка', '404', 'not found', 'не найдено'],
  ['ai', 'ии', 'нейросеть', 'llm', 'chat', 'чат', 'агент', 'agent'],
  ['hero', 'первый экран', 'герой', 'landing', 'лендинг'],
  ['footer', 'подвал', 'футер'],
  ['table of contents', 'оглавление', 'toc', 'содержание']
];

export const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

// Light stemming for Russian: drop one case or number ending, keeping a stem of four letters or more. Not a real
// stemmer: enough for "модалка / модалки / модалку", "анимация / анимации", "шторка / шторки".
const ENDINGS = [
  'иями', 'ями', 'ами', 'ией', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'иях',
  'ия', 'ии', 'ию', 'ие', 'ий', 'ый', 'ой', 'ей', 'ая', 'яя', 'ое', 'ее', 'ые', 'ых', 'их', 'ов', 'ев', 'ом', 'ем', 'ам', 'ям', 'ах', 'ях', 'ую', 'юю',
  'а', 'я', 'ы', 'и', 'е', 'о', 'у', 'ю', 'ь', 'й'
];
export function stem(word: string) {
  const w = norm(word);
  if (!/^[а-я]+$/.test(w)) return w;
  for (const e of ENDINGS) if (w.endsWith(e) && w.length - e.length >= 4) return w.slice(0, -e.length);
  return w;
}
// For MiniSearch: the same on both sides, the index and the query
export const processTerm = (term: string) => stem(term);

const SPLIT = /[\s\p{P}]+/u;
const words = (s: string) => norm(s).split(SPLIT).filter(Boolean);
const stems = (s: string) => words(s).map(stem);
// every phrase of every group as stems, longest first, with the groups it belongs to
const PHRASES = (() => {
  const map = new Map<string, Set<number>>();
  SYNONYMS.forEach((g, i) => g.forEach((p) => {
    const key = stems(p).join(' ');
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(i);
  }));
  return [...map.entries()].map(([key, groups]) => ({ parts: key.split(' '), groups: [...groups] })).sort((a, b) => b.parts.length - a.parts.length);
})();

type Part = { text: string; groups: number[] };
// The query cut into words and known phrases ("empty state" is one part)
function parse(q: string): Part[] {
  const ws = words(q);
  const ss = ws.map(stem);
  const out: Part[] = [];
  for (let i = 0; i < ws.length;) {
    const hit = PHRASES.find((p) => p.parts.every((s, j) => ss[i + j] === s));
    if (hit) { out.push({ text: ws.slice(i, i + hit.parts.length).join(' '), groups: hit.groups }); i += hit.parts.length; }
    else { out.push({ text: ws[i], groups: [] }); i++; }
  }
  return out;
}
const termsOf = (groups: number[]) => [...new Set(groups.flatMap((g) => SYNONYMS[g]))];

export type SearchQuery = string | { combineWith: 'AND' | 'OR'; queries: SearchQuery[]; prefix?: (t: string) => boolean; fuzzy?: (t: string) => number | false };
// A MiniSearch query tree: every part must match (AND); a part with synonyms matches any of them (OR). A phrase among
// the synonyms needs all its words. Short synonyms neither prefix- nor fuzzy-match: "ии" must not find "иконки".
export function expandQuery(q: string): SearchQuery {
  const parts = parse(q);
  return {
    combineWith: 'AND',
    queries: parts.map((p) => (p.groups.length
      ? {
          combineWith: 'OR' as const,
          prefix: (t: string) => t.length >= 5,
          fuzzy: (t: string) => (t.length >= 6 ? 0.2 : false),
          queries: termsOf(p.groups).map((t) => (t.includes(' ') ? { combineWith: 'AND' as const, queries: [t] } : t))
        }
      : p.text))
  };
}

// Every name the query may mean: its synonyms, as stems
export function synonymTerms(q: string) {
  return termsOf(parse(q).flatMap((p) => p.groups)).map(stems);
}
// two stems agree when one starts the other ("overlay" and "overlays"), from three letters on
const same = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a)));
const within = (big: string[], small: string[]) => big.some((_, i) => i + small.length <= big.length && small.every((s, j) => same(big[i + j], s)));
// A short name (a kind, a task, a collection) the query means: it holds the words, or it and a synonym hold one another
// ("модалка" → "Всплывающее" through "всплывающее окно"; "онбординг" → "Первые шаги").
export function labelHit(label: string, q: string) {
  const whole = norm(q.trim());
  if (!whole) return false;
  if (norm(label).includes(whole)) return true;
  const l = stems(label);
  return synonymTerms(q).some((t) => within(l, t) || within(t, l));
}
