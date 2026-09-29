import * as THREE from "three";
import { TILE, DRAPE, seedDelay, mossAt, mossKnob, fbm } from "./garden-surface";
import { buildSheet, RISE, type Garden } from "./garden-sheet";

/** length of the pile, world units */
export const FUR = .05;
const MAX_SHELLS = 22;

/** how far the pile has come at a vertex, and the sway of its tips: shared by the layers and by the hull */
const PILE_GLSL = `
  vec3 lifted(vec3 from,vec3 along,float layer){
    float pile=smoothstep(aDelay+.02,aDelay+.30,uGarden);
    vec3 p=from+along*(layer*uFur*pile);
    p.xz+=vec2(sin(uGardenTime*1.3+from.x*9.+from.z*5.),cos(uGardenTime*1.1+from.z*8.-from.x*4.))*(.008*layer*layer*pile);
    return p;
  }`;

/** Moss as a shell-textured pile.
    The first version of the pile was 74 000 instanced blades about a pixel wide. Geometry that thin can only alias:
    it shimmered and looked pixelated, worst on screens where the canvas is upscaled. Real-time moss and fur are
    normally done the other way round: the cushion surface is drawn a dozen or two times, each copy pushed a little
    further out along the normal, and in every copy a procedural mask keeps only the cross-sections of the strands,
    thinner the higher the layer. There are no thin triangles at all, the edge of every strand is antialiased by the
    GPU (alpha to coverage on the multisampled target), and the number of layers is a quality dial that weak devices
    can turn down.
    Three draws: the cushion (casts the shadow), a hull at the tips, and all the layers as one instanced call. */
