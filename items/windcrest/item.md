---
title: Windcrest
type: webgl
status: stable
summary: "Холм, где каждая травинка — настоящая геометрия: сотни тысяч травинок рисуются одним instanced-вызовом, ветер ходит пятнами, всё на ползунках."
tech: [three.js, GLSL]
tags: [grass, wind, instancing, voronoi, noise, lil-gui, трава, ветер, холм]
added: 2026-09-20
origin: own
source: Projects/windcrest
repo: https://github.com/kloserock97-tech/windcrest
demo:
  url: https://kloserock97-tech.github.io/windcrest/
  background: dark
loop: loop.mp4
variants:
  - { id: three, label: three.js, files: [grass.glsl.js, terrain.js, settings.js, main.js] }
poster: poster.webp
jobs: [atmosphere]
collections: [calm, no-assets]
---
- Травинка — семь вершин и немного данных: где стоит, куда смотрит, какой длины, к какой кочке относится. Данные пишутся один раз при посадке, дальше CPU их не трогает.
- Кончик каждой травинки вершинный шейдер считает заново каждый кадр от ветра, курсора и камеры. Состояния между кадрами нет, поэтому число травинок — просто ползунок (20–600 тыс.), а пробел замораживает время посреди порыва.
- Кочки — jittered Voronoi: травинки одной ячейки делят высоту и тон, ковёр распадается на пучки с просветами.
- Ветер пятнами: два слоя value noise с порогом. Порыв не растягивает травинку, а кладёт её и поворачивает светлой изнанкой — отсюда серебристые пятна по склону.
- Шум на целочисленном хэше: sin-хэш теряет точность на координатах травинок, и ветер начинает полосить.
- Против мерцания два приёма: минимальная ширина травинки в пикселях и alpha-to-coverage.
