---
title: Glass Diorama
type: webgl
status: stable
summary: "Обложка проекта как живая диорама на three.js: стеклянные карточки-спутники вокруг экрана продукта, вход лесенкой из глубины, парение, орбиты, ленты и огоньки; текст карточек рисуется Canvas 2D в экранном разрешении."
tech: [TypeScript, three.js, GLSL, Canvas 2D]
tags: [diorama, glass, cards, orbit, sparks, entrance, three.js, диорама, стекло, карточки, орбиты, вход]
added: 2026-09-28
updated: 2026-09-29
origin: own
source: "Portfolio 3D TS2: src/caseScene/engine.ts, kit.ts, draw.ts, paint.ts, community.ts, lead.ts"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
demo:
  path: demo/index.html
  background: dark
  grid: false
variants:
  - { id: ts, label: TypeScript, files: [engine.ts, kit.ts, draw.ts, board.ts, main.ts] }
poster: poster.webp
jobs: [showcase]
collections: [feels-expensive, depth]
usedIn: [ts2]
pairs: [case-card-stack]
---
- Координаты — пиксели кадра-референса 1672×941: камера подобрана так, что плоскость z = 0 ложится на кадр один к одному, и раскладку можно сверять с картинкой наложением. Кадр вписывается в свободную область окна; центр сдвигается `setViewOffset`, а не камерой, поэтому перспектива не меняется.
- Стекло карточки — один шейдер: скруглённый прямоугольник через SDF, молочная середина, яркая кромка-фаска, френель, тёплый отсвет снизу и ореол за краем. Содержимое — текстура внутри с тенью на стекле.
- Свет только складывается: у огоньков, свечений и линий `blendSrcAlpha = Zero`, `blendDstAlpha = One` — цвет прибавляется, а альфа холста не растёт, и свет ложится на то, что под прозрачным холстом.
- Вход: карточки летят от центра композиции и из глубины (−260) лесенкой по `delay`, линии прорисовываются (`instanceCount` у Line2), свет разгорается, ease-out ~1,4 с. «Присутствие» 0…1 гасит всё разом — так сцену выводит прокрутка главы.
- Текст карточек рисуется Canvas 2D в том разрешении, которое карточка займёт на экране (`texScale`), а не растягивается из готовой картинки. Шейдеры собираются заранее `compileAsync`, чтобы первый кадр входа не дёрнулся.
- На телефоне композиция сжимается по ширине до 0,8, спутники уменьшаются до 0,72, а обратный масштаб не даёт карточкам сплющиться.
- На карточках — выдуманная командная доска, нарисованная `draw.ts`.
- Демо собрано из варианта TS командой esbuild (см. demo/app.js)
