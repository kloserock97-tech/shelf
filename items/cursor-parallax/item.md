---
title: Cursor Parallax
type: cursor
status: stable
summary: "Слои кадра сдвигаются за курсором каждый на свою глубину, центральная карточка наклоняется к курсору, а картинка в ней едет навстречу, как вид в окне. Один requestAnimationFrame и две CSS-переменные, без 3D-библиотек."
tech: [HTML, CSS, JavaScript, TypeScript, React]
tags: [parallax, cursor, tilt, depth, hover, css-variables, параллакс, курсор, наклон, глубина, слои]
added: 2026-09-28
origin: own
source: "Portfolio 3D TS2: src/ui/hero/heroUi.ts, src/ui/hero/hero.css (.par, .portal-media), src/intro/NatureScene.ts (setPointer)"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
registry: cursor-parallax
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: html, label: HTML, files: [index.html, cursor-parallax.css, cursor-parallax.js] }
  - { id: react, label: React, files: [CursorParallax.tsx, cursor-parallax.css] }
poster: poster.webp
---
- Скрипт пишет на корень только две переменные, `--px` и `--py` (−1…1). Слой сдвигается в CSS на свою глубину `--pd`: по горизонтали `px · pd` пикселей, по вертикали 0,6 от этого. Глубины как на первом экране портфолио: от 5 (док) до 22 (карточка).
- Сглаживание `1 − e^(−3.2·dt)` одинаковое на 60 и 120 Гц, шаг кадра ограничен 50 мс, чтобы после свёрнутой вкладки ничего не прыгало. Стиль пишется, только когда значение, округлённое до 0,001, изменилось: неподвижный курсор не трогает DOM.
- «Окно»: картинка в карточке выступает за рамку на 8 px и едет против курсора (8 и 5 px). Карточка сдвигается в одну сторону, вид в ней в другую, и появляется глубина. По наведению картинка приближается с 1,06 до 1,11.
- Наклон взят у плиты загрузчика: ближняя к курсору сторона проседает. В 3D там 0,05 рад (около 2,9°), это значение по умолчанию; плоской карточке в демо дано 6°, иначе наклон не читается. Парение — CSS-анимация, без записи стилей каждый кадр.
- Палец игнорируется (у касания нет наведения), уход курсора из окна возвращает всё в покой. С reduced motion корень не получает класс `cp-on`, и трансформаций нет вовсе.
