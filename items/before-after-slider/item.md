---
title: Before After Slider
type: gallery
status: stable
summary: "Два экрана под одним ползунком «было/стало»: тянется мышью и пальцем с любого места, ходит стрелками, читается скринридером. Оба экрана целиком видны на сцене, которая помещается в окно."
tech: [HTML, CSS, JavaScript, React]
tags: [before after, compare, slider, comparison, a11y, gallery, было стало, сравнение, ползунок, галерея]
added: 2026-09-28
origin: own
source: "Portfolio 3D TS2: src/ui/caseStoryView.ts (галерея compare), src/ui/case-story.css (.cs-stage, .cs-compare-*)"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
registry: before-after-slider
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: html, label: HTML, files: [before-after.js, before-after.css, index.html] }
  - { id: react, label: React, files: [BeforeAfterSlider.tsx, before-after-slider.css] }
poster: poster.webp
---
- Положение живёт в одной переменной `--pos` на коробке: она режет верхний слой «было» через `clip-path: inset(0 calc(100% − var(--pos)) 0 0)` и двигает линию ручки. Скрипт меняет только эту переменную.
- Оба экрана видны целиком: `--ar` коробки — меньшее из двух соотношений сторон, у каждой картинки своё `--iar`, размер считается явно через `cqw`, а сцена не выше `clamp(340px, 100svh − 230px, 780px)`.
- Под коробкой лежит настоящий `<input type="range">` с прозрачностью 0: стрелки, Page Up/Down, Home/End и скринридер работают без своего кода. `aria-valuetext` говорит «45% Before, 55% After».
- Отличие от TS2: там поверх лежал сам range и принимал мышь, а у нативного бегунка линия отстаёт от курсора до половины его ширины у краёв. Здесь у range `pointer-events: none`, тянет коробка с `setPointerCapture`, и линия стоит ровно под пальцем. После перетаскивания фокус остаётся на ползунке (`preventDefault` в `pointerdown`), и стрелки продолжают с того же места.
- `touch-action: pan-y`: вертикальный свайп листает страницу, горизонтальный двигает ручку. Ручка — круг 44 px с двумя шевронами из рамок, без картинок.
- Экраны в демо — вымышленный планировщик (SVG): старая версия с формой фильтров, тремя графиками и таблицей против новой с четырьмя числами и одним графиком.
