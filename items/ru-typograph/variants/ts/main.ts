/* Demo: text in, the same text through tidy() out. Both versions are set in columns of the same width,
   and the page counts what went wrong at the line ends: a short word left hanging, a dash that starts
   a line, a lone last word. Layout is read only after an edit or a resize, never in an animation frame. */
import { tidy } from "./typograph";

const EXAMPLES: [string, string][] = [
  ["Mixed", "Мы перенесли заявки в один экран — и за 9 месяцев ошибки в отчётах упали с 6 → 0. Не знаю, как бы вы поступили, но мы решили так же и не пожалели об этом."],
  ["Prepositions", "Мы перенесли заявки в один экран и убрали лишние шаги, а в итоге люди стали чаще доходить до конца и не терялись в меню."],
  ["Particles", "Кнопку бы сделать заметнее, но так ли это нужно, если её и так находят? Вот и я бы не стал."],
  ["Dash", "Поиск — самое частое действие на странице, а фильтры — самое редкое, и это видно по данным."],
  ["Numbers", "За 9 месяцев сократили путь с 6 до 3 шагов, конверсия выросла на 38 %, а жалоб стало в 4 раза меньше."],
  ["Arrow", "Ошибки в отчётах: 6 → 0 за квартал. Статусы заявки идут так: новая → проверка → одобрена → в работе."],
  ["English", "I led it for 9 weeks with a team of 6 — and if it breaks, it is on me. So we tested it on real people first."],
];

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const input = $<HTMLTextAreaElement>("#src");
const chips = $<HTMLElement>(".chips");
const range = $<HTMLInputElement>("#col");
const rangeOut = $<HTMLElement>("#col-out");
const compare = $<HTMLElement>(".compare");
const before = $<HTMLElement>("[data-before]");
const after = $<HTMLElement>("[data-after]");
const beforeCount = $<HTMLElement>("[data-before-count]");
const afterCount = $<HTMLElement>("[data-after-count]");
const added = $<HTMLElement>("[data-added]");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* Every word becomes a span, spaces stay text: a normal space as is, a non-breaking one wrapped
   in .nb so CSS can draw a mark under it. Wrapping does not change where the line may break. */
function render(el: HTMLElement, text: string) {
  el.innerHTML = text
    .split(/([  ]+)/)
    .map((part) => {
      if (!part) return "";
      if (/^[  ]+$/.test(part)) return part.replace(/ /g, '<span class="nb"> </span>');
      return `<span class="w">${esc(part)}</span>`;
    })
    .join("");
}

const SHORT_WORD = /^[(«„“"']?[A-Za-zА-Яа-яЁё]{1,2}$/;
const DASH_WORD = /^[—–]$/;

/* Marks what went wrong at the line ends of an already laid-out column; returns how many problems */
function audit(el: HTMLElement) {
  const words = [...el.querySelectorAll<HTMLElement>(".w")];
  words.forEach((w) => w.classList.remove("bad"));
  let problems = 0;
  const top = (w: HTMLElement) => w.offsetTop;
  words.forEach((w, i) => {
    const next = words[i + 1];
    const prev = words[i - 1];
    const lineEnd = !!next && top(next) > top(w) + 2;
    const lineStart = !!prev && top(w) > top(prev) + 2;
    const text = w.textContent ?? "";
    const hanging = lineEnd && SHORT_WORD.test(text);
    const dashFirst = lineStart && DASH_WORD.test(text);
    const orphan = !next && lineStart && text.length <= 5 && words.length > 6;
    if (hanging || dashFirst || orphan) {
      w.classList.add("bad");
      problems++;
    }
  });
  return problems;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function update() {
  const src = input.value;
  const out = tidy(src);
  render(before, src);
  render(after, out);
  const nb = (out.match(/ /g) ?? []).length - (src.match(/ /g) ?? []).length;
  added.textContent = plural(nb, "non-breaking space added", "non-breaking spaces added");
  measure();
}

function measure() {
  beforeCount.textContent = plural(audit(before), "problem", "problems");
  afterCount.textContent = plural(audit(after), "problem", "problems");
}

function setWidth() {
  compare.style.setProperty("--col", `${range.value}px`);
  rangeOut.textContent = `${range.value} px`;
  measure();
}

chips.innerHTML = EXAMPLES.map(([name], i) => `<button type="button" class="chip" data-i="${i}" aria-pressed="${i === 0}">${name}</button>`).join("");
chips.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".chip");
  if (!b) return;
  chips.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
  input.value = EXAMPLES[Number(b.dataset.i)][1];
  update();
});
input.addEventListener("input", () => {
  chips.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
  update();
});
range.addEventListener("input", setWidth);
let resizeRaf = 0;
addEventListener("resize", () => {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(measure);
});
/* the web font changes line breaks: audit again when it arrives */
document.fonts?.ready.then(measure);

input.value = EXAMPLES[0][1];
compare.style.setProperty("--col", `${range.value}px`);
rangeOut.textContent = `${range.value} px`;
update();
