---
title: Confidence Underline
type: text
status: stable
summary: "Сгенерированный текст, где у каждой фразы своя уверенность модели: сомнительные подчёркнуты точками, и чем ниже уверенность, тем гуще и теплее точки. Переключатель превращает абзац в тепловую карту, а наведение или фокус на фразе показывает другие варианты и источник с заменой в один клик."
tech: [HTML, CSS, JavaScript]
tags: [ai, llm, confidence, uncertainty, probability, logprobs, heat map, citations, source, alternatives, underline, уверенность, неуверенность, вероятность, тепловая карта, источник, варианты, подчёркивание, нейросеть]
added: 2026-09-30
origin: adapted
priorArt: "Vasconcelos et al., Generation Probabilities Are Not Enough (uncertainty highlighting in AI code completions); spell-check squiggles"
source: Shelf
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: html, label: HTML }
poster: poster.webp
jobs: [feedback, input]
collections: [ai-native]
pairs: [ai-edit-review]
---
- Вход — массив `[{ text, p, alts, source }]`, где `p` — вероятность фразы от 0 до 1 (например, среднее по токенам из logprobs). Ниже порога 0,85 фраза получает подчёркивание, на 0,25 и ниже оно в полную силу.
- Подчёркивание — фон из точек `radial-gradient`: шаг от 7 до 3,4 px, точка от 0,95 до 1,5 px, цвет смешивается `color-mix(in oklab)` от серого #8c8c91 к оранжевому #a04800 (в тёмной теме #ff9f0a). Сомнение — зарегистрированное свойство `@property --cu-d`, поэтому после замены фразы плотность и цвет перетекают за 400 мс.
- Тепловая карта: фон фразы — оранжевый с непрозрачностью до 34% по `1 − p`, уверенные фразы уходят в `label-secondary`. Переключение идёт волной слева направо, по 14 мс на фразу.
- Поповер: процент, полоса уверенности, варианты по убыванию `p`, цитата-источник с выделенной совпавшей фразой и «Mark as checked». Замена меняет фразу и вариант местами: старая формулировка остаётся в списке, всё обратимо.
- Наведение открывает поповер через 120 мс, следующий в течение 600 мс — сразу и без движения; клик или тап закрепляет его.
- Клавиатура: Tab по сомнительным фразам, Enter или ↓ — в список, ↑/↓ по вариантам, Esc — назад к фразе, Tab с последней кнопки — к следующей фразе. У фраз `role="button"` и `aria-label` с процентом и числом вариантов, замены объявляет `aria-live`.
- Флаги демо: `?shot=1` — открыт поповер у «€18,000», `?heat=1` — сразу тепловая карта.
- `color-mix` и `@property`: Chrome 111+, Safari 16.4+, Firefox 128+.
