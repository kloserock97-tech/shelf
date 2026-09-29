---
title: Case Study Page
type: section
status: stable
summary: "Страница кейса как один рассказ: герой, плитки фактов, разделы с иконками, одна навигация (панель прогресса и капсула-оглавление) и пять видов галерей на сцене, которая всегда помещается в окно."
tech: [TypeScript, CSS]
tags: [case study, page, long read, table of contents, gallery, scroll-spy, кейс, страница кейса, лонгрид, оглавление, галерея]
added: 2026-09-28
origin: own
source: "Portfolio 3D TS2: src/ui/caseStoryView.ts, src/ui/case-story.css, src/ui/caseHero.ts"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
demo:
  url: https://kloserock97-tech.github.io/gorbachev-nikita-product-designer/?lang=en#/work/community
  background: light
variants:
  - { id: ts, label: TypeScript, files: [caseStoryView.ts, caseHero.ts] }
  - { id: css, label: CSS, files: [case-story.css] }
poster: poster.webp
jobs: [storytelling, showcase, navigation]
usedIn: [ts2]
pairs: [toc-capsule, sticky-film-screen, before-after-slider, spot-gallery]
---
- Навигация одна. Сверху панель: назад, название кейса с линией прогресса (проявляется, когда герой ушёл вверх), соседние кейсы. Снизу плавающая капсула: текущий раздел и кольцо прочитанного, по клику — лист оглавления. Разборы в глубину вложены в раздел «Решения» как `<details>` и открываются на месте, адрес `#/work/<кейс>/<разбор>` сохраняется.
- Текущий раздел считается по прокрутке, а не через IntersectionObserver: это последний заголовок, поднявшийся выше 150 px от верха. После прыжка по оглавлению заголовок встаёт у самой панели и в полосу наблюдателя не попадает.
- Любой экран стоит на одной сцене `.cs-stage`: высота `min(--stage-h, ширина колонки / --ar)`, где `--stage-h = clamp(340px, 100svh − 230px, 780px)`. Размер картинки считается явно через `cqw`, а не процентом: сцена всегда помещается в окно и не прыгает, когда файл догрузился.
- Галереи вместо рамок: film (высокий экран едет внутри закреплённой сцены ровно на столько, на сколько прокрутили страницу), compare (ползунок «было/стало»), spot (точки ведут к решениям), stack (веер телефонов), bento (сетка, окно просмотра с зумом до 6×).
- Герой — мокап в цвет кейса (`caseArt.ts/.css`, в варианты не вошёл): фигура под 45°, в ней экран в перспективе, слои расходятся за курсором.
- Первое предложение лида и подписи набрано чернилами, продолжение серым (`runIn`), так глаз идёт по длинному абзацу. Код справочный, как есть: импорты данных, i18n, иконок и типографа не вычищены.
