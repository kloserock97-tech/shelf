---
title: Not Found Page
type: section
status: stable
summary: "Самодостаточная страница 404 для GitHub Pages: фото под тёмной вуалью, язык из выбора на сайте, корень сайта из адреса (/<репозиторий>/ на github.io), ссылки назад и строка с адресом, которого нет."
tech: [HTML, CSS, JavaScript]
tags: ["404", not found, error page, github pages, i18n, ошибка, страница не найдена, 404 страница]
added: 2026-09-28
origin: own
source: "Portfolio 3D TS2: public/404.html; фон — кадр сцены public/ui/hill-poster.webp"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
demo:
  path: demo/index.html
  background: dark
  grid: false
variants:
  - { id: html, label: HTML, files: [404.html] }
poster: poster.webp
---
- GitHub Pages отдаёт `/404.html` на любой неизвестный путь, поэтому страница самодостаточна: свои стили и скрипт в одном файле, никаких модулей сборки.
- Относительные ссылки на такой странице ломаются: на `/work/old-case` они считаются от `/work/`. Поэтому корень сайта вычисляется из адреса — на `*.github.io` это `/<репозиторий>/`, на своём домене `/` — и от него строятся ссылки, фото, иконка и шрифт.
- Язык — тот, что человек выбрал на сайте (ключ в localStorage, по умолчанию `site-lang`), иначе язык браузера. Тексты лежат в `data-en` / `data-ru` прямо в разметке. Настройки — `window.NOT_FOUND = { base, image, font, icon, path, langKey, lang }` до скрипта; в демо так задан локальный корень и образец адреса, а переключатель EN / RU есть только в демо.
- Фото проявляется после загрузки до прозрачности 0,62 над тёмно-зелёным фоном, вуаль-градиент держит текст читаемым на любом кадре. Строка «Address: …» показывает путь без корня сайта.
- Шрифт — Onest, файл берётся от корня сайта.
- Фон — тот же кадр холма, что у футера. Контакты — `hello@example.com`.
