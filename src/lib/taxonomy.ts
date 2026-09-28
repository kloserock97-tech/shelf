// The twelve kinds of things on the shelf, in sidebar order. Icons are Lucide names (see icons.ts).
export const TYPES = [
  { id: 'component', label: 'Components', one: 'Component', icon: 'Component' },
  { id: 'button', label: 'Buttons', one: 'Button', icon: 'MousePointerClick' },
  { id: 'section', label: 'Sections & pages', one: 'Section', icon: 'LayoutPanelTop' },
  { id: 'app', label: 'Apps', one: 'App', icon: 'AppWindow' },
  { id: 'webgl', label: '3D & WebGL', one: '3D & WebGL', icon: 'Box' },
  { id: 'shader', label: 'Shaders', one: 'Shader', icon: 'Blend' },
  { id: 'motion', label: 'Motion', one: 'Motion', icon: 'Orbit' },
  { id: 'loader', label: 'Loaders', one: 'Loader', icon: 'Loader' },
  { id: 'text', label: 'Text effects', one: 'Text effect', icon: 'Type' },
  { id: 'background', label: 'Backgrounds', one: 'Background', icon: 'Image' },
  { id: 'object', label: '3D objects', one: '3D object', icon: 'Cylinder' },
  { id: 'utility', label: 'Utilities', one: 'Utility', icon: 'Wrench' }
] as const;

export type TypeId = (typeof TYPES)[number]['id'];
export const TYPE_IDS = TYPES.map((t) => t.id) as [TypeId, ...TypeId[]];
export const typeOf = (id: string) => TYPES.find((t) => t.id === id) ?? TYPES[0];
