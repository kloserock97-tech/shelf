// The Shelf mark as browser icons, from the same shapes as the sidebar logo (Logo.astro) and public/favicon.svg:
// favicon.ico (16, 32, 48) for browsers and Windows, apple-touch-icon.png (180) for Safari, iPhone and the tiles of
// new-tab pages, icon-192/512.png and a maskable 512 for the web manifest. Without the raster ones a new-tab tile or
// Safari draws a letter "S" from the page title instead of the mark. Run: npm run icons (sharp comes with Astro).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public');
const BLUE = '#0073e6'; // --accent in the light theme, the colour of the mark's tile in the sidebar

// The mark on a 32 grid: two things on a plank and one below it. Its box is x 5..27, y 7..27.
const MARK = `
  <rect x="7" y="7" width="7" height="10" rx="2" fill="#fff"/>
  <rect x="16" y="11" width="9" height="6" rx="2" fill="#fff" fill-opacity=".72"/>
  <rect x="5" y="18.5" width="22" height="1.5" rx=".75" fill="#fff"/>
  <rect x="8" y="22" width="11" height="5" rx="2.5" fill="#fff" fill-opacity=".72"/>`;

// round: the tile with corners, as in the tab. bleed: a full square for masks that round it themselves (iOS, Android);
// the mark is centred and scaled into the safe zone.
const svg = ({ round, scale = 1 }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32"${round ? ' rx="8"' : ''} fill="${BLUE}"/>
  <g transform="translate(16 ${round ? 17 : 16}) scale(${scale}) translate(-16 -17)">${MARK}</g>
</svg>`;

const png = (source, size) => sharp(Buffer.from(source), { density: 72 * (size / 32) * 4 }).resize(size, size).png().toBuffer();

// ICO holding PNG images: a 6-byte header, a 16-byte entry per image, then the images.
function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e);
    head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt8(0, e + 2);
    head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...images.map((i) => i.data)]);
}

const round = svg({ round: true });
fs.writeFileSync(path.join(OUT, 'favicon.svg'), round.replace(/\n\s*/g, ''));
const small = await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(round, size) })));
fs.writeFileSync(path.join(OUT, 'favicon.ico'), ico(small));
fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), await png(svg({ round: false, scale: 0.9 }), 180));
fs.writeFileSync(path.join(OUT, 'icon-192.png'), await png(round, 192));
fs.writeFileSync(path.join(OUT, 'icon-512.png'), await png(round, 512));
// Android's circle keeps 80% of the square: the mark's box has to fit inside it
fs.writeFileSync(path.join(OUT, 'icon-mask-512.png'), await png(svg({ round: false, scale: 0.78 }), 512));
console.log('icons: favicon.svg, favicon.ico (16/32/48), apple-touch-icon.png, icon-192.png, icon-512.png, icon-mask-512.png');
