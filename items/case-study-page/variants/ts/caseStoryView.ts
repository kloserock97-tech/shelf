/* v41 (docs/prompts/v41.md): страница кейса как один рассказ. Разметка и поведение раздела кейса,
   у которого есть рассказ в data/caseStory. Навигация одна: тонкая панель сверху (назад, название и
   прогресс чтения, соседние кейсы) и оглавление-рельса слева со scroll-spy; разборы в глубину (бывшие
   подзадачи) вложены в раздел «Решения» и открываются на месте, адрес #/work/<кейс>/<разбор> сохраняется.
   Галереи вместо рамок: film (экран едет внутри рамки по прокрутке), compare (ползунок), spot (точки,
   привязанные к решениям), stack (веер телефонов), bento (сетка с лайтбоксом).
   caseView.ts решает, есть ли рассказ, и зовёт renderStory/mountStory.

   v64: подача «по-эпловски» (docs/prompts/v64-apple-cards.md). Структура рассказа и тексты прежние, меняется вид:
   герой — сцена в цвет кейса с настоящим экраном и предметом (caseHero.ts); левой рельсы больше нет, оглавление
   живёт в плавающей капсуле внизу и на широком экране (она же показывает текущий раздел); у разделов иконки
   (icons.ts); первое предложение лида и подписи набрано чернилами, продолжение серым (runIn) — так Apple ведёт
   глаз по длинному абзацу; экраны стоят на светлой сцене в цвет кейса. Стили — case-story.css. */
import type { CaseStory, Gallery, Decision, CaseImage, Method } from "../data/caseStory";
import { pad2 as pad } from "../lib/format";
import type { CaseTrack, TrackPart } from "../data/caseTracks";
import { getCases } from "../data/cases";
import { shots2x } from "../data/shots2x";
import { t } from "../i18n";
import { heroStage, mountHero } from "./caseHero";
import { brandMark, goArrow, lookVars, objectPicture } from "./caseLook";
import { demoBlock, mountDemos } from "./caseDemos";
import { icon, type IconName } from "./icons";
import { smoothWheel } from "./smoothScroll";
import { tidy } from "../lib/typograph";
import "./case-story.css";

const BASE = import.meta.env.BASE_URL;
/* всё, что уходит в разметку, проходит типограф показа: неразрывные пробелы после предлогов, у чисел и перед тире */
const esc = (s: string) => tidy(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/* v74.2: адрес сайта в тексте кейса («stories.mos.ru») — настоящая ссылка, а не слово: его хочется открыть.
   Применяется к уже экранированному тексту; точка в конце предложения в ссылку не попадает */
const linkify = (html: string) =>
  html.replace(/\b((?:[a-z0-9-]+\.)+(?:ru|com|app|io|dev|design))(\/[\w/-]*)?(?=[\s.,;:)!?]|$)/gi, (m) => `<a class="cs-link" href="https://${m}" target="_blank" rel="noopener">${m}</a>`);
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** «Заход»: первое предложение (или часть до двоеточия) — чернилами, продолжение — серым. Одно предложение
    остаётся как есть. Граница ищется в первых 140 знаках, чтобы заходом не стал весь абзац. */
function runIn(text: string) {
  const head = text.slice(0, 140);
  let cut = -1;
  for (const mark of [": ", ". ", "? ", "! "]) {
    const i = head.indexOf(mark);
    if (i > 12 && (cut < 0 || i < cut)) cut = i + mark.length - 1;
  }
  if (cut < 0 || cut >= text.length - 1) return esc(text);
  return `<b class="cs-run">${esc(text.slice(0, cut))}</b> ${esc(text.slice(cut + 1))}`;
}

/** слово с дефисом не рвётся по дефису: «ИИ-агентов» переносится целиком, а не «ИИ-» в конце строки */
const keepHyphens = (html: string) => html.split(" ").map((w) => (w.includes("-") ? `<span class="cs-nw">${w}</span>` : w)).join(" ");

type Section = { id: string; label: string; children?: { id: string; label: string }[] };

/* Экран в двух размерах. Раньше файл был один и в том размере, в каком его когда-то отдали, — на плотном
   экране и в окне просмотра браузеру приходилось додумывать пиксели, отсюда «мыло». Ширины в srcset
   настоящие, поэтому выбор идёт и по плотности точек, и по месту, которое кадру досталось на странице.
   Список экранов, у которых есть двойной файл, собирает tools/shot-tiers.mjs --manifest. */
const SIZES = "(max-width: 900px) 92vw, 1000px";
const hi = (g: CaseImage, sizes = SIZES) => {
  const w = shots2x.get(g.src);
  return w ? ` srcset="${BASE}${g.src} ${w}w, ${BASE}${g.src.replace(/.webp$/, "@2x.webp")} ${w * 2}w" sizes="${sizes}"` : "";
};

const pic = (g: CaseImage, extra = "") =>
  `<img src="${BASE}${g.src}" alt="${esc(g.caption)}" width="${g.w}" height="${g.h}" loading="lazy" decoding="async"${hi(g)}${extra}>`;

/* ── сцена: один способ показывать экран ─────────────────────────────────────
   Любой экран стоит на одной и той же тёмной сцене, и сцена всегда помещается в окно: высота ограничена
   --stage-h, ширина — колонкой, пропорции берутся из --ar (case-v41.css). Клик открывает экран целиком.
   Высокий экран (film) закрепляется и проезжает внутри сцены с той же скоростью, с какой крутят страницу. */
const ar = (g: CaseImage) => (g.w / g.h).toFixed(4);

const stage = (g: CaseImage) =>
  `<div class="cs-stage" style="--ar:${ar(g)}"><button type="button" class="cs-stage-media${g.kind === "device" ? " is-device" : ""}" data-zoom aria-label="${t("cs.open")}: ${esc(g.caption)}">${pic(g)}</button></div>`;

/** экран внутри текста: решение, метод, подход, вариант */
const fig = (g: CaseImage, cls = "") =>
  `<figure class="cs-fig cs-fig--inline ${cls}">${stage(g)}<figcaption>${runIn(g.caption)}</figcaption></figure>`;

/* v68: картинка-разделитель между главами. Не интерфейс, а воздух: подпись уходит в alt, не на экран.
   Фирменные материалы — это продуманные композиции, им полоса нужна выше, иначе от кадра остаётся обрезок. */
