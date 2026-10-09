---
title: Error Fix Capsule
type: overlay
status: stable
summary: "Ошибки формы не рассыпаются красным текстом, а собираются в капсулу на месте кнопки отправки: «3 fields to fix · Next» ведёт по полям, счётчик убывает пружиной. У поля в фокусе — подсказка на якоре, часто с исправлением в одно нажатие: «gmial.com → gmail.com?», «Remove spaces», «Add +31»."
tech: [HTML, CSS, JavaScript, Constraint Validation API, ":user-invalid", Popover API, CSS Anchor Positioning, field-sizing]
tags: [form, validation, error, inline error, typo, did you mean, autocorrect, error summary, popover, anchor positioning, user-invalid, форма, валидация, ошибка, опечатка, исправление, подсказка, сводка ошибок, поле ввода]
added: 2026-10-09
origin: adapted
priorArt: "Мотив — подсказка «Did you mean …?» в почтовых формах; «Inline Validation» (21st.dev, ddoemonn)"
source: Shelf
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: html, label: HTML, files: [fix-capsule.js, fix-capsule.css, index.html] }
poster: poster.webp
jobs: [error, input, feedback]
pairs: [feedforward-action]
---
- Форма с `novalidate`, проверка — нативная (`required`, `type`) плюс свои правила из `data-check`. Итог правила уходит в `setCustomValidity`, поэтому стили держатся на `:invalid` и `:user-invalid`.
- Правила:
  - `email` — пробелы (исправление «Remove spaces»), формат, опечатка в домене;
  - `phone` — только цифры, 8–15 цифр с `+`; `00` в начале → «Use +»; номер без кода → «Add +31» с кодом из `data-country-code` и без ведущего 0;
  - `web` — пробелы («Remove spaces»), окончание вида `.com`.
- Опечатку в домене ищет своё расстояние правки по 12 почтовым доменам: вставка, удаление, замена и перестановка соседних букв — по одной правке. Подсказка, если правок 1–2 и меньше трети длины домена. «Keep as typed» запоминает домен на поле и снимает ошибку.
- Ошибку показывают, когда человек ушёл с поля или нажал отправку. Пока он печатает в нетронутом поле, ничего не краснеет.
- Отправка с ошибками останавливает событие `submit`, помечает поля и превращает кнопку в капсулу: точка, число, «fields to fix», «Next». Next ведёт к следующему полю с ошибкой после того, где человек был последним, по кругу, с прокруткой к центру.
- Число в капсуле катится: старое уходит вверх, новое приезжает снизу на пружине (`linear()` на 41 точку, ~0,5 с), капсула чуть вздрагивает. Когда исправлено всё — «All fixed» и кнопка отправки внутри капсулы.
- Подсказка — один `popover="hint"` на форму (где `hint` не поддерживается — `manual`), привязан к полю через `anchor-name`, `position-area: bottom span-right` с запасными сторонами. Вёрстку не двигает. Без anchor positioning скрипт ставит её под полем или над ним.
- Подсказка вставляется в DOM сразу за полем, поэтому Tab из поля попадает на кнопку исправления. Исправление ставит значение, шлёт событие `input`, на 0,7 с показывает «Fixed».
- Доступность: `aria-invalid`, `aria-describedby` на текст подсказки, итоги («Fixed. 2 left.») читает `aria-live="polite"`. Esc закрывает подсказку.
- `textarea` растёт с текстом через `field-sizing: content`, без поддержки — по `scrollHeight` из скрипта.
- `prefers-reduced-motion`: без пружин и сдвигов, только прозрачность.
- Демо: «Reset demo» возвращает форму с ошибками. `?shot=1` — после попытки отправки, имя уже введено, открыта подсказка с опечаткой в почте.
