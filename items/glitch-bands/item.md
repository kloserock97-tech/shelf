---
title: Glitch Bands
type: transition
status: stable
summary: "Переход через глитч: полосы разной высоты рывком съезжают вбок, часть рассыпается на крупные пиксели, каналы расслаиваются, а смена картинки прячется под пиком."
tech: [WebGL2, GLSL, JavaScript]
tags: [glitch, transition, rgb split, pixelate, bands, postprocessing, глитч, переход, полосы, помехи]
added: 2026-09-28
origin: own
source: "Portfolio 3D TS2: src/scene/shaders.ts (finalFragment, uGlitch), src/scene/HillScene.ts (glitch, glitchSeed), src/scene/story.ts (bell)"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
demo:
  path: demo/index.html
  background: dark
  grid: false
variants:
  - { id: glsl, label: GLSL, files: [glitch-bands.frag, fullscreen.vert] }
  - { id: js, label: WebGL2 JS, files: [glitch-bands.js] }
poster: poster.webp
---
- На каждом рывке кадр режется на 14–60 полос. В полную силу сдвигаются три полосы из четырёх, до ±9% ширины. Часть сдвинутых становится блоками 90 рядов (клетка в 1,6 раза шире высоты), и у всего кадра разъезжаются красный и синий каналы.
- Рывки, а не плавание: зерно случайности целое, `floor(time·18) + floor(progress·60)`. Полосы прыгают 18 раз в секунду и от самой прокрутки.
- Картинка меняется ровно в пике, где глитч закрывает шов. В половине сдвинутых полос новая картинка проскакивает раньше, а старая держится дольше — смена мерцает по полосам, а не щёлкает. Это добавлено для демо; на сайте глитч шёл поверх одной сцены.
- В пике баланс белого уходит в холод (0,86; 0,95; 1,12), как у камеры, которая теряет сигнал.
- На сайте глитч открывал переход с холма в About с силой 0,32: с v17 полосы идут намёком, а не на весь кадр. В демо по умолчанию 1, ползунок рядом. При `prefers-reduced-motion` сайт глитч выключал; в демо вместо него простое растворение.
- Хэш свой, целочисленный: синусный из оригинала заменён. Обе картинки процедурные, тонмаппинг свой.
