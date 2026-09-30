// Demo: a music app with five tabs. Covers are drawn here as small SVG compositions.
import { minimizingTabBar } from '../variants/html/tab-bar.js';

const bars = (heights) => heights.map((h, i) => `<rect x="${11 + i * 4.6}" y="${50 - h / 2}" width="2.4" height="${h}" rx="1.2" fill="#2f2f2f"/>`).join('');
const dots = () => {
  let s = '';
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) if ((r * 3 + c * 5) % 7 !== 2) s += `<circle cx="${17 + c * 11}" cy="${17 + r * 11}" r="2.3" fill="#b24a3b"/>`;
  return s;
};
const squares = () => {
  let s = '';
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) s += `<rect x="${17 + c * 23}" y="${17 + r * 23}" width="19" height="19" rx="5.5" fill="#6b2d3c" opacity="${[1, 0.35, 0.7, 0.55, 1, 0.3, 0.8, 0.45, 1][r * 3 + c]}"/>`;
  return s;
};

const ART = {
  tidewater: '<rect width="100" height="100" fill="#1f4e5f"/><circle cx="70" cy="30" r="12" fill="#f0a04b"/><path d="M-5 58q13-8 26 0t26 0 26 0 26 0 26 0M-5 70q13-8 26 0t26 0 26 0 26 0 26 0M-5 82q13-8 26 0t26 0 26 0 26 0 26 0" fill="none" stroke="#e8dcc4" stroke-width="3.5"/>',
  lowsun: '<rect width="100" height="100" fill="#f2e6d0"/><circle cx="50" cy="60" r="28" fill="#d9572b"/><rect y="60" width="100" height="40" fill="#23221f"/><path d="M16 70h68M26 80h48M36 90h28" stroke="#d9572b" stroke-width="2.6"/>',
  harbours: '<rect width="100" height="100" fill="#dfe7ea"/><rect y="70" width="100" height="30" fill="#27465e"/><path d="M30 68 50 24v44z" fill="#f7f3ea"/><path d="M53 68V32l17 36z" fill="#c8553d"/><path d="M24 70h52l-6 9H30z" fill="#1b2d3c"/>',
  freight: '<rect width="100" height="100" fill="#14161c"/><circle cx="74" cy="24" r="9" fill="#e9e4d8"/><path d="M46 44 18 100M54 44l28 56" stroke="#f5c542" stroke-width="2.5"/><path d="M40 56h20M34 68h32M27 82h46M20 96h60" stroke="#f5c542" stroke-width="1.6" opacity=".7"/>',
  machines: `<rect width="100" height="100" fill="#e8c9c0"/>${squares()}`,
  glasshouse: '<rect width="100" height="100" fill="#cfe0c3"/><path d="M26 86V48a24 24 0 0 1 48 0v38z" fill="#3f6e4a"/><path d="M50 24v62M26 58h48M26 72h48M36 29v57M64 29v57" stroke="#e9f1e2" stroke-width="1.4" opacity=".75"/><rect x="18" y="86" width="64" height="3" rx="1.5" fill="#2c4a33"/>',
  field: `<rect width="100" height="100" fill="#efe9dd"/>${bars([8, 20, 34, 16, 44, 28, 54, 30, 20, 40, 26, 12, 32, 48, 24, 10, 30, 18])}`,
  north: '<rect width="100" height="100" fill="#2d3a55"/><path d="M0 84 32 40l20 26 14-18 34 36v16H0z" fill="#9fb4d8"/><path d="M32 40 40.5 51 36 49 32 53 28.5 49.5 26 48.3z" fill="#eef1f7"/><circle cx="76" cy="26" r="5" fill="#eef1f7"/>',
  salt: `<rect width="100" height="100" fill="#f4f1ea"/>${dots()}<rect y="44" width="100" height="12" fill="#1d1d1f"/>`,
  kite: '<rect width="100" height="100" fill="#f3c64d"/><path d="M58 14 78 36 58 62 38 36z" fill="#1f3c88"/><path d="M58 14v48M38 36h40" stroke="#f3c64d" stroke-width="1.4"/><path d="M58 62q-6 8 0 14t0 14" fill="none" stroke="#1f3c88" stroke-width="1.6"/><path d="m52 71 6 2-6 3zm6 13 6 2-6 3z" fill="#c8553d"/>',
  after: '<rect width="100" height="100" fill="#0f0f10"/><circle cx="50" cy="50" r="26" fill="none" stroke="#f2efe8" stroke-width="3"/><circle cx="68" cy="32" r="4" fill="#e0703a"/>',
  copper: '<rect width="100" height="100" fill="#b86b3e"/><path d="M0 100V40a60 60 0 0 1 60 60z" fill="#e9c7a6"/><path d="M0 100V64a36 36 0 0 1 36 36z" fill="#7a3b1d"/><circle cx="78" cy="24" r="8" fill="#e9c7a6"/>'
};
const art = (k) => `<span class="art"><svg viewBox="0 0 100 100" aria-hidden="true">${ART[k]}</svg></span>`;
const chev = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';
const sec = (t) => `<h2 class="sec">${t}${chev.replace('chev', '')}</h2>`;
const tile = ([k, t, a]) => `<a class="tile" href="#" aria-label="${t}, ${a}">${art(k)}<b>${t}</b><span>${a}</span></a>`;
const cell = ([k, t, a]) => `<a class="cell" href="#" aria-label="${t}, ${a}">${art(k)}<b>${t}</b><span>${a}</span></a>`;

