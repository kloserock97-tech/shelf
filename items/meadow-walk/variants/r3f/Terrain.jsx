import { useMemo } from 'react'
import * as THREE from 'three'
import { CFG } from '../config.js'
import { noiseGLSL } from '../glsl/noise.js'
import { U, sampleHeightGLSL } from './uniforms.js'

// Смещение плоскости по карте высот (общий код для цвета и теней)
const displace = /* glsl */ `
  vec2 wxz = position.xz + uCenter;
  float hC = hfHeight(wxz);
  vec3 transformed = vec3(wxz.x, hC, wxz.y);
`

function patchTerrainColor(shader) {
  Object.assign(shader.uniforms, {
    uHeight: U.uHeight, uCenter: U.uCenter, uSize: U.uSize, uTexel: U.uTexel,
    uTime: U.uTime, uSea: U.uSea,
    uLush: U.uLush, uMeadow: U.uMeadow, uDry: U.uDry, uRock: U.uRock, uPath: U.uPath,
  })
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', /* glsl */ `#include <common>
      ${sampleHeightGLSL}
      varying vec2 vWorldXZ;
      varying float vHeight;
      varying float vSlope;
      varying vec3 vWorldNormal;
    `)
    .replace('#include <beginnormal_vertex>', /* glsl */ `
      vec3 objectNormal = hfNormal(position.xz + uCenter);
      vSlope = length(objectNormal.xz) / max(objectNormal.y, 0.05);
      vWorldNormal = objectNormal; // у рельефа нет трансформаций: объект = мир
    `)
    .replace('#include <begin_vertex>', `${displace}\n vWorldXZ = wxz; vHeight = hC;`)

  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', /* glsl */ `#include <common>
      uniform float uTime;
      uniform float uSea;
      uniform vec3 uLush, uMeadow, uDry, uRock, uPath;
      varying vec2 vWorldXZ;
      varying float vHeight;
      varying float vSlope;
      varying vec3 vWorldNormal;
      ${noiseGLSL}
      // мелкие неровности земли (высота в мировых единицах)
      float detailH(vec2 p) {
        return (tdNoise(p * 1.9) * 0.6 + tdNoise(p * 5.3) * 0.3) * 0.03;
      }
    `)
    .replace('#include <color_fragment>', /* glsl */ `
      #include <color_fragment>
      float h = vHeight;
      float sea = uSea;
      float n1 = tdNoise(vWorldXZ * 0.08);
      float n2 = tdNoise(vWorldXZ * 0.45);
      float n3 = tdNoise(vWorldXZ * 3.1);

      // луг: сочная трава в низинах, светлее на склонах, суше на гребнях
      // цвета — с панели (uniform); грязь у воды — тёмный оттенок сухой травы
      vec3 grassDeep  = uLush;
      vec3 grassLight = uMeadow;
      vec3 grassDry   = uDry;
      vec3 rock       = uRock;
      vec3 mud        = uDry * vec3(0.14, 0.12, 0.1);
      vec3 col = mix(grassDeep, grassLight, smoothstep(-0.5, 0.6, n1 + 0.45 * n2 + (h - sea) * 0.12));
      col = mix(col, grassDry, smoothstep(0.1, 0.7, n2 * 0.6 + (h - sea - 2.2) * 0.35) * 0.75);
      col *= 0.9 + 0.2 * n3;
      // каменистые крутые склоны
      float rocky = smoothstep(0.5, 0.95, vSlope + n2 * 0.25);
      col = mix(col, rock * (0.85 + 0.3 * n3), rocky);
      // влажная земля у озерца
      float wet = 1.0 - smoothstep(sea, sea + 0.18, h);
      col = mix(col, mud, wet * 0.85);

      // тропинки: изолинии высоты — утоптанная светлая земля по горизонталям холмов
      float tideLines = 0.0;
      float fwH = max(fwidth(h), 1e-4);
      for (int k = 0; k < 2; k++) {
        float fk = float(k);
        float level = sea + 0.95 + fk * 1.15 + 0.1 * sin(uTime * 0.21 + fk * 1.7);
        float px = abs(h - level) / fwH;
        float line = 1.0 - smoothstep(1.6, 4.2, px);
        float gap = smoothstep(-0.2, 0.2, tdNoise(vWorldXZ * 0.05 + vec2(fk * 7.3, fk * 2.1)));
        tideLines += line * gap * (1.0 - fk * 0.3);
      }
      tideLines = clamp(tideLines, 0.0, 1.0);
      vec3 path = uPath * (0.85 + 0.3 * n3);
      diffuseColor.rgb = mix(col, path, tideLines * 0.9);
    `)
    .replace('#include <normal_fragment_maps>', /* glsl */ `
      #include <normal_fragment_maps>
      {
        // микрорельеф: наклон мелкого шума конечными разностями в мировых XZ
        // отклоняет мировую нормаль, затем переводим её в пространство камеры
        const float e = 0.05;
        float d0 = detailH(vWorldXZ);
        vec2 slope = vec2(detailH(vWorldXZ + vec2(e, 0.0)) - d0, detailH(vWorldXZ + vec2(0.0, e)) - d0) / e;
        // вдали неровности мельче пикселя — гасим, чтобы не рябило
        slope *= 1.0 - smoothstep(25.0, 60.0, length(vViewPosition));
        vec3 bumped = normalize(normalize(vWorldNormal) - vec3(slope.x, 0.0, slope.y));
        normal = normalize((viewMatrix * vec4(bumped, 0.0)).xyz);
      }
    `)
    .replace('#include <emissivemap_fragment>', /* glsl */ `
      #include <emissivemap_fragment>
    `)
}

function patchTerrainDepth(shader) {
  Object.assign(shader.uniforms, {
    uHeight: U.uHeight, uCenter: U.uCenter, uSize: U.uSize, uTexel: U.uTexel,
  })
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${sampleHeightGLSL}`)
    .replace('#include <begin_vertex>', displace)
}

export function Terrain() {
  const { geometry, material, depthMaterial } = useMemo(() => {
    const s = CFG.terrainSegments * CFG.texel
    const geometry = new THREE.PlaneGeometry(s, s, CFG.terrainSegments, CFG.terrainSegments)
    geometry.rotateX(-Math.PI / 2)

    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.97, metalness: 0 })
    material.onBeforeCompile = patchTerrainColor
    material.customProgramCacheKey = () => 'mw-terrain'

    const depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
    depthMaterial.onBeforeCompile = patchTerrainDepth
    depthMaterial.customProgramCacheKey = () => 'mw-terrain-depth'
    return { geometry, material, depthMaterial }
  }, [])

  return (
    <mesh
      geometry={geometry}
      material={material}
      customDepthMaterial={depthMaterial}
      frustumCulled={false}
      receiveShadow
      castShadow
    />
  )
}
