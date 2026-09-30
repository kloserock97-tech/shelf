---
title: Just-in-Time Hint
type: overlay
status: stable
summary: "Подсказка, которую вызывает поведение: когда человек в третий раз берёт одну команду из меню ⋯, якорный поповер показывает на настоящую кнопку и клавишу. Уходит, как только быстрым путём воспользовались; каждая подсказка — один раз."
tech: [HTML, CSS, JavaScript, Popover API, CSS Anchor Positioning]
tags: [onboarding, coach mark, hint, tip, popover, anchor positioning, position-try, keyboard shortcut, feature discovery, in-product help, первые шаги, подсказка, коучмарк, горячие клавиши, обучение, поповер, якорное позиционирование]
jobs: [onboarding]
added: 2026-09-30
origin: adapted
priorArt: "Chrome in-product help (Feature Engagement tracker)"
source: Shelf
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: html, label: HTML, files: [jit-hint.js, jit-hint.css, index.html] }
poster: poster.webp
---
- Счётчик медленных путей: команда из меню — `slow(cmd)`, с кнопки или клавиши — `fast(cmd)`. На третьем медленном пути одной команды подсказка открывается через 450 мс, когда меню уже закрылось.
- Судьба подсказки лежит в localStorage (`jit-hints`): `shown`, `used` или `known`.
  - Показанная подсказка больше не появляется.
  - Если быстрым путём воспользовались раньше, подсказка списывается как `known` и не показывается никогда.
- Подсказка — `popover="manual"`: клик мимо её не закрывает, можно работать дальше. Она уходит по «Got it», по Escape или при быстром пути. В последнем случае 1,1 с держится «That’s the fast way» с галочкой.
- Позиция — CSS anchor positioning.
  - `position-area: bottom`, отступ 10 px от кнопки и 8 px от краёв окна.
  - `position-try-fallbacks: bottom span-right, bottom span-left, top, top span-right, top span-left`.
  - Без якорей `placeByHand` перебирает те же шесть мест по размерам окна.
- Стрелку ставит скрипт после раскладки: по прямоугольникам выбирает сторону, по центру кнопки — место, не ближе 18 px к углам. При прокрутке и ресайзе пересчитывает.
- Поверхность инверсная — тёмная на светлой странице, светлая на тёмной. На кнопке-цели кольцо акцента и два импульса, при `prefers-reduced-motion` остаётся одно кольцо.
- Доступность:
  - у кнопок `aria-keyshortcuts`;
  - цель получает `aria-describedby` на подсказку, текст объявляет `role="status"`;
  - меню ⋯ — отдельный `popover` с `role="menu"`, стрелками, Home/End и Escape.
- В демо «Reset hints» чистит хранилище и возвращает письма. `?shot=1` — момент после третьего архива через меню, без localStorage.
