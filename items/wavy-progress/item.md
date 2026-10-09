---
title: Wavy Progress
type: loader
status: stable
summary: "Линейный и круговой индикатор прогресса, у которого заполненная часть — бегущая волна: пока работа идёт, волна бежит вперёд и вздрагивает на каждом шаге, при простое затухает в прямую, а к 100% сглаживается и меняет цвет. Между заполненной и пустой частью — зазор."
tech: [HTML, CSS, JavaScript, SVG, "@property"]
tags: [progress, progress bar, loader, wave, wavy, circular progress, linear progress, spring, activity, прогресс, индикатор, загрузка, волна, круговой прогресс, полоса прогресса, синхронизация]
added: 2026-10-09
origin: adapted
priorArt: "Material 3 Expressive wavy progress indicators (Google, Android 16)"
source: Shelf
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: html, label: HTML, files: [wavy-progress.js, wavy-progress.css, index.html] }
poster: poster.webp
jobs: [loading, feedback]
collections: [no-assets]
pairs: [morph-progress]
---
- Разметка — пустой `div.wvp` с `data-kind="linear|circular"`, `data-value` (0…1) и флагом `data-active`. Скрипт строит внутри SVG из двух путей: заполненная волна и прямая пустая часть. Управление — атрибутами (их слушает MutationObserver) или `el.wavy.set(v)` / `el.wavy.active(on)`.
- Линейный: синусоида вдоль заполненной части, точки каждые 2 px, фаза бежит вперёд со скоростью 1,15 длины волны в секунду. На первых и последних 10 px волна плавно садится на ось, поэтому голова круглая и ровно отделена зазором 6 px (+ толщина штриха под круглые концы) от пустой части.
- Круговой: радиус r(θ) = R + A·sin(kθ − φ), k — целое число волн на окружность (из длины волны), так что на 100% кольцо замыкается без шва. Пустая часть — дуга с зазором с обеих сторон.
- Амплитуда — пружина (ω = 9 рад/с, ζ = 0,55) к цели: 1 при `data-active`, 0 в простое; от 92% до 100% цель сглаживается к 0. Каждый шаг прогресса вперёд толкает амплитуду (скорость + до 3), поэтому неровная работа видна как неровный пульс. Значение едет своей пружиной (ω = 11, ζ = 0,95). Скорость фазы падает вместе с амплитудой — затухшая волна стоит.
- Цвет — `@property --wvp-tone` с переходом 600 мс: на 100% ставится `data-state="done"` и тон плавно меняется на зелёный.
- Геометрия из CSS-переменных: `--wvp-stroke`, `--wvp-amp`, `--wvp-wave`, `--wvp-gap`, `--wvp-size`; перечитываются при ресайзе (ResizeObserver).
- rAF крутится, только пока бежит волна или едут пружины; в простое и после 100% — ноль кадров. Вне экрана (IntersectionObserver) и в скрытой вкладке — пауза.
- Доступность: `role="progressbar"`, `aria-valuenow` в процентах, `aria-valuetext` — «42%», «42%, paused», «Complete». SVG скрыт от скринридера.
- `prefers-reduced-motion`: всегда прямая линия, значение без анимации.
- Демо: Busy — фейковая синхронизация неровными шагами, Idle — пауза, Finish — до 100%. `?shot=1` — 62%, волна на полной высоте.
