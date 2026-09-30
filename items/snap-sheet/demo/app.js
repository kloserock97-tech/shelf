// Demo: a map with a place card. The map is drawn here: canal rings around a point off-screen, bridges as spokes.
import { snapSheet } from '../variants/html/snap-sheet.js';

const CX = 620;
const CY = 1000;
const f = (n) => n.toFixed(1);
const at = (r, a) => [CX + r * Math.cos((a * Math.PI) / 180), CY + r * Math.sin((a * Math.PI) / 180)];
const arc = (r, a0 = 180, a1 = 278) => {
  const [x0, y0] = at(r, a0);
  const [x1, y1] = at(r, a1);
  return `M${f(x0)} ${f(y0)}A${r} ${r} 0 0 1 ${f(x1)} ${f(y1)}`;
};
const spoke = (a, r0 = 470, r1 = 1080) => {
  const [x0, y0] = at(r0, a);
  const [x1, y1] = at(r1, a);
  return `M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`;
};

const CANALS = [540, 650, 760, 870];
const NAMES = { 650: 'Molengracht', 760: 'Tuingracht', 870: 'Zoutgracht' };
const SPOKES = [203, 215, 227, 239, 251, 263, 275];

function drawMap() {
  let s = '<rect class="m-land" width="390" height="844"/>';
  // a few built-up blocks between the rings, for texture
  for (let i = 0; i < CANALS.length - 1; i++) {
    const r0 = CANALS[i] + 22;
    const r1 = CANALS[i + 1] - 22;
    for (let j = 0; j < SPOKES.length - 1; j++) {
      if ((i + j) % 3 === 1) continue;
      const a0 = SPOKES[j] + 1.4;
      const a1 = SPOKES[j + 1] - 1.4;
      const [p0, p1, p2, p3] = [at(r0, a0), at(r0, a1), at(r1, a1), at(r1, a0)];
      s += `<path class="m-block" d="M${f(p0[0])} ${f(p0[1])}A${r0} ${r0} 0 0 1 ${f(p1[0])} ${f(p1[1])}L${f(p2[0])} ${f(p2[1])}A${r1} ${r1} 0 0 0 ${f(p3[0])} ${f(p3[1])}Z"/>`;
    }
  }
  s += '<path class="m-park" d="M300 612c30-6 62-2 90 8v214H268c-10-40-8-92 6-150 6-30 12-62 26-72z"/>';
  s += '<text class="m-slabel" x="318" y="742">Tuinpark</text>';
  s += '<path class="m-water" d="M0 0h390v78c-70 14-140-8-210 8S50 84 0 96z"/>';
  s += '<text class="m-wlabel" x="150" y="70">Oosterhaven</text>';
  // quays either side of every canal, then the water, then the bridges
  for (const r of CANALS) s += `<path class="m-street" stroke-width="6" d="${arc(r - 17)}"/><path class="m-street" stroke-width="6" d="${arc(r + 17)}"/>`;
  for (const r of CANALS) s += `<path class="m-canal" id="c${r}" d="${arc(r)}"/>`;
  for (const a of SPOKES) s += `<path class="m-street" stroke-width="7" d="${spoke(a)}"/>`;
  s += '<path class="m-street" stroke-width="4" d="M0 214 118 176 204 162M0 420l70-10"/>';
  s += '<text class="m-slabel" transform="translate(28 204) rotate(-17)">Bloemstraat</text>';
  for (const [r, name] of Object.entries(NAMES)) {
    s += `<text class="m-wlabel" dy="3.5"><textPath href="#c${r}" startOffset="${r === '760' ? '58%' : '34%'}">${name}</textPath></text>`;
  }
  // points of interest
  const poi = (x, y, label, glyph, dx = 12) =>
    `<g class="m-poi" transform="translate(${x} ${y})"><circle r="8"/><path d="${glyph}"/><text x="${dx}" y="3.5">${label}</text></g>`;
  s += poi(318, 244, 'Bakery Mol', 'M-3.5 1.5h7M-2.5 1.5l-.8-4h6.6l-.8 4');
  s += poi(70, 520, 'Public Library', 'M-3.5-2.5v5h7v-5M0-2.5v5');
  s += poi(250, 560, 'Tram 13', 'M-3-3h6v4.5h-6zM-2 3l-1 1.5M2 3l1 1.5');
  // you
  s += '<g class="m-me" transform="translate(262 432)"><circle class="halo" r="24"/><circle class="ring" r="9"/><circle class="dot" r="6"/></g>';
  // the selected place
  s += `<g class="m-sel" transform="translate(150 222)">
    <path class="pin" d="M0 0c-3-7-17-15-17-30a17 17 0 0 1 34 0C17-15 3-7 0 0z"/>
    <path class="glyph" d="M-7-36h11v5.5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM4-34h1.6a2.6 2.6 0 0 1 0 5.2H4"/>
    <text y="16" text-anchor="middle">Tuin Coffee</text></g>`;
  document.getElementById('map').innerHTML = s;
}

