import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { TILE, FRONT, GARDEN_DELAY_GLSL, rand } from "./garden-surface";
import type { Garden } from "./garden-sheet";

/** The slab of frosted glass, the shadow it drops, and the captions engraved on it. */
export function buildSlab(garden: Garden, scene: THREE.Scene, world: THREE.Group, isDisposed: () => boolean) {
  /* The canvas is transparent and the page is the backdrop, so the floor is only a shadow catcher. It fades out before
     the edge of the square canvas: a long shadow is never cut by it. */
  const floorMat = new THREE.ShadowMaterial({ color: "#1d1e1f", opacity: .3 });
  floorMat.onBeforeCompile = shader => {
    shader.vertexShader = `varying vec3 vCatch;
${shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
vCatch=(modelMatrix*vec4(position,1.)).xyz;`)}`;
    shader.fragmentShader = `varying vec3 vCatch;
${shader.fragmentShader.replace("#include <tonemapping_fragment>", `gl_FragColor.a*=1.-smoothstep(2.0,3.0,length(vCatch.xz-vec2(.45,.4)));
#include <tonemapping_fragment>`)}`;
  };
  /* The slab hovers: the gap detaches its shadow and lets the thickness read against the backdrop. */
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = -TILE.thickness - .42; floor.receiveShadow = true;
  scene.add(floor);

  /* Frosted glass, faked: an opaque body with a wet clear coat, a cool glow in the walls where light would pass
     through the thickness, and cloudy density inside. Real transmission would render the scene twice. */
  const material = new THREE.MeshPhysicalMaterial({
    color: "#d6e4e3", roughness: .34, metalness: 0, clearcoat: .8, clearcoatRoughness: .18, ior: 1.45, envMapIntensity: 1.1,
  });
  // Fine frosted grain, generated locally rather than fetched as a texture.
  const data = new Uint8Array(128 * 128);
  for (let i = 0; i < data.length; i++) data[i] = Math.round(112 + rand(i) * 30);
  const bump = new THREE.DataTexture(data, 128, 128, THREE.RedFormat);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping; bump.repeat.set(4, 4); bump.magFilter = THREE.LinearFilter; bump.needsUpdate = true;
  material.bumpMap = bump; material.bumpScale = .012;
  material.onBeforeCompile = shader => {
    shader.uniforms.uGarden = garden.growth;
    shader.uniforms.uGardenTime = garden.clock;
    shader.vertexShader = "varying vec3 vTile; varying vec3 vTileN;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvTile=position; vTileN=normal;");
    shader.fragmentShader = "varying vec3 vTile; varying vec3 vTileN; uniform float uGarden; uniform float uGardenTime; float gWet;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `
      #include <color_fragment>
      float x=vTile.x,z=vTile.z;
      float delay=${GARDEN_DELAY_GLSL};
      float arrive=delay/.70*${FRONT.toFixed(3)};
      // where the moss already stands: frost and the glow of the glass give way there
      float moss=smoothstep(arrive,arrive+.16,uGarden);
      float top=smoothstep(.5,.95,abs(normalize(vTileN).y));
      // Cloudy density inside the glass.
      float cloud=.5+.5*sin(x*2.1+sin(z*2.9)*1.3)*cos(z*1.7-x*.9);
      diffuseColor.rgb*=mix(.93,1.03,cloud);
      // Walls: you look into the thickness, so they are deeper and cooler than the milky top.
      float wallTint=1.-smoothstep(.15,.85,abs(normalize(vTileN).y));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.50,.64,.69),wallTint*.78);
      // A cool breath across the top towards the cold corner.
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.74,.86,.90),(1.-wallTint)*.34*smoothstep(1.4,-1.8,x+z));
      // Frost along the ice, fading as the slab warms up.
      float frost=(1.-smoothstep(.9,2.6,length(vec2((x+1.7)*1.25,(z+1.2)*.6))))*(1.-moss)*(1.-uGarden*.55);
      float crystal=.5+.5*sin(x*47.+sin(z*35.))*cos(z*53.);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.60,.77,.83)*(1.+crystal*.2),frost*.62);
      // Matting: tiny crystals scattered over the top, denser inside the frost.
      float speck=fract(sin(dot(floor(vTile.xz*70.),vec2(12.9898,78.233)))*43758.5453);
      diffuseColor.rgb*=1.-step(.62,speck)*(.03+frost*.07)*top;
      // Foliage somewhere above, out of frame: soft leaf shadows lie across the bare glass and sway a little.
      float shade=0.;
      for(int i=0;i<9;i++){
        float fi=float(i);
        float sway=sin(uGardenTime*.45+fi*1.7)*.035;
        // two loose branches crossing the slab from the far side
        vec2 c=vec2(-.95+fi*.27+sin(fi*2.3)*.22, -.75+fi*.17+cos(fi*1.9)*.38)+vec2(sway,sway*.6);
        float a=.9+sin(fi*3.1)*.9+sway*2.;
        vec2 p=vec2(x,z)-c; p=vec2(cos(a)*p.x+sin(a)*p.y,-sin(a)*p.x+cos(a)*p.y);
        p/=vec2(.46+.12*sin(fi*5.),.17+.04*cos(fi*4.));
        // a leaf: an ellipse pinched towards both tips
        float d=length(vec2(p.x,p.y*(1.+.9*abs(p.x))));
        shade=max(shade,(1.-smoothstep(.45,1.15,d))*(.7+.3*sin(fi*7.)));
      }
      diffuseColor.rgb*=1.-shade*.26*top;
      // Where the ice has gone it leaves a film of water: darker, and much glossier than the matted glass.
      float iu=max(0.,(x+1.685)/1.7), iv=max(0.,(z+1.785)/3.0);
      float it=pow(iu,1.15)+pow(iv,1.6);
      float gone=.14+max(0.,1.-it)*.40;
      gWet=(1.-smoothstep(.95,1.2,it))*smoothstep(gone+.12,gone+.32,uGarden)*(1.-moss)*top;
      diffuseColor.rgb*=1.-gWet*.07;
      // The mound stands on the glass: a soft contact shadow runs just ahead of the moss.
      float ahead=uGarden-arrive;
      float contact=smoothstep(-.10,.0,ahead)*(1.-smoothstep(.0,.14,ahead));
      diffuseColor.rgb*=1.-contact*.2*top;
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", `
      #include <roughnessmap_fragment>
      roughnessFactor*=mix(1.,.28,gWet);
    `);
    /* cast glass is never optically flat: a slow wave in the normal makes the reflections of the room wander */
    shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_maps>", `
      #include <normal_fragment_maps>
      normal=normalize(normal+vec3(sin(vTile.x*3.1+vTile.z*1.7),0.,cos(vTile.z*3.6-vTile.x*1.3))*.035);
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>", `
      #include <emissivemap_fragment>
      // Light that would travel through the thickness: strongest in the walls, a breath of it on the top face.
      float wall=1.-smoothstep(.12,.8,abs(normalize(vTileN).y));
      float depthFade=smoothstep(-${TILE.thickness.toFixed(3)},0.,vTile.y);
      totalEmissiveRadiance+=vec3(.50,.74,.78)*(wall*.10*depthFade+.012)*(1.-moss);
    `);
  };
  // Round in 3D first, then compress: corner radius is independent of visual thickness.
  const geometry = new RoundedBoxGeometry(TILE.width, TILE.modelHeight, TILE.depth, 10, TILE.radius);
  geometry.scale(1, TILE.thickness / TILE.modelHeight, 1);
  geometry.translate(0, -TILE.thickness / 2, 0);
  const tile = new THREE.Mesh(geometry, material);
  tile.castShadow = tile.receiveShadow = true;
  world.add(tile);

  /* Small engraved captions along the four edges: the run goes from cold to warm and from quiet to alive. They lie on
     the glass, so the ice hides one of them at first and the moss takes them all in the end. */
  const canvas = document.createElement("canvas");
  canvas.width = 1024; canvas.height = Math.round(1024 * TILE.depth / TILE.width);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  const draw = () => {
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '700 27px Onest, "Segoe UI", system-ui, sans-serif';
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "7px";
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#1f3138";
    const put = (text: string, u: number, v: number, turn: number) => {
      ctx.save(); ctx.translate(u * canvas.width, v * canvas.height); ctx.rotate(turn); ctx.fillText(text, 0, 0); ctx.restore();
    };
    put("COLD", .60, .085, 0); put("WARM", .40, .918, 0);
    put("QUIET", .082, .56, -Math.PI / 2); put("ALIVE", .920, .44, Math.PI / 2);
    texture.needsUpdate = true;
  };
  draw();
  /* the page font may arrive after the scene: draw again with it */
  void document.fonts?.ready.then(() => { if (!isDisposed()) draw(); });
  const labels = new THREE.Mesh(new THREE.PlaneGeometry(TILE.width, TILE.depth),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: .78, depthWrite: false }));
  labels.rotation.x = -Math.PI / 2; labels.position.y = .003;
  world.add(labels);
}
