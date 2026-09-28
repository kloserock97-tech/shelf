/* Line icons: a 16×16 field, a 1.25 line, no fills, round caps and joins; shapes from plain arcs and straight
   lines with no small details, so an icon still reads at 14 px. The colour is currentColor: an icon takes the
   colour of the text around it. One set for the whole site, every new place takes its icons from here. */
const paths = {
  /* brief */
  text: `<path d="M3 4.2h10"/><path d="M3 8h10"/><path d="M3 11.8h6"/>`,
  /* list */
  list: `<path d="M3 4.5h10"/><path d="M3 8h10"/><path d="M3 11.5h7"/>`,
  /* context */
  pin: `<path d="M8 14s4.4-3.7 4.4-7.3A4.4 4.4 0 0 0 3.6 6.7C3.6 10.3 8 14 8 14Z"/><circle cx="8" cy="6.6" r="1.6"/>`,
  /* approach */
  route: `<circle cx="3.8" cy="12.2" r="1.5"/><circle cx="12.2" cy="3.8" r="1.5"/><path d="M5.3 12.2h3.2a2.2 2.2 0 0 0 0-4.4H7.3a2.2 2.2 0 0 1 0-4.4h3.4"/>`,
  /* research */
  search: `<circle cx="7" cy="7" r="4.2"/><path d="m10.1 10.1 3.4 3.4"/>`,
  /* flow */
  swap: `<path d="M2.5 5.2h10.2"/><path d="m10.3 2.8 2.4 2.4-2.4 2.4"/><path d="M13.5 10.8H3.3"/><path d="m5.7 8.4-2.4 2.4 2.4 2.4"/>`,
  /* decisions */
  sliders: `<path d="M2.5 4.5h5"/><path d="M11 4.5h2.5"/><circle cx="9.2" cy="4.5" r="1.7"/><path d="M2.5 11.5H5"/><path d="M8.5 11.5h5"/><circle cx="6.8" cy="11.5" r="1.7"/>`,
  /* split */
  columns: `<rect x="2.2" y="2.8" width="11.6" height="10.4" rx="2"/><path d="M8 2.8v10.4"/>`,
  /* mistakes */
  undo: `<path d="M3.2 6.2h6.3a3.3 3.3 0 0 1 0 6.6H6.5"/><path d="m5.6 3.6-2.6 2.6 2.6 2.6"/>`,
  /* results */
  trend: `<path d="M2.5 13.5h11"/><path d="m3.5 10.3 3.1-3.3 2.4 2.2 3.7-4.4"/><path d="M9.9 4.6h2.9v2.9"/>`,
  /* screens, dock Work */
  monitor: `<rect x="2.2" y="2.6" width="11.6" height="8.4" rx="1.4"/><path d="M5.6 13.6h4.8"/>`,
  /* roadmap */
  flag: `<path d="M3.8 14V2.4"/><path d="M3.8 3h7.7l-1.8 2.7 1.8 2.7H3.8"/>`,
  /* takeaways */
  bulb: `<path d="M5.7 11.3a4.3 4.3 0 1 1 4.6 0v1.1H5.7Z"/><path d="M6.4 14.2h3.2"/>`,
  /* deep */
  layers: `<path d="m8 2.4 5.6 2.9L8 8.2 2.4 5.3Z"/><path d="m2.4 8.2 5.6 2.9 5.6-2.9"/><path d="m2.4 11 5.6 2.9 5.6-2.9"/>`,
  /* role, dock About */
  user: `<circle cx="8" cy="5.4" r="2.7"/><path d="M2.8 13.8c.7-2.7 2.5-4.1 5.2-4.1s4.5 1.4 5.2 4.1"/>`,
  /* company */
  building: `<path d="M3.2 13.6V3.4a1 1 0 0 1 1-1h4.6a1 1 0 0 1 1 1v10.2"/><path d="M9.8 6.6h2a1 1 0 0 1 1 1v6"/><path d="M2.2 13.6h11.6"/><path d="M5.6 5.2h1.8"/><path d="M5.6 7.8h1.8"/><path d="M5.6 10.4h1.8"/>`,
  /* time */
  clock: `<circle cx="8" cy="8" r="5.7"/><path d="M8 4.8V8l2.2 1.5"/>`,
  /* platform */
  devices: `<rect x="1.8" y="3" width="9.2" height="7" rx="1.2"/><path d="M4.4 12.6h4"/><rect x="10.2" y="6.4" width="4" height="7.2" rx="1"/>`,
  /* dock Experiments */
  flask: `<path d="M6.2 2.3h3.6M6.9 2.3v3.9l-3.5 5.9a1.3 1.3 0 0 0 1.1 2h7a1.3 1.3 0 0 0 1.1-2L9.1 6.2V2.3"/><path d="M5 10.4h6"/>`,
  /* dock Say hi, footer */
  mail: `<path d="M2.4 4.2h11.2v7.6H2.4z"/><path d="m2.6 4.5 5.4 4.2 5.4-4.2"/>`,
  /* footer */
  send: `<path d="M14 2.6 1.9 7.3c-.6.2-.6 1 0 1.2l3 1 1.1 3.5c.2.5.8.6 1.1.2l1.7-1.8 3 2.2c.4.3 1 .1 1.1-.4L15 3.4c.1-.6-.5-1-1-.8Z"/><path d="m5 9.4 6.5-4.3"/>`,
  /* dock language */
  globe: `<circle cx="8" cy="8" r="6"/><path d="M2.2 8h11.6"/><path d="M8 2.1c1.7 1.7 2.6 3.7 2.6 5.9S9.7 12.2 8 13.9C6.3 12.2 5.4 10.2 5.4 8s.9-4.2 2.6-5.9Z"/>`,
  /* footer */
  copy: `<rect x="5.6" y="5.6" width="8" height="8" rx="1.6"/><path d="M10.6 5.6V4a1.6 1.6 0 0 0-1.6-1.6H4A1.6 1.6 0 0 0 2.4 4v5a1.6 1.6 0 0 0 1.6 1.6h1.6"/>`,
  /* check, footer */
  check: `<path d="m3 8.6 3.2 3.2L13 5"/>`,
  /* plus */
  plus: `<path d="M8 3.5v9"/><path d="M3.5 8h9"/>`,
  /* arrow */
  "arrow-up-right": `<path d="M4.5 11.5 11.5 4.5"/><path d="M5.8 4.5h5.7v5.7"/>`,
  /* note deck */
  "chevron-left": `<path d="M10 3.5 5.5 8l4.5 4.5"/>`,
  /* note deck */
  "chevron-right": `<path d="M6 3.5 10.5 8 6 12.5"/>`,
} as const;

export type IconName = keyof typeof paths;
export const iconNames = Object.keys(paths) as IconName[];

/** an icon as a markup string; cls: your own class for size and spacing */
export const icon = (name: IconName, cls = "ic") =>
  `<svg class="${cls}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
