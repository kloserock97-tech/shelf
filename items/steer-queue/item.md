---
title: Steer-While-Running Queue
type: list
status: stable
summary: "Прогон агента по шагам, которому можно писать по ходу: заметка встаёт в очередь и попадает в прогон на границе шага или сразу прерывает текущий шаг. Очередь перетаскивается, заметку можно отменить, пока её не взяли; взятая въезжает в ленту шагов, а пауза замораживает дугу прогресса."
tech: [HTML, CSS, JavaScript, View Transitions, moveBefore, Invoker Commands]
tags: [ai, agent, steering, queue, interrupt, pause, resume, run, progress, human in the loop, reorder, агент, очередь, уточнение, прервать, пауза, прогон, перетаскивание, нейросеть]
added: 2026-10-09
origin: adapted
priorArt: "Steering a running agent: message queue in Claude Code, Linear agent steering (2026), pause and resume in Dia 1.50"
source: Shelf
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: html, label: HTML, files: [steer-queue.js, steer-queue.css, index.html] }
poster: poster.webp
jobs: [feedback, input, loading]
collections: [ai-native]
pairs: [agent-plan-card]
---
- Вход — `{ title, steps: [{ id, text, ms, note }] }`: симулятор идёт по шагам, `ms` — длительность шага. Время и прогресс считает один rAF, пока прогон идёт; на паузе, после конца и на скрытой вкладке цикл стоит.
- Заметка из поля встаёт в очередь с режимом. «After this step» берётся на ближайшей границе шагов, по одной за границу, в порядке очереди. «Interrupt now» во время прогона берётся сразу: текущий шаг сбрасывается («Interrupted step 3 at 45%»), заметка встаёт перед ним, шаг начинается заново с пометкой «Restarted with your note». Ctrl/⌘+Enter отправляет как прерывание.
- На паузе все заметки ждут. После «Resume» прерывание в голове очереди срабатывает сразу, остальные ждут границ. Заметки, оставшиеся к концу плана, добавляют шаги «Follow up: …».
- Взятая заметка переезжает из очереди в ленту через `moveBefore()` (без поддержки — `insertBefore`) внутри view transition: все строки обеих лент на время перехода получают имена и общий `view-transition-class`, поэтому заметка летит, а соседи сдвигаются (460 мс). Есть `Element.startViewTransition` — переход ограничен карточкой, иначе документный, без View Transitions — FLIP на WAAPI.
- После взятия агент 700 мс «читает» заметку, потом начинается следующий шаг. `onTake(note, { before, steps })` может вернуть `{ rewrite: [{ id, text }] }` — ещё не выполненные шаги переписываются и на 1,6 с подсвечиваются, в заметке пишется «reworded step 3».
- Очередь перетаскивается за ручку (Pointer Events, соседи разъезжаются FLIP за 220 мс), с клавиатуры — ↑/↓ на ручке. Если граница шага пришла во время перетаскивания, агент ждёт («Waiting for the queue»). × отменяет заметку, пока её не взяли, фокус переходит на соседнюю.
- Круг в шапке — кнопка паузы через Invoker Commands (`commandfor` + `command="--toggle-run"`, событие `command` на корне), без их поддержки — обычный клик. На паузе дуга прогресса стоит и сереет, дорожка становится пунктирной, вращение значка шага замирает (`animation-play-state: paused`).
- Статус, взятие, отмена и пауза объявляются через `aria-live`; режим — радиогруппа, у ручек подпись с позицией в очереди. `prefers-reduced-motion`: переезд без перехода, вращение медленное.
- Флаг демо: `?shot=1` — первая заметка уже в прогоне и переписала шаг 3, шаг 3 на паузе на 45%, в очереди обычная заметка и прерывание.
