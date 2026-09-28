/* Demo: static markup with data-i18n, one block built by code, a timer that proves the page never reloads,
   and a readout of where the choice is kept. */
import { initI18n, onLang, t } from "./i18n";
import { initLangToggle } from "./langToggle";

initI18n();
initLangToggle();

const count = document.querySelector<HTMLElement>("[data-count]")!;
const add = document.querySelector<HTMLButtonElement>("[data-add]")!;
const uptime = document.querySelector<HTMLElement>("[data-uptime]")!;
const urlOut = document.querySelector<HTMLElement>("[data-url]")!;
const savedOut = document.querySelector<HTMLElement>("[data-saved]")!;

let messages = 3;
const started = performance.now();

/* everything code writes goes through t(); onLang redraws it */
function drawCount() {
  count.textContent = t("inbox.count", { n: messages });
}
function drawUptime() {
  uptime.textContent = t("uptime", { s: Math.floor((performance.now() - started) / 1000) });
}
function drawState() {
  urlOut.textContent = location.search || "—";
  let saved: string | null = null;
  try { saved = localStorage.getItem("site-lang"); } catch { /* private mode */ }
  savedOut.textContent = saved ?? t("state.none");
}

add.addEventListener("click", () => {
  messages++;
  drawCount();
});
onLang(() => {
  drawCount();
  drawUptime();
  drawState();
});

drawCount();
drawUptime();
drawState();
setInterval(drawUptime, 1000);