const panels = {
  home: `
    <h1 class="title">Home</h1>
    <p class="hint">Scroll down and the bar tucks into a pill. Slide a finger along it to switch tabs.</p>
    ${sec('Top Picks')}
    <div class="hrow">
      <a class="pick" href="#">${art('lowsun')}<small>Made for you</small><b>Evening Wind-Down</b><span>Maren &amp; the Quiet, Isla Verde and more</span></a>
      <a class="pick" href="#">${art('north')}<small>Because you played Weft</small><b>Northbound</b><span>Sable Park</span></a>
      <a class="pick" href="#">${art('copper')}<small>New station</small><b>Copper Hours Radio</b><span>Delft Tapes and similar artists</span></a>
    </div>
    ${sec('Recently Played')}
    <div class="hrow">${[
      ['harbours', 'Paper Harbours', 'Isla Verde'], ['freight', 'Night Freight', 'The Linden Sound'],
      ['machines', 'Soft Machines', 'Ode Kiosk'], ['glasshouse', 'Glasshouse', 'Ruth Anand'],
      ['field', 'Field Recordings, Vol. 2', 'Weft'], ['kite', 'Kite Season', 'Bram Okafor']
    ].map(tile).join('')}</div>
    ${sec('Made for You')}
    <div class="grid">${[
      ['after', 'Late Train Mix', 'Updated Friday'], ['salt', 'Discovery Mix', 'Updated Wednesday'],
      ['kite', 'Favourites Mix', 'Updated today'], ['field', 'Focus Flow', 'Quiet, steady, wordless'],
      ['machines', 'Rainy Sunday', 'Slow and warm'], ['tidewater', 'Commute Mix', 'For the 08:12 train']
    ].map(cell).join('')}</div>
    ${sec('Friends Are Listening')}
    <div class="hrow">${[
      ['copper', 'Copper Hours', 'Delft Tapes'], ['lowsun', 'Low Sun Ritual', 'Maren & the Quiet'],
      ['north', 'Northbound', 'Sable Park'], ['after', 'Afterlight', 'Nine Rooms']
    ].map(tile).join('')}</div>`,
  new: `
    <h1 class="title">New</h1>
    ${sec('New Releases')}
    <div class="grid">${[
      ['glasshouse', 'Glasshouse', 'Ruth Anand'], ['north', 'Northbound', 'Sable Park'],
      ['salt', 'Salt & Static', 'June Harlow'], ['kite', 'Kite Season', 'Bram Okafor'],
      ['after', 'Afterlight', 'Nine Rooms'], ['copper', 'Copper Hours', 'Delft Tapes'],
      ['harbours', 'Paper Harbours', 'Isla Verde'], ['lowsun', 'Low Sun Ritual', 'Maren & the Quiet']
    ].map(cell).join('')}</div>
    ${sec('Coming Friday')}
    <ul class="rows">${[
      ['freight', 'Night Freight (Deluxe)', 'The Linden Sound · 4 October'],
      ['field', 'Field Recordings, Vol. 3', 'Weft · 4 October'],
      ['machines', 'Soft Machines Remixed', 'Ode Kiosk · 11 October']
    ].map(([k, t, a]) => `<li>${art(k)}<span class="txt"><b>${t}</b><span>${a}</span></span></li>`).join('')}</ul>`,
  radio: `
    <h1 class="title">Radio</h1>
    ${sec('On Air')}
    <div class="hrow">
      <a class="pick" href="#">${art('freight')}<small><span class="live">LIVE</span>20:00 to 22:00</small><b>Night Freight Radio</b><span>Slow trains, late records, no talking</span></a>
      <a class="pick" href="#">${art('tidewater')}<small><span class="live">LIVE</span>Until midnight</small><b>Harbour FM</b><span>Songs about water, mostly</span></a>
    </div>
    ${sec('Stations')}
    <ul class="rows">${[
      ['after', 'Slow Signal', 'Ambient and drone'], ['copper', 'Dutch Indie Hour', 'Every weekday at 18:00'],
      ['field', 'Field & Forest', 'Recorded outside'], ['kite', 'Sunday Kites', 'Bright folk and pop'],
      ['north', 'Northbound Radio', 'Based on Sable Park'], ['salt', 'Static Club', 'Leftfield electronic']
    ].map(([k, t, a]) => `<li>${art(k)}<span class="txt"><b>${t}</b><span>${a}</span></span>${chev}</li>`).join('')}</ul>`,
  library: `
    <h1 class="title">Library</h1>
    <ul class="rows">${['Playlists', 'Artists', 'Albums', 'Songs', 'Downloaded'].map((t) => `<li><span class="txt"><b>${t}</b></span>${chev}</li>`).join('')}</ul>
    ${sec('Recently Added')}
    <div class="grid">${[
      ['tidewater', 'Tidewater', 'Hollow Coast'], ['glasshouse', 'Glasshouse', 'Ruth Anand'],
      ['freight', 'Night Freight', 'The Linden Sound'], ['field', 'Field Recordings, Vol. 2', 'Weft'],
      ['salt', 'Salt & Static', 'June Harlow'], ['machines', 'Soft Machines', 'Ode Kiosk']
    ].map(cell).join('')}</div>`,
  search: `
    <h1 class="title">Search</h1>
    <label class="field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.2"/><path d="m15.6 15.6 4 4"/></svg><input type="search" placeholder="Artists, songs, lyrics" aria-label="Search music"></label>
    ${sec('Browse Categories')}
    <div class="cats">${[
      ['Focus', '#3b6e8f'], ['Dinner', '#a4513a'], ['Rainy Day', '#56636f'], ['Dutch Indie', '#b87a24'],
      ['Jazz', '#2f5249'], ['Running', '#8a3b52'], ['Sleep', '#2b3350'], ['Live', '#6d5a3a']
    ].map(([t, c]) => `<a class="cat" href="#" style="background:${c}">${t}</a>`).join('')}</div>`
};

