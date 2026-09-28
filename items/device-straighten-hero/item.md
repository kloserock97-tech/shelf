---
title: Device Straighten Hero
type: scroll
status: stable
summary: "Герой страницы кейса: настоящий экран в устройстве, развёрнутом в перспективе, выпрямляется по мере прокрутки, а предмет перед ним парит и уходит за мышью дальше устройства — камера без WebGL."
tech: [HTML, CSS, JavaScript, TypeScript]
tags: [hero, scroll, perspective, parallax, mockup, device, 3d transform, герой, прокрутка, перспектива, параллакс, мокап]
added: 2026-09-28
origin: own
source: "Portfolio 3D TS2 v64: src/ui/caseHero.ts, src/ui/caseHero.css (удалён в v74, git d2d6c1a^), src/ui/case-story.css (.cs-hero-stage), src/ui/caseStoryView.ts (--hs); предмет — public/cases/objects/moderator-dashboard.webp"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: html, label: HTML, files: [hero.css, hero.js, index.html] }
  - { id: ts, label: TypeScript, files: [hero.ts, hero.css] }
poster: poster.webp
---
- Разворот целиком в CSS от одной переменной: `rotateY(−15° + 11°·hs)`, `rotateX(5° − 4°·hs)`, `rotateZ(1,2° − 1,2°·hs)`, у телефона свои числа. Скрипт пишет только `--hs`, одно свойство на кадр.
- `--hs` доходит до 1, когда за верхний край ушло 80% высоты героя вместе с плитками фактов. `transition: transform 0.9s` сглаживает рывки колеса: устройство догоняет прокрутку, а не дёргается за ней.
- Режет сцена (`overflow: hidden`), а не сама картинка: окно браузера на 18% шире колонки и уходит за правый и нижний край, как у крупных мокапов на продуктовых страницах.
- Предмет — второй слой: по прокрутке поднимается на 4 cqw, за мышью уходит вдвое дальше устройства. Два слоя на разной глубине и дают ощущение камеры. Сдвиги в `cqw`, то есть от размера колонки, а не окна; на тач-экране мышиного сдвига нет.
- Парение предмета (9 с) стоит, когда героя не видно, вкладка скрыта или включено reduced motion; при reduced motion устройство просто стоит в лёгком развороте −8°.
- В живом портфолио с v74 герой — другой мокап, и `--hs` там больше никто не читает. Здесь версия v64 из истории git.
