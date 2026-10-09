---
title: Anchor-Hop Product Tour
type: overlay
status: stable
summary: "Тур по интерфейсу с одной подсветкой: вырез в затемнении перепрыгивает от цели к цели по CSS-якорям и меняет размер и скругление на лету, карточка шага перетекает следом и сама выбирает сторону, где помещается. Шаг проходится кнопкой «Next», стрелками или кликом по подсвеченному контролу; Esc и клик мимо закрывают тур."
tech: [HTML, CSS, JavaScript, CSS Anchor Positioning, position-try-fallbacks, View Transitions]
tags: [product tour, onboarding, coach marks, walkthrough, spotlight, anchor positioning, position-try, view transitions, тур, обзор интерфейса, первые шаги, подсветка, коучмарки, якорное позиционирование, обучение]
added: 2026-10-09
origin: adapted
priorArt: "Мотив — классические продуктовые туры (Intro.js, Shepherd)"
source: Shelf
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: html, label: HTML, files: [anchor-tour.js, anchor-tour.css, index.html] }
poster: poster.webp
jobs: [onboarding, navigation]
pairs: [just-in-time-hint]
---
- `anchorTour(root, steps, { onEnd, returnFocus })` → `start(n)`, `next()`, `prev()`, `end()`. Шаг — `{ target, title, text, hint? }`, цель — селектор внутри `root` или элемент.
- Одна подсветка на весь тур. Текущей цели скрипт ставит `anchor-name: --aht-target`, подсветка привязана к ней `top/left/right/bottom: anchor(…)` с отступом 6 px. Смена шага — перенос одного `anchor-name`, путь подсветки рисуют CSS-переходы инсетов, 560 мс на пружине.
- Затемнение — тень с разлётом `200vmax` вокруг подсветки, `root` с `overflow: clip` держит её внутри. Скругление выреза = скругление цели + отступ, тоже переходом: от пилюли поиска к квадратной кнопке.
- Тур открывается ирисом: вырез стартует размером с `root` и сжимается к первой цели. Закрывается обратно в рамку с угасанием.
- Карточка шага: `position-area: bottom` и `position-try-fallbacks: bottom span-right, bottom span-left, top, top span-right, top span-left, right, left` — у края карточка сама уходит на сторону, где помещается. Стрелку скрипт ставит после раскладки: сторона по прямоугольникам, место — напротив центра цели, не ближе 18 px к углам.
- Переход карточки — `document.startViewTransition`: она перетекает в новое место и размер. Старый снимок страницы на время перехода скрыт, поэтому подсветка не двоится и едет вживую.
- Без anchor positioning скрипт ставит подсветку и карточку сам, перебирая те же восемь мест по размерам `root`. Пересчёт — на `resize` и через `ResizeObserver`. Без View Transitions карточка просто встаёт на место.
- Ввод:
  - клик по подсвеченному контролу срабатывает как обычно и ведёт тур дальше;
  - клик в любое другое место закрывает тур и до приложения не доходит (перехват на фазе capture);
  - Esc закрывает, стрелки ←/→ листают, пока фокус в карточке.
- Доступность: карточка — `role="dialog"` без модальности, фокус переходит в неё на каждом шаге, «Step N of M» читается через `aria-live`. Цель на время шага получает `aria-describedby` на текст. После закрытия фокус возвращается на `returnFocus` или туда, откуда тур открыли.
- `prefers-reduced-motion`: без ириса, пружин и перетекания, только прозрачность.
- Несколько туров на странице не мешают друг другу: `anchor-scope` на `root`.
- Демо: тур стартует сам, «Restart tour» запускает заново, «New project» на шаге 3 правда добавляет проект. `?shot=1` — шаг 3 без анимации, карточка ушла влево от правого края.
