---
title: Uncertainty Slider
type: control
status: stable
summary: "Ползунок оценки с уверенностью: вбок — значение, вверх-вниз — насколько уверен. Ручка сидит на вершине колокола с полосами 50% и 90%, подпись «12 ± 3 days», наружу уходит {mean, low, high}."
tech: [HTML, CSS, JavaScript, SVG, React]
tags: [estimate, uncertainty, confidence, range, distribution, bell curve, slider, 2d slider, forecast, оценка, неопределённость, уверенность, диапазон, распределение, ползунок, прогноз, срок]
added: 2026-09-30
origin: adapted
priorArt: "Kay et al., 'When (ish) is my bus?', CHI 2016; распределения на входе у Metaculus и Guesstimate"
source: Shelf
registry: uncertainty-slider
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: html, label: HTML, files: [uncertainty-slider.js, uncertainty-slider.css, index.html] }
  - { id: react, label: React, files: [UncertaintySlider.tsx, uncertainty-slider.css] }
poster: poster.webp
jobs: [input, data]
collections: [from-research]
---
- Одна ручка, две оси. Горизонталь — среднее, вертикаль — σ нормального распределения: ручка всегда стоит на вершине кривой, поэтому тянуть вверх значит сузить колокол, вниз — расплющить. Высота вершины линейна по log σ, σ от 0,4 шага до 1/6 шкалы.
- Закрашены центральные 50% (±0,674σ) и 90% (±1,645σ); те же интервалы повторены полосами на дорожке. «±» в подписи — половина 90%-го интервала, до 2 округляется до 0,5.
- Легенда говорит частотами: «1 in 2 chance», «9 in 10» — так интервалы читаются легче процентов. Слово в капсуле («Very sure» … «Rough guess») считается от разброса относительно самого значения, а не от шкалы.
- События `input` (пока тянут) и `change` (после отпускания), `detail = { mean, low, high }`, где low и high — границы 90%. После перетаскивания среднее доезжает до шага за 200 мс.
- Клавиатура: ←/→ — значение на шаг, PageUp/PageDown — на пять, Home/End — края; ↑/↓ — увереннее и менее уверенно (с Shift крупнее), Shift+←/→ — сузить и расширить. На касании второй палец разводит колокол щипком, на тачпаде то же делает щипок (ctrl + колесо).
- Для скринридера ручка — `role="slider"` с `aria-valuetext` вида «12 days, give or take 3. 9 in 10 chance: 9–15 days. Fairly sure.»; подсказка по клавишам в `aria-describedby`.
- Вертикальная направляющая и подпись «↑ More sure / ↓ Less sure» видны, пока ручку держат или фокусируют с клавиатуры, при наведении — вполсилы. Подпись встаёт над вершиной, а если места нет — сбоку, за краем кривой. Фон подписи — `--us-surface`, его нужно выставить под свою подложку.
- Отрисовка по событию, одним кадром; в покое requestAnimationFrame не крутится. При `prefers-reduced-motion` среднее встаёт на шаг сразу.
- Ограничения: распределение симметричное, у края шкалы просто обрезается — для сроков, которые чаще затягиваются, честнее логнормальное. Мышью значение и уверенность меняются одним движением, отдельно по осям — клавишами.
- Демо: `?shot=1` — ручка «в руке» с направляющей, `&mean=` и `&spread=` задают состояние.
