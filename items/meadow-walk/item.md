---
title: Meadow Walk
type: webgl
status: stable
summary: "Бесконечный неторопливый полёт над вечерним лугом: полмиллиона травинок, пруды и тропы в холмах, а курсор пускает по полю мягкие волны."
tech: [React, R3F, GLSL]
tags: [grass, terrain, heightmap, cursor waves, film grain, луг, трава, холмы]
added: 2026-09-16
origin: own
source: Projects/meadow-walk
repo: https://github.com/kloserock97-tech/meadow-walk
demo:
  url: https://kloserock97-tech.github.io/meadow-walk/
  background: dark
loop: loop.mp4
variants:
  - { id: r3f, label: R3F, files: [Grass.jsx, Terrain.jsx, Cursor.jsx, uniforms.js] }
poster: poster.webp
jobs: [atmosphere]
collections: [calm, no-assets]
---
- Луг — одна функция высоты. Её спрашивают все: сетка земли, каждая травинка, камешки, тени, камера. Чтобы не считать шум полмиллиона раз за проход, каждый кадр высота вокруг камеры пишется в half-float текстуру, а шейдеры только читают.
- Та же функция живёт в JavaScript. Шум на целочисленном хэше (`Math.imul`, `>>> 0`) повторяет GPU бит в бит, поэтому курсор попадает ровно в ту травинку, над которой висит.
- Два слоя травы: 360 тыс. ближних травинок из пяти вершин с тенями и 140 тыс. дальних треугольников. Оба оборачиваются вокруг камеры через `mod`, без учёта патчей.
- Волны от курсора — поле из живых колец: трава ложится, камешки приподнимаются и съезжают, пыль встаёт, потом всё оседает на место.
- Зерно только в полутонах и 24 раза в секунду, как плёнка: шум, который меняется с каждым кадром монитора, на тёмной картинке читается как мерцание.
