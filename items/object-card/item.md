---
title: Object Card
type: card
status: stable
summary: "Карточка проекта по схеме Apple «Get to know»: светлая сцена в цвет проекта, вырезанный предмет без фона, срезанный краем, и кнопка, которая раскрывается в подпись. Все размеры — в долях ширины карточки."
tech: [HTML, CSS, JavaScript, React]
tags: [card, case study, container queries, cqw, parallax, hover, карточка, кейс, параллакс, предмет]
added: 2026-09-28
origin: own
source: "Portfolio 3D TS2: src/ui/case-cards.css, src/ui/caseLook.ts (lookVars, objectPicture), src/ui/cases.ts"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
registry: object-card
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: html, label: HTML, files: [object-card.css, object-card.js, index.html] }
  - { id: react, label: React, files: [ObjectCard.tsx, object-card.css] }
poster: poster.webp
---
- Всё внутри карточки — в `cqw` при `container-type: size`: карточка бывает от 220 до 400 px, а композиция «текст сверху, предмет снизу» остаётся той же. Набок (`@container (min-aspect-ratio: 1.2)`) текст уходит влево, предмет вправо.
- Цвета и раскладка предмета приходят переменными на саму карточку: `--s1`/`--s2` — сцена, `--ink` — текст и кнопка, `--accent` — метка, `--ow`/`--ox`/`--oy` — ширина и место предмета в долях карточки. Одна разметка на все проекты.
- Сцена светлая нарочно: предметы вырезаны со светлых обложек, и полупрозрачное стекло на светлом выглядит чисто, а на тёмном даёт ореол.
- Предмет «приподнят» сдвигом, а не 3D: `overflow: hidden` у карточки расплющивает `preserve-3d`. Сдвиг складывается из места карточки в ряду (`--tilt`, −1…1, до 5,5 cqw) и курсора (`--px`/`--py`, до 1,8 cqw).
- Кнопка раскрывается через `grid-template-columns: 0fr → 1fr` за 0,55 с — ширина подписи не меряется скриптом. Под курсором ещё свет `radial-gradient` в точке `--mx`/`--my`, он лежит под предметом.
