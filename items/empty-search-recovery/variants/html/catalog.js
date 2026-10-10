/* A made-up rainwear catalog of 60 products for the Empty Search Recovery example.
   Seeded, so every load builds the same shop. Waterproofing costs extra, which is why
   "Under €40" and "Waterproof" rarely meet in a rain jacket. */
(() => {
  // seeded random numbers: a Weyl sequence through our own 32-bit mixer (items/hash-kit)
  const SALT = 0xb31c96c9;
  function hashU(x) {
    x ^= x >>> 16; x = Math.imul(x, 0x3f9c86cb);
    x ^= x >>> 14; x = Math.imul(x, 0x1ae9dacf);
    x ^= x >>> 15;
    return x >>> 0;
  }
  function makeRandom(seed = 1) {
    let s = seed >>> 0;
    return () => {
      s = (s + SALT) >>> 0;
      return hashU(s) / 4294967296;
    };
  }

  const KINDS = [
    { kind: 'Rain Jacket', shape: 'jacket', n: 16, price: [27, 45], wp: 0.55, wpAdd: 19, hood: 0.9, pack: 0.4 },
    { kind: 'Shell Jacket', shape: 'jacket', n: 8, price: [72, 128], wp: 1, wpAdd: 0, hood: 0.8, pack: 0.3 },
    { kind: 'Windbreaker', shape: 'jacket', n: 8, price: [26, 48], wp: 0, wpAdd: 0, hood: 0.6, pack: 0.85, extra: ['jacket'] },
    { kind: 'Rain Poncho', shape: 'poncho', n: 7, price: [17, 36], wp: 1, wpAdd: 0, hood: 1, pack: 0.9 },
    { kind: 'Rain Boots', shape: 'boots', n: 7, price: [34, 72], wp: 1, wpAdd: 0, hood: 0, pack: 0 },
    { kind: 'Rain Pants', shape: 'pants', n: 7, price: [28, 52], wp: 0.7, wpAdd: 12, hood: 0, pack: 0.6 },
    { kind: 'Fleece', shape: 'fleece', n: 7, price: [24, 56], wp: 0, wpAdd: 0, hood: 0.4, pack: 0.2, extra: ['pullover'] }
  ];
  const NAMES = ['Drizzle', 'Harbor', 'Fjord', 'Squall', 'Tideline', 'Ridge', 'Marsh', 'Gale', 'Cove', 'Ferry', 'Moor',
    'Delta', 'Lantern', 'Pebble', 'Breakwater', 'Cobble', 'Estuary', 'Puddle', 'Mizzle', 'Shoal', 'Bothy', 'Heron'];
  const COLORS = [
    ['olive', '#7a7d3a'], ['navy', '#2d4a7a'], ['rust', '#b4532a'], ['ochre', '#c99a2e'],
    ['slate', '#5d6b78'], ['sage', '#7f9b7a'], ['plum', '#7d4a6e'], ['red', '#c2413b'], ['teal', '#2f7f7a']
  ];

  /** [{ id, name, kind, shape, color, colorName, price, waterproof, hooded, packable, words }] */
  function makeCatalog(seed = 7) {
    const rnd = makeRandom(seed);
    const out = [];
    let id = 0;
    KINDS.forEach((k, ki) => {
      for (let i = 0; i < k.n; i++) {
        const waterproof = rnd() < k.wp;
        const hooded = rnd() < k.hood;
        const packable = rnd() < k.pack;
        const [lo, hi] = k.price;
        const price = Math.round(lo + rnd() * (hi - lo) + (waterproof ? k.wpAdd : 0));
        const [colorName, color] = COLORS[(i * 4 + ki * 2 + Math.floor(rnd() * 2)) % COLORS.length];
        const name = `${NAMES[(i * 5 + ki * 3) % NAMES.length]} ${k.kind}`;
        const flags = [waterproof && 'waterproof', hooded && 'hooded', packable && 'packable'].filter(Boolean);
        out.push({
          id: `p${++id}`,
          name,
          kind: k.kind,
          shape: k.shape,
          color,
          colorName,
          price,
          waterproof,
          hooded,
          packable,
          words: `${name} ${colorName} ${(k.extra || []).join(' ')} ${flags.join(' ')}`.toLowerCase().split(/\s+/).filter(Boolean)
        });
      }
    });
    return out;
  }

  window.esrCatalog = { makeCatalog };
})();
