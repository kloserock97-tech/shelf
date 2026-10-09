---
title: Agent Context Tray
type: control
status: stable
summary: "Лоток над полем промпта: всё, что агент получит, разложено чипами по трём ролям — Always, This task и Background. Чип выключается кликом, закрепляется, раскрывает превью в поповере у себя и перетаскивается в другую группу; полоса под полем складывает токены, и у предела самый тяжёлый незакреплённый чип пульсирует."
tech: [HTML, CSS, JavaScript, Popover API, CSS Anchor Positioning, "@property", field-sizing]
tags: [ai, agent, context, prompt, composer, chips, token budget, attachments, drag and drop, popover, anchor positioning, контекст, агент, промпт, чипы, токены, бюджет, вложения, перетаскивание, нейросеть]
added: 2026-10-09
origin: adapted
priorArt: "NN/g, 3 agent context roles (2026) — https://www.nngroup.com/articles/3-agent-context-roles/"
source: Shelf
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: html, label: HTML, files: [context-tray.js, context-tray.css, index.html] }
poster: poster.webp
jobs: [input, data, quality]
collections: [ai-native]
---
- Вход — `{ budget, items: [{ id, name, kind, tokens, role, on, pinned, preview }] }`; `role` — `always`, `task` или `background`, `kind` выбирает иконку (profile, rules, file, link, sheet, mail, note, calendar). `onSend({ text, items, tokens })` получает только включённые чипы с их ролью.
- Чип — две кнопки: основная (`aria-pressed`, клик включает и выключает) и шеврон превью. Выключенный остаётся на месте пунктиром, его токены зачёркнуты и не считаются.
- Превью — один `popover` на лоток с `role="dialog"`: кусок содержимого моноширинным шрифтом (до 6 строк), Turn off, Pin и «Move to» в другую группу. Якорь — `anchor-name` на открытом чипе, `position-area: block-end span-inline-end` и `position-try-fallbacks` с переворотом; без anchor positioning поповер ставится по `getBoundingClientRect` и следует за прокруткой. Esc и клик мимо закрывают, фокус возвращается на шеврон.
- Перетаскивание: мышью после сдвига на 5 px, касанием после удержания 260 мс (на Android короткая вибрация). Чип остаётся пунктирным слотом и сразу встаёт в место вставки, соседи разъезжаются FLIP за 280 мс, поднятая копия летит за пальцем и садится в слот за 200 мс. Esc или `pointercancel` возвращают на старое место. С клавиатуры: Alt+↑/↓ — в соседнюю группу, P — закрепить.
- Файлы с рабочего стола падают в группу под курсором (по умолчанию This task): токены — размер / 4, превью — первые 600 символов текстовых файлов.
- Бюджет: полоса из трёх сегментов цвета групп, ширины — зарегистрированные через `@property` числа, поэтому меняются плавно (420 мс). От 85% — «Near the limit», выше 100% — сегменты ужимаются, появляется метка предела, Send выключается. Самый тяжёлый включённый незакреплённый чип получает кольцо, которое пульсирует через прозрачность псевдоэлемента (1,5 с), и подсказку в превью, сколько он освободит.
- Поле — `field-sizing: content` до 168 px; без поддержки высоту ставит JS по `scrollHeight`. Enter отправляет, Shift+Enter — перенос.
- Счётчики групп, полоса (`role="meter"` с `aria-valuetext`) и `aria-live` озвучивают включение, перенос и отправку. `prefers-reduced-motion`: без FLIP и пульса, кольцо горит ровно.
- Флаг демо: `?shot=1` — набран промпт, бюджет у предела, открыто превью самого тяжёлого чипа, его кольцо остановлено на яркой фазе.
