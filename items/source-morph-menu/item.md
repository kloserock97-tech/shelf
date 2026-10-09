---
title: Source-Morph Menu
type: overlay
status: stable
summary: "Меню, которое вырастает из открывшей его кнопки: прямоугольник кнопки с её цветом и скруглением перетекает в панель, а пункты появляются каскадом от кнопки. При закрытии панель стекает обратно в кнопку. Работает с любой кнопкой в любом углу экрана."
tech: [HTML, CSS, JavaScript, Popover, Invoker Commands, Anchor Positioning, "@starting-style", clip-path, sibling-index(), linear()]
tags: [menu, popover, dropdown, morph, context menu, anchor positioning, starting-style, clip-path, cascade, spring, меню, выпадающее меню, поповер, морфинг, вырастает из кнопки, каскад, пружина]
added: 2026-10-09
origin: adapted
priorArt: "меню и попапы Liquid Glass в iOS 26, которые раскрываются из кнопки-источника"
source: Shelf
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: html, label: HTML, files: [source-morph-menu.js, source-morph-menu.css, index.html] }
poster: poster.webp
jobs: [navigation, input]
pairs: [morphing-island]
---
- Источник — любая кнопка с `commandfor` + `command="toggle-popover"`, меню — `.smm[popover][role=menu]` с `.smm__body` и пунктами `.smm__item`. Без Invoker Commands скрипт ставит `popoverTargetElement`.
- Перед каждым открытием (`beforetoggle`) скрипт меряет источник: ширину, высоту, радиус угла (не больше половины стороны), цвет фона и текста — и кладёт их в `--src-*`. Угол, из которого растёт панель, выбирается по положению источника: правая половина экрана — от правого края, нижние 40% — вверх. Получаются `data-x="start|end"` и `data-y="down|up"`.
- Позиция — anchor positioning: у каждого источника своё имя якоря, панель ставит тот же угол на тот же угол (`left: anchor(left)`, `bottom: anchor(bottom)` и т.д.). Без якорей скрипт пишет `left/right/top/bottom` по прямоугольнику источника; при ресайзе (и при прокрутке без якорей) меню закрывается.
- Морф: `.smm__body` закрыт `clip-path: inset()` размером с источник в его углу и с его радиусом (`--smm-from`), открыт — `inset(0 round 22px)`; старт через `@starting-style`. Фон и текст за 160 мс переходят от цвета источника к цвету панели. Тень — `filter: drop-shadow` на внешнем элементе: `box-shadow` под `clip-path` обрезался бы.
- Шапка панели — копия источника (`cloneNode`, `inert`, `aria-hidden`) на том же месте, поэтому кнопка будто остаётся, а панель растёт из неё. Иконка с `data-smm-turn` поворачивается на 45° (плюс → крестик). Клик по шапке закрывает меню. Сам источник под открытой панелью гаснет (`opacity`, чтобы фокус мог вернуться) и проявляется, когда панель стекла в него.
- Пружины — затухающий осциллятор, заданный периодом и долей отскока (ζ = 1 − bounce), свёрнутый в `linear()` с прореживанием точек: форма — 0,56 с / 0,16, пункты — 0,44 с / 0,36. Закрытие — 280 мс без отскока, цвет возвращается в последние 150 мс; `display`/`overlay` с `allow-discrete`.
- Каскад: 70 мс + 30 мс на пункт, ближний к источнику первым — `sibling-index()` (для меню вверх — `sibling-count() − sibling-index()`), фолбэк — `--smm-i`, который скрипт ставит сам. Пункты въезжают на 8 px со стороны источника.
- Клавиатура: при открытии фокус на отмеченном пункте или на ближнем к источнику; ↑/↓/Home/End, Enter, Esc и клик мимо закрывают, Tab закрывает и уходит дальше; фокус возвращается на источник. `aria-haspopup="menu"`, `aria-expanded`, `menuitemradio` с `aria-checked`. Выбор шлёт событие `smm:pick` с `{ item, value }`.
- `prefers-reduced-motion`: панель сразу полной формы и только проявляется, пункты без сдвига.
- Демо: три источника — плашка рабочего пространства слева сверху, капсула «New» справа сверху, квадратная кнопка «Share» справа снизу (меню растёт вверх-влево). `?shot=1` — открыто меню New, `?shot=2` — Share.