export function buildMoss(garden: Garden, world: THREE.Group) {
  const uniforms = { uShells: { value: 16 }, uFur: { value: FUR }, uDensity: { value: 60 } };
  const base = buildSheet(garden, {
    x0: -TILE.width / 2 - DRAPE - .1, x1: TILE.width / 2 + DRAPE + .1, z0: -TILE.depth / 2 - DRAPE - .1, z1: TILE.depth / 2 + DRAPE + .1,
    res: garden.small ? 76 : 106, mode: "grow",
    material: new THREE.MeshLambertMaterial({ color: "#ffffff", vertexColors: true }),
    /* the front runs over the top first and then creeps down each wall */
    sample: (x, z, anchor) => {
      const h = mossAt(x, z, anchor);
      /* shade: 0 in the creases between the knobs, 1 on their crowns; the pile reads it from the vertex colour.
         The height of the cushion counts too: a tall mound is lighter than the carpet around it */
      const crown = anchor.wall > 0 ? .3 + fbm(x * 7, z * 7) * .5 : mossKnob(x, z) * .5 + fbm(x * 6, z * 6) * .22 + Math.min(1, h / .3) * .28;
      return { h, delay: seedDelay(anchor.bx, anchor.bz) + Math.min(1, anchor.wall) * .07, shade: crown };
    },
    /* what shows between the strands: deep, almost black green */
    tint: (shade, out) => out.setRGB(.012 + shade * .02, .022 + shade * .045, .006 + shade * .009),
  });
  world.add(base);

  const vertexHead = `uniform float uGarden, uGardenTime, uShells, uFur;
attribute vec3 aRest; attribute float aDelay; attribute vec2 aGrid;
varying float vShell; varying vec2 vGrid;
${PILE_GLSL}
`;

  /* The hull: the same surface at the height of the tips, dark, drawn before the layers and without writing depth.
     It gives the pile a clean antialiased silhouette and marks all of it opaque in the alpha of the target, which the
     layers themselves cannot do (see the colour mask below). Between the strands it shows as the dark of the roots. */
  const hullMaterial = new THREE.MeshLambertMaterial({ color: new THREE.Color(1.8, 2.0, 1.7), vertexColors: true, depthWrite: false });
  hullMaterial.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms, { uGarden: garden.growth, uGardenTime: garden.clock });
    shader.vertexShader = (vertexHead + shader.vertexShader).replace("#include <begin_vertex>", `
      vec3 transformed=lifted(mix(aRest,position,${RISE}),normal,1.);
      vShell=1.; vGrid=aGrid;`);
  };
  const hull = new THREE.Mesh(base.geometry, hullMaterial);
  hull.frustumCulled = false; hull.renderOrder = 1;
  world.add(hull);

  const material = new THREE.MeshLambertMaterial({ color: "#ffffff", vertexColors: true, alphaToCoverage: true });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms, { uGarden: garden.growth, uGardenTime: garden.clock });
    shader.vertexShader = (vertexHead + shader.vertexShader).replace("#include <begin_vertex>", `
      float layer=(float(gl_InstanceID)+1.)/uShells;
      vec3 transformed=lifted(mix(aRest,position,${RISE}),normal,layer);
      vShell=layer; vGrid=aGrid;`);
    shader.fragmentShader = `uniform float uDensity;
varying float vShell; varying vec2 vGrid;
/* Integer hash of a lattice cell and a salt: the mixer of our Hash Kit (shelf/items/hash-kit).
   Cells reach a few hundred and integers, unlike a sine hash, do not care how far from the origin they are. */
uint mossMix(uint x){ x^=x>>16; x*=0x3f9c86cbu; x^=x>>14; x*=0x1ae9dacfu; x^=x>>15; return x; }
float cellHash(vec2 cell,uint salt){
  uvec2 q=uvec2(ivec2(cell));
  return float(mossMix(mossMix(mossMix(salt)^q.x)^q.y)>>8)*(1./16777216.);
}
/* One lattice of strands: a strand to a cell, some cells empty, centres well scattered. Returns coverage and hands
   back what the colour needs: how far up its strand this layer is, a random for the hue, and whether it is a tall one. */
float strands(vec2 uv,uint seed,out float up,out float hue,out float tall){
  vec2 cell=floor(uv);
  float h1=cellHash(cell,seed), present=step(.16,cellHash(cell,seed+1u));
  hue=cellHash(cell,seed+2u); tall=step(.93,cellHash(cell,seed+3u));
  float len=mix(.36+.5*h1*h1,1.,tall);
  up=vShell/len;
  if(up>1.||present<.5) return 0.;
  vec2 jitter=(vec2(cellHash(cell,seed+4u),cellHash(cell,seed+5u))-.5)*.62;
  // the cross-section of a strand shrinks towards its tip
  float radius=(.34-.08*tall)*sqrt(1.-up);
  float dist=length(fract(uv)-.5-jitter);
  float soft=fwidth(dist)*1.1+1e-4;
  return 1.-smoothstep(radius-soft,radius+soft,dist);
}
${shader.fragmentShader}`
      .replace("#include <map_fragment>", `
      /* Two lattices at different scales, one turned against the other, both bent by a slow warp: rows of a single
         grid read as a rubber mat, this reads as growth. */
      vec2 warp=vec2(sin(vGrid.y*7.3+vGrid.x*2.1),cos(vGrid.x*6.1-vGrid.y*1.7))*.035;
      vec2 ga=(vGrid+warp)*uDensity;
      vec2 gb=mat2(.7986,-.6018,.6018,.7986)*(vGrid-warp*1.4)*uDensity*1.37+31.7;
      float upA,hueA,tallA,upB,hueB,tallB;
      float sa=strands(ga,0u,upA,hueA,tallA), sb=strands(gb,8u,upB,hueB,tallB);
      float strand=max(sa,sb);
      if(strand<.04) discard;
      float pick=step(sa,sb);
      float up=mix(upA,upB,pick), hue=mix(hueA,hueB,pick), tall=mix(tallA,tallB,pick);
      #include <map_fragment>`)
      .replace("#include <color_fragment>", `
      #include <color_fragment>
      // dark at the root, yellow-green at the tip: the depth of the pile comes from colour, not from shadow maps
      float crown=clamp((vColor.g-.022)/.045,0.,1.);
      float rise=pow(up,1.25);
      vec3 rootColor=vec3(.010,.026,.006)*(1.+crown);
      vec3 tipColor=mix(vec3(.050,.115,.020),vec3(.17,.26,.052),hue)*(.38+.98*crown);
      // here and there a dry, ochre strand and a tall pale one
      tipColor=mix(tipColor,vec3(.30,.27,.085),step(.9,hue)*.5);
      tipColor=mix(tipColor,vec3(.40,.46,.16),tall*.6);
      diffuseColor.rgb=mix(rootColor,tipColor,rise);
      diffuseColor.a=strand;`)
      .replace("#include <opaque_fragment>", `
      // velvet: moss lights up where you look along it
      float sheen=pow(1.-abs(dot(normalize(vNormal),normalize(vViewPosition))),3.);
      outgoingLight+=tipColor*sheen*.5*rise;
      #include <opaque_fragment>`);
  };
  const shells = new THREE.InstancedMesh(base.geometry, material, MAX_SHELLS);
  const identity = new THREE.Matrix4();
  for (let i = 0; i < MAX_SHELLS; i++) shells.setMatrixAt(i, identity);
  shells.frustumCulled = false; shells.renderOrder = 2;
  shells.castShadow = false;
  /* shadow lookups on twenty overlapping layers are what a weak GPU cannot afford */
  shells.receiveShadow = !garden.small;
  /* Alpha to coverage takes its mask from the alpha the shader writes, and that alpha would also land in the target:
     a half-covered pixel in the middle of the moss would come out half transparent and let the page through. The hull
     has already written alpha 1 over the whole pile, so the layers leave the alpha channel alone.
     three keeps its own copy of the colour mask (all on), so it does not fight this. */
  shells.onBeforeRender = renderer => renderer.getContext().colorMask(true, true, true, false);
  shells.onAfterRender = renderer => renderer.getContext().colorMask(true, true, true, true);
  world.add(shells);

  return {
    /** how many layers to draw: the quality dial */
    setShells(count: number) { shells.count = Math.min(MAX_SHELLS, Math.max(4, Math.round(count))); uniforms.uShells.value = shells.count; },
    /** cells of the strand lattice per world unit; kept at a few device pixels a cell, so a strand never falls under a
        pixel and shimmers */
    setDensity(perUnit: number) { uniforms.uDensity.value = perUnit; },
  };
}
