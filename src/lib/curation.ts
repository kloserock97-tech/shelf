// The second axis of the shelf and its human layer. A kind (taxonomy.ts) says what a piece is; a job says what it does
// for the person on the page; a collection is a matter of taste; a project is where the piece actually runs.
// Icons are Lucide names. scripts/lib/items.mjs keeps the same ids for the check.
import type { Lang } from './i18n';

export const JOBS = [
  { id: 'navigation', label: 'Navigation', ru: 'Навигация', icon: 'Compass', about: 'Where am I and where can I go: docks, menus, contents.', aboutRu: 'Где я и куда дальше: доки, меню, оглавления.' },
  { id: 'discovery', label: 'Discovery', ru: 'Поиск и обзор', icon: 'ListFilter', about: 'Browsing a lot and finding the one: filters, catalogues.', aboutRu: 'Просмотреть много и найти одно: фильтры, каталоги.' },
  { id: 'showcase', label: 'Showcase', ru: 'Показ работ', icon: 'GalleryHorizontalEnd', about: 'Putting work in front of people: galleries, project cards.', aboutRu: 'Показать работу: галереи, карточки проектов.' },
  { id: 'storytelling', label: 'Storytelling', ru: 'Рассказ', icon: 'BookOpen', about: 'Leading through a story step by step.', aboutRu: 'Провести через историю шаг за шагом.' },
  { id: 'first-impression', label: 'First impression', ru: 'Первое впечатление', icon: 'Sparkles', about: 'The first seconds on a page: heroes, intros.', aboutRu: 'Первые секунды на странице: герои, заставки.' },
  { id: 'atmosphere', label: 'Atmosphere', ru: 'Атмосфера', icon: 'CloudSun', about: 'Mood and backdrop: skies, landscapes, weather, sound.', aboutRu: 'Настроение и фон: небо, пейзажи, погода, звук.' },
  { id: 'feedback', label: 'Feedback', ru: 'Отклик', icon: 'MousePointerClick', about: 'Answering an action so it feels done.', aboutRu: 'Ответ на действие, чтобы было ясно: сработало.' },
  { id: 'loading', label: 'Loading', ru: 'Ожидание', icon: 'Hourglass', about: 'What people see while things load.', aboutRu: 'Что видно, пока всё грузится.' },
  { id: 'comparison', label: 'Comparison', ru: 'Сравнение', icon: 'Columns2', about: 'Two states or options side by side.', aboutRu: 'Два состояния или варианта рядом.' },
  { id: 'contact', label: 'Contact', ru: 'Связь', icon: 'Mail', about: 'Getting people to write, share or reach out.', aboutRu: 'Чтобы написали, поделились, связались.' },
  { id: 'input', label: 'Input and choice', ru: 'Ввод и выбор', icon: 'TextCursorInput', about: 'Fields, switches, picking a value.', aboutRu: 'Поля, переключатели, выбор значения.' },
  { id: 'onboarding', label: 'Onboarding', ru: 'Первые шаги', icon: 'Footprints', about: 'How a product greets someone new.', aboutRu: 'Как продукт встречает новичка.' },
  { id: 'empty-state', label: 'Empty state', ru: 'Пустое состояние', icon: 'Inbox', about: 'What shows when there is nothing yet.', aboutRu: 'Что видно, когда ещё ничего нет.' },
  { id: 'error', label: 'Errors', ru: 'Ошибки', icon: 'TriangleAlert', about: 'Errors, not found, the way back.', aboutRu: 'Ошибки, «не найдено», путь обратно.' },
  { id: 'data', label: 'Data', ru: 'Данные', icon: 'ChartColumn', about: 'Charts, numbers, tables.', aboutRu: 'Графики, числа, таблицы.' },
  { id: 'quality', label: 'Speed and polish', ru: 'Скорость и чистота', icon: 'Gauge', about: 'Fast, smooth and clean: quality steps, antialiasing, typography.', aboutRu: 'Быстро, плавно и чисто: ступени качества, сглаживание, типографика.' }
] as const;

