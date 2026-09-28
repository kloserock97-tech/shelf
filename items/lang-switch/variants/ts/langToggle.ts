/* The language toggle. Its label is the language it switches TO: on the English page the button says «RU».
   The language changes without a reload: dictionaries put the strings in, modules redraw their own markup. */
import { onLang, otherLang, setLang, t } from "./i18n";

export function initLangToggle(selector = ".lang-btn") {
  const btn = document.querySelector<HTMLButtonElement>(selector);
  if (!btn) return;
  const label = btn.querySelector<HTMLElement>(".lang-l");
  const paint = () => {
    if (label) label.textContent = t("nav.lang.short");
    btn.setAttribute("aria-label", t("nav.lang"));
  };
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    setLang(otherLang());
  });
  onLang(paint);
  paint();
}