const interlude = (g: CaseImage, focus = "50% 47%") =>
  `<div class="cs-interlude cs-interlude--${esc(g.kind)}" data-reveal aria-hidden="true" style="--focus:${esc(focus)}"><img src="${BASE}${g.src}" alt="" width="${g.w}" height="${g.h}" loading="lazy" decoding="async"${hi(g, "100vw")} draggable="false"></div>`;

/* ── куски ─────────────────────────────────────────────────────────────────── */
const SEC_ICON: Record<string, IconName> = { brief: "brief", context: "context", approach: "approach", research: "research", flow: "flow", decisions: "decisions", split: "split", mistakes: "mistakes", results: "results", screens: "screens", roadmap: "roadmap", takeaways: "takeaways" };
const head = (n: number, id: string, label: string, lead?: string) => `
  <header class="cs-head" id="cs-${id}">
    <p class="cs-num">${icon(SEC_ICON[id] ?? "brief")}<span>${pad(n)}</span>${esc(label)}</p>
    ${lead ? `<h2 class="cs-lead" data-reveal>${keepHyphens(esc(lead))}</h2>` : ""}
  </header>`;

/** абзацы разделяются пустой строкой в данных */
const paras = (text: string, cls = "cs-text") => text.split(/\n{2,}/).map((x) => `<p class="${cls}" data-reveal>${esc(x)}</p>`).join("");

const mini = (label: string) => `<p class="cs-mini">${esc(label)}</p>`;

const methodCard = (m: Method, k: number) => `
  <article class="cs-method" data-reveal style="--rd:${k}">
    <p class="cs-method-kind"><span>${pad(k + 1)}</span>${esc(m.kind)}</p>
    <h3>${esc(m.title)}</h3>
    <dl>
      <div><dt>${t("cs.question")}</dt><dd>${esc(m.question)}</dd></div>
      ${m.sample ? `<div><dt>${t("cs.sample")}</dt><dd>${linkify(esc(m.sample))}</dd></div>` : ""}
    </dl>
    <p class="cs-method-finding"><b>${t("cs.finding")}</b>${esc(m.finding)}</p>
    ${m.image ? fig(m.image) : ""}
  </article>`;

const decision = (d: Decision, k: number, dives: CaseTrack[]) => {
  const dive = d.deepDive ? dives.find((x) => x.id === d.deepDive) : null;
  return `
  <article class="cs-decision" id="cs-d-${esc(d.id)}" data-reveal>
    <div class="cs-decision-text">
      <p class="cs-num cs-num--s"><span>${pad(k + 1)}</span></p>
      <h3>${esc(d.title)}</h3>
      <div class="cs-fdw">
        <div><p class="cs-mini">${t("cs.found")}</p><p>${esc(d.found)}</p></div>
        <div><p class="cs-mini">${t("cs.did")}</p><p>${esc(d.did)}</p></div>
        ${d.effect ? `<div><p class="cs-mini">${t("cs.effect")}</p><p>${esc(d.effect)}</p></div>` : ""}
      </div>
      ${d.why ? `<p class="cs-why"><b>${t("cs.why")}</b>${esc(d.why)}</p>` : ""}
      <p class="cs-basis-row">
        ${d.basis ? `<span class="cs-basis"><i></i>${t("cs.basis")}: ${esc(d.basis)}</span>` : ""}
        ${dive ? `<a class="cs-divelink" href="#/work/__ID__/${dive.id}" data-dive="${dive.id}">${t("cs.deep")}: ${esc(dive.chip)} <span aria-hidden="true">→</span></a>` : ""}
      </p>
    </div>
    ${d.image ? fig(d.image, "cs-decision-img") : ""}
  </article>`;
};

