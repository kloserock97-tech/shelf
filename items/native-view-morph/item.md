---
title: Native View Morph
type: transition
status: stable
summary: "Карточка проекта перетекает в шапку страницы кейса при настоящем переходе между двумя HTML-страницами: подложка, обложка и название становятся героем, «Назад» сворачивает его обратно в карточку. Основа — cross-document View Transitions, без их поддержки остаётся обычный переход по ссылке."
tech: [HTML, CSS, JavaScript, SVG]
tags: [view transitions, cross-document, shared element, morph, card to page, mpa, page transition, pageswap, pagereveal, переход между страницами, общий элемент, морф, карточка в страницу, кейс]
added: 2026-09-30
origin: adapted
priorArt: "Apple App Store card expand; Chrome cross-document View Transitions"
source: Shelf
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: html, label: HTML, files: [morph.js, morph.css, index.html] }
jobs: [navigation, showcase, storytelling]
collections: [feels-expensive, no-assets]
pairs: [case-study-page, object-card]
poster: poster.webp
---
- Две настоящие страницы (`index.html` и `case.html`), на обеих `@view-transition { navigation: auto; }`. Браузер снимает старую страницу, загружает новую и анимирует между снимками элементов с одинаковым `view-transition-name`: подложка карточки → панель героя, обложка → обложка, название → заголовок.
- Имя может носить только один элемент, поэтому карточки получают его в последний момент. `pageswap` на старой странице называет карточку, по чьей ссылке уходят. `pagereveal` на новой при возврате называет карточку страницы, откуда пришли (`navigation.activation.from`, запасной путь — sessionStorage), и снимает имена, когда морф закончился. У героя имена есть всегда.
- Скругления: у названных частей своего радиуса нет, их обрезает родитель, а радиус записан в `--morph-radius`. Старая страница оставляет радиусы в sessionStorage, новая анимирует `border-radius` у `::view-transition-group(morph-*)` через Web Animations: подложка 22 → 28 px, обложка 14 → 18 px.
- Снимок — растр, и маленький при увеличении мылится. Поэтому ведёт крупный: при открытии новый герой виден сразу, а карточка гаснет под ним за 160 мс; при возврате герой держится до 55% времени, карточка проявляется в конце. У названия одинаковые line-height, вес и трекинг в em, поэтому два снимка одной формы и не двоятся.
- Типы для CSS через `:active-view-transition-type()`: `morph-open` (карточка → герой), `morph-close` (герой → список), `morph-next` (герой → герой по ссылке «Next case»).
- 480 мс, `cubic-bezier(.32, .72, 0, 1)`. Всё, что не общее, на старой странице гаснет за 200 мс, новая поднимается на 16 px с задержкой 100 мс.
- «All work» делает `history.back()`, если пришли со списка: браузер достаёт его из bfcache вместе с прокруткой. Иначе — обычный переход на список, морф тот же. Esc — тоже назад. Новая навигация посреди морфа прерывает его.
- `morph.js` подключается обычным `<script>` в `<head>`: `pagereveal` приходит до первого кадра, модуль бы опоздал. Страница кейса не рисует первый кадр, пока не собран герой: `<link rel="expect" href="#case-end" blocking="render">`.
- Работает на статическом хостинге и внутри iframe (проверено в Chrome). Без cross-document View Transitions и при `prefers-reduced-motion` — обычный переход по ссылке.
- Флаг демо: `index.html?shot=1` сам открывает первый кейс и замораживает морф на 16% времени, `&t=0.3` — другой момент.
