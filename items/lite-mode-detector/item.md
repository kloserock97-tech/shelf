---
title: Lite Mode Detector
type: utility
status: stable
summary: "Решает до старта 3D, открывать ли лёгкую версию: WebGL2 с failIfMajorPerformanceCaveat, программный рендер, запомненное решение на 14 дней, параметр ?lite, а после старта — потеря контекста и зависание."
tech: [TypeScript, WebGL2, CSS]
tags: [fallback, lite, webgl, performance, swiftshader, progressive enhancement, лёгкая версия, фолбэк, производительность, запасной вариант]
added: 2026-09-28
origin: own
source: "Portfolio 3D TS2: src/ui/lite.ts, src/main.ts (degrade, stallCheck), src/scene/HillScene.ts (onContextLost), src/ui/hill-ui.css (.lite-bar)"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: ts, label: TypeScript, files: [lite.ts, lite.css, main.ts] }
poster: poster.webp
---
- Главная проверка — `getContext("webgl2", { failIfMajorPerformanceCaveat: true })`: браузер не отдаёт контекст, если рисовать будет процессор. Отказал, а обычный WebGL2 есть — значит, программный рендер; нет и его — значит, 3D выключено. Дальше строка рендерера проверяется на SwiftShader, llvmpipe и «Basic Render»: в нагрузочном прогоне холм шёл там 0,2 кадра в секунду.
- Каждый пробный контекст сразу отпускается через `WEBGL_lose_context`: у страницы лимит живых контекстов. Проверка не бесплатная: в холодном Chrome первый контекст создавался 0,2–0,4 с.
- Решение «лёгкая» запоминается на 14 дней после «слишком медленно» (даже нижняя ступень дольше 45 мс) и «не запустилось» (ни кадра за 14 с). Не запоминается после потери контекста: это обычно случайность. Фоновая вкладка не рисует вовсе, поэтому зависанием не считается.
- Потерянный контекст обычно возвращается за секунду, тогда страница перезагружается. Не вернулся за 2,5 с — лёгкая версия, а не замёрзший холст.
- `?lite=1` открывает лёгкую версию, `?lite=0` пробует 3D и стирает запомненное решение. Ссылка «Try 3D anyway» в плашке ведёт на `?lite=0`.
- В демо проверка идёт по-настоящему и показывает каждый шаг; кнопки ломают сцену нарочно, а «Lose context» действительно теряет контекст.

Демо собрано из варианта TS командой esbuild (см. demo/app.js)
