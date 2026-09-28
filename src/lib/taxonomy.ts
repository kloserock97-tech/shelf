// The kinds of things on the shelf, in sidebar order, grouped into foldable sidebar sections.
// Icons are Lucide names (see icons.ts). scripts/lib/items.mjs keeps the same list of ids for the scripts.
export const GROUPS = [
  { id: 'interface', label: 'Interface' },
  { id: 'animation', label: 'Animation' },
  { id: 'graphics', label: 'Graphics' },
  { id: 'pages', label: 'Pages & tools' }
] as const;

export const TYPES = [
  { id: 'component', label: 'Components', one: 'Component', icon: 'Component', group: 'interface' },
  { id: 'button', label: 'Buttons', one: 'Button', icon: 'MousePointerClick', group: 'interface' },
  { id: 'card', label: 'Cards', one: 'Card', icon: 'SquareStack', group: 'interface' },
  { id: 'navigation', label: 'Navigation', one: 'Navigation', icon: 'Compass', group: 'interface' },
  { id: 'gallery', label: 'Galleries', one: 'Gallery', icon: 'GalleryHorizontalEnd', group: 'interface' },
  { id: 'icon', label: 'Icons', one: 'Icons', icon: 'Shapes', group: 'interface' },
  { id: 'cursor', label: 'Cursors', one: 'Cursor', icon: 'MousePointer2', group: 'interface' },
  { id: 'motion', label: 'Motion', one: 'Motion', icon: 'Orbit', group: 'animation' },
  { id: 'transition', label: 'Transitions', one: 'Transition', icon: 'ArrowRightLeft', group: 'animation' },
  { id: 'scroll', label: 'Scroll effects', one: 'Scroll effect', icon: 'Mouse', group: 'animation' },
  { id: 'text', label: 'Text effects', one: 'Text effect', icon: 'Type', group: 'animation' },
  { id: 'loader', label: 'Loaders', one: 'Loader', icon: 'Loader', group: 'animation' },
  { id: 'webgl', label: '3D & WebGL', one: '3D & WebGL', icon: 'Box', group: 'graphics' },
  { id: 'shader', label: 'Shaders', one: 'Shader', icon: 'Blend', group: 'graphics' },
  { id: 'background', label: 'Backgrounds', one: 'Background', icon: 'Image', group: 'graphics' },
  { id: 'object', label: '3D objects', one: '3D object', icon: 'Cylinder', group: 'graphics' },
  { id: 'section', label: 'Sections & pages', one: 'Section', icon: 'LayoutPanelTop', group: 'pages' },
  { id: 'app', label: 'Apps', one: 'App', icon: 'AppWindow', group: 'pages' },
  { id: 'sound', label: 'Sound', one: 'Sound', icon: 'AudioLines', group: 'pages' },
  { id: 'utility', label: 'Utilities', one: 'Utility', icon: 'Wrench', group: 'pages' }
] as const;

export type TypeId = (typeof TYPES)[number]['id'];
export const TYPE_IDS = TYPES.map((t) => t.id) as [TypeId, ...TypeId[]];
export const typeOf = (id: string) => TYPES.find((t) => t.id === id) ?? TYPES[0];
