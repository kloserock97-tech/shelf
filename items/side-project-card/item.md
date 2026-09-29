---
title: Side Project Card
type: card
status: stable
summary: "Карточка-листалка проектов: картинка с названием и ссылкой на демо, плашка ‹ 01/04 › в углу, шеврон раскрывает описание с цифрами, свайп и стрелки, превью-ролик играет, только когда карточку видно."
tech: [HTML, CSS, React]
tags: [card, carousel, pager, swipe, expand, accordion, video preview, карточка, карусель, листалка, раскрытие, свайп]
added: 2026-09-28
origin: own
source: "Portfolio 3D TS2: src/ui/fieldNote.ts, src/ui/hero/note-card.css, src/data/notes.ts, src/ui/hero/hero.css (.card), src/ui/hill-ui.css (видео)"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
registry: side-project-card
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: html, label: HTML, files: [side-project-card.js, side-project-card.css, projects.js, index.html] }
  - { id: react, label: React, files: [SideProjectCard.tsx, side-project-card.css] }
poster: poster.webp
jobs: [showcase]
usedIn: [ts2]
pairs: [quiet-hill-hero, cursor-parallax, line-icons]
---
- Описание раскрывается сеткой `grid-template-rows: 0fr → 1fr` за 0,7 с — высота берётся от содержимого, без замеров. Текст внутри проявляется с задержкой 0,25 с, а `visibility` выключается только после закрытия, чтобы ссылки не ловили Tab.
- Открытая карточка растёт вниз. Если низ уходит за окно, она поднимается (`--note-lift`, отрицательный `margin-top`), потом картинка отдаёт до 38% высоты, и только потом описание прокручивается внутри (`.is-tight`). Высоты считаются от единицы кадра, а не от `offsetHeight`, который посреди перехода врёт. На узком экране карточка просто растёт, страница листается.
- Листание: подпись и картинка гаснут и съезжают в сторону листания, новая картинка ждёт декодирования, но не дольше 900 мс. Открытая карточка остаётся открытой. Свайп — pointer events с `touch-action: pan-y`: вертикаль остаётся странице, картинка едет за пальцем с сопротивлением 0,45 (до 56 px), листает сдвиг больше 44 px.
- Кликабельна вся картинка, но настоящая ссылка — название: так работают Tab, скринридер и «открыть в новой вкладке». Клик после свайпа (400 мс) демо не открывает.
- Превью-ролик идёт поверх постера (его первого кадра) и проявляется по событию `playing`; играет, только пока карточка в кадре и вкладка активна (IntersectionObserver, visibilitychange). При reduced motion, Save-Data и на телефоне ролик не подключается вовсе и не качается — остаётся постер.
- Контент — четыре WebGL-проекта (Windcrest, Driftfield, Nightsail, Meadow Walk). Ролики — H.264 CRF 32 (608 × 320, ~0,7 МБ на все четыре). Параллакс карточки за курсором — отдельный элемент Cursor Parallax.
