---
title: Metal Button
type: button
status: stable
summary: "Кнопка из дымчатого стекла с первого экрана портфолио: по кромке бежит свет, по наведению проходит проблеск, свечение идёт за курсором, при нажатии сходится кольцо."
tech: [HTML, CSS, React]
tags: [button, glass, glassmorphism, hover, shine, ripple, кнопка, стекло, блик, проблеск]
added: 2026-09-28
origin: own
source: "Portfolio 3D TS2: src/ui/hero/hero.css (.metal, .metal-rim), src/ui/hero/heroUi.ts"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
registry: metal-button
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: html, label: HTML, files: [metal-button.css, metal-button.js, index.html] }
  - { id: react, label: React, files: [MetalButton.tsx, metal-button.css] }
poster: poster.webp
---
- Свет по кромке — неподвижный конический градиент на слое `.metal-rim`, который вращается под кольцевой маской (`mask-composite: exclude`). Раньше (до v79) крутился угол градиента через `@property --beam`: браузер пересчитывал стили каждый кадр, около 2 мс главного потока, пока кнопка на экране. Поворот слоя ведёт видеокарта.
- Кольцо маски лежит у внутреннего края рамки: саму рамку обрезает `overflow: hidden` кнопки. Проблеск по той же причине едет `translate` слоя шириной 2,5 кнопки (−78% → 18%), а не `background-position`.
- Под курсором свет по кромке ускоряется с 9 до 3,2 с на оборот. На сайте это смена `animation-duration`, и угол при наведении прыгает; здесь скрипт меняет `updatePlaybackRate`, угол сохраняется. Без JS остаётся вариант с прыжком.
- На тач-экранах `backdrop-filter` выключен: над живым WebGL-холстом он заново размывал кусок кадра каждый кадр, на iPhone 11 интерфейс стоил около 12 мс. Над небом размытие почти не видно.
- `prefers-reduced-motion` гасит проблеск и свет по кромке. На сайте после v79 правило забыло про `.metal-rim::before`, и кромка там крутится и при «меньше движения»; здесь исправлено.
- Размеры `lg` и `md` — кнопка «See the work» на десктопе и на телефоне, `icon` — круглая кнопка «Позвать ветер». Все числа — пиксели кадра героя 1600 × 880, их масштабирует `--metal-u`.
