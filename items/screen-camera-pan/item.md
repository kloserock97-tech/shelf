---
title: Screen Camera Pan
type: motion
status: stable
summary: "«Камера» ездит по скриншоту: рамка стоит, экран внутри наезжает на фокусы и сменяет состояния интерфейса, подпись ведёт рассказ. Сценарий — async-функция с токеном отмены, стартует, когда блок в кадре."
tech: [TypeScript, CSS]
tags: [motion, camera, zoom, pan, screenshot, walkthrough, case study, IntersectionObserver, камера, наезд, скриншот, сценарий, кейс]
added: 2026-09-28
origin: own
source: "Portfolio 3D TS2: src/ui/caseScreenMotion.ts, src/ui/caseScreenMotion.css, src/ui/caseDemos.ts (mountDemos), src/ui/case-v37.css (.dm-*)"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: ts, label: TypeScript, files: [screenMotion.ts, demoRunner.ts, main.ts, screen-motion.css] }
poster: poster.webp
---
- Камера — один `transform` у слоя со скриншотом от левого верхнего угла, фокусы — CSS-пресеты на `[data-focus]`. Сдвиг задан в % от самого экрана, поэтому пресет верен на любой ширине: для фокуса с углом в точке (x, y) — `translate(−s·x, −s·y) scale(s)`.
- Переезд идёт 1,5 с по `cubic-bezier(.22, 1, .36, 1)`, другое состояние интерфейса проявляется поверх за 0,7 с, пока камера ещё едет.
- Сценарий — async-функция с токеном отмены: сцена держится 3,2 с тактами по 100 мс, и на каждом такте проверяется токен. Ушёл из кадра, нажал «Play again» или выбрал состояние кнопкой — старый сценарий кадр уже не сдвинет. Скрытая вкладка сцену не съедает.
- Демо стартует, когда в кадре 45% блока, останавливается, когда блок уходит, и при возврате играет заново.
- На телефоне окно почти квадратное (1,05), экран сохраняет 1,6 и стоит чуть ниже верха, поэтому у пресетов свои числа. При reduced motion камера не ездит: сразу показана вторая, самая говорящая сцена.
- Для растровых скриншотов в `sizes` ставится ширина после наезда (рамка × 1,95), а не ширина рамки, иначе на крупном плане мыло. Экраны демо в SVG и чёткие при любом наезде.
- Демо собрано из варианта TS командой esbuild (см. demo/app.js)
