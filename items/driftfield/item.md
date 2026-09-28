---
title: Driftfield
type: webgl
status: stable
summary: "Облако точек в curl-поле с линзой перед ним: положение каждой точки — чистая функция от её seed и времени, поэтому время можно перематывать, а число точек — ползунок."
tech: [three.js, GLSL]
tags: [particles, curl noise, flow field, depth of field, частицы, поток, линза]
added: 2026-09-16
origin: own
source: Projects/driftfield
priorArt: известный приём curl noise + depth of field, код написан заново
repo: https://github.com/kloserock97-tech/driftfield
demo:
  url: https://kloserock97-tech.github.io/driftfield/
  background: dark
loop: loop.mp4
variants:
  - { id: three, label: three.js, files: [field.glsl.js, main.js, settings.js] }
poster: poster.webp
---
- Ни состояния, ни буфера скоростей: точка знает только, где стартовала, а позиция на кадр — чистая функция seed и часов в вершинном шейдере. Время можно заморозить, отмотать назад, пропущенный кадр не копит дрейф.
- Скорость — ротор шумового потенциала. У ротора нулевая дивергенция, поэтому в потоке нет источников и стоков: точки не сбиваются в комки и не утекают из кадра.
- Облако круглое не потому, что в коде есть сфера: нормализованное направление поля в точке seed — это точка на единичной сфере.
- Нити появляются от малого seed spread, а не от частоты: соседние seed идут по одной линии тока.
- Глубина резкости — формула тонкой линзы с f-числом (1.4 — всё тает, 16 — всё резко). Смешивание alpha, а не additive: плотное облако не выгорает в белое.