const PHOTOS = [
  ['The window seat', '<rect width="150" height="112" fill="#d8c7ad"/><rect x="22" y="12" width="106" height="76" rx="3" fill="#a9c6d6"/><path d="M75 12v76M22 50h106" stroke="#f3ece0" stroke-width="4"/><rect x="16" y="86" width="118" height="9" fill="#8a6a4d"/><circle cx="40" cy="76" r="11" fill="#4f7a4a"/><circle cx="52" cy="71" r="9" fill="#6a9a5f"/><rect x="36" y="80" width="20" height="10" fill="#b8643c"/><rect x="92" y="74" width="12" height="12" rx="2" fill="#f4efe6"/>'],
  ['A flat white', '<rect width="150" height="112" fill="#6d4c38"/><circle cx="72" cy="56" r="36" fill="#f4efe6"/><circle cx="72" cy="56" r="25" fill="#e8dccb"/><circle cx="72" cy="56" r="20" fill="#9a6440"/><path d="M64 50a6 6 0 0 1 8 0 6 6 0 0 1 8 0c0 7-8 12-8 14 0-2-8-7-8-14z" fill="#f4e9da"/><rect x="106" y="51" width="18" height="10" rx="5" fill="#f4efe6"/>'],
  ['The counter', '<rect width="150" height="112" fill="#efe4d2"/><rect x="10" y="64" width="130" height="34" rx="4" fill="#d4c2a6"/><ellipse cx="40" cy="62" rx="20" ry="11" fill="#c98a45"/><ellipse cx="80" cy="61" rx="18" ry="12" fill="#b8733a"/><ellipse cx="116" cy="63" rx="16" ry="10" fill="#d69d57"/><path d="M31 57q9-6 18 0M71 55q9-6 18 0" stroke="#e8c48f" stroke-width="2" fill="none"/><rect x="18" y="16" width="114" height="26" rx="4" fill="#3e3a36"/><path d="M28 26h40M28 33h28M84 26h36M84 33h24" stroke="#efe4d2" stroke-width="2" opacity=".7"/>'],
  ['The terrace', '<rect width="150" height="112" fill="#c4d8cc"/><rect y="80" width="150" height="32" fill="#8da0ac"/><path d="M0 84h150" stroke="#e8e2d4" stroke-width="5"/><rect x="18" y="46" width="50" height="6" rx="3" fill="#f2f0ea"/><path d="M43 52v28M30 80h26" stroke="#3b3b3b" stroke-width="3"/><rect x="82" y="42" width="50" height="6" rx="3" fill="#f2f0ea"/><path d="M107 48v32M94 80h26" stroke="#3b3b3b" stroke-width="3"/><path d="M0 14h150" stroke="#e7dccb" stroke-width="12"/><path d="M10 14v20M40 14v20M70 14v20M100 14v20M130 14v20" stroke="#b0664a" stroke-width="10" opacity=".5"/>']
];

const REVIEWS = [
  ['Lotte V.', '2 weeks ago', 5, 'The window seat gets the morning sun, and the cardamom bun is worth the queue.'],
  ['Sam O.', 'Last month', 4, 'Great filter coffee, a bit loud around noon. They let me sit with a laptop for two hours without a look.'],
  ['Inès R.', 'Last month', 5, 'Friendly people, oat flat white done right, and a dog biscuit jar by the door.'],
  ['Kofi A.', 'August', 4, 'Small inside, so go early or take it to the canal. Card only.']
];
const STAR = '<svg class="star" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z"/></svg>';

drawMap();
document.getElementById('photos').innerHTML = PHOTOS.map(([alt, svg]) => `<svg role="img" aria-label="${alt}" viewBox="0 0 150 112">${svg}</svg>`).join('');
document.getElementById('reviews').innerHTML = REVIEWS.map(([who, when, n, text]) => `<article class="review"><header>${who}<span>${when}</span></header><div class="stars" role="img" aria-label="${n} out of 5">${STAR.repeat(n)}</div><p>${text}</p></article>`).join('');
document.querySelectorAll('a[href="#"]').forEach((a) => a.addEventListener('click', (e) => e.preventDefault()));

const q = new URLSearchParams(location.search);
const root = document.querySelector('.ss');
if (['half', 'full'].includes(q.get('detent'))) root.dataset.detent = q.get('detent');
const sheet = snapSheet(root, { peek: 184, top: 62, half: 0.52 });
document.querySelector('.place__btns [aria-label="Close"]').addEventListener('click', () => sheet.goTo('peek'));

// ?shot=1 freezes the sheet on its way from half to full, so the poster shows the morph; ?shot=<0…2> picks the spot
const shot = q.get('shot');
if (shot) requestAnimationFrame(() => sheet.freeze(shot === '1' ? 1.32 : Number(shot)));