const main = document.getElementById('panels');
main.innerHTML = Object.entries(panels)
  .map(([id, html], i) => `<section class="panel${i ? '' : ' is-active'}" id="panel-${id}" role="tabpanel" aria-labelledby="tab-${id}" tabindex="-1"${i ? ' inert' : ''}>${html}</section>`)
  .join('');
document.querySelectorAll('a[href="#"]').forEach((a) => a.addEventListener('click', (e) => e.preventDefault()));
document.querySelector('[data-art]').innerHTML = `<svg viewBox="0 0 100 100">${ART.tidewater}</svg>`;

const nav = document.querySelector('.mtb');
const sections = [...main.querySelectorAll('.panel')];
const bar = minimizingTabBar(nav, { scroller: sections[0] });

nav.addEventListener('tabchange', (e) => {
  const id = e.detail.tab.getAttribute('aria-controls');
  for (const p of sections) {
    const on = p.id === id;
    p.classList.toggle('is-active', on);
    p.inert = !on;
  }
  bar.setScroller(document.getElementById(id));
});

// play / pause in the accessory
const play = nav.querySelector('[data-play]');
play.addEventListener('click', () => {
  const playing = play.getAttribute('aria-label') === 'Pause';
  play.setAttribute('aria-label', playing ? 'Play' : 'Pause');
  play.querySelector('svg').innerHTML = playing
    ? '<path class="solid" d="M7.5 5.5v13l11-6.5z"/>'
    : '<path d="M8.5 6v12M15.5 6v12"/>';
});

// Frozen states for the poster: ?shot=1 (the lens mid-scrub), ?shot=collapsed (tucked away, the accessory merged into the row)
const shot = new URLSearchParams(location.search).get('shot');
if (shot) {
  const home = sections[0];
  home.scrollTop = shot === 'collapsed' ? 430 : 0;
  setTimeout(() => {
    if (shot === 'collapsed') return bar.collapse();
    bar.expand();
    const barEl = nav.querySelector('.mtb__bar');
    const r = barEl.getBoundingClientRect();
    const tw = (r.width - 8) / 5;
    const opts = (x) => ({ bubbles: true, pointerId: 7, pointerType: 'touch', button: 0, clientX: x, clientY: r.top + r.height / 2 });
    barEl.dispatchEvent(new PointerEvent('pointerdown', opts(r.left + 4 + tw * 2.5)));
    barEl.dispatchEvent(new PointerEvent('pointermove', opts(r.left + 4 + tw * 3.38)));
  }, 80);
}
