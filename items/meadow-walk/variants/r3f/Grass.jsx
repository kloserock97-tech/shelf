import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CFG } from '../config.js'
import { noiseGLSL } from '../glsl/noise.js'
import { U, sampleHeightGLSL, cursorFieldGLSL } from './uniforms.js'
import { rig } from './CameraRig.jsx'
import { perf } from './perf.js'

// Трава: два слоя инстансов, всё в вершинном шейдере.
//   near — густой участок у камеры (5 вершин на стебель, принимает тени)
//   far  — редкие широкие треугольники дальше (3 вершины, без теней)
// Дальше far траву изображает цвет рельефа. Число стеблей на лету подбирает perf (Adaptive.jsx).
const grassHead = /* glsl */ `
${sampleHeightGLSL}
${noiseGLSL}
${cursorFieldGLSL}
attribute vec4 aSeed;
uniform vec2 uGrassCenter;
uniform float uGrassTile;
uniform vec2 uBladeH;
uniform vec2 uBladeW;
uniform float uTime;
uniform float uSea;
uniform float uWindTime;
uniform float uWind;
uniform vec2 uBladeScale;
varying float vGrassY;
varying float vGrassTint;
`

const grassBody = /* glsl */ `
  float T = uGrassTile;
  vec2 origin = uGrassCenter - 0.5 * T;
  vec2 wxz = origin + mod(aSeed.xy * T - origin, T);
  vec2 fromC = abs(wxz - uGrassCenter) / (0.5 * T);
  float edge = 1.0 - smoothstep(0.45, 1.0, max(fromC.x, fromC.y));

  float h = hfHeight(wxz);
  float sea = uSea;
  float r1 = aSeed.z;
  float r2 = aSeed.w;
  float r3 = fract(r2 * 13.17 + r1 * 3.1);

  // где растёт: не у воды, не на тропинках, пятнами гуще
  float dens = smoothstep(sea + 0.12, sea + 0.5, h);
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    float level = sea + 0.95 + fk * 1.15 + 0.1 * sin(uTime * 0.21 + fk * 1.7);
    dens *= mix(1.0, smoothstep(0.02, 0.11, abs(h - level)), 0.9 - fk * 0.2);
  }
  float clump = tdNoise(wxz * 0.13 + 7.0);
  dens *= 0.62 + 0.38 * smoothstep(-0.35, 0.3, clump);
  float s = step(r1, dens) * edge;

  float bladeH = mix(uBladeH.x, uBladeH.y, r2 * r2) * (0.7 + 0.5 * smoothstep(-0.4, 0.5, clump)) * uBladeScale.x;
  float bladeW = mix(uBladeW.x, uBladeW.y, r3) * uBladeScale.y;

  // ветер: бегущая волна + порывы
  float gust = tdNoise(wxz * 0.045 + vec2(uWindTime * 0.22, uWindTime * 0.09));
  float wave = sin(uWindTime * 1.25 + dot(wxz, vec2(0.23, 0.14)) + r1 * 2.0);
  vec2 bend = vec2(0.86, 0.5) * (0.16 * wave + 0.4 * gust + 0.18) * uWind;

  // курсор: волна пробегает по траве и приминает её от центра
  vec3 field = cursorField(wxz);
  bend += field.xy * 1.6;
  float bl = length(bend);
  if (bl > 1.2) bend *= 1.2 / bl;

  float yy = position.y;
  float ang = r1 * 6.2832;
  vec2 side = vec2(cos(ang), sin(ang));
  float hh = bladeH * s * (1.0 - 0.25 * field.z);
  float curve = yy * yy;
  vec3 transformed = vec3(wxz.x, h - 0.03, wxz.y)
    + vec3(side.x, 0.0, side.y) * position.x * bladeW * s
    + vec3(bend.x * curve * hh, yy * hh * (1.0 - 0.4 * min(bl, 1.0)), bend.y * curve * hh);

  vGrassY = yy;
  vGrassTint = clamp(r3 * 0.6 + gust * 0.5 + 0.2, 0.0, 1.0);
`

