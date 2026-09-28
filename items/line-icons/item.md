---
title: Line Icons
type: icon
status: stable
summary: "28 линейных иконок сайта на поле 16×16 с линией 1,25 и currentColor: функция icon(name) отдаёт разметку строкой, рядом тот же набор SVG-спрайтом."
tech: [TypeScript, SVG]
tags: [icons, svg, sprite, line icons, stroke, currentColor, иконки, пиктограммы, спрайт, линейные]
added: 2026-09-28
origin: own
source: "Portfolio 3D TS2: src/ui/icons.ts, иконки дока, футера и карточки заметок из index.html"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: ts, label: TypeScript, files: [icons.ts, main.ts] }
  - { id: svg, label: SVG sprite, files: [sprite.svg, usage.html] }
poster: poster.webp
---
- Стиль взят с иконок дока: поле 16×16, линия 1,25 без заливок, круглые концы и стыки, форма из простых дуг и прямых без мелких деталей. Поэтому иконка читается и в 14 px.
- Цвет — `currentColor`: иконка берёт цвет текста вокруг, на светлом и тёмном фоне ничего не переопределяется.
- `icon(name, cls)` возвращает разметку строкой, так иконки вставляются в шаблоны без DOM и без SVG-загрузчика в сборке; класс задаёт размер и отступы. Толщину перебивает CSS-свойство `stroke-width` — оно сильнее атрибута, на этом построен переключатель в демо.
- В спрайте у символов нет толщины, её задаёт `<svg>`, который ссылается на символ: один спрайт на все веса.
- Имена стали общими: на сайте иконки назывались по разделам страницы кейса (brief → text, context → pin, results → trend, takeaways → bulb), исходное имя подписано комментарием. Числа в путях почищены от хвостовых нулей (3.600 → 3.6). Знак бренда из дока и логотип LinkedIn из футера не вошли.

Демо собрано из варианта TS командой esbuild (см. demo/app.js)
