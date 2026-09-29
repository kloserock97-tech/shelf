---
title: Garden Loader
type: loader
status: stable
summary: "Загрузчик-сад: на толстой плите матового стекла тает лёд, растут мох и цветы — ровно по настоящей готовности страницы, а качество само опускается, если кадры опаздывают."
tech: [TypeScript, three.js, GLSL, CSS]
tags: [loader, preloader, moss, ice, glass, shell texturing, alpha to coverage, a11y, reduced motion, загрузчик, прелоадер, мох, лёд, стекло, сад]
added: 2026-09-28
updated: 2026-09-29
origin: own
source: "Portfolio 3D TS2: src/intro/natureLoader.ts, natureLoader.css, NatureScene.ts, garden/*.ts"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
demo:
  path: demo/index.html
  background: light
  grid: false
variants:
  - { id: ts, label: TypeScript, files: [garden-loader.ts, garden-scene.ts, garden-surface.ts, garden-sheet.ts, garden-slab.ts, garden-ice.ts, garden-moss.ts, garden-flowers.ts, garden-water.ts, garden-post.ts, garden-loader.css, main.ts] }
poster: poster.webp
---
- Рост честный: `progress()` держится ниже 94 % до `ready()`, время — только хореография (полный рост не быстрее 2,8 с). 100 % — это готовая страница и уже отрисованный заросший кадр, стенки плиты тоже.
- Мох — shell texturing: 8–20 слоёв одним instanced-вызовом, край ворсинки сглаживает alpha-to-coverage на MSAA ×4. Слои не пишут альфу (`colorMask`), непрозрачность даёт «оболочка» на высоте кончиков. Приём отдельно — Moss Shell Texturing.
- Ступени качества: DPR 2 → 1 и 20 → 8 слоёв. Если в окне из 30 кадров 17 пришли позже 26 мс — ступень вниз; одиночные зависания дольше 90 мс не считаются, вверх не поднимается. `?gardentier=0…4` закрепляет ступень.
- Стекло без transmission: непрозрачное тело, clearcoat, отражения процедурной комнаты (RoomEnvironment → PMREM). Холст прозрачный, фон — CSS-студия; перед тонмаппингом цвет делится на покрытие, иначе по силуэту светлая кайма.
- Доступность: диалог с `aria-modal`, страница под ним `inert`, этап — `role=status`, полоса — `progressbar`; reduced motion — неподвижная сцена и кадр раз в 220 мс; через 10 с предлагается лёгкая версия; на выходе освобождается всё, вплоть до `forceContextLoss`. Фокус диалог берёт, только если документ уже в фокусе — в iframe не уводит его со страницы.
- Демо крутит готовность по кругу (12 с), `?garden=0…1` — стоп-кадр фазы, `?slow=1` — кнопка лёгкой версии через 3 с. Хэш клетки мха заменён на свой целочисленный. Chrome на D3D11 пишет предупреждение HLSL X4122 про константы упаковки глубины three.js — это не ошибка.

Демо собрано из варианта TS командой esbuild (см. demo/app.js)
