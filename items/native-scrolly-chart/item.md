---
title: Native Scrolly Chart
type: chart
status: stable
summary: "Скролл-история со столбчатым графиком, где шаги текста переключают график без единого слушателя прокрутки: каждый шаг — CSS-триггер, он плавно переводит регистрируемое число из 0 в 1, а столбцы, цвета, подписи и шкала считаются из этих чисел. Где триггеров нет, те же числа ставит IntersectionObserver."
tech: [HTML, CSS, JavaScript, SVG, Scroll-triggered animations, "@property", Container queries]
tags: [scrollytelling, scroll story, scroll-triggered animation, animation-trigger, timeline-trigger, view timeline, "@property", bar chart, data story, chart, sibling-index, скролл-история, сторителлинг, график, столбцы, прокрутка, триггер, данные]
added: 2026-10-09
origin: adapted
priorArt: "Chrome for Developers: scroll-triggered animations (animation-trigger, timeline-trigger)"
source: Shelf
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: html, label: HTML, files: [native-scrolly.css, native-scrolly.js, index.html] }
poster: poster.webp
jobs: [storytelling, data]
pairs: [scroll-chapter-timeline]
---
- История прокручивается внутри своего контейнера `.nsc`. Узко — график прилип сверху на 60% высоты, шаги проходят под ним, линия чтения на 78% высоты. От 640 px ширины контейнера (container query) — шаги слева, график справа на всю высоту, линия чтения посередине.
- Каждый шаг — триггер: `timeline-trigger-name: --nsc-sN` и `timeline-trigger-source: view(block …)` со вставками, которые сжимают область просмотра в линию чтения. Шаг активен, пока лежит на линии. Имена видны графику через `trigger-scope` на `.nsc`.
- Состояние — четыре числа `@property --nsc-on1…4` (`<number>`, 0…1). У столбцов, подписей, шкал и легенды четыре анимации, каждая со своим триггером: `animation-trigger: --nsc-sN play-forwards play-backwards`. Вошли в шаг — число едет к 1 за 720 мс, вышли — обратно. Соседние шаги переливаются друг в друга.
- График — арифметика в `calc()`:
  - высота столбца `scaleY(a·(on1+on2+on3) + b·on4)`: до первого шага столбцы лежат, на шаге 4 перетекают в другую величину (поездки на участника);
  - цвет — `color-mix()` с долей `on2` для летних месяцев и `on3+on4` для зимних, остальные гаснут до 0,4;
  - прошлый год — пунктирные контуры с прозрачностью `on3`, шкала и подпись оси переливаются по `on4`.
  - Столбцы встают по очереди: `animation-delay: calc((sibling-index() - 1) * 26ms)`.
- Высоты внутри истории считаются от `--nsc-h` (высота контейнера, по умолчанию 600 px), а не от `cqh`: в Chrome 154 вкладка падала при сочетании триггеров прокрутки и единиц `cqh` у контейнера-прокрутки с `container-type: size`. Сейчас `container-type: inline-size`, ширина раскладки — через container query.
- Все `animation-*` — отдельными свойствами: сокращённое `animation` вместе с `animation-trigger` некоторые минификаторы CSS склеивают в форму, которую Chrome отбрасывает.
- Заметки и скобки на графике — HTML поверх SVG, координаты в процентах от области столбцов: шрифт не масштабируется вместе с `viewBox`, подписи читаются и на 360 px.
- Фолбэк: без `timeline-trigger` и `animation-trigger` скрипт ставит `.nsc--io` и следит за шагами через IntersectionObserver с `rootMargin`, сжатым до той же линии; номер шага пишется в `data-step`, числа переносят переходы `transition` по зарегистрированным свойствам. Линия пересчитывается при смене раскладки (ResizeObserver).
- Доступность: контейнер истории фокусируется и прокручивается с клавиатуры; график скрыт от скринридера, вместо него — таблица с данными (визуально скрыта), текст шагов читается по порядку.
- `prefers-reduced-motion`: состояния переключаются сразу, без сдвигов и очереди.
- Демо: `?shot=1` — история на шаге 3; `?step=1…4` — любой шаг; `?fallback=1` — путь через IntersectionObserver. В углу подписано, какой путь работает.
