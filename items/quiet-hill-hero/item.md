---
title: Quiet Hill Hero
type: section
status: stable
summary: "Первый экран сайта: закатный холм в WebGL, а поверх него интерфейс в DOM — док, заголовок, стеклянная кнопка, карточка проектов и строка статистики, которые расходятся за курсором каждый на свою глубину."
tech: [HTML, CSS, TypeScript, WebGL]
tags: [hero, landing, webgl, parallax, dock, glass button, stagger, первый экран, холм, параллакс, док]
added: 2026-09-28
origin: own
source: "Portfolio 3D TS2: src/ui/hero/hero.css, src/ui/hero/heroUi.ts, src/ui/hill-ui.css (вход интерфейса), index.html (разметка героя)"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
demo:
  url: https://kloserock97-tech.github.io/gorbachev-nikita-product-designer/?intro=0&lang=en
  background: dark
variants:
  - { id: ts, label: HTML + CSS + TS, files: [hero.html, hero.css, hero-enter.css, heroUi.ts] }
poster: poster.webp
jobs: [first-impression]
collections: [calm, depth]
usedIn: [ts2]
pairs: [magnetic-dock, metal-button, cursor-parallax, side-project-card]
---
- В вариантах только интерфейсный слой, без сцены холма (three.js, шейдеры). Демо — живой сайт с `?intro=0`, без загрузчика.
- Кадр 1600 × 880 в своих единицах: `--u = min(100vw / 1600, 1900px / 1600)`, любой отступ и кегль — `calc(N * var(--u))`. Экран масштабируется целиком, а до 900 px переключается на колонку шириной 760u.
- Канвас сцены лежит на `z-index: 2`, интерфейс над ним. `.stage` центруется полями (`inset: 0; margin: auto`), а не `transform`: transform открыл бы свой контекст наложения, и весь интерфейс ушёл бы под канвас. По той же причине на `.stage` нельзя держать постоянный `will-change`; когда прокрутка сдвигает слой, он получает `z-index: 4`.
- Параллакс: `heroUi.ts` подтягивает `--px`/`--py` (−1…1) к курсору по `1 − e^(−3.2·dt)`, так что скорость не зависит от частоты кадров. Слой сдвигается на свою глубину `--pd`: `translate3d(px·pd·−1px, py·pd·−0.6px, 0)`, без поворотов.
- В кадре DOM не читается: прямоугольники дока меряются по ResizeObserver и resize, а переменные пишутся, только когда значение изменилось. Параллакс, док и блик кромки считаются в одном requestAnimationFrame.
- Вход: класс `is-ready` ставится после принудительного пересчёта стилей (`void body.offsetHeight`), дальше каскад по `--d`, ease-out `cubic-bezier(.23, 1, .32, 1)`, сдвиг 8–22 px и blur, который гаснет быстрее движения. Через 2,6 с `intro-done` снимает filter, иначе параллакс перерисовывал бы размытие. Канвас не прячется через opacity (Chrome на гибридной графике не выводит невидимый WebGL): поверх лежит заливка цвета неба и растворяется.
