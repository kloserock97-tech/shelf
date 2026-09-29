import * as THREE from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";

/** The scene is drawn into a multisampled half-float target and then composited: a little halation on the brightest
    highlights, a vignette, tone mapping and grain. Four samples everywhere: the pile of the moss is antialiased by
    alpha to coverage, and with two samples that gives only three levels of edge. */
export function createPost(renderer: THREE.WebGLRenderer) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, samples: 4 });
  const material = new THREE.ShaderMaterial({
    uniforms: { tScene: { value: target.texture }, uPixel: { value: new THREE.Vector2() } },
    vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }",
    fragmentShader: `
      uniform sampler2D tScene; uniform vec2 uPixel; varying vec2 vUv;
      // Hash Kit (our own hash, see shelf/items/hash-kit)
      uint hashU(uint x){ x^=x>>16; x*=0x3f9c86cbu; x^=x>>14; x*=0x1ae9dacfu; x^=x>>15; return x; }
      void main(){
        vec4 texel=texture2D(tScene,vUv);
        vec3 c=texel.rgb;
        // Highlight-only halation, not a screen-wide blur over the moss.
        vec3 halo=vec3(0.);
        for(int i=0;i<8;i++){
          float a=float(i)*.785398;
          vec3 s=texture2D(tScene,vUv+vec2(cos(a),sin(a))*uPixel*3.).rgb;
          halo+=max(s-vec3(1.5),vec3(0.));
        }
        c+=halo*.012;
        c*=1.-.075*dot((vUv-.5)*1.4,(vUv-.5)*1.4);
        /* The target is premultiplied (edge pixels of the slab are colour × coverage). Tone mapping is not linear,
           so it has to see the straight colour; otherwise every silhouette gets a pale fringe. */
        float coverage=texel.a;
        gl_FragColor=vec4(coverage>.001?c/coverage:vec3(0.),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        uvec2 gq=uvec2(gl_FragCoord.xy); float grain=float(hashU(gq.x+hashU(gq.y+0xb31c96c9u))>>8)*(1./16777216.)-.5;
        gl_FragColor.rgb+=grain*.003;
        gl_FragColor=vec4(gl_FragColor.rgb*coverage,coverage);
      }`,
    depthTest: false, depthWrite: false,
  });
  const quad = new FullScreenQuad(material);
  return {
    target,
    resize(widthPx: number, heightPx: number) {
      target.setSize(widthPx, heightPx);
      material.uniforms.uPixel.value.set(1 / widthPx, 1 / heightPx);
    },
    render(scene: THREE.Scene, camera: THREE.Camera) {
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      quad.render(renderer);
    },
    dispose() { target.dispose(); quad.dispose(); material.dispose(); },
  };
}
