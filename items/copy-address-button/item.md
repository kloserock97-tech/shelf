---
title: Copy Address Button
type: button
status: stable
summary: "Адрес почты сам и есть кнопка: клик кладёт его в буфер, подпись на 1,8 с меняется на зелёное «Address copied» с галочкой; если буфер закрыт, открывается почта."
tech: [HTML, CSS, React]
tags: [copy, clipboard, email, contact, feedback, копировать, буфер обмена, почта, контакты]
added: 2026-09-28
origin: own
source: "Portfolio 3D TS2: src/ui/footer.ts, src/ui/hill-ui.css (.sf-copy, .sf-pill), index.html (футер)"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
registry: copy-address-button
demo:
  path: demo/index.html
  background: auto
  grid: true
variants:
  - { id: html, label: HTML, files: [copy-address.js, copy-address.css, index.html] }
  - { id: react, label: React, files: [CopyAddressButton.tsx, copy-address.css] }
poster: poster.webp
---
- Действие и адрес разделены: «Написать письмо» открывает почту, а сам адрес — кнопка копирования, и видно, что именно копируется.
- Подтверждение прямо в кнопке: иконка копирования меняется на галочку, текст — на «Address copied» цветом `#9fe38b`, через 1,8 с всё возвращается.
- Если буфер закрыт политикой браузера, сначала пробуется скрытое поле и `execCommand('copy')` (старые браузеры, http, фрейм без `clipboard-write`), потом открывается `mailto:`: клик не теряется.
- Имя кнопки для скринридера — «Copy the address: …», а «Address copied» объявляет отдельная `role="status"` рядом. Кнопка шлёт событие `copied` — на него удобно повесить звук.
