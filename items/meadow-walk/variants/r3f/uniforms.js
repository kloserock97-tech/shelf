import * as THREE from 'three'
import { CFG } from '../config.js'
import { live } from './live.js'

// Единые объекты uniform: подключаются по ссылке во все материалы,
// поэтому обновлять их достаточно в одном месте.
export const U = {
  uTime: { value: 0 },
  uSea: { value: -0.4 }, // уровень чёрной воды
  uHeight: { value: null }, // текстура карты высот
  uCenter: { value: new THREE.Vector2() }, // центр участка карты высот (мир XZ)
  uSize: { value: CFG.worldSize },
  uTexel: { value: 1 / CFG.heightRes },
  uCam: { value: new THREE.Vector3() },
  uPebbleCenter: { value: new THREE.Vector2() },
  uTile: { value: CFG.pebbleTile },
  // курсор: точка под курсором (xyz — мир, w — сила 0..1)
  uHead: { value: new THREE.Vector4(1e5, 0, 1e5, 0) },
  // волны от движения курсора: xyz — центр, w — возраст в секундах (< 0 — слот свободен)
  uWaves: { value: Array.from({ length: 16 }, () => new THREE.Vector4(1e5, 0, 1e5, -1)) },
  // прямоугольник, где поле курсора не ноль (minX, minZ, maxX, maxZ): вне его шейдеры не считают цикл
  uFieldBounds: { value: new THREE.Vector4(1e5, 1e5, -1e5, -1e5) },

  // ── значения панели (обновляет Live.jsx каждый кадр) ──
  uHills: { value: 2.6 }, // высота холмов
  uHillScale: { value: 1 }, // частота холмов: больше — мельче и чаще
  uWaveStrength: { value: 1 },
  uWaveSpeed: { value: 2.6 },
  uWaveLife: { value: 2.6 },
  uWindTime: { value: 0 }, // накопленное «время ветра»: смена скорости не даёт скачка фазы
  uWind: { value: 1 },
  uBladeScale: { value: new THREE.Vector2(1, 1) }, // высота, ширина
  uStones: { value: 1 },
  uStoneSize: { value: 1 },
  uDustSize: { value: 1 },
  uLush: { value: live.lush },
  uMeadow: { value: live.meadow },
  uDry: { value: live.dry },
  uRock: { value: live.rock },
  uPath: { value: live.path },
  uGrassRoot: { value: live.grassRoot },
  uGrassTip: { value: live.grassTip },
  uGrassDry: { value: live.grassDry },
  uStoneColor: { value: live.stoneColor },
}

export const HEAD_RADIUS = 4.5
// максимальный радиус влияния волны при текущих настройках
export const waveReach = () => 0.4 + live.waveSpeed * live.waveLife + 2.5

// Поле курсора: плавный купол под курсором + расходящиеся волны от следа.
// Возвращает (push.x, push.z, lift): смещение по земле и подъём, всё без разрывов.
export const cursorFieldGLSL = /* glsl */ `
uniform vec4 uHead;
uniform vec4 uWaves[16];
uniform vec4 uFieldBounds;
uniform float uWaveStrength;
uniform float uWaveSpeed;
uniform float uWaveLife;
vec3 cursorField(vec2 p) {
  if (p.x < uFieldBounds.x || p.y < uFieldBounds.y || p.x > uFieldBounds.z || p.y > uFieldBounds.w) return vec3(0.0);
  vec2 push = vec2(0.0);
  float lift = 0.0;
  if (uHead.w > 0.001) {
    vec2 dv = p - uHead.xz;
    float d = length(dv);
    float f = exp(-(d * d) / ${(HEAD_RADIUS * HEAD_RADIUS).toFixed(2)}) * uHead.w;
    push += dv / max(d, 0.6) * f * smoothstep(0.0, 1.8, d) * 0.7;
    lift += f * 0.35;
  }
  for (int i = 0; i < 16; i++) {
    vec4 wv = uWaves[i];
    float age = wv.w;
    if (age < 0.0 || age > uWaveLife) continue;
    vec2 dv = p - wv.xz;
    float d = length(dv);
    float radius = 0.4 + age * uWaveSpeed;
    float width = 1.0 + age * 0.55;
    float x = (d - radius) / width;
    float ring = exp(-x * x);
    // волна мягко набирается и долго выдыхается
    float env = smoothstep(0.0, 0.55, age) * (1.0 - smoothstep(0.27 * uWaveLife, uWaveLife, age));
    float k = ring * env * smoothstep(0.0, 1.2, d);
    lift += k;
    push += dv / max(d, 0.6) * k * 0.55;
  }
  // мягкий предел: перекрытие волн не даёт скачков
  lift *= uWaveStrength;
  push *= uWaveStrength;
  float liftN = 1.0 - exp(-lift * 1.1);
  float pl = length(push);
  vec2 pushN = pl > 1e-4 ? push / pl * (1.0 - exp(-pl * 1.2)) : vec2(0.0);
  return vec3(pushN, liftN);
}
`

// Уровень воды в озерцах: очень медленное колебание, без начала и конца (прогулка бесконечна)
export function seaLevel(t) {
  return live.waterLevel + 0.16 * Math.sin(t * 0.021) + 0.06 * Math.sin(t * 0.37 - 0.6)
}

// Выборка высоты из текстуры в вершинном шейдере
export const sampleHeightGLSL = /* glsl */ `
uniform sampler2D uHeight;
uniform vec2 uCenter;
uniform float uSize;
uniform float uTexel;
vec2 hfUv(vec2 wxz) { return (wxz - uCenter) / uSize + 0.5; }
float hfHeight(vec2 wxz) { return texture2D(uHeight, hfUv(wxz)).r; }
vec3 hfNormal(vec2 wxz) {
  vec2 uv = hfUv(wxz);
  float e = uTexel;
  float hl = texture2D(uHeight, uv - vec2(e, 0.0)).r;
  float hr = texture2D(uHeight, uv + vec2(e, 0.0)).r;
  float hd = texture2D(uHeight, uv - vec2(0.0, e)).r;
  float hu = texture2D(uHeight, uv + vec2(0.0, e)).r;
  float w = 2.0 * e * uSize;
  return normalize(vec3(hl - hr, w, hd - hu));
}
`
