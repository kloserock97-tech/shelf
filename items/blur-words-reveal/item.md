---
title: Blur Words Reveal
type: text
status: stable
summary: "Заставка главы: слова заголовка по прокрутке выходят из размытия по одному, потом вся строка уходит вверх и снова размывается. Скрипт пишет одну переменную --k, задержки и кривые живут в CSS."
tech: [HTML, CSS, JavaScript, React]
tags: [scroll, blur, words, reveal, stagger, sticky, chapter title, прокрутка, размытие, по словам, заставка, заголовок]
added: 2026-09-28
origin: own
source: "Portfolio 3D TS2: src/ui/walkChapter.ts, src/ui/walk.css (заставка главы «Кейсы»), src/ui/storyHero.ts (splitIntro)"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
registry: blur-words-reveal
demo:
  path: demo/index.html
  background: dark
  grid: false
variants:
  - { id: html, label: HTML, files: [blur-words-reveal.css, blur-words-reveal.js, index.html] }
  - { id: react, label: React, files: [BlurWordsReveal.tsx, blur-words-reveal.css] }
poster: poster.webp
---
- Слово i проявляется на отрезке прогресса `0,06 + 0,045·i … 0,28 + 0,045·i` со smoothstep: прозрачность 0 → 1, размытие 16 px → 0, подъём на 0,45em. Надзаголовок входит на 0,02–0,16, подпись на 0,34–0,52, а на 0,72–1 вся заставка гаснет, поднимается на 9vh и размывается на 10 px.
- В портфолио скрипт пишет `--in` каждому слову. Здесь по-другому, как у абзаца About (`splitIntro`): слова один раз режутся на span с номером в `--i`, а кадр прокрутки пишет только `--k` на секцию. Остальное считает CSS через `clamp()` и `calc()`.
- Заголовок целиком лежит в aria-label, слова спрятаны от скринридера: иначе он читал бы по одному слову.
- Прогресс считается от кэшированных границ секции: они меряются при загрузке и resize, а в кадре прокрутки только арифметика. Высота окна берётся с пробника `100vh`, чтобы прятки адресной строки на телефоне не сдвигали прогресс.
- Длина заставки в прокрутке — 1,65 экрана, как в портфолио (`--screens`). `data-from="0.5"` открывает первый экран уже проявленным: первая строка видна сразу и уходит по прокрутке.
- Размытие каждого слова стоит кадров. В портфолио под заставкой живой WebGL-луг, поэтому у слов `will-change` и никакого backdrop-filter. При reduced motion остаётся только прозрачность.