/* разбор в глубину — та же модель частей, что у подзадач v35, но вложен в страницу */
const part = (p: TrackPart, k: number) => {
  const blocks: string[] = [];
  if (p.before) blocks.push(`<div class="cs-before"><span class="cs-mini">${esc(p.before.label)}</span><b>${esc(p.before.text)}</b>${p.before.note ? `<p>${esc(p.before.note)}</p>` : ""}</div>`);
  if (p.found || p.did || p.points?.length) {
    blocks.push(`<div class="cs-fdw cs-fdw--2">
      ${p.found ? `<div><p class="cs-mini">${t("cv.found")}</p><p>${esc(p.found)}</p></div>` : ""}
      <div>${p.did ? `<p class="cs-mini">${t("cs.did")}</p><p>${esc(p.did)}</p>` : ""}
      ${p.points?.length ? `<ul class="cs-checks">${p.points.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</div>
    </div>`);
  }
  if (p.options?.length) {
    blocks.push(`<div class="cs-options">${p.options.map((o) => `<article class="cs-option${o.chosen ? " is-chosen" : ""}">
      <header><b>${esc(o.name)}</b>${o.chosen ? `<span class="cs-badge">${t("cs.chosen")}</span>` : ""}</header>
      <p>${esc(o.text)}</p>
      ${o.image ? fig(o.image) : ""}
    </article>`).join("")}</div>`);
  }
  if (p.steps?.length) blocks.push(`<ol class="cs-steps">${p.steps.map((s, j) => `<li><span>${pad(j + 1)}</span><b>${esc(s.title)}</b><p>${esc(s.text)}</p></li>`).join("")}</ol>`);
  if (p.effect || p.why) {
    blocks.push(`<div class="cs-pair">
      ${p.effect ? `<div class="cs-card"><p class="cs-mini">${t("cs.effect")}</p><p>${esc(p.effect)}</p></div>` : ""}
      ${p.why ? `<div class="cs-card cs-card--dark"><p class="cs-mini">${t("cs.why")}</p><p>${esc(p.why)}</p></div>` : ""}
    </div>`);
  }
  if (p.lesson) blocks.push(`<div class="cs-lesson"><p class="cs-mini">${t("cv.lesson")}</p><b>${esc(p.lesson.title)}</b><p>${esc(p.lesson.text)}</p></div>`);
  if (p.images?.length) blocks.push(`<div class="cs-bento cs-bento--inline">${p.images.map((g) => fig(g, "cs-bento-item")).join("")}</div>`);
  return `<section class="cs-part"><p class="cs-mini">${pad(k + 1)} · ${esc(p.label)}</p><h4>${esc(p.title)}</h4>${blocks.join("")}</section>`;
};

const deepDive = (tr: CaseTrack, k: number) => `
  <details class="cs-deep" id="cs-dd-${esc(tr.id)}" data-dive="${esc(tr.id)}">
    <summary>
      <span class="cs-num cs-num--s"><span>${pad(k + 1)}</span></span>
      <span class="cs-deep-title"><b>${esc(tr.chip)}</b><span>${esc(tr.tagline)}</span></span>
      <span class="cs-deep-toggle" aria-hidden="true"><i></i></span>
    </summary>
    <div class="cs-deep-body">
      <header class="cs-deep-head">
        <p class="cs-kicker">${esc(tr.kicker)}</p>
        <h3>${esc(tr.title)}</h3>
        ${tr.facts?.length ? `<dl class="cs-facts">${tr.facts.map(([a, b]) => `<div><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join("")}</dl>` : ""}
        ${tr.metrics?.length ? `<div class="cs-kpis cs-kpis--s">${tr.metrics.map((m) => `<div class="cs-kpi"><b>${esc(m.value)}</b><span>${esc(m.label)}</span></div>`).join("")}</div>` : ""}
      </header>
      ${tr.parts.map(part).join("")}
      ${tr.quote ? `<blockquote class="cs-quote">${esc(tr.quote)}</blockquote>` : ""}
    </div>
  </details>`;

const gallery = (g: Gallery, k: number) => {
  const title = g.title ? `<h3 class="cs-gal-title">${esc(g.title)}</h3>` : "";
  switch (g.kind) {
    case "film":
      return `<figure class="cs-gal cs-fig cs-film" data-reveal style="--rd:${k % 3}">${title}
        <div class="cs-film-pin"><div class="cs-film-sticky">
          <div class="cs-stage cs-film-stage"><div class="cs-film-track">${pic(g.image, ' draggable="false"')}</div><button type="button" class="cs-stage-zoom" data-zoom aria-label="${t("cs.open")}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 3H3v5M12 3h5v5M8 17H3v-5M12 17h5v-5"/></svg></button></div>
          <figcaption>${runIn(g.image.caption)}</figcaption>
        </div><div class="cs-film-run" aria-hidden="true"></div></div></figure>`;
    case "compare":
      return `<figure class="cs-gal cs-fig cs-compare" data-reveal style="--rd:${k % 3}">${title}
        <div class="cs-stage cs-compare-box" style="--ar:${Math.min(g.before.w / g.before.h, g.after.w / g.after.h).toFixed(4)};--pos:50%">
          <div class="cs-compare-after">${pic(g.after, ` draggable="false" style="--iar:${ar(g.after)}"`)}</div>
          <div class="cs-compare-before">${pic(g.before, ` draggable="false" style="--iar:${ar(g.before)}"`)}</div>
          <span class="cs-compare-label cs-compare-label--a">${esc(g.labels[0])}</span>
          <span class="cs-compare-label cs-compare-label--b">${esc(g.labels[1])}</span>
          <div class="cs-compare-handle" aria-hidden="true"><i></i></div>
          <input class="cs-compare-range" type="range" min="0" max="100" value="50" aria-label="${t("cs.drag")}">
        </div>
        <figcaption>${esc(g.before.caption)} · ${esc(g.after.caption)}</figcaption></figure>`;
    case "spot":
      return `<figure class="cs-gal cs-fig cs-spot" data-reveal style="--rd:${k % 3}">${title}
        <div class="cs-stage" style="--ar:${ar(g.image)}"><div class="cs-spot-img">${pic(g.image)}
          ${g.spots.map((s, j) => `<button type="button" class="cs-spot-dot${s.x > 66 ? " is-right" : s.x < 34 ? " is-left" : ""}" style="--x:${s.x};--y:${s.y}" data-decision="${s.decision ?? ""}" aria-label="${t("cs.spot")} ${j + 1}: ${esc(s.text)}"><span>${j + 1}</span><em>${esc(s.text)}</em></button>`).join("")}
        </div><button type="button" class="cs-stage-zoom" data-zoom aria-label="${t("cs.open")}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 3H3v5M12 3h5v5M8 17H3v-5M12 17h5v-5"/></svg></button></div>
        <ol class="cs-spot-list">${g.spots.map((s) => `<li><span>${esc(s.text)}</span></li>`).join("")}</ol>
        <figcaption>${esc(g.image.caption)}</figcaption></figure>`;
    case "stack":
      return `<figure class="cs-gal cs-fig cs-stack" data-reveal style="--rd:${k % 3}">${title}
        <div class="cs-stage cs-stack-fan" style="--n:${g.images.length}">${g.images.map((im, j) => `<button type="button" class="cs-stack-phone${im.kind === "device" ? " is-device" : ""}" data-zoom style="--i:${j}" aria-label="${t("cs.open")}: ${esc(im.caption)}">${pic(im)}</button>`).join("")}</div>
        <figcaption>${g.images.map((im) => esc(im.caption)).join(" · ")}</figcaption></figure>`;
    case "bento":
      return `<div class="cs-gal" data-reveal style="--rd:${k % 3}">${title}
        <div class="cs-bento">${g.images.map((im) => fig(im, "cs-bento-item")).join("")}</div></div>`;
  }
};

/* ── оглавление ───────────────────────────────────────────────────────────── */
export function sectionsOf(s: CaseStory): Section[] {
  const list: Section[] = [{ id: "brief", label: t("cs.brief") }, { id: "context", label: t("cs.context") }];
  if (s.approach) list.push({ id: "approach", label: t("cs.approach") });
  list.push({ id: "research", label: t("cs.research") });
  if (s.flow) list.push({ id: "flow", label: t("cs.flow") });
  list.push({ id: "decisions", label: t("cs.decisions"), children: s.deepDives.map((d) => ({ id: `dd-${d.id}`, label: d.chip })) });
  if (s.split) list.push({ id: "split", label: t("cs.split") });
  if (s.mistakes) list.push({ id: "mistakes", label: t("cs.mistakes") });
  list.push({ id: "results", label: t("cs.results") });
  if (s.gallery.length) list.push({ id: "screens", label: t("cs.screens") });
  if (s.roadmap) list.push({ id: "roadmap", label: t("cs.roadmap") });
  list.push({ id: "takeaways", label: t("cs.takeaways") });
  return list;
}

const toc = (sections: Section[], cls: string) => `
  <ol class="${cls}">${sections.map((s, k) => `<li>
    <a href="#cs-${s.id}" data-sec="${s.id}" data-n="${pad(k + 1)}">${icon(SEC_ICON[s.id] ?? "brief")}<span>${pad(k + 1)}</span><em>${esc(s.label)}</em></a>
    ${s.children?.length ? `<ol>${s.children.map((c) => `<li><a href="#cs-${c.id}" data-sec="${c.id}">${esc(c.label)}</a></li>`).join("")}</ol>` : ""}
  </li>`).join("")}</ol>`;

/* ── страница ─────────────────────────────────────────────────────────────── */
export function renderStory(s: CaseStory, i: number, n: number, nextId: string, prevId: string) {
  const card = getCases().find((c) => c.id === s.id)!;
  const sections = sectionsOf(s);
  let sec = 0;
  const next = getCases().find((c) => c.id === nextId)!;
  const ctx = s.context;
  const ap = s.approach;
  const r = s.research;
  /** фото-разделитель встаёт после названной главы, если он у кейса есть */
  const brk = (after: string) => (s.interludes ?? []).filter((x) => x.after === after).map((x) => interlude(x.image, x.focus)).join("");
  const html = `
  <article class="cs" data-case="${esc(s.id)}" style="${lookVars(card, "mono")}">
    <div class="cs-top">
      <button type="button" class="cs-back"><span aria-hidden="true">←</span> ${t("cs.back")}</button>
      <div class="cs-top-title" aria-hidden="true"><b>${esc(card.title)}</b><i class="cs-progress"></i></div>
      <div class="cs-top-nav">
        <span class="cs-top-count">${pad(i + 1)} / ${pad(n)}</span>
        <a class="cs-top-arrow" href="#/work/${esc(prevId)}" aria-label="${t("cs.prevcase")}"><span aria-hidden="true">←</span></a>
        <a class="cs-top-arrow" href="#/work/${esc(nextId)}" aria-label="${t("cs.nextcase")}"><span aria-hidden="true">→</span></a>
      </div>
    </div>

    <div class="cs-layout">
      <div class="cs-body">
        <header class="cs-hero">
          <div class="cs-hero-stage">
            <div class="cs-hero-text">
              <p class="cs-hero-brand">${brandMark(card, "cs-brand")}<span>${esc(card.title)}</span></p>
              <p class="cs-kicker" data-reveal>${esc(s.hero.kicker)}</p>
              <h1 id="cv-title" tabindex="-1" data-reveal style="--rd:1">${keepHyphens(esc(s.hero.title))}</h1>
              <p class="cs-tagline" data-reveal style="--rd:2">${linkify(esc(s.hero.tagline))}</p>
            </div>
            ${heroStage(card, card.title)}
          </div>
          <dl class="cs-facts cs-facts--hero" data-reveal style="--rd:3">${s.hero.facts.map(([a, b], k) => `<div>${icon((["role", "company", "time", "platform"] as const)[k] ?? "brief")}<dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join("")}</dl>
          <p class="cs-tags" data-reveal style="--rd:4">${s.hero.tags.map((x) => `<span>${esc(x)}</span>`).join("")}</p>
        </header>

        ${s.kpis.length ? `<section class="cs-kpis" aria-label="${t("cs.results")}">${s.kpis.map((m, k) => `<div class="cs-kpi${m.value.length > 7 ? " cs-kpi--long" : ""}" data-reveal style="--rd:${k}"><b data-count="${esc(m.value)}">${esc(m.value)}</b><span>${esc(m.label)}</span></div>`).join("")}</section>` : ""}

        <section class="cs-sec">
          ${head(++sec, "brief", t("cs.brief"))}
          <p class="cs-summary" data-reveal>${runIn(s.hero.summary)}</p>
        </section>

        ${brk("brief")}

        <section class="cs-sec">
          ${head(++sec, "context", t("cs.context"), ctx.lead)}
          ${ctx.text ? paras(ctx.text) : ""}
          ${ctx.origin ? `<div class="cs-block" data-reveal>${mini(t("cs.origin"))}<p class="cs-text">${esc(ctx.origin)}</p></div>` : ""}
          ${ctx.roles?.length ? `<div class="cs-block" data-reveal>${mini(t("cs.roles"))}<ul class="cs-roles">${ctx.roles.map((x) => `<li><b>${esc(x.who)}</b><span>${esc(x.needs)}</span></li>`).join("")}</ul></div>` : ""}
          ${ctx.constraints?.length ? `<div class="cs-block" data-reveal>${mini(t("cs.constraints"))}<ol class="cs-constraints">${ctx.constraints.map((x, k) => `<li><span>${pad(k + 1)}</span><b>${esc(x.title)}</b><p>${esc(x.text)}</p></li>`).join("")}</ol></div>` : ""}
          ${ctx.team?.length ? `<div class="cs-block" data-reveal>${mini(t("cs.team"))}<ul class="cs-roles">${ctx.team.map((x) => `<li><b>${esc(x.who)}</b><span>${esc(x.how)}</span></li>`).join("")}</ul></div>` : ""}
          <div class="cs-block cs-card cs-card--dark" data-reveal>${mini(t("cs.myrole"))}<p>${esc(ctx.myRole)}</p></div>
        </section>
        ${brk("context")}

        ${ap ? `<section class="cs-sec">
          ${head(++sec, "approach", t("cs.approach"), ap.lead)}
          ${ap.text ? paras(ap.text) : ""}
          ${ap.rejected ? `<div class="cs-block cs-rejected" data-reveal>${mini(t("cs.rejected"))}<p>${esc(ap.rejected)}</p></div>` : ""}
          ${ap.levels?.length ? `<div class="cs-block" data-reveal>${mini(t("cs.levels"))}<ol class="cs-levels">${ap.levels.map((x, k) => `<li style="--k:${k}"><span>${pad(k + 1)}</span><b>${esc(x.title)}</b><p>${esc(x.text)}</p></li>`).join("")}</ol></div>` : ""}
          ${ap.rules?.length ? `<div class="cs-block" data-reveal>${mini(t("cs.rules"))}<dl class="cs-rules">${ap.rules.map((x) => `<div><dt>${esc(x.trait)}</dt><dd>${esc(x.rule)}</dd></div>`).join("")}</dl></div>` : ""}
          ${ap.refusals?.length ? `<div class="cs-block" data-reveal>${mini(t("cs.refusals"))}<ul class="cs-refusals">${ap.refusals.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
          ${ap.image ? `<div data-reveal>${fig(ap.image, "cs-fig--wide")}</div>` : ""}
        </section>` : ""}
        ${brk("approach")}

        <section class="cs-sec">
          ${head(++sec, "research", t("cs.research"), r.lead)}
          <div class="cs-methods">${r.methods.map(methodCard).join("")}</div>
          ${r.hypotheses ? `<div class="cs-block" data-reveal>${mini(t("cs.hypotheses"))}${r.hypotheses.intro ? `<p class="cs-text">${esc(r.hypotheses.intro)}</p>` : ""}
            <ol class="cs-hyp">${r.hypotheses.items.map((h, k) => `<li><span>${pad(k + 1)}</span><q>${esc(h.text)}</q><em class="${h.won ? "is-won" : ""}">${esc(h.verdict)}</em></li>`).join("")}</ol>
            ${r.hypotheses.measured ? `<p class="cs-measured"><b>${t("cs.measured")}</b>${esc(r.hypotheses.measured)}</p>` : ""}</div>` : ""}
          ${r.persona ? `<div class="cs-block cs-persona" data-reveal>${mini(t("cs.persona"))}<div class="cs-persona-card"><div class="cs-persona-face" aria-hidden="true">${esc(r.persona.name.slice(0, 1))}</div><div><b>${esc(r.persona.name)}, ${esc(r.persona.age)}</b><p>${esc(r.persona.note)}</p></div>
            <div><p class="cs-mini">${t("cs.pains")}</p><ul>${r.persona.pains.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
            <div><p class="cs-mini">${t("cs.needs")}</p><ul>${r.persona.needs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div></div></div>` : ""}
          ${r.competitors ? `<div class="cs-block" data-reveal>${mini(t("cs.competitors"))}<p class="cs-text">${esc(r.competitors.title)}</p>
            <div class="cs-table-wrap"><table class="cs-table"><thead><tr><th></th>${r.competitors.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
            <tbody>${r.competitors.rows.map((row) => `<tr><th>${esc(row.name)}</th>${row.marks.map((m) => `<td><i class="cs-mark cs-mark--${m}"></i></td>`).join("")}</tr>`).join("")}</tbody></table></div>
            <p class="cs-note">${esc(r.competitors.note)}</p></div>` : ""}
          ${r.matrix ? `<div class="cs-block" data-reveal>${mini(t("cs.matrix"))}<p class="cs-text">${esc(r.matrix.title)}</p>
            <div class="cs-matrix" style="--ax:'${esc(r.matrix.axes[0])}';--ay:'${esc(r.matrix.axes[1])}'"><span class="cs-matrix-ax">${esc(r.matrix.axes[0])} →</span><span class="cs-matrix-ay">${esc(r.matrix.axes[1])} →</span>
              ${r.matrix.items.map((it, k) => `<span class="cs-matrix-dot" style="--x:${it.impact}%;--y:${it.cost}%"><b>${k + 1}</b><em>${esc(it.tier)}</em></span>`).join("")}</div>
            <ol class="cs-matrix-list">${r.matrix.items.map((it) => `<li><span>${esc(it.text)}</span><em>${esc(it.tier)}</em></li>`).join("")}</ol>
            <p class="cs-note">${esc(r.matrix.note)}</p></div>` : ""}
          ${r.funnel ? `<div class="cs-block" data-reveal>${mini(t("cs.funnel"))}<p class="cs-text">${esc(r.funnel.title)}</p>
            <ol class="cs-funnel">${r.funnel.steps.map((st, k) => `<li class="${st.drop ? "is-drop" : ""}" style="--k:${k};--n:${r.funnel!.steps.length}"><b>${esc(st.label)}</b><span>${esc(st.note)}</span></li>`).join("")}</ol>
            <p class="cs-note">${esc(r.funnel.note)}</p></div>` : ""}
          ${r.noData ? `<div class="cs-block cs-nodata" data-reveal><p class="cs-mini">${esc(r.noData.title)}</p><p class="cs-text">${esc(r.noData.text)}</p>
            <ol class="cs-props">${r.noData.props.map((p, k) => `<li><span>${pad(k + 1)}</span><b>${esc(p.title)}</b><p>${esc(p.text)}</p></li>`).join("")}</ol></div>` : ""}
        </section>
        ${brk("research")}

        ${s.flow ? `<section class="cs-sec">
          ${head(++sec, "flow", t("cs.flow"), s.flow.title)}
          <div class="cs-flow" data-reveal>
            ${[s.flow.before, s.flow.after].map((f, side) => `<div class="cs-flow-col ${side ? "is-after" : "is-before"}">
              <h3>${esc(f.title)}</h3>
              <ol>${f.steps.map((st, k) => `<li class="${st.wait ? "is-wait" : ""}"><span class="cs-flow-n">${pad(k + 1)}</span><span class="cs-flow-who">${esc(st.who)}</span><b>${esc(st.step)}</b><p>${esc(st.note)}</p></li>`).join("")}</ol>
              <p class="cs-flow-sum">${esc(f.summary)}</p>
            </div>`).join("")}
          </div>
          <p class="cs-legend"><i></i>${t("cs.wait")}</p>
        </section>` : ""}

        <section class="cs-sec">
          ${head(++sec, "decisions", t("cs.decisions"))}
          <p class="cs-text cs-text--lead" data-reveal>${runIn(s.decisions.lead)}</p>
          ${demoBlock(s.id)}
          <div class="cs-decisions">${s.decisions.items.map((d, k) => decision(d, k, s.deepDives)).join("")}</div>
          ${s.deepDives.length ? `<div class="cs-deeps">${mini(t("cs.deep"))}${s.deepDives.map(deepDive).join("")}</div>` : ""}
        </section>
        ${brk("decisions")}

        ${s.split ? `<section class="cs-sec">
          ${head(++sec, "split", t("cs.split"), s.split.title)}
          <div class="cs-split" data-reveal>
            <div class="cs-card"><p class="cs-mini">${esc(s.split.left.name)}</p><ul class="cs-checks">${s.split.left.items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
            <div class="cs-card cs-card--dark"><p class="cs-mini">${esc(s.split.right.name)}</p><ul class="cs-checks">${s.split.right.items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
          </div>
          <p class="cs-why cs-why--wide" data-reveal><b>${t("cs.why")}</b>${esc(s.split.why)}</p>
        </section>` : ""}

        ${s.mistakes ? `<section class="cs-sec">
          ${head(++sec, "mistakes", t("cs.mistakes"), s.mistakes.lead)}
          ${s.mistakes.intro ? paras(s.mistakes.intro) : ""}
          <div class="cs-mistakes">${s.mistakes.items.map((m, k) => `<article class="cs-mistake" data-reveal style="--rd:${k}">
            <p class="cs-num cs-num--s"><span>${pad(k + 1)}</span></p><h3>${esc(m.title)}</h3>
            <div class="cs-mistake-grid">
              <div><p class="cs-mini">${t("cs.decided")}</p><p>${esc(m.decided)}</p></div>
              <div><p class="cs-mini">${t("cs.wrong")}</p><p>${esc(m.wrong)}</p></div>
              <div><p class="cs-mini">${t("cs.out")}</p><p>${esc(m.out)}</p></div>
              <div class="is-changed"><p class="cs-mini">${t("cs.changed")}</p><p>${esc(m.changed)}</p></div>
            </div></article>`).join("")}</div>
        </section>` : ""}

        <section class="cs-sec">
          ${head(++sec, "results", t("cs.results"), s.results.lead)}
          ${s.results.intro ? paras(s.results.intro) : ""}
          ${s.results.outcomes?.length ? `<ol class="cs-outcomes">${s.results.outcomes.map((o, k) => `<li data-reveal style="--rd:${k}">
            <p class="cs-num cs-num--s"><span>${pad(k + 1)}</span></p>
            <div><p class="cs-mini">X · ${t("cs.x")}</p><b>${esc(o.x)}</b></div>
            <div><p class="cs-mini">Y · ${t("cs.y")}</p><p>${esc(o.y)}</p></div>
            <div><p class="cs-mini">Z · ${t("cs.z")}</p><p>${esc(o.z)}</p></div></li>`).join("")}</ol>` : ""}
          ${s.results.points.length ? `<ul class="cs-points" data-reveal>${s.results.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
          ${s.results.contribution ? `<div class="cs-block cs-card cs-card--dark" data-reveal>${mini(t("cs.contribution"))}<p>${esc(s.results.contribution)}</p></div>` : ""}
          ${s.results.honesty ? `<div class="cs-block cs-honesty" data-reveal>${mini(t("cs.honesty"))}<p>${esc(s.results.honesty)}</p></div>` : ""}
        </section>

        ${s.gallery.length ? `<section class="cs-sec cs-sec--screens">
          ${head(++sec, "screens", t("cs.screens"))}
          <div class="cs-gallery">${s.gallery.map(gallery).join("")}</div>
        </section>` : ""}

        ${s.roadmap ? `<section class="cs-sec">
          ${head(++sec, "roadmap", t("cs.roadmap"))}
          <div class="cs-roadmap">${s.roadmap.map((x, k) => `<article data-reveal style="--rd:${k}"><p class="cs-mini">${esc(x.kicker)}</p><b>${esc(x.title)}</b><p>${esc(x.text)}</p></article>`).join("")}</div>
        </section>` : ""}

        <section class="cs-sec">
          ${head(++sec, "takeaways", t("cs.takeaways"))}
          <p class="cs-takeaway" data-reveal>${esc(s.takeaways[0] ?? "")}</p>
          ${s.takeaways.length > 1 ? `<ul class="cs-learn" data-reveal style="--rd:1">${s.takeaways.slice(1).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
          ${s.quote ? `<blockquote class="cs-quote cs-quote--big" data-reveal style="--rd:2">${esc(s.quote)}</blockquote>` : ""}
        </section>

        <a class="cs-next" href="#/work/${esc(next.id)}" style="${lookVars(next, "mono")}" data-reveal>
          <span class="cs-next-text"><span class="cs-mini">${t("cs.nextcase")}</span><b>${esc(next.title)}</b><span class="cs-next-sub">${esc(next.subtitle)}</span></span>
          ${objectPicture(next, "cs-next-obj")}
          <span class="cs-go">${goArrow}</span>
        </a>
      </div>
    </div>

    <button type="button" class="cs-toc-btn" aria-haspopup="dialog" aria-expanded="false" aria-label="${t("cs.contents")}">${icon("list")}<span class="cs-toc-now"><b>01</b><em>${t("cs.contents")}</em></span><i class="cs-toc-ring" aria-hidden="true"></i></button>
    <div class="cs-sheet" hidden role="dialog" aria-label="${t("cs.contents")}">
      <div class="cs-sheet-panel"><div class="cs-sheet-head"><b>${t("cs.contents")}</b><button type="button" class="cs-sheet-close" aria-label="${t("cs.close")}">×</button></div>${toc(sections, "cs-toc cs-toc--sheet")}</div>
    </div>
    <dialog class="cs-lightbox" aria-label="${t("cs.screens")}">
      <div class="cs-lb-view"><img alt="" draggable="false"></div>
      <p class="cs-lb-cap"></p>
      <button type="button" class="cs-lightbox-close" aria-label="${t("cs.close")}">×</button>
    </dialog>
  </article>`;
  return html.replace(/__ID__/g, esc(s.id));
}

/** поведение: scroll-spy, прогресс, разборы по адресу, галереи, лайтбокс, нижний лист */
export function mountStory(root: HTMLElement, scroller: HTMLElement, opts: { onClose: () => void; track: string | null; go: (to: string, replace?: boolean) => void }) {
  const stops: (() => void)[] = [];
  const article = root.querySelector<HTMLElement>(".cs")!;
  const id = article.dataset.case!;

  root.querySelector(".cs-back")!.addEventListener("click", opts.onClose);

  /* прокрутка к разделу: по оглавлению и по ссылкам «Разбор» */
  /* колесо и переходы по оглавлению едут одним и тем же мягким движением (smoothScroll.ts) */
  const smoother = smoothWheel(scroller);
  stops.push(() => smoother.stop());
  const scrollTo = (target: HTMLElement) => {
    smoother.to(target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 84);
  };
  const openDive = (diveId: string, jump = true) => {
    const d = root.querySelector<HTMLDetailsElement>(`#cs-dd-${CSS.escape(diveId)}`);
    if (!d) return;
    d.open = true;
    if (jump) requestAnimationFrame(() => scrollTo(d));
  };
  root.querySelectorAll<HTMLAnchorElement>(".cs-toc a").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    const sec = a.dataset.sec!;
    if (sec.startsWith("dd-")) { openDive(sec.slice(3)); opts.go(`#/work/${id}/${sec.slice(3)}`); closeSheet(); return; }
    const el = root.querySelector<HTMLElement>(`#cs-${CSS.escape(sec)}`);
    if (el) scrollTo(el);
    closeSheet();
  }));
  root.querySelectorAll<HTMLAnchorElement>(".cs-divelink").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openDive(a.dataset.dive!);
    opts.go(a.getAttribute("href")!);
  }));
  /* раскрыли разбор руками — адрес меняется на его, свернули — обратно на кейс */
  root.querySelectorAll<HTMLDetailsElement>(".cs-deep").forEach((d) => d.addEventListener("toggle", () => {
    const want = d.open ? `#/work/${id}/${d.dataset.dive}` : `#/work/${id}`;
    if (location.hash !== want && (d.open || location.hash === `#/work/${id}/${d.dataset.dive}`)) opts.go(want, true);
  }));
  if (opts.track) openDive(opts.track);

  /* scroll-spy по разделам и разборам, прогресс чтения, название в панели после hero */
  const links = [...root.querySelectorAll<HTMLAnchorElement>(".cs-toc a")];
  const targets = [...root.querySelectorAll<HTMLElement>(".cs-head, .cs-deep")];
  /* текущий раздел — последний, чей заголовок уже поднялся к панели. Считаем по прокрутке, а не через
     IntersectionObserver: после прыжка по оглавлению заголовок встаёт у самой панели и в полосу наблюдателя не попадает */
  let lastSec = "";
  const markSection = () => {
    const edge = scroller.getBoundingClientRect().top + 150;
    let sec = "";
    for (const el of targets) {
      if (el.getBoundingClientRect().top > edge) break;
      if (el.classList.contains("cs-deep")) { if ((el as HTMLDetailsElement).open) sec = `dd-${el.dataset.dive}`; }
      else sec = el.id.replace("cs-", "");
    }
    if (sec === lastSec) return;
    lastSec = sec;
    links.forEach((a) => a.classList.toggle("is-on", a.dataset.sec === sec));
    /* капсула оглавления показывает, где сейчас читают: номер и название раздела (у разбора — его раздел «Решения») */
    const top = links.find((a) => a.dataset.sec === sec)?.closest(".cs-toc > li")?.querySelector<HTMLAnchorElement>("a");
    if (top && nowN && nowL) { nowN.textContent = top.dataset.n ?? ""; nowL.textContent = top.querySelector("em")?.textContent ?? top.textContent ?? ""; }
  };

  const nowN = root.querySelector<HTMLElement>(".cs-toc-now b");
  const nowL = root.querySelector<HTMLElement>(".cs-toc-now em");
  const tocBtn = root.querySelector<HTMLElement>(".cs-toc-btn");
  const progress = root.querySelector<HTMLElement>(".cs-progress")!;
  const top = root.querySelector<HTMLElement>(".cs-top")!;
  const hero = root.querySelector<HTMLElement>(".cs-hero")!;
  const films = [...root.querySelectorAll<HTMLElement>(".cs-film-pin")].map((pin) => ({ pin, over: 0 }));
  const heroStageEl = root.querySelector<HTMLElement>(".cs-hero-stage");
  let lastHs = -1;
  const stageTop = 92;
  let raf = 0;
  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const max = scroller.scrollHeight - scroller.clientHeight;
      const read = max > 0 ? scroller.scrollTop / max : 0;
      progress.style.setProperty("--p", String(read));
      tocBtn?.style.setProperty("--p", read.toFixed(4));
      /* герой: устройство выпрямляется, пока сцену прокручивают (caseHero.css, --hs) */
      const hs = Math.min(1, Math.max(0, scroller.scrollTop / Math.max(1, hero.offsetHeight * 0.8)));
      if (hs !== lastHs) { lastHs = hs; heroStageEl?.style.setProperty("--hs", hs.toFixed(3)); }
      top.classList.toggle("is-scrolled", scroller.scrollTop > 8);
      top.classList.toggle("is-past", scroller.scrollTop > hero.offsetTop + hero.offsetHeight - 120);
      markSection();
      /* film: сцена закреплена под панелью, экран внутри проезжает ровно на столько, на сколько прокрутили страницу */
      const edge = scroller.getBoundingClientRect().top + stageTop;
      for (const f of films) {
        const shift = Math.min(f.over, Math.max(0, edge - f.pin.getBoundingClientRect().top));
        f.pin.style.setProperty("--shift", `${shift}px`);
        f.pin.classList.toggle("is-end", f.over === 0 || shift >= f.over - 1);
      }
    });
  };
  /* сколько экрана не помещается в сцену — на столько же удлиняется закреплённый участок */
  const measureFilms = () => {
    for (const f of films) {
      const stageEl = f.pin.querySelector<HTMLElement>(".cs-film-stage")!;
      const track = f.pin.querySelector<HTMLElement>(".cs-film-track")!;
      const padY = parseFloat(getComputedStyle(stageEl).getPropertyValue("--stage-pad")) || 24;
      f.pin.style.setProperty("--film-h", `${Math.ceil(track.offsetHeight + padY * 2)}px`);
      f.over = Math.max(0, Math.round(track.offsetHeight + padY * 2 - stageEl.clientHeight));
      f.pin.style.setProperty("--over", `${f.over}px`);
    }
    onScroll();
  };
  const ro = new ResizeObserver(measureFilms);
  films.forEach((f) => { ro.observe(f.pin.querySelector(".cs-film-track")!); ro.observe(f.pin.querySelector(".cs-film-stage")!); });
  stops.push(() => ro.disconnect());
  scroller.addEventListener("scroll", onScroll, { passive: true });
  stops.push(() => scroller.removeEventListener("scroll", onScroll));
  onScroll();

  /* compare: ползунок и перетаскивание */
  root.querySelectorAll<HTMLElement>(".cs-compare-box").forEach((box) => {
    const range = box.querySelector<HTMLInputElement>(".cs-compare-range")!;
    const set = (v: number) => { box.style.setProperty("--pos", `${v}%`); range.value = String(v); };
    range.addEventListener("input", () => set(Number(range.value)));
    let down = false;
    const move = (e: PointerEvent) => {
      if (!down) return;
      const r = box.getBoundingClientRect();
      set(Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100))));
    };
    box.addEventListener("pointerdown", (e) => { if (e.target === range) return; down = true; box.setPointerCapture(e.pointerId); move(e); });
    box.addEventListener("pointermove", move);
    box.addEventListener("pointerup", () => (down = false));
    box.addEventListener("pointercancel", () => (down = false));
  });

  /* spot: точка ведёт к решению */
  root.querySelectorAll<HTMLButtonElement>(".cs-spot-dot").forEach((b) => b.addEventListener("click", () => {
    const d = b.dataset.decision;
    const el = d ? root.querySelector<HTMLElement>(`#cs-d-${CSS.escape(d)}`) : null;
    if (el) { scrollTo(el); el.classList.add("is-flash"); setTimeout(() => el.classList.remove("is-flash"), 1600); }
  }));

  /* Окно просмотра экрана: кадр целиком, увеличение жестом.
     Масштаб и сдвиг живут в transform самой картинки — это не трогает раскладку и не заставляет браузер
     пересчитывать страницу на каждое движение пальца. */
  const box = root.querySelector<HTMLDialogElement>(".cs-lightbox")!;
  const view = box.querySelector<HTMLElement>(".cs-lb-view")!;
  const boxImg = box.querySelector("img")!;
  const boxCap = box.querySelector<HTMLElement>(".cs-lb-cap")!;
  const MAX = 6; // дальше растягивать нечего: у самого файла кончаются точки
  let scale = 1, tx = 0, ty = 0;

  const apply = (ease = false) => {
    boxImg.classList.toggle("is-eased", ease);
    boxImg.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${scale.toFixed(3)})`;
    view.classList.toggle("is-zoom", scale > 1.01);
  };
  /** не даём утащить кадр за край: сдвиг ограничен тем, что вылезло за рамку */
  const hold = () => {
    const r = view.getBoundingClientRect();
    const mx = Math.max(0, (boxImg.clientWidth * scale - r.width) / 2);
    const my = Math.max(0, (boxImg.clientHeight * scale - r.height) / 2);
    tx = Math.min(mx, Math.max(-mx, tx));
    ty = Math.min(my, Math.max(-my, ty));
  };
  /** увеличить в k раз вокруг точки (cx, cy): под курсором и пальцами остаётся то же место кадра */
  const zoomAt = (k: number, cx: number, cy: number, ease = false) => {
    const r = view.getBoundingClientRect();
    const px = cx - r.left - r.width / 2, py = cy - r.top - r.height / 2;
    const next = Math.min(MAX, Math.max(1, scale * k));
    const f = next / scale;
    tx = px - (px - tx) * f;
    ty = py - (py - ty) * f;
    scale = next;
    if (scale <= 1.001) { scale = 1; tx = 0; ty = 0; }
    hold();
    apply(ease);
  };
  const reset = () => { scale = 1; tx = 0; ty = 0; apply(false); };

  root.querySelectorAll<HTMLButtonElement>("[data-zoom]").forEach((b) => b.addEventListener("click", () => {
    const im = b.querySelector("img") ?? b.closest(".cs-stage")!.querySelector("img")!;
    /* кадр разворачивается во весь экран, поэтому здесь нужен самый крупный файл из набора */
    boxImg.src = im.src; boxImg.srcset = im.srcset; boxImg.sizes = im.srcset ? "100vw" : "";
    boxImg.alt = im.alt; boxCap.textContent = im.alt;
    reset();
    box.showModal();
  }));
  const closeBox = () => box.close();
  box.querySelector(".cs-lightbox-close")!.addEventListener("click", closeBox);
  box.addEventListener("close", reset);
  /* щелчок по полю вокруг кадра закрывает; по самому кадру — нет, иначе до двойного щелчка не добраться */
  box.addEventListener("click", (e) => { if (e.target === box || (e.target === view && scale <= 1.01)) closeBox(); });

  view.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoomAt(Math.exp(-e.deltaY * 0.0018), e.clientX, e.clientY);
  }, { passive: false });
  view.addEventListener("dblclick", (e) => {
    e.preventDefault();
    zoomAt(scale > 1.01 ? 1 / scale : 2.6, e.clientX, e.clientY, true);
  });

  /* Пальцы и мышь одной дорогой: щипок двумя точками увеличивает, одна точка на увеличенном кадре тащит. */
  const pts = new Map<number, { x: number; y: number }>();
  let span = 0, dragging = false;
  const pair = () => [...pts.values()];
  const gap = () => { const [a, b] = pair(); return Math.hypot(a.x - b.x, a.y - b.y); };
  const mid = () => { const [a, b] = pair(); return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
  view.addEventListener("pointerdown", (e) => {
    view.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { span = gap(); dragging = false; }
    else if (scale > 1.01) { dragging = true; view.classList.add("is-drag"); }
  });
  view.addEventListener("pointermove", (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 2) {
      const d = gap();
      if (span > 0) { const c = mid(); zoomAt(d / span, c.x, c.y); }
      span = d;
    } else if (dragging) {
      tx += dx; ty += dy;
      hold();
      apply();
    }
  });
  const liftOff = (e: PointerEvent) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) span = 0;
    if (pts.size === 0) { dragging = false; view.classList.remove("is-drag"); }
  };
  view.addEventListener("pointerup", liftOff);
  view.addEventListener("pointercancel", liftOff);

  /* лист с оглавлением: его открывает капсула внизу; на широком экране он встаёт панелью над капсулой */
  const btn = root.querySelector<HTMLButtonElement>(".cs-toc-btn")!;
  const sheet = root.querySelector<HTMLElement>(".cs-sheet")!;
  const closeSheet = () => { sheet.hidden = true; btn.setAttribute("aria-expanded", "false"); };
  btn.addEventListener("click", () => { sheet.hidden = !sheet.hidden; btn.setAttribute("aria-expanded", String(!sheet.hidden)); });
  sheet.querySelector(".cs-sheet-close")!.addEventListener("click", closeSheet);
  sheet.addEventListener("click", (e) => { if (e.target === sheet) closeSheet(); });

  /* появление блоков и досчёт цифр */
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target as HTMLElement;
      el.classList.add("is-in");
      io.unobserve(el);
      el.querySelectorAll<HTMLElement>("[data-count]").forEach(countUp);
    }
  }, { root: scroller, rootMargin: "0px 0px -8% 0px", threshold: 0.1 });
  root.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => io.observe(el));
  stops.push(() => io.disconnect());

  stops.push(mountDemos(root, scroller));
  stops.push(mountHero(root, scroller));

  return {
    stop: () => stops.forEach((f) => f()),
    /** адрес сменился внутри того же кейса: раскрыть разбор, если он ещё закрыт */
    setTrack: (track: string | null) => {
      if (!track) return;
      const d = root.querySelector<HTMLDetailsElement>(`#cs-dd-${CSS.escape(track)}`);
      if (d && !d.open) openDive(track);
    },
  };
}

/* v37: число досчитывается от нуля; «6 → 0» и проценты со знаком остаются как есть */
function countUp(el: HTMLElement) {
  const raw = el.dataset.count ?? "";
  const m = raw.match(/^([+−-]?~?)(\d+)(.*)$/);
  if (!m || /→/.test(raw) || reduced()) return;
  const [, pre, num, post] = m;
  const target = Number(num);
  const t0 = performance.now();
  const dur = 900;
  const tick = (now: number) => {
    const p = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = `${pre}${Math.round(target * eased)}${post}`;
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
