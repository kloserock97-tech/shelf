---
title: Retro Desktop Screen
type: app
status: stable
summary: "Экран монитора из 2000-х на CanvasTexture: рабочий стол, окно браузера с домашней страницей, часы на панели задач и рабочие кнопки; страница прокручивается прямо в шейдере, без перерисовки."
tech: [TypeScript, three.js, GLSL, Canvas 2D]
tags: [retro, desktop, y2k, canvas texture, crt, scroll, raycast, ретро, рабочий стол, монитор, домашняя страница]
added: 2026-09-28
origin: own
source: "Portfolio 3D TS2: src/scene/portfolioScreen.ts"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: ts, label: TypeScript, files: [retro-screen.ts, retro-content.ts, monitor.ts, main.ts] }
related: [crt-screen-shader]
poster: poster.webp
---
- Две текстуры: `chrome` — всё неподвижное (обои, рамка окна, меню, адрес, панель задач) с прозрачной дырой под страницу, и `page` — вся страница одной длинной полосой. Шейдер склеивает их и сдвигает страницу на величину прокрутки: при скролле ничего не перерисовывается и не грузится в видеокарту.
- Ползунок полосы прокрутки тоже рисует шейдер; часы перерисовывают только `chrome`, раз в минуту.
- Кнопки первого экрана работают: луч в меш экрана → uv → `buttonAt` пересчитывает uv с той же выпуклостью стекла, что и шейдер, и с учётом прокрутки. Наведение подсвечивает кнопку, клик листает к разделу.
- Страница вёрстается в логических пикселях и рисуется в 1,3 раза крупнее — иначе текст на мониторе в кадре мелкий. UV экрана идут сверху, как у холста, поэтому `flipY = false`.
- Поверх — слабый кинескоп (подробно — CRT Screen Shader). Значок у Start — свой холм с солнцем, без чужих логотипов. Человек и портрет выдуманные: тексты в `retro-content.ts`, аватар нарисован на холсте.
- Монитор в демо собран из примитивов; в портфолио экран натянут на меш модели ПК, которую сюда не переносили.

Демо собрано из варианта TS командой esbuild (см. demo/app.js)
