---
title: Social Card
type: section
status: stable
summary: "Карточка превью ссылки 1200×630 на HTML и CSS: вёрстка в «дизайн-пикселях» через container query, снимок в JPEG скриптом Playwright и полный набор og- и twitter-тегов."
tech: [HTML, CSS, Playwright]
tags: [og image, open graph, social card, link preview, twitter card, meta tags, превью ссылки, соцсети, карточка, мета-теги]
added: 2026-09-28
origin: own
source: "Portfolio 3D TS2: docs/media/og-cover.source.html, мета-теги превью из index.html"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: html, label: HTML, files: [og-card.html, og-card.css, og-tags.html, shoot.mjs] }
poster: poster.webp
jobs: [contact]
usedIn: [ts2]
pairs: [lang-switch]
---
- Картинка превью — отдельная HTML-карточка 1200×630, которую `shoot.mjs` снимает Playwright-ом в JPEG. WebP не годится: LinkedIn и часть мессенджеров его не разворачивают. Адреса в тегах только абсолютные, относительные краулеры не понимают.
- Набор тегов: og:site_name, og:title, og:description, og:type, og:locale с alternate, og:url, og:image с type, width, height и alt, плюс twitter:card `summary_large_image` со своими title, description, image и alt. Если язык страницы меняется на лету, og:title и og:description меняются вместе с ним.
- Все размеры — «дизайн-пиксели» × `--u` (`100cqw / 1200`): при снимке карточка ровно 1200 px, а в любой колонке держит пропорции, как сжатое превью в ленте.
- Текст слева на тёмной вуали, картинка просвечивает справа: в ленте превью обрезают и уменьшают, имя должно это пережить.
- Перед снимком шрифты грузятся явно, `load()` для каждого начертания. `document.fonts.ready` сам по себе разрешается, пока шрифт ещё не запрошен, и в кадр попадал запасной шрифт.
- В шаблоне нейтральные имя, текст и фон: холмы на закате из градиентов и монограмма.