function bladeGeometry(levels) {
  // сужающаяся полоска: уровни по 2 вершины + острый кончик
  const pos = []
  for (const y of levels) {
    const w = Math.pow(1 - y, 0.9)
    pos.push(-0.5 * w, y, 0, 0.5 * w, y, 0)
  }
  pos.push(0, 1, 0)
  const index = []
  for (let i = 0; i < levels.length - 1; i++) {
    const a = i * 2
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const top = pos.length / 3 - 1
  index.push(top - 2, top - 1, top)
  const g = new THREE.InstancedBufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0), 3))
  g.setIndex(index)
  return g
}

function GrassLayer({ layer }) {
  const center = useRef(new THREE.Vector2()).current
  const { geometry, material } = useMemo(() => {
    const geometry = bladeGeometry(layer.levels)
    const seeds = new Float32Array(layer.count * 4)
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random()
    geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4))
    geometry.instanceCount = layer.count
    perf.grass[layer.name] = { geometry, max: layer.count }

    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0,
      side: THREE.DoubleSide,
    })
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        uHeight: U.uHeight, uCenter: U.uCenter, uSize: U.uSize, uTexel: U.uTexel,
        uGrassCenter: { value: center }, uGrassTile: { value: layer.tile },
        uBladeH: { value: new THREE.Vector2(...layer.height) },
        uBladeW: { value: new THREE.Vector2(...layer.width) },
        uTime: U.uTime, uSea: U.uSea, uWindTime: U.uWindTime, uWind: U.uWind, uBladeScale: U.uBladeScale,
        uGrassRoot: U.uGrassRoot, uGrassTip: U.uGrassTip, uGrassDry: U.uGrassDry,
        uHead: U.uHead, uWaves: U.uWaves, uFieldBounds: U.uFieldBounds,
        uWaveStrength: U.uWaveStrength, uWaveSpeed: U.uWaveSpeed, uWaveLife: U.uWaveLife,
      })
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${grassHead}`)
        // стебли освещаем «как землю»: нормаль вверх
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
        .replace('#include <begin_vertex>', grassBody)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uGrassRoot, uGrassTip, uGrassDry;\nvarying float vGrassY;\nvarying float vGrassTint;')
        // обратная грань не переворачивает нормаль — иначе стебли чёрные
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);')
        .replace(
          '#include <color_fragment>',
          /* glsl */ `#include <color_fragment>
          vec3 gBase = uGrassRoot;
          vec3 gTip = mix(uGrassTip, uGrassDry, vGrassTint);
          // max(): у основания интерполяция даёт −1e-7, а pow от отрицательного = NaN,
          // который bloom размазывает в чёрные вспышки на весь кадр
          diffuseColor.rgb = mix(gBase, gTip, pow(clamp(vGrassY, 0.0, 1.0), 0.45));`
        )
    }
    material.customProgramCacheKey = () => `mw-grass-${layer.name}`
    return { geometry, material }
  }, [layer, center])

  // участок начинается у камеры и тянется вперёд по взгляду; при виде сверху — под точкой фокуса
  useFrame(() => {
    const d = rig.dir
    const horiz = Math.hypot(d.x, d.z)
    if (horiz < 0.35) {
      center.set(rig.focus.x, rig.focus.z)
    } else {
      const reach = Math.min(rig.focusDist, layer.tile * 0.4)
      center.set(U.uCam.value.x + (d.x / horiz) * reach, U.uCam.value.z + (d.z / horiz) * reach)
    }
  })

  return (
    <mesh
      geometry={geometry}
      material={material}
      frustumCulled={false}
      receiveShadow={layer.shadows}
    />
  )
}

export function Grass() {
  return (
    <>
      {CFG.grassLayers.map((layer) => (
        <GrassLayer key={layer.name} layer={layer} />
      ))}
    </>
  )
}
