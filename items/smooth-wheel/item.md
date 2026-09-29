---
title: Smooth Wheel
type: scroll
status: stable
summary: "Сглаживание колеса мыши без scrolljacking: путь 1:1, сглаживается только рывок (экспонента, λ = 6,5), а тачпад, палец, клавиатура, вложенные блоки и reduced motion остаются родными."
tech: [TypeScript]
tags: [scroll, smooth scroll, wheel, scrolljacking, accessibility, reduced motion, прокрутка, колесо, плавный скролл, сглаживание]
added: 2026-09-28
origin: own
source: "Portfolio 3D TS2: src/ui/smoothScroll.ts, src/scrollFeel.ts"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: ts, label: TypeScript, files: [smoothScroll.ts, scrollFeel.ts, main.ts] }
poster: poster.webp
jobs: [quality]
usedIn: [ts2]
pairs: [toc-capsule, scroll-chapter-timeline]
---
- Расстояние 1:1: щелчок проезжает ровно столько, сколько без скрипта, сглаживается только рывок. Позиция догоняет цель по экспоненте `1 − e^(−6,5·dt)`, 95% пути примерно за 0,46 с. Скорость и направление прокрутки не меняются.
- Шаг считается от настоящего времени кадра, поэтому на слабом устройстве с редкими кадрами движение занимает те же полсекунды. Прокрутка настоящая (`scrollTo`, `scrollTop`), без transform: sticky, якоря и IntersectionObserver работают как обычно.
- Родным остаётся всё, кроме колеса мыши: тачпад (пиксельные дельты меньше 40 — у него своя инерция, второе сглаживание даёт «резину»), палец, клавиши, полоса прокрутки, поиск, Ctrl + колесо и вложенные блоки, пока им есть куда ехать. Сдвинул страницу кто-то другой — цель бросается, место подхватывается.
- `to()` — переход по оглавлению тем же движением: издалека сначала перескок на 1,2 экрана до цели, потом мягкая посадка, а не пролёт через всю страницу.
- На краю страницы колесо не глотается, а уходит странице снаружи: в iframe внешняя страница крутится, даже когда курсор над демо. Третий необязательный аргумент `report` сообщает, куда ушло событие (индикатор в демо).
- При prefers-reduced-motion сглаживания нет совсем, а `to()` ставит место сразу.
- Демо собрано из варианта TS командой esbuild (см. demo/app.js)
