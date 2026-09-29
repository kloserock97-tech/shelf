---
title: God Rays
type: shader
status: stable
summary: "Лучи от низкого солнца сквозь крону: яркостная маска у солнца, радиальное размытие в четверти разрешения за два прохода и сложение с кадром до тонмаппинга."
tech: [WebGL2, GLSL, JavaScript]
tags: [god rays, light shafts, radial blur, postprocessing, hdr, sun, лучи, солнце, свет, постобработка]
added: 2026-09-28
updated: 2026-09-29
origin: own
source: "Portfolio 3D TS2: src/scene/postfx.ts, src/scene/shaders.ts (godMaskFragment, godBlurFragment, finalFragment)"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
demo:
  path: demo/index.html
  background: light
  grid: false
variants:
  - { id: glsl, label: GLSL, files: [rays-mask.frag, rays-blur.frag, rays-composite.frag, fullscreen.vert] }
  - { id: js, label: WebGL2 JS, files: [god-rays.js] }
poster: poster.webp
---
- В маску попадает только яркое у самого солнца: яркость 0,85–2,2 в линейном HDR, умноженная на гауссов ореол вокруг солнца. Белое небо (~0,9) почти не проходит, иначе веер шёл бы от каждого светлого пятна.
- Размытие к солнцу: 36 выборок с затуханием 0,96, два прохода в четверти разрешения (0,9 и 0,35 пути до солнца). Начало каждого луча сдвинуто дизером Hash Kit, и ступеньки выборок становятся мелким зерном.
- Лучи прибавляются к HDR-кадру до тонмаппинга, с тёплым оттенком (1; 0,86; 0,66), поэтому у солнца выгорают так же, как оно само. При силе 0,32 это тёплая дымка, а не прожекторы.
- Солнце может уйти за край кадра: широкий ореол (halo 5) всё равно дотягивается до кадра, и веер заходит сбоку. Лучи плавно гаснут, когда солнце дальше 1,6–2,7 в координатах NDC. В демо солнце можно вытащить за край.
- Тонмаппинг в демо: линейно до 0,72, дальше мягкое плечо.
- Флаги демо: `?rays=0`, `?raysmask=0.85,2.2`, `?rayshalo=5`, `?raysoff=1.6,2.7` и `?view=mask|rays`. Вариант JS несёт шейдеры текстом, чтобы демо открывалось и с `file://`.
