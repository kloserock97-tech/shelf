---
title: Bento Lightbox
type: gallery
status: stable
summary: "Сетка экранов на одинаковых сценах, каждая помещается в окно; клик открывает окно просмотра во весь экран с зумом колесом, щипком и двойным кликом до 6×, перетаскиванием и клавишами."
tech: [HTML, CSS, JavaScript, React]
tags: [lightbox, bento, gallery, zoom, pinch, dialog, screenshots, лайтбокс, галерея, зум, просмотр, скриншоты]
added: 2026-09-28
origin: own
source: "Portfolio 3D TS2: src/ui/caseStoryView.ts (bento, окно просмотра), src/ui/case-story.css (.cs-bento, .cs-stage, .cs-lightbox)"
repo: https://github.com/kloserock97-tech/gorbachev-nikita-product-designer
registry: bento-lightbox
demo:
  path: demo/index.html
  background: auto
  grid: false
variants:
  - { id: html, label: HTML, files: [bento-lightbox.js, bento-lightbox.css, index.html] }
  - { id: react, label: React, files: [BentoLightbox.tsx, bento-lightbox.css] }
poster: poster.webp
jobs: [showcase]
usedIn: [ts2]
pairs: [phone-fan-stack]
---
- Сетка — `repeat(auto-fit, minmax(min(100%, 340px), 1fr))` с `align-items: start`, у каждого экрана своя сцена не выше `clamp(220px, 44svh, 400px)`. Размер экрана считается явно через `cqw` и `--ar`, поэтому телефон и десктоп стоят целиком и ничего не прыгает, пока файл грузится.
- Окно просмотра — `<dialog>` с `showModal()`: фокус, Esc и верхний слой браузер даёт сам. `display: grid` задан только для `[open]`, иначе авторский стиль перебивает `dialog:not([open])` и закрытое окно остаётся на экране.
- Масштаб и сдвиг живут в `transform` самой картинки, раскладка на каждое движение пальца не пересчитывается. Колесо — `exp(−deltaY · 0,0018)` вокруг курсора, двойной клик — 2,6× и обратно, щипок двумя пальцами, увеличенный кадр тащится одним. Сдвиг ограничен тем, что вылезло за рамку, потолок 6×. У поля `touch-action: none`, иначе щипок уйдёт в масштаб страницы.
- Клик по полю вокруг кадра закрывает, по самому кадру — нет, иначе до двойного клика не добраться. Здесь это проверяется по координатам: с захватом указателя клик приходит в поле в любом случае.
- Стрелки ←/→ и кнопки листают экраны той же сетки со счётчиком «2 / 4», `+`/`−`/`0` зумят с клавиатуры, фокус после закрытия возвращается на плитку. Кнопки окна — тёмное стекло: светлые пропадают на увеличенном светлом экране.
- Подпись под плиткой — «заход»: первое предложение чернилами, остальное серым (`runIn` в React-варианте режет сам). Экраны в демо — вымышленный планировщик, SVG, поэтому чёткие при любом зуме.
