---
title: Swipe Strip
type: gallery
status: stable
summary: "Лента карточек на родном scroll-snap, которая держит один номер карточки вместе с внешней прокруткой: страница ведёт ленту, свайп переставляет страницу."
tech: [TypeScript, CSS]
tags: [carousel, scroll-snap, swipe, sync, scrollend, hysteresis, карусель, лента, свайп, синхронизация]
added: 2026-09-28
origin: own
source: "Portfolio 3D TS2: src/ui/swipeStrip.ts, src/scene/story.ts (stickyIndex), src/ui/cases.ts, src/ui/hill-ui.css"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: ts, label: TypeScript, files: [swipeStrip.ts, swipe-strip.css, main.ts] }
poster: poster.webp
jobs: [showcase, discovery]
usedIn: [ts2]
pairs: [scroll-chapter-timeline, experiments-deck, object-card]
---
- Лента — обычная горизонтальная прокрутка с `scroll-snap-type: x mandatory` и `scroll-snap-stop: always`. Инерцию, отскок и «один бросок — одна карточка» даёт браузер, скрипт только слушает.
- Две оси связаны номером карточки. Страница дошла до карточки → `follow(i)` плавно везёт ленту. Человек перелистнул сам → `onUserSettle(i)`, и страница встаёт на ту же карточку. Пока палец на ленте, страница её не трогает.
- Остановку ловит `scrollend`, а в Safari, где его нет, — 160 мс тишины после последнего `scroll`. Срабатывает один раз на движение; свою автопрокрутку от жеста человека отличает флаг `auto`.
- `stickyIndex` — гистерезис: вперёд, когда пройдено 60 % шага, назад — когда отступили на 60 %. С простым округлением карточка менялась от 200 px случайной вертикальной прокрутки сразу после свайпа.
- Шаг — 0,85 экрана прокрутки на карточку. Бросок пальцем на 500 px увозит страницу примерно на 1,2 экрана, и при шаге 0,5 он пролистывал две-три карточки.
- После свайпа страница прыгает мгновенно, а номер держится до 2,5 с: иначе следующий кадр прокрутки тянул бы ленту назад. В демо две полоски внизу показывают обе оси.
- Демо собрано из варианта TS командой esbuild (см. demo/app.js)
