// Fingerprints of well-known third-party code: hash and noise constants, tone curves, anti-aliasing schemes, PRNGs,
// shadertoy classics, easing tables and libraries with licences we don't want. A public item must not carry any of
// them — our own replacements live in items/hash-kit (hash, random, dither) and items/edge-aa (edge smoothing).
// Only code is scanned: the notes may name what was replaced.
export const BORROWED = [
  [/1597334673|3812015801|2798796415/, "Dave Hoskins' integer hash (MIT)"],
  [/\b0?\.1031\b|\.1030\s*,\s*\.0973|443\.897/, "Dave Hoskins' Hash without Sine (MIT)"],
  [/43758\.54|12\.9898\s*,\s*78\.233/, 'the fract(sin(…) · 43758.5453) hash'],
  [/127\.1\s*,\s*311\.7|269\.5\s*,\s*183\.3/, "Inigo Quilez' hash constants"],
  [/0x7feb352d|0x846ca68b/i, "Chris Wellons' lowbias32"],
  [/0x85ebca6b|0xc2b2ae35|0xcc9e2d51/i, 'MurmurHash3'],
  [/747796405|2891336453/, 'the PCG hash'],
  [/374761393|668265263|1274126177|2246822519|3266489917/, 'xxHash32 primes'],
  [/0x6d2b79f5|1831565813/i, 'mulberry32'],
  [/123\.34\s*,\s*456\.21/, "The Art of Code's N21 hash"],
  [/52\.9829189|0\.06711056/, "Jorge Jimenez' interleaved gradient noise"],
  [/0\.7548776662|0\.5698402910/, "Martin Roberts' R2 sequence"],
  [/mod289|taylorInvSqrt|1\.79284291400159/, "Ashima / Stefan Gustavson's simplex noise (MIT)"],
  [/\bFXAA_|lumaNW|REDUCE_MIN|SPAN_MAX/, 'FXAA (NVIDIA)'],
  [/min\(abs\(dir\.x\),\s*abs\(dir\.y\)\)|\(1\.0\s*\/\s*3\.0\s*-\s*0\.5\)|\b0\.1667\b/, "FXAA's edge-direction scheme (NVIDIA)"],
  [/mix\(0\.125,\s*0\.2\b|min\(mn,\s*1\.0\s*-\s*mx\)/, 'AMD FidelityFX CAS (MIT)'],
  [/agxDefaultContrast|12\.47393|0\.842479062253094/, 'AgX'],
  [/startCompression\s*=\s*0\.8\s*-\s*0\.04/, 'Khronos PBR Neutral (Apache-2.0)'],
  [/RRTAndODTFit|ACESInputMat|0\.0245786/, 'an ACES fit'],
  [/formuparam|distfading/, "Kali's Star Nest (MIT)"],
  [/triNoise2d/, "nimitz' noise (CC BY-NC-SA)"],
  [/SEA_CHOPPY|octave_m\b/, "TDM's Seascape (CC BY-NC-SA)"],
  [/0\.80?\s*,\s*0\.60?\s*,\s*-0\.60?\s*,\s*0\.80?/, "Inigo Quilez' octave rotation"],
  [/0\.227027|0\.1945946/, "LearnOpenGL's Gaussian weights (CC BY-NC)"],
  [/1\.70158|7\.5625/, "Robert Penner's easing (BSD) / easings.net (GPL)"],
  [/\bgsap\b|GreenSock|ScrollTrigger/i, 'GSAP (its own licence)'],
  [/\blygia\b/i, 'LYGIA (Prosperity licence)']
];
export const CODE = /\.(html?|css|m?js|cjs|jsx|ts|tsx|vue|svelte|glsl|vert|frag|wgsl)$/i;

/** [{ file, line, what }] for every fingerprint in the given text */
export function borrowedIn(text) {
  const hits = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const [re, what] of BORROWED) if (re.test(line)) hits.push({ line: i + 1, what });
  });
  return hits;
}
