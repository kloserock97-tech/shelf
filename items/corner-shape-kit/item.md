---
title: Corner Shape Kit
type: card
status: stable
summary: "Набор карточек на нативном corner-shape: билет с выкусом на линии отрыва, марка со скруглениями внутрь, бирка с острым концом, сквиркл-аватар и купон с вырезанными углами. Плитка-лаборатория гнёт углы через superellipse(k) ползунком или по кругу; без corner-shape формы собирает clip-path."
tech: [HTML, CSS, JavaScript, corner-shape, "clip-path: shape()", "@property"]
tags: [corner-shape, superellipse, squircle, scoop, notch, bevel, ticket, stamp, tag, coupon, avatar, border-radius, clip-path, shape, углы, форма углов, сквиркл, билет, марка, бирка, купон, аватар, скругление]
added: 2026-10-09
origin: adapted
priorArt: "Chrome for Developers: implementing corner-shape; Smashing Magazine, March 2026: Beyond border-radius, CSS corner-shape"
source: Shelf
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: html, label: HTML, files: [corner-shape-kit.css, corner-shape-kit.js, index.html] }
poster: poster.webp
jobs: [showcase, quality]
collections: [no-assets]
---
- `corner-shape` меняет форму угла, который задаёт `border-radius`. Ключевые слова — точки одной шкалы `superellipse(k)`: notch (k = −∞), scoop (−1), bevel (0), round (1), squircle (2), square (+∞). Рамка, `outline` и `box-shadow` идут по новой форме.
- Формы:
  - билет — две половины; углы, которыми они сходятся, `scoop` 14 px, вместе дают круглый выкус на линии отрыва; наружные углы `round` 18 px, у корешка пунктир `border-left`. Тень — `drop-shadow` на обёртке, общая для обеих половин;
  - марка — `scoop` 14 px на всех углах, внутренняя рамка — `outline` с отступом −8 px, она повторяет вогнутые углы;
  - бирка — `bevel round round bevel` и радиусы `30px … / 50% …` слева: две фаски сходятся в острие, в нём дырочка;
  - аватар — `squircle` при `border-radius: 50%`, кольцо — `outline` с отступом 3 px;
  - купон — `notch` 16 px и пунктирная рамка, которая тоже обходит вырезы.
- Лаборатория: плитка с `corner-shape: superellipse(var(--k))`, `--k` — `@property <number>`. Ползунок от −3 до 4 с шагом 0,1; подпись называет значение и ближайшие ключевые слова («between bevel and round»). Play гоняет `--k` CSS-анимацией от −2,5 до 3,5 и обратно за 4,8 с, пока идёт цикл, rAF раз в кадр читает `--k` и двигает ползунок. Пауза, движение ползунка или скрытая вкладка останавливают и анимацию, и rAF.
- Фолбэк в `@supports not (corner-shape: squircle)`: билет, марка и бирка вырезаются `clip-path: shape()` с дугами (`arc … ccw` — вогнутый угол, `cw` — выпуклый), где нет `shape()` — `polygon()` (у марки — восьмиугольник, у билета прямые углы на линии отрыва). Купон — `polygon()` с 12 точками, аватар — `border-radius: 36%`. Тени в фолбэке — `drop-shadow` на обёртке, потому что `clip-path` срезает `box-shadow`. Ползунок и Play выключаются, подпись говорит, что видна обычная `border-radius`.
- Доступность: марка и аватар — `role="img"` с подписью, у ползунка `aria-valuetext` («superellipse 0.6, between bevel and round»), у Play — `aria-pressed`, подпись значения — `aria-live`.
- `prefers-reduced-motion`: Play скрыт, k меняется только ползунком.
- Демо: `?shot=1` — k = −0,6; `?k=…` — любое начальное k.
