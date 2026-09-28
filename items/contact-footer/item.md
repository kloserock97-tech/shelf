---
title: Contact Footer
type: section
status: stable
summary: "Футер портфолио на закатном холме: крупное «Let's make something complex feel simple.» с одним словом курсивом Playfair, контакты тёмными капсулами, адрес-кнопка копирования и строка ссылок; входит каскадом."
tech: [HTML, CSS]
tags: [footer, contact, cta, serif accent, glass pills, футер, подвал, контакты, призыв]
added: 2026-09-28
origin: own
source: "Portfolio 3D TS2: index.html (футер), src/ui/hill-ui.css (.site-footer, .sf-*), src/ui/footer.ts, src/ui/fonts.css (.serif-accent); фон — кадр сцены public/ui/hill-poster.webp"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
demo:
  path: demo/index.html
  background: dark
  grid: false
variants:
  - { id: html, label: HTML, files: [index.html, contact-footer.css, contact-footer.js] }
poster: poster.webp
---
- Акцент — одно слово курсивной антиквой внутри гротеска (`.serif-accent`): Playfair Display Italic 400, на 6% крупнее — антиква оптически мельче гротеска того же кегля. Одно слово на заголовок, не чаще.
- Заголовок без широкой размытой тени: на DPR 2,25 её растр при входе давал кадр около 100 мс. Хватает тени 1–2 px и тёмного неба.
- Главное действие — «Write an e-mail», светлая капсула. Сам адрес — кнопка копирования (подтверждение в кнопке, `role="status"` для скринридера, при закрытом буфере — `mailto:`). Остальные контакты — тёмное стекло как у дока.
- Вход каскадом один раз, когда видна четверть футера: подзаголовок, две половины заголовка, контакты и строка ссылок с задержками 0 / 90 / 220 / 340 мс. На сайте футер лежит поверх 3D-сцены и включается скролл-историей; здесь он обычная секция, фон задаёт страница.
- Фон — кадр собственной сцены холма (`hill-poster.webp`) под сумеречной вуалью. С кадра убрана собака: её модель — CC BY 4.0 (Jéssica Magno), ей нужна атрибуция; кресло, стол и компьютер — CC0. Значки Telegram и LinkedIn заменены нейтральными, адрес и ссылки — заглушки.
