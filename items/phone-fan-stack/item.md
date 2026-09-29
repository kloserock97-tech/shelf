---
title: Phone Fan Stack
type: gallery
status: stable
summary: "Экраны телефона веером на одной сцене: раскладка целиком на CSS (поворот на 7° за шаг и опускание по параболе), наведение и фокус выпрямляют телефон и выносят его вперёд."
tech: [HTML, CSS, JavaScript]
tags: [gallery, phone, mockup, fan, hover, container queries, галерея, телефон, веер, мокап]
added: 2026-09-28
origin: own
source: "Portfolio 3D TS2: src/ui/caseStoryView.ts (gallery stack), src/ui/case-story.css (.cs-stage, .cs-stack-fan, .cs-stack-phone)"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: html, label: HTML, files: [fan.css, fan.js, index.html] }
poster: poster.webp
---
- Раскладка на CSS: телефон знает свой номер `--i` и число телефонов `--n`, смещение от середины `--o = i − (n − 1) / 2`. Поворот `o · 7°`, опускание `o² · 4% + 9%` — парабола: крайние ниже центрального, низ срезает край сцены. Работает для любого числа телефонов.
- Внахлёст телефоны сводят отрицательные поля `clamp(-36px, -2.4cqw, -12px)`; кто позже в разметке, тот сверху.
- Наведение и фокус с клавиатуры выпрямляют телефон, поднимают до 4% и выносят вперёд. Анимируются отдельные свойства `rotate`, `translate`, `scale`, а не `transform`, поэтому раскладка и наведение не перебивают друг друга.
- В узкой колонке сцена почти квадратная (`@container (max-width: 640px)`, `--ar: 0.95`), иначе телефоны выходят с ноготь.
- Если рамка уже нарисована в картинке (рендер устройства), телефон получает `.is-device`: своей рамки нет, тень `drop-shadow` идёт по контуру корпуса.
- Клик открывает телефон крупно в `<dialog>`. Окно просмотра со щипком и зумом — отдельный элемент Bento Lightbox.
