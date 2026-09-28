import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { U, HEAD_RADIUS, waveReach } from './uniforms.js'
import { live } from './live.js'
import { terrainHeight } from './terrainCPU.js'

// Курсор как «рука» над лугом.
// uHead — точка под курсором: медленно догоняет курсор, сила плавно растёт и спадает.
// uWaves — волны: при движении курсор оставляет центры, от них расходятся кольца,
// частицы поднимаются на гребне и оседают, когда волна прошла (сам расчёт — cursorFieldGLSL).
const HEAD = U.uHead.value
const WAVES = U.uWaves.value
const BOUNDS = U.uFieldBounds.value
const SPAWN_DIST = 1.4 // ед. между центрами волн
// не чаще, чем жизнь волны / 15: иначе 16 слотов не хватит и живые волны начнут перезаписываться
const spawnGap = () => Math.max(0.17, live.waveLife / 15)
const ray = new THREE.Raycaster()
const hit = new THREE.Vector3()
const last = new THREE.Vector3(1e6, 0, 1e6)
const smooth01 = (x) => {
  const c = Math.min(Math.max(x, 0), 1)
  return c * c * (3 - 2 * c)
}

function surface(x, z, t, sea) {
  return Math.max(terrainHeight(x, z, t), sea)
}

// Марш луча по рельефу + бисекция на найденном отрезке
function pickTerrain(origin, dir, t, sea, out) {
  let prev = 0
  let d = 0.5
  for (let i = 0; i < 260 && d < 180; i++) {
    const x = origin.x + dir.x * d
    const y = origin.y + dir.y * d
    const z = origin.z + dir.z * d
    if (y <= surface(x, z, t, sea)) {
      let lo = prev
      let hi = d
      for (let k = 0; k < 8; k++) {
        const m = (lo + hi) / 2
        const my = origin.y + dir.y * m
        if (my <= surface(origin.x + dir.x * m, origin.z + dir.z * m, t, sea)) hi = m
        else lo = m
      }
      out.copy(origin).addScaledVector(dir, hi)
      return true
    }
    prev = d
    d += Math.max(0.25, d * 0.02)
  }
  return false
}

export function Cursor() {
  const { camera, pointer, gl } = useThree()
  const hover = useRef(false)
  const hoverAmt = useRef(0)
  const sinceSpawn = useRef(1)
  const headInit = useRef(false)

  useEffect(() => {
    const el = gl.domElement
    const on = () => (hover.current = true)
    const off = () => (hover.current = false)
    el.addEventListener('pointermove', on)
    el.addEventListener('pointerenter', on)
    el.addEventListener('pointerleave', off)
    document.addEventListener('mouseleave', off)
    return () => {
      el.removeEventListener('pointermove', on)
      el.removeEventListener('pointerenter', on)
      el.removeEventListener('pointerleave', off)
      document.removeEventListener('mouseleave', off)
    }
  }, [gl])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20)

    let found = false
    if (hover.current) {
      ray.setFromCamera(pointer, camera)
      found = pickTerrain(ray.ray.origin, ray.ray.direction, U.uTime.value, U.uSea.value, hit)
    }

    hoverAmt.current += ((found ? 1 : 0) - hoverAmt.current) * Math.min(1, dt * (found ? 1.5 : 1.0))
    if (found) {
      if (!headInit.current || HEAD.w < 0.01) {
        HEAD.set(hit.x, hit.y, hit.z, HEAD.w)
        headInit.current = true
      }
      const k = Math.min(1, dt * 4)
      HEAD.x += (hit.x - HEAD.x) * k
      HEAD.y += (hit.y - HEAD.y) * k
      HEAD.z += (hit.z - HEAD.z) * k

      sinceSpawn.current += dt
      if (last.distanceToSquared(HEAD) > SPAWN_DIST * SPAWN_DIST && sinceSpawn.current > spawnGap()) {
        // свободный слот или самый старый
        let s = 0
        for (let i = 0; i < WAVES.length; i++) {
          const a = WAVES[i].w
          if (a < 0 || a > live.waveLife) { s = i; break }
          if (a > WAVES[s].w) s = i
        }
        WAVES[s].set(HEAD.x, HEAD.y, HEAD.z, 0)
        last.copy(HEAD)
        sinceSpawn.current = 0
      }
    }
    HEAD.w = smooth01(hoverAmt.current)

    // возраст волн и общий прямоугольник влияния
    let minX = 1e5, minZ = 1e5, maxX = -1e5, maxZ = -1e5
    const reach = waveReach()
    for (const wv of WAVES) {
      if (wv.w < 0) continue
      wv.w += dt
      if (wv.w > live.waveLife) {
        wv.w = -1
        continue
      }
      minX = Math.min(minX, wv.x - reach)
      maxX = Math.max(maxX, wv.x + reach)
      minZ = Math.min(minZ, wv.z - reach)
      maxZ = Math.max(maxZ, wv.z + reach)
    }
    if (HEAD.w > 0.001) {
      const r = HEAD_RADIUS * 3
      minX = Math.min(minX, HEAD.x - r)
      maxX = Math.max(maxX, HEAD.x + r)
      minZ = Math.min(minZ, HEAD.z - r)
      maxZ = Math.max(maxZ, HEAD.z + r)
    }
    BOUNDS.set(minX, minZ, maxX, maxZ)
  }, -1)

  return null
}
