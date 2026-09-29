---
title: Contents Capsule
type: navigation
status: stable
summary: "Плавающая капсула внизу страницы: номер и название раздела, который сейчас читают, и кольцо прочитанного. По клику — лист оглавления с вложенными разборами, которые открываются на месте."
tech: [HTML, CSS, JavaScript, React]
tags: [table of contents, toc, scroll-spy, progress, bottom sheet, capsule, details, оглавление, содержание, прогресс чтения, нижний лист, капсула]
added: 2026-09-28
origin: own
source: "Portfolio 3D TS2: src/ui/caseStoryView.ts (капсула, лист, scroll-spy), src/ui/case-story.css (.cs-toc-btn, .cs-sheet, .cs-toc)"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
registry: toc-capsule
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: html, label: HTML, files: [toc-capsule.js, toc-capsule.css, index.html] }
  - { id: react, label: React, files: [TocCapsule.tsx, toc-capsule.css] }
poster: poster.webp
jobs: [navigation]
usedIn: [ts2]
pairs: [case-study-page, smooth-wheel]
---
- Текущий раздел считается по прокрутке, раз в кадр: последний заголовок, поднявшийся выше линии 150 px. IntersectionObserver тут подводит: после прыжка по оглавлению заголовок встаёт у самого верха и в полосу наблюдателя не попадает.
- Кольцо — `conic-gradient` на доле прочитанного, выдолбленный радиальной маской (`transparent 9.5px, #000 10px`). Одна переменная `--p`, никакого SVG.
- Разборы в глубину — обычные `<details>` внутри раздела. В оглавлении они вложены под него: клик открывает блок и едет к нему, раскрытие руками пишет id в адрес, закрытие убирает. Разбор считается текущим, только пока открыт, а капсула показывает его раздел.
- На широком экране лист встаёт панелью над капсулой, уже 760 px — нижним листом от края до края. До первого заголовка капсула пишет «01 Contents».
- Клавиатура: Esc закрывает лист, фокус уходит в лист и возвращается на капсулу, Tab не выходит из листа, после перехода фокус встаёт на выбранный раздел. Цвета через `light-dark()` — тёмная тема включается, если страница объявила `color-scheme: light dark`.
- Отступ капсулы снизу — `--toc-bottom`: 20 px, во фрейме полки 68 px (там внизу своя панель). Прыжок к разделу оставляет над ним место под верхнюю панель: 84 px, в демо без панели — 40.
