---
title: Lang Switch
type: utility
status: stable
summary: "Два языка без перезагрузки: словари с одинаковыми ключами, атрибуты data-i18n в разметке, t() и onLang для всего, что собирает код. Выбор хранится в ?lang= и localStorage, а пропущенную строку русского словаря ловит tsc."
tech: [TypeScript]
tags: [i18n, localization, language switcher, globe, localStorage, перевод, локализация, переключатель языка, язык]
added: 2026-09-28
origin: own
source: "Portfolio 3D TS2: src/i18n/index.ts, src/ui/langToggle.ts"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: ts, label: TypeScript, files: [i18n.ts, en.ts, ru.ts, langToggle.ts, main.ts] }
poster: poster.webp
---
- Статичный текст размечен атрибутами: `data-i18n` (текст), `data-i18n-html` (с тегами внутри), `data-i18n-label`, `-alt`, `-title`. При смене языка один проход подставляет строки, остальная страница не пересобирается: в портфолио холм продолжает крутиться.
- Всё, что собирает код, берёт строки через `t(key, vars)` и подписывается на `onLang`. Подстановки вида `{n}` делает тот же `t()`.
- Русский словарь объявлен как `Record<keyof typeof en, string>`: забытая или опечатанная строка — ошибка сборки, а не пустое место на странице.
- Язык выбирается так: `?lang=` в адресе, потом сохранённый выбор, потом язык браузера. После переключения язык пишется в адрес через `history.replaceState`, поэтому пересланная ссылка откроется на том же языке. localStorage обёрнут в try: в приватном режиме он бросает исключение.
- На кнопке написан язык, на который она переключит («RU» на английской странице), а aria-label сказан на том языке, куда ведёт («Читать по-русски»).
- Демо стартует на языке браузера, так что на русской системе оно открывается по-русски. Таймер на карточке идёт дальше при переключении и показывает, что страница не перезагружалась.

Демо собрано из варианта TS командой esbuild (см. demo/app.js)
