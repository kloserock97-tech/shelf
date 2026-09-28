---
title: Spring Toggle
type: component
status: stable
summary: "Переключатель с пружинной ручкой: перелёт 1,5% и мягкая посадка. Движение целиком на CSS, скрипт только меняет aria-checked."
tech: [HTML, CSS, React, Vue]
tags: [switch, toggle, spring, a11y, переключатель, пружина]
added: 2026-09-28
origin: own
source: написан для Shelf как образец элемента
registry: spring-toggle
demo:
  path: demo/index.html
  background: auto
  grid: true
variants:
  - { id: html, label: HTML }
  - { id: react, label: React }
  - { id: vue, label: Vue }
poster: poster.webp
---
- Пружина задана через `linear()`: 12 точек дают перелёт 1,5% за 400 мс. Safari понимает `linear()` с 17.2; для старых браузеров подойдёт `cubic-bezier(0.34, 1.3, 0.64, 1)`.
- Ручку двигает `transform`, а не `left`: иначе на 120 Гц видно дрожание.
- Состояние живёт в `aria-checked`, поэтому скринридер и CSS читают одно и то же, а отдельного класса «on» нет.
- Выключенная дорожка `#8c8c91` держит контраст 3:1 к белому фону — это граница контрола по WCAG.
