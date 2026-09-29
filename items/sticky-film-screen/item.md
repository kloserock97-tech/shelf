---
title: Sticky Film Screen
type: scroll
status: stable
summary: "Высокий экран закрепляется под панелью и проезжает внутри сцены ровно на столько, на сколько прокрутили страницу: скорость скролла не меняется, а сцена всегда помещается в окно."
tech: [HTML, CSS, JavaScript]
tags: [scroll, sticky, gallery, screenshot, case study, container queries, прокрутка, липкий, галерея, скриншот, кейс]
added: 2026-09-28
origin: own
source: "Portfolio 3D TS2: src/ui/caseStoryView.ts (gallery film, mountStory), src/ui/case-story.css (.cs-stage, .cs-stage-media, .cs-film)"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: html, label: HTML, files: [film.css, film.js, index.html] }
poster: poster.webp
---
- Запас хода — отдельный пустой блок `.film-run` после липкого, высотой ровно в ту часть экрана, что не влезла в сцену. Padding у родителя не годится: липкий блок держится только внутри содержимого родителя.
- Сдвиг экрана — на сколько верх блока ушёл за линию прилипания, но не больше запаса. Страница крутится с родной скоростью, экран едет 1:1 с ней, колесо никто не перехватывает.
- Сцена помещается в окно: `--stage-h = clamp(340px, 100svh − 230px, 780px)`, а короткому экрану сцена не выше его самого (`--film-h`).
- Размер экрана в обычной сцене — явная формула от `cqw` и `--ar/--iar`, а не проценты: проценты ломались, когда картинка догружалась и распирала блок своим размером.
- Отступ сцены берётся из `offsetTop` дорожки: `getPropertyValue('--stage-pad')` отдаёт строку `clamp(...)`, и `parseFloat` даёт NaN.
- Затемнение у нижнего края сцены подсказывает, что экран длиннее; в конце хода оно гаснет (`.is-end`).
