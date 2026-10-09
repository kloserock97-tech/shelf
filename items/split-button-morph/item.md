---
title: Split Button Morph
type: button
status: stable
summary: "Кнопка из двух частей: главное действие и меню вариантов. При открытии правая половина перетекает из полукапсулы в круг, шеврон переворачивается, а меню выходит прямо из круга; выбранный вариант выполняется и становится главным действием, кнопка помнит его между визитами."
tech: [HTML, CSS, JavaScript, Popover, Invoker Commands, Anchor Positioning, "@starting-style", linear()]
tags: [split button, dropdown button, menu button, popover, anchor positioning, morph, spring, remember choice, кнопка с меню, сплит-кнопка, выпадающее меню, экспорт, пружина, морфинг, запоминание выбора]
added: 2026-10-09
origin: adapted
priorArt: "Material 3 Expressive split button (Google, 2025)"
source: Shelf
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: html, label: HTML, files: [split-button.js, split-button.css, index.html] }
poster: poster.webp
jobs: [input, navigation]
---
- Разметка: `.spb__main` + `.spb__toggle[commandfor][command=toggle-popover]` + `.spb__menu[popover][role=menu]` с пунктами `menuitemradio`. Без Invoker Commands скрипт переключает кнопку на `popoverTargetElement`.
- Морф на CSS: `.spb:has(.spb__menu:popover-open)` меняет у кнопки-меню ширину 38 → 44 px, радиусы 7/22 → 22 (круг), зазор 3 → 7 px и заливку; шеврон поворачивается на 180°. Справа у группы зарезервирована полоска 10 px, круг растёт в неё, поэтому соседи не сдвигаются.
- Меню привязано к кнопке через anchor positioning: `position-area: bottom span-left` — правый край меню на правом краю круга, запасные позиции `flip-block`/`flip-inline`. Имя якоря у каждого экземпляра своё (`--spb-N`). Без якорей скрипт ставит `top`/`right` по прямоугольнику кнопки.
- Появление: `@starting-style` — `clip-path: inset()` размером с круг в правом верхнем углу, меню сдвинуто вверх на высоту кнопки + 8 px, то есть стоит ровно на круге; оттуда раскрывается и съезжает вниз. Закрытие — обратно в круг за 220 мс без отскока, `display`/`overlay` с `allow-discrete`. Пункты — каскад 32 мс через `sibling-index()`, фолбэк `--spb-i` по `nth-child`.
- Пружины — затухающий осциллятор, заданный периодом и долей отскока (ζ = 1 − bounce), свёрнутый в `linear()` с прореживанием точек. Морф — 0,5 с / 0,3; смена ширины главной кнопки — 0,42 с / 0,18.
- Выбор пункта выполняет действие, ставит его подпись на главную кнопку (ширина едет FLIP-анимацией, подпись въезжает снизу) и пишет значение в `localStorage` под `spb:<data-key>`; при открытии страницы выбор восстанавливается. Обе кнопки шлют событие `spb:run` с `{ value, label }`, иконка на 1,4 с сменяется галочкой.
- Клавиатура: стрелка вниз на кнопке-меню открывает меню, фокус встаёт на текущий вариант; ↑/↓/Home/End ходят по пунктам, Enter выбирает, Esc и клик мимо закрывают (light dismiss), Tab закрывает и уводит дальше. `aria-expanded`, `aria-haspopup="menu"`, `aria-checked` у пунктов.
- `prefers-reduced-motion`: без морфа и сдвигов, меню и пункты только проявляются.
- Если меню перевернулось вверх (`flip-block`), стартовый круг всё равно смещён вверх — появление выглядит как сдвиг, а не рост из кнопки.
- Демо: `?shot=1` — прошлый выбор PDF, меню экспорта открыто. Второй экземпляр — тихий вид `.spb--soft`.