// `cover` is the collection's art on All items, big one first, as an editor picks a playlist's cover: pieces whose
// posters read at a glance, and no two alike side by side. Members without a cover fill in when a pick is missing.
export const COLLECTIONS = [
  { id: 'feels-expensive', label: 'Feels expensive', ru: 'Выглядит дорого', icon: 'Gem', about: 'Material, light, glass and restraint.', aboutRu: 'Материал, свет, стекло и сдержанность.', cover: ['glass-diorama', 'garden-loader', 'nightsail'] },
  { id: 'calm', label: 'Calm', ru: 'Спокойное', icon: 'Leaf', about: 'Slow motion and a quiet mood.', aboutRu: 'Неспешное движение и тихое настроение.', cover: ['god-rays', 'windcrest', 'driftfield'] },
  { id: 'depth', label: 'Depth', ru: 'Глубина', icon: 'Layers', about: 'Layers, tilt and 3D on a flat screen.', aboutRu: 'Слои, наклон и объём на плоском экране.', cover: ['depth-tilt-object', 'portal-door', 'phone-fan-stack'] },
  { id: 'no-assets', label: 'Code only', ru: 'Только код', icon: 'Code', about: 'No images, models or sound files: everything is drawn by code.', aboutRu: 'Без картинок, моделей и звуковых файлов: всё рисует код.', cover: ['procedural-tree-rocks', 'moss-shell-texturing', 'css-photo-studio'] },
  { id: 'retro', label: 'Retro', ru: 'Ретро', icon: 'Tv', about: 'Tubes, old desktops, film and polaroids.', aboutRu: 'Кинескопы, старые рабочие столы, плёнка и полароиды.', cover: ['retro-desktop-screen', 'glitch-bands', 'polaroid-tape'] },
  { id: 'playful', label: 'Playful', ru: 'С игрой', icon: 'Smile', about: 'Small joys: springs, looks, a wink.', aboutRu: 'Маленькие радости: пружины, взгляды, подмигивание.', cover: ['look-at-cursor-rig', 'umbrella-hat', 'spring-toggle'] },
  { id: 'ai-native', label: 'AI-native', ru: 'AI-интерфейсы', icon: 'Sparkles', about: 'Working with a model: streams, doubt, edits you can take back, plans you can steer.', aboutRu: 'Работа с моделью: поток текста, сомнение, правки, которые можно вернуть, план, которым можно управлять.', cover: [] as string[] },
  { id: 'from-research', label: 'From research', ru: 'Из исследований', icon: 'Microscope', about: 'Ideas from HCI papers, built to use.', aboutRu: 'Идеи из статей по HCI, собранные в рабочие вещи.', cover: [] as string[] }
] as const;

// Where pieces run. The URL is the live site, so a piece can be seen at work in its real context.
export const PROJECTS = [
  { id: 'ts2', label: 'Portfolio 3D', url: 'https://kloserock97-tech.github.io/gorbachev-nikita-product-designer/' },
  { id: 'windcrest', label: 'Windcrest', url: 'https://kloserock97-tech.github.io/windcrest/' },
  { id: 'driftfield', label: 'Driftfield', url: 'https://kloserock97-tech.github.io/driftfield/' },
  { id: 'nightsail', label: 'Nightsail', url: 'https://kloserock97-tech.github.io/nightsail/' },
  { id: 'meadow-walk', label: 'Meadow Walk', url: 'https://kloserock97-tech.github.io/meadow-walk/' }
] as const;

export type JobId = (typeof JOBS)[number]['id'];
export type CollectionId = (typeof COLLECTIONS)[number]['id'];
export type ProjectId = (typeof PROJECTS)[number]['id'];
export type JobDef = (typeof JOBS)[number];
export type CollectionDef = (typeof COLLECTIONS)[number];
export const JOB_IDS = JOBS.map((j) => j.id) as [JobId, ...JobId[]];
export const COLLECTION_IDS = COLLECTIONS.map((c) => c.id) as [CollectionId, ...CollectionId[]];
export const PROJECT_IDS = PROJECTS.map((p) => p.id) as [ProjectId, ...ProjectId[]];

export const jobOf = (id: string) => JOBS.find((j) => j.id === id) ?? JOBS[0];
export const collectionOf = (id: string) => COLLECTIONS.find((c) => c.id === id) ?? COLLECTIONS[0];
export const projectOf = (id: string) => PROJECTS.find((p) => p.id === id) ?? PROJECTS[0];

type Named = { label: string; ru: string; about: string; aboutRu: string };
export const nameOf = (x: Named, lang: Lang) => (lang === 'ru' ? x.ru : x.label);
export const aboutOf = (x: Named, lang: Lang) => (lang === 'ru' ? x.aboutRu : x.about);
