---
title: Polaroid Tape
type: object
status: stable
summary: "Полароид на одной CanvasTexture: кремовая рамка, выцветшее фото, полоска скотча и подпись от руки. Висит на скотче, покачивается и поворачивается к курсору."
tech: [three.js, JavaScript, Canvas 2D]
tags: [polaroid, canvas-texture, photo, tape, tilt, handwriting, annotation, полароид, фото, скотч, наклон, подпись]
added: 2026-09-28
updated: 2026-09-29
origin: own
source: "Portfolio 3D TS2: src/scene/polaroid.ts, src/scene/HillScene.ts (kellyClientPoint), src/ui/hill-ui.css (.kelly-note), src/intro/NatureScene.ts (setPointer)"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: js, label: JavaScript, files: [polaroid.js, landscape.js, main.js] }
poster: poster.webp
---
- Карточка — одна плоскость и один холст 512×616: бумага градиентом, фото 452×452 с полями по 30 px и широким нижним полем, скотч — полупрозрачный прямоугольник, повёрнутый на −0,06 рад. Кроме самого фото, грузить нечего.
- «Моментальный снимок» — три слоя поверх фото: тёплая заливка в режиме soft-light, белая дымка 8% (приподнятые тени) и виньетка от 0,3 до 0,75 стороны фото. Любая картинка выцветает одинаково.
- Подпись на нижнем поле рисуется тем же холстом. Рукописный шрифт приходит позже первого рисования, поэтому холст перерисовывается по `document.fonts.load`, иначе так и останется запасной шрифт.
- Заметка со стрелкой живёт в DOM: каждый кадр точка над верхним краем карточки проецируется из 3D в координаты окна, стрелка рисуется через `stroke-dashoffset`. Стиль пишется, только когда округлённые координаты изменились.
- Поворот к курсору: курсор −1…1 и сглаживание `1 − e^(−3.2·dt)`, одинаковое на 60 и 120 Гц. Шарнир у верхнего края: карточка висит на скотче. С reduced motion она не качается и не поворачивается.
- Плоскость с `FrontSide` не отбрасывает тень: three по умолчанию рисует в карту теней обратные грани. Нужен `shadowSide = DoubleSide`. Фото в демо — рассвет над озером, нарисованный на холсте (`landscape.js`).
