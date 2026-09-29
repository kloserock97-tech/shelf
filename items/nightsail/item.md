---
title: Nightsail
type: webgl
status: stable
summary: "Мраморная голова под столбом света в штормовом ночном море: прилив топит её и возвращает, волны считаются одной формулой на GPU и CPU, любую ночь можно отправить ссылкой."
tech: [three.js, WebGPU, TSL]
tags: [sea, ocean, tide, waves, light column, sparks, bloom, море, прилив, волны]
added: 2026-09-16
origin: own
source: "Projects/nightsail; бюст — Poly Haven, небо — рендер Blender"
repo: https://github.com/kloserock97-tech/nightsail
demo:
  url: https://kloserock97-tech.github.io/nightsail/
  background: dark
loop: loop.mp4
variants:
  - { id: webgpu, label: WebGPU · TSL, files: [ocean.js, light.js, sparks.js, post.js, main.js] }
poster: poster.webp
jobs: [atmosphere]
collections: [feels-expensive]
---
- В сцене один источник света в известной точке, поэтому почти ничего не идёт через систему освещения: море, осколки и воздух светлеют по тому, насколько смотрят на ядро и близки к его оси.
- Камень считает ту же сумму волн, что и море, в каждой своей точке, поэтому ватерлиния точная. Отметку высокой воды держит CPU и медленно опускает: голова выглядит только что вынырнувшей.
- Столб света — одна плоскость к камере с гауссовым спадом и шумом вдоль. У плоскости нет силуэта, который выдаёт конус или цилиндр; там, где она пересекает голову, она гаснет по сравнению глубин, без шва.
- Море — четыре заострённых синуса плюс три ряби, которые гнут нормаль, но не двигают поверхность.
- Блики линзы рисуются в спроецированной точке ядра, без прохода по ярким пикселям.
