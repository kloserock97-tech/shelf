# Shelf

A personal shelf of UI pieces: components, sections, small apps, WebGL scenes, shaders and interface motion.
Every item has a live preview and its code in one or more variants (HTML/CSS/JS, React, Vue, R3F).

This is a working tool for one person, published only because GitHub Pages hosts it. Pages ask search
engines not to index them.

## How it is built

- [Astro](https://astro.build) 7, static output, deployed to GitHub Pages by `.github/workflows/deploy.yml`.
- One item is one folder in `items/<slug>/`: `item.md` (metadata and notes), `demo/` (the live preview),
  `variants/<id>/` (code), `poster.webp` and an optional `loop.mp4`.
- Code is highlighted at build time with Shiki, in a palette made from the design system tokens
  (`design/tokens.json`, turned into `src/styles/tokens.css` by `npm run tokens`).
- Search is MiniSearch in the browser. React items are also served as a shadcn registry under `/r/`.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | local site with hot reload |
| `npm run check` | validates every item: fields, files, origin rules, leaked secrets |
| `npm run new -- <slug> --type component` | scaffolds an item |
| `npm run capture -- <slug>` | takes a 4:3 poster of the demo in Chrome with the GPU on |
| `npm run build` | lays out demos and media, builds the site into `dist/` |
| `npm run smoke` | checks the built site in Chrome: errors, layout, search, Quick Look, copy |

Private items live in `private/<slug>/`, which git ignores: they show up locally and never get published.

## Licence

Source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE). See [COMMERCIAL.md](COMMERCIAL.md)
for commercial use. Items copied from other repositories keep their own licence, named on the item page.
