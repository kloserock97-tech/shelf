// The kinds of things on the shelf, in sidebar order, grouped into foldable sidebar sections.
// Icons are Lucide names (see icons.ts). scripts/lib/items.mjs keeps the same list of ids for the scripts.
import type { Lang } from './i18n';

export const GROUPS = [
  { id: 'interface', label: 'Interface', ru: 'Интерфейс' },
  { id: 'animation', label: 'Animation', ru: 'Движение' },
  { id: 'graphics', label: 'Graphics', ru: 'Графика' },
  { id: 'pages', label: 'Pages & tools', ru: 'Страницы и утилиты' }
] as const;

export const TYPES = [
  { id: 'component', label: 'Components', one: 'Component', ru: 'Компоненты', oneRu: 'Компонент', icon: 'Component', group: 'interface', about: "Controls and small pieces of interface: switches, fields, menus.", aboutRu: "Контролы и мелкие части интерфейса: переключатели, поля, меню." },
  { id: 'button', label: 'Buttons', one: 'Button', ru: 'Кнопки', oneRu: 'Кнопка', icon: 'MousePointerClick', group: 'interface', about: "Buttons with character: material, shine, a press you can feel.", aboutRu: "Кнопки с характером: материал, блик, ощутимое нажатие." },
  { id: 'card', label: 'Cards', one: 'Card', ru: 'Карточки', oneRu: 'Карточка', icon: 'SquareStack', group: 'interface', about: "Containers for one idea: a project, a note, an object.", aboutRu: "Контейнеры для одной мысли: проект, заметка, предмет." },
  { id: 'navigation', label: 'Navigation', one: 'Navigation', ru: 'Навигация', oneRu: 'Навигация', icon: 'Compass', group: 'interface', about: "Ways to move around: docks, menus, contents.", aboutRu: "Способы перемещаться: доки, меню, оглавления." },
  { id: 'gallery', label: 'Galleries', one: 'Gallery', ru: 'Галереи', oneRu: 'Галерея', icon: 'GalleryHorizontalEnd', group: 'interface', about: "Ways to show many screens or pictures at once.", aboutRu: "Способы показать много экранов или картинок сразу." },
  { id: 'icon', label: 'Icons', one: 'Icons', ru: 'Иконки', oneRu: 'Иконки', icon: 'Shapes', group: 'interface', about: "Icon sets and the rules they are drawn by.", aboutRu: "Наборы иконок и правила, по которым они нарисованы." },
  { id: 'cursor', label: 'Cursors', one: 'Cursor', ru: 'Курсоры', oneRu: 'Курсор', icon: 'MousePointer2', group: 'interface', about: "Things that follow the pointer: parallax, a look, a tilt.", aboutRu: "Всё, что следит за курсором: параллакс, взгляд, наклон." },
  { id: 'motion', label: 'Motion', one: 'Motion', ru: 'Анимации', oneRu: 'Анимация', icon: 'Orbit', group: 'animation', about: "Interface animation that explains what just happened.", aboutRu: "Анимации интерфейса, которые объясняют, что произошло." },
  { id: 'transition', label: 'Transitions', one: 'Transition', ru: 'Переходы', oneRu: 'Переход', icon: 'ArrowRightLeft', group: 'animation', about: "Moves between screens and scenes.", aboutRu: "Переходы между экранами и сценами." },
  { id: 'scroll', label: 'Scroll effects', one: 'Scroll effect', ru: 'Эффекты прокрутки', oneRu: 'Эффект прокрутки', icon: 'Mouse', group: 'animation', about: "Effects that the scroll position drives.", aboutRu: "Эффекты, которые ведёт прокрутка." },
  { id: 'text', label: 'Text effects', one: 'Text effect', ru: 'Текстовые эффекты', oneRu: 'Текстовый эффект', icon: 'Type', group: 'animation', about: "Headlines and paragraphs that move or reveal.", aboutRu: "Заголовки и абзацы, которые двигаются и проявляются." },
  { id: 'loader', label: 'Loaders', one: 'Loader', ru: 'Загрузчики', oneRu: 'Загрузчик', icon: 'Loader', group: 'animation', about: "What people look at while things load.", aboutRu: "На что смотрят, пока всё грузится." },
  { id: 'webgl', label: '3D & WebGL', one: '3D & WebGL', ru: '3D и WebGL', oneRu: '3D и WebGL', icon: 'Box', group: 'graphics', about: "Live scenes on three.js, WebGL and WebGPU.", aboutRu: "Живые сцены на three.js, WebGL и WebGPU." },
  { id: 'shader', label: 'Shaders', one: 'Shader', ru: 'Шейдеры', oneRu: 'Шейдер', icon: 'Blend', group: 'graphics', about: "Shaders and post effects on their own.", aboutRu: "Шейдеры и постэффекты отдельно от сцен." },
  { id: 'background', label: 'Backgrounds', one: 'Background', ru: 'Фоны', oneRu: 'Фон', icon: 'Image', group: 'graphics', about: "Backdrops: light, sky, studio, grain.", aboutRu: "Фоны: свет, небо, студия, зерно." },
  { id: 'object', label: '3D objects', one: '3D object', ru: '3D-предметы', oneRu: '3D-предмет', icon: 'Cylinder', group: 'graphics', about: "Standalone 3D things for scenes and posters.", aboutRu: "Отдельные 3D-предметы для сцен и постеров." },
  { id: 'section', label: 'Sections & pages', one: 'Section', ru: 'Секции и страницы', oneRu: 'Секция', icon: 'LayoutPanelTop', group: 'pages', about: "Whole screens and sections of pages.", aboutRu: "Целые экраны и секции страниц." },
  { id: 'app', label: 'Apps', one: 'App', ru: 'Приложения', oneRu: 'Приложение', icon: 'AppWindow', group: 'pages', about: "Small apps with their own logic.", aboutRu: "Маленькие приложения со своей логикой." },
  { id: 'sound', label: 'Sound', one: 'Sound', ru: 'Звук', oneRu: 'Звук', icon: 'AudioLines', group: 'pages', about: "Sound in the interface: signals and ambience.", aboutRu: "Звук в интерфейсе: сигналы и фон." },
  { id: 'utility', label: 'Utilities', one: 'Utility', ru: 'Утилиты', oneRu: 'Утилита', icon: 'Wrench', group: 'pages', about: "Helpers without looks: language, quality, detection.", aboutRu: "Помощники без внешности: язык, качество, детекторы." }
] as const;

export type TypeId = (typeof TYPES)[number]['id'];
export type TypeDef = (typeof TYPES)[number];
export const TYPE_IDS = TYPES.map((t) => t.id) as [TypeId, ...TypeId[]];
export const typeOf = (id: string) => TYPES.find((t) => t.id === id) ?? TYPES[0];

// Labels in the page language: plural for lists and the sidebar, singular for a single item.
export const typeLabel = (t: TypeDef, lang: Lang) => (lang === 'ru' ? t.ru : t.label);
export const typeOne = (t: TypeDef, lang: Lang) => (lang === 'ru' ? t.oneRu : t.one);
export const groupLabel = (g: (typeof GROUPS)[number], lang: Lang) => (lang === 'ru' ? g.ru : g.label);
export const typeAbout = (t: TypeDef, lang: Lang) => (lang === 'ru' ? t.aboutRu : t.about);
