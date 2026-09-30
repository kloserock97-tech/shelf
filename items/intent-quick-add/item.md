---
title: Intent Quick Add
type: control
status: stable
summary: "Одно поле, которое читает строку на ходу: «tomorrow 9am», @anna, #offsite и €240 превращаются в чипы прямо в тексте, а строка под полем показывает, что будет создано («Task · Tomorrow, 09:00 · Anna Kovacs»). Backspace после чипа оставляет слова текстом, Esc выключает разбор."
tech: [HTML, CSS, JavaScript, React]
tags: [quick add, natural language, parser, chips, tokens, task input, date parsing, mentions, command field, быстрое добавление, естественный язык, разбор, чипы, задачи, даты, упоминания]
added: 2026-09-30
origin: adapted
priorArt: "Todoist Quick Add, Fantastical: ввод событий обычной фразой"
source: Shelf
registry: intent-quick-add
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: html, label: HTML, files: [intent-quick-add.js, intent-parse.js, intent-quick-add.css, index.html] }
  - { id: react, label: React, files: [IntentQuickAdd.tsx, intent-parse.ts, intent-quick-add.css] }
poster: poster.webp
jobs: [input]
collections: [ai-native]
pairs: [ghost-complete-field]
---
- Поле — обычная `<textarea>` с прозрачным текстом: каретка, выделение, IME, автоисправление и отмена остаются родными. Под ней лежит зеркало с тем же шрифтом и переносами, оно рисует текст и чипы. Отступы чипа погашены отрицательными полями, поэтому буквы в зеркале стоят ровно под кареткой.
- Грамматика своя, около 20 шаблонов (`intent-parse.js`, для React — `intent-parse.ts` с теми же правилами): дни (`today`, `tomorrow`, `friday`, `next friday`, `12 oct`, `the 5th`, `in 3 days`, `end of month`), время (`9am`, `14:30`, `noon`, `at 3`, `morning`), интервалы (`2-3pm`), повторы (`every monday`, `daily`), длительность (`for 1h`), `@люди`, `#проекты`, суммы (`€40`, `12,50 eur`, `1,200 eur`), приоритет `p1–p3`, префикс `remind me to`.
- Из совпадений побеждает самое длинное, пересечения выбрасываются. Дата и время рядом («tomorrow at 9am», «9am tomorrow») склеиваются в один чип. Чипом становится только первая дата: во фразе «from thursday to friday» срок — пятница, а «from thursday» остаётся в названии.
- `at 3` читается по рабочему дню (1–6 — после обеда); над таким чипом написано, что это догадка. Время без даты — сегодня, а если оно уже прошло, то завтра. `@an` находит Anna по началу имени. Незнакомое имя становится чипом с пометкой «Not in the team yet».
- Название — строка без чипов. Имя после `with`, `for`, `call` и похожих слов остаётся в названии («Lunch with Ben»), висящие предлоги по краям убираются.
- Над чипом под кареткой всплывает, как он прочитан («Tomorrow, 09:00»); подсказка всегда стоит над первой строкой, чтобы не закрывать слова. Новый чип коротко вспыхивает (520 мс, при `prefers-reduced-motion` без вспышки).
- Первый Backspace сразу после чипа не стирает, а превращает чип в текст: диапазон запоминается как буквальный и сдвигается вместе с правками вокруг. Следующий Backspace стирает как обычно. Esc включает и выключает разбор целиком, Enter создаёт; переносы строк при вставке становятся пробелами.
- Событие `submit`: `{ kind, title, due, hasTime, end, repeat, people, project, amount, priority, duration, dueLabel, text }`; `kind` — Task, Event (есть конец) или Reminder.
- Доступность: у поля `aria-label` и описание в `aria-describedby`; итог «Will create: …» зачитывается вежливым live-регионом через 0,9 с после паузы, а не на каждую букву.
- Ограничения: только английский и евро, недели с понедельника, US-формат 3/10 не читается (неоднозначен).
- Демо: кнопки Try вставляют готовые фразы; `?shot=1` замораживает часы на ср 30 сентября 2026, 10:12, и ставит каретку после «9am».
