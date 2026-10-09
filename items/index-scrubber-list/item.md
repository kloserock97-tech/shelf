---
title: Index Scrubber List
type: list
status: stable
summary: "Список контактов с рейлом A–Z у края: если вести по нему пальцем, список прыгает к букве, рядом с пальцем едет крупная буква-пузырь, на каждой новой букве звучит тик. Пустые буквы сжаты в точки и пропускаются, а залипший заголовок секции становится стеклянной плашкой со счётчиком."
tech: [HTML, CSS, JavaScript, Container Scroll-State Queries, IntersectionObserver, Pointer Events, Web Audio API]
tags: [index, alphabet, a-z, scrubber, section index, contacts, sticky header, scroll-state, stuck, fisheye, ios, индекс, алфавит, указатель, контакты, залипающий заголовок, перемотка]
added: 2026-10-09
origin: adapted
priorArt: "Apple iOS Contacts: section index; Chrome for Developers, CSS scroll-state queries (developer.chrome.com/blog/css-scroll-state-queries)"
source: Shelf
platform: [web, mobile]
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: html, label: HTML, files: [index-scrubber.js, index-scrubber.css, index.html] }
poster: poster.webp
jobs: [navigation, discovery, contact]
collections: [no-assets]
---
- Список — свой контейнер прокрутки, секция на букву, заголовок секции `position: sticky`. Скрипт строит рейл из алфавита (`data-letters`, по умолчанию A–Z): буква с секцией — ссылка высотой 15 px, буква без секции — точка 3 px в строке 7 px.
- Ведение по рейлу: `pointerdown` захватывает указатель (`setPointerCapture`), у рейла `touch-action: none`. Под пальцем ищется ближайшая буква с секцией, поэтому пустые буквы пропускаются сами. Смена буквы — прыжок без анимации, тик и `navigator.vibrate(4)` на Android.
- Тик синтезируется на лету: шум через полосовой фильтр, 16 мс, частота от 2,4 кГц у A до 3,8 кГц у Z. Чаще раза в 25 мс не звучит, быстрый проход не превращается в жужжание.
- Пузырь 64 px едет по Y за пальцем левее рейла, появляется с `scale` 0,6 → 1 и гаснет через 380 мс после отпускания. Буквы рейла рядом с пальцем отъезжают влево до 16 px и растут до 1,55 раза (сглаженная ступень по расстоянию, радиус 56 px).
- Залипший заголовок: у него `container-type: scroll-state`, а `@container scroll-state(stuck: top)` даёт плашке стекло (`backdrop-filter: blur(18px) saturate(1.6)`), волосяную линию снизу, тёмную букву и счётчик «4 contacts». Где запроса нет, тот же вид включает класс `.is-stuck`.
- Текущая секция считается по IntersectionObserver: в начале каждой секции лежит страж высотой 1 px; ушедший выше края списка — пройден, текущая — последняя пройденная. Отсюда `aria-current="location"` на букве рейла и `.is-stuck` в браузере без scroll-state.
- Прыжок ставит секцию на 2 px ниже её начала: заголовок уже залип, страж уже за краем. Подвал «55 contacts» растягивается так, чтобы до верха доезжала и последняя секция.
- Клавиатура: рейл — одна остановка табуляции, стрелки и Home/End ходят по буквам с секциями и сразу прыгают. Буква на клавиатуре в любом месте списка прыгает к ней или к следующей непустой. Ссылки рейла работают и для скринридера, в имени — число контактов.
- `prefers-reduced-motion`: без линзы на рейле и роста пузыря, плавная прокрутка выключена.
- Демо: `?shot=1` — прокрутка рейла застыла на M, `?letter=K` — на другой букве.
