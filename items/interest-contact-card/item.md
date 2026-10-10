---
title: Interest Contact Card
type: overlay
status: stable
summary: "Имя человека в тексте — обычная ссылка, которая при наведении, фокусе с клавиатуры или долгом нажатии открывает карточку: роль, местное время с отметкой рабочих часов, как быстро отвечает, кнопки «Copy email» и «Write». Где есть interest invokers, задержки и уход курсора ведёт браузер, в остальных — свой маленький скрипт."
tech: [HTML, CSS, JavaScript, Interest Invokers, Popover API, CSS Anchor Positioning, Intl]
tags: [hover card, contact card, mention, interestfor, interest invokers, popover hint, anchor positioning, profile preview, time zone, copy email, карточка контакта, упоминание, всплывающая карточка, наведение, часовой пояс, контакт, почта]
added: 2026-10-09
origin: adapted
priorArt: "Hover-карточки профилей GitHub и Linear; MDN: Using interest invokers"
source: Shelf
platform: [web, mobile]
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: html, label: HTML, files: [contact-card.js, contact-card.css, index.html] }
poster: poster.webp
jobs: [contact, discovery]
pairs: [copy-address-button, slot-picker-ics]
---
- Разметка: `<a class="icc-mention" interestfor="card-id">` и сразу за ней `<span class="icc-card" id="card-id" popover="hint">`. Карточка стоит в тексте сразу после имени, поэтому Tab ведёт с имени в её кнопки, а скрытая карточка (`display: none`) не попадает ни в порядок табуляции, ни в чтение скринридера.
- Где есть interest invokers (`interestForElement` у ссылки), скрипт в показ не вмешивается: задержки задаёт `interest-delay: 0.4s 0.25s` на ссылке, переход курсора с имени на карточку, фокус и долгое нажатие на тач-экране обрабатывает браузер. Подсветка имени — `:interest-source`.
- `popover="hint"` не закрывает уже открытые `auto`-поповеры (меню, листы): карточка может всплыть поверх открытого меню. Без `hint` — `auto` при родных invokers и `manual` при своём скрипте.
- Свой контроллер (нет interestfor или `data-icc-fallback` на корне): наведение мышью или пером — показ через 400 мс; уход с имени и с карточки — скрытие через 250 мс, за это время можно перейти на карточку. Фокус с клавиатуры (`:focus-visible`) показывает её с той же задержкой, уход фокуса из пары «имя + карточка» прячет. На тач-экране удержание 480 мс показывает карточку и гасит клик и контекстное меню, сдвиг пальца больше 10 px отменяет. Esc закрывает и возвращает фокус на имя, касание мимо — закрывает.
- Позиция — CSS anchor positioning: `position-area: block-end span-inline-end`, 10 px от имени, `position-try-fallbacks: flip-block, flip-inline`. Свой контроллер даёт имени `anchor-name` и ставит карточке `position-anchor`; где якорей нет, считает `top/left` по прямоугольнику имени и держит карточку в 12 px от краёв окна, пересчёт на прокрутке и ресайзе.
- Местное время: `data-tz` (IANA) и `data-city`. Смещение пояса — через `Intl.DateTimeFormat(...).formatToParts`, разница с посетителем пишется как «2 h behind you», «5 h 30 min ahead of you» или «same time as you». `data-hours="9-18"` — рабочие часы с понедельника по пятницу; в них точка зелёная, скринридер слышит «working hours». Пока карточка открыта, время обновляется по границе минуты, закрытая ничего не считает.
- «Copy email» кладёт `data-email` в буфер (запасной путь — скрытое поле и `execCommand`, если и он закрыт — `mailto:`), подпись на 1,6 с меняется на «Copied» с галочкой, `role="status"` объявляет адрес. Карточка шлёт всплывающее событие `copied`. «Write» — ссылка `mailto:`.
- Появление: прозрачность и сдвиг на 6 px за 260 мс через `@starting-style` и `transition` с `display`/`overlay allow-discrete`. `prefers-reduced-motion` — только прозрачность.
- `data-icc-now="2026-10-14T13:20:00Z"` на корне закрепляет часы (скриншоты, тесты).
- Без Popover API карточка переключается классом `icc-open` и ставится скриптом.
- Демо: `?shot=1` — открыта карточка Mira Okafor; `?fallback=1` — свой контроллер даже там, где есть interestfor.
