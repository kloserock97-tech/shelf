---
title: CRT Screen Shader
type: shader
status: stable
summary: "Кинескоп поверх любой картинки: экран-суперэллипс, выпуклость стекла с членом четвёртой степени, разъезд каналов к краю, строки развёртки, мерцание и помехи — на чистом WebGL2 с ползунками."
tech: [GLSL, JavaScript, WebGL2]
tags: [crt, retro, scanlines, chromatic aberration, barrel distortion, squircle, glitch, кинескоп, ретро, развёртка, помехи, шейдер]
added: 2026-09-28
updated: 2026-09-29
origin: own
source: "Portfolio 3D TS2: src/scene/portfolioScreen.ts (кинескоп экрана ретро-компьютера)"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: glsl, label: GLSL, files: [crt.frag, crt.vert] }
  - { id: js, label: JavaScript, files: [crt.js] }
related: [retro-desktop-screen]
poster: poster.webp
---
- Шейдер переписан с нуля, без чужих CRT-вставок: экран — суперэллипс («сквиркл»), а не прямоугольник со скруглёнными углами; степень формы = 0,9 / uCorner, от 4 до 40.
- Выпуклость — квадратичный член плюс слабый член четвёртой степени (`r²·(1 + 1,6·r²)`): края гнутся сильнее середины, как у настоящего стекла.
- Разъезд каналов идёт по радиусу от центра и растёт к краю; развёртка — узкие тёмные щели между яркими строками, а не ровная синусоида.
- Мерцание — сумма двух несоизмеримых частот (9,7 и 23,3), поэтому не читается как ровная пульсация. Виньетка — по эллипсу экрана.
- Помехи: строки полосами рывком съезжают вбок, сверху снег. За кромкой экрана шейдер ничего не рисует — видно рамку или страницу.
- Значения по умолчанию (`DEFAULTS`, кнопка Subtle) — как на экране монитора в портфолио: почти плоский монитор 2000-х, эффект едва заметен. Strong — для наглядности.
