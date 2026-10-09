---
title: Drum Wheel Picker
type: control
status: stable
summary: "Барабан выбора даты как в iOS: три колеса — месяц, число, год — на родной прокрутке со snap, каждая строка поворачивается на цилиндре по своему view-timeline без скрипта. На каждом зубце щелчок, колёса сцеплены: у февраля лишние числа гаснут, и барабан сам доезжает до последнего."
tech: [HTML, CSS, JavaScript, Scroll-driven Animations, CSS Scroll Snap, Web Audio API, Intl]
tags: [picker, date picker, wheel, drum, spinbutton, scroll snap, view timeline, scroll-driven animations, 3d, ios, барабан, колесо, выбор даты, дата, пикер, прокрутка]
added: 2026-10-09
origin: adapted
priorArt: "Apple iOS UIPickerView / UIDatePicker (wheels)"
source: Shelf
platform: [web, mobile]
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: html, label: HTML, files: [drum-picker.js, drum-picker.css, index.html] }
poster: poster.webp
jobs: [input, data]
collections: [depth, no-assets]
---
- Колесо — вертикальный контейнер прокрутки высотой 252 px с `scroll-snap-type: y mandatory`, строки по 36 px с `scroll-snap-align: center`, сверху и снизу отступ по 108 px, чтобы крайние строки вставали в центр. Инерцию, бросок и доводку до строки делает браузер.
- Поворот: у лица строки (`.dp__face`) анимация на `animation-timeline: view()` от `cover 0%` до `cover 100%`. Ключевые кадры посчитаны для цилиндра радиусом 130 px: строка на расстоянии d от центра сдвигается на `R·sin(d/R) − d` по Y и на `R·(cos(d/R) − 1)` по Z и поворачивается на `−d/R` (у края ±63°), прозрачность `cos^1,2`. Своя `perspective(600px)` у каждой строки. Сверху и снизу колесо гасит маска.
- Анимация записана только полными свойствами (`animation-name`, `animation-duration`, `animation-timeline`, `animation-range-start` и т. д.): сокращённое `animation` сбрасывает `animation-timeline`, а минификатор склеивает свойства в него.
- Поворачивается лицо, а не сама строка: Chrome считает точки snap по повёрнутой рамке, и `scrollTo` недоезжал до строки на 11 px.
- Где `animation-timeline` нет, тот же поворот пишет скрипт на `scroll` через rAF — только видимым строкам, в покое ничего не считается.
- Щелчок: на каждой строке, прошедшей центр, синтезированный шум через полосовой фильтр 12 мс (месяц 1,8 кГц, число 2,3 кГц, год 2 кГц). Чаще раза в 22 мс не звучит, при быстром вращении тише. На Android — `navigator.vibrate(3)`. `scrollsnapchanging` для зубцов не подходит: во время броска он сообщает только конечную строку.
- Значение читается на `scrollsnapchange` и `scrollend`, без них — после 140 мс тишины. Месяц или год меняют число дней: лишние строки серые (`.is-off`), если выбранного числа нет, колесо дней доезжает до последнего. Остановка на серой строке тоже откатывается.
- Доступность: каждое колесо — `role="spinbutton"` с `aria-valuenow`, `aria-valuetext` («February»), min и max; строки скрыты от скринридера. ↑ и ↓ меняют значение, PageUp/PageDown — на 5, Home/End — к краю, ← и → переходят между колёсами. Быстрые нажатия складываются, а не теряются. Тап по строке выше или ниже центра доводит её до центра.
- Мышь прокрутку не тянет: своя тяга со снапом выключенным на время жеста, скорость за 100 мс проецируется на 260 мс вперёд, снап возвращается после `scrollend`. Колесо мыши работает родным образом.
- Названия месяцев — `Intl.DateTimeFormat` по `lang` страницы. `DrumPicker.wheel()` собирает одно колесо из любых значений, `DrumPicker.date()` — дату из трёх.
- Демо: `?shot=1` — февраль 2027 года, числа 29–31 серые, колесо дней застыло между строками.
