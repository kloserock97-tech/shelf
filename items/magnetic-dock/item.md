---
title: Magnetic Dock
type: navigation
status: stable
summary: "Док навигации: пункты подрастают, когда к ним подводят курсор, кромка загорается в точке курсора, а текущий раздел подсвечивается сам по прокрутке."
tech: [HTML, CSS, React]
tags: [dock, navbar, navigation, scroll-spy, proximity, magnetic, glass, док, навигация, меню, скролл]
added: 2026-09-28
origin: own
source: "Portfolio 3D TS2: index.html (док), src/ui/hero/hero.css, src/ui/hill-ui.css, src/ui/hero/heroUi.ts, src/ui/dockNav.ts"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
registry: magnetic-dock
demo:
  path: demo/index.html
  background: light
  grid: false
variants:
  - { id: html, label: HTML, files: [dock.js, dock.css, index.html] }
  - { id: react, label: React, files: [MagneticDock.tsx, magnetic-dock.css] }
poster: poster.webp
jobs: [navigation]
collections: [feels-expensive, playful]
usedIn: [ts2]
pairs: [quiet-hill-hero, work-mega-menu, line-icons]
---
- Рост — не `:hover`, а близость: каждый пункт меряет, как далеко курсор по горизонтали, и растёт на smoothstep от этого расстояния, до 16%, вниз от верхней кромки (`transform-origin: 50% 0`). Тянет на 2,6 высоты дока в стороны, на одну выше и на 2,2 ниже.
- Значения сглаживаются `1 − e^(−rate·dt)` — не зависит от частоты кадров. Один `requestAnimationFrame` на всё, в DOM пишется только изменившееся число (округление до 0,001). Прямоугольники меряются, когда док изменился (ResizeObserver, resize, scroll), а не каждый кадр. Цикл засыпает, когда всё успокоилось.
- Блик кромки — второй фон под прозрачной рамкой: `radial-gradient(… at var(--gx) var(--gy)) border-box`. Без `backdrop-filter`: под доком может идти WebGL, который перерисовывается каждый кадр. Фон дока нельзя задавать сокращением `background` — оно стирает слой блика.
- Активный пункт — последний раздел, чей верх прошёл 40% окна (scroll-spy на `requestAnimationFrame`). Знак в начало не подсвечивается. Правило активного пункта сильнее правила наведения, иначе под курсором белый текст ляжет на светлый фон.
- На телефоне остаются значки с нижними пределами 44–56 px под палец. Подпись скрыта только визуально: у ссылок остаётся имя для скринридера.
- Фокус с клавиатуры (`:focus-visible`) раздувает пункт как курсор; клик мышью эффект не замораживает. Вход — каскад из размытия с шагом `--d`, после него `filter` снимается совсем.
