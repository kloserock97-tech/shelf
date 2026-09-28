---
title: Magnetic Dock
type: navigation
status: stable
summary: "Док навигации с первого экрана портфолио: пункты подрастают, когда к ним подводят курсор, кромка загорается в точке курсора, а текущий раздел подсвечивается сам по прокрутке."
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
---
- Рост — не `:hover`, а близость: каждый пункт меряет, как далеко курсор по горизонтали, и растёт на smoothstep от этого расстояния, до 16%, вниз от верхней кромки (`transform-origin: 50% 0`). Тянет на 2,6 высоты дока в стороны, на одну выше и на 2,2 ниже.
- Значения сглаживаются `1 − e^(−rate·dt)` — не зависит от частоты кадров. Один `requestAnimationFrame` на всё, в DOM пишется только изменившееся число (округление до 0,001). Прямоугольники меряются, когда док изменился (ResizeObserver, resize, scroll), а не каждый кадр. В отличие от сайта цикл засыпает, когда всё успокоилось.
- Блик кромки — второй фон под прозрачной рамкой: `radial-gradient(… at var(--gx) var(--gy)) border-box`. Без `backdrop-filter`: на сайте под доком каждый кадр перерисовывается WebGL. На живом сайте этот слой перекрыт: `hill-ui.css` задаёт доку `background` целиком, и блик не рисуется, хотя скрипт его считает. Здесь слой на месте.
- Активный пункт — последний раздел, чей верх прошёл 40% окна (scroll-spy на `requestAnimationFrame`). Знак в начало не подсвечивается. Там же на сайте баг: активный пункт под курсором получает белый текст на бумажном фоне; здесь правило активного пункта сильнее.
- На телефоне остаются значки с нижними пределами 44–56 px под палец. На сайте подпись прячется `display: none`, и у ссылок пропадает имя для скринридера; здесь она скрыта только визуально.
- Фокус с клавиатуры (`:focus-visible`) раздувает пункт как курсор; клик мышью эффект не замораживает. Вход — каскад из размытия с шагом `--d`, после него `filter` снимается совсем. Меню Work и переключатель языка с сайта не перенесены.
