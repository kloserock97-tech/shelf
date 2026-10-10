---
title: Live-Preview Interest Picker
type: section
status: stable
summary: "Шаг онбординга с выбором интересов, над чипами — мини-лента будущего экрана. Каждый выбранный чип сразу перестраивает ленту: карточки новой темы въезжают первыми, остальные переезжают, цвет акцента берётся от последней темы; счётчик и кнопка «Continue» включаются через :has()."
tech: [HTML, CSS, JavaScript, ":has()", View Transitions API, "@starting-style"]
tags: [onboarding, interests, topics, chips, feed preview, personalization, view transitions, has selector, feedforward, онбординг, интересы, темы, чипы, превью ленты, персонализация, выбор тем]
added: 2026-10-09
origin: adapted
priorArt: "Экраны выбора интересов в мобильных приложениях (Perplexity, Bumble, Brink на Mobbin): чипы и счётчик «выберите 3»; превью ленты — своё"
source: Shelf
platform: [mobile]
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: html, label: HTML, files: [live-preview.js, live-preview.css, index.html] }
poster: poster.webp
jobs: [onboarding, first-impression]
collections: [no-assets]
pairs: [scented-filter-chips]
---
- Чипы — настоящие `<input type="checkbox">` внутри `<label>`, цвет темы в `--c`. Выбранный чип заливается цветом, слева выезжает галочка.
- Счётчик «Pick 3 topics → Pick 2 more → Pick 1 more → Looks good», три точки прогресса и кнопка «Continue» считают выбранные чипы селекторами `:has()`: «два и больше» — `.lpo-chip:has(:checked) ~ .lpo-chip:has(:checked)`, «три и больше» — цепочка из трёх. Порог 3 записан в CSS; `data-min` проверяет скрипт при отправке.
- Все возможные карточки лежат в `<template class="lpo-cards">`: `data-topic` совпадает со значением чипа, `data-shape` выбирает рисунок. Скрипт собирает ленту из шаблона: последняя выбранная тема первая, остальные по кругу, до `data-max` карточек (4). Первая карточка обведена цветом темы, точка и надпись «For you» тоже берут этот цвет.
- Рисунки карточек — два псевдоэлемента в цвете темы на его оттенке: миска, горы, квадрат с кругом, столбики, орбита, полосы, лист, кадр плёнки, арка. `--v` (0–2) немного сдвигает и поворачивает рисунок, чтобы три карточки одной темы различались.
- Перестройка идёт внутри `document.startViewTransition`: у каждой карточки свой `view-transition-name` и общий `view-transition-class: lpo-card`. Переезд — 460 мс, `cubic-bezier(.32,.72,0,1)`; новая карточка падает сверху из 0,86 масштаба, ушедшая гаснет за 260 мс. Пока переход идёт, у `::view-transition` `pointer-events: none`, а корень страницы не перетекает — чипы можно жать подряд, новый выбор пропускает недоигранный переход.
- Без View Transitions карточки появляются через `@starting-style`. Пусто — четыре серые заготовки и «Your feed builds here».
- Доступность: чипы в `<fieldset>`, выбор объявляет `role="status"` («Music added. Pick 1 more.»), у кнопки `aria-disabled`, пока тем мало. Нажатие раньше времени не отправляет форму: кнопка вздрагивает, фокус уходит на первый невыбранный чип.
- События: `lpo:change` и `lpo:continue` с `detail.topics` в порядке выбора.
- `prefers-reduced-motion`: лента меняется сразу, без переходов и вздрагивания.
- Демо: `?shot=1` — выбраны Travel, Music, Cooking (Cooking ведёт); `?pick=science,film` — другой набор.
