---
title: Vogel Disk Blur
type: shader
status: stable
summary: "Размытие диском на спирали Вогеля: 16 выборок ровно накрывают круг, узор повёрнут шумом в каждом пикселе, и яркие точки остаются дисками, а не кольцами."
tech: [WebGL2, GLSL, JavaScript]
tags: [blur, bokeh, vogel, golden angle, disk, postprocessing, размытие, боке, золотой угол, фон]
added: 2026-09-28
updated: 2026-09-29
origin: own
source: "Portfolio 3D TS2: src/scene/shaders.ts (quarterFragment), src/scene/postfx.ts (bgRT → bgBlurRT)"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
demo:
  path: demo/index.html
  background: dark
  grid: false
variants:
  - { id: glsl, label: GLSL, files: [vogel-blur.frag, present.frag, fullscreen.vert] }
  - { id: js, label: WebGL2 JS, files: [vogel-blur.js] }
poster: poster.webp
---
- Выборка k повёрнута на золотой угол (2,39996 рад) от предыдущей и стоит на `sqrt((k + 0,5) / N)` радиуса. Так 16 точек ровно накрывают весь круг вместе с серединой.
- Выборки на двух кольцах (R и 0,49 R) размывают маленький яркий источник в кольцо с дыркой — «пончик». В демо слева кольца, справа спираль; разница видна на гирлянде.
- Узор в каждом пикселе повёрнут дизером Hash Kit. Без него 16 выборок дают 16 чётких копий картинки, с ним остаётся мелкое зерно. Переключатель Noise показывает оба случая.
- Сцена рисуется в половинном разрешении, размытие считается в четверти, финал читает его одной билинейной выборкой. Под размытием разницы не видно, а пикселей в 16 раз меньше.
- Радиус в демо по умолчанию 0,03 высоты кадра, для фона хватает 0,016. Число выборок меняется ползунком, рабочее — 16.
