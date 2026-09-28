/* Two page languages switched without a reload.

   All strings live in dictionaries `en.ts` and `ru.ts` under the same keys; `ru` is typed by `en`, so a
   missing Russian string fails the type check. Markup is tagged with `data-i18n` (text), `data-i18n-html`
   (text with tags), `data-i18n-label` (aria-label), `data-i18n-alt`, `data-i18n-title`; applyStatic walks
   them and puts the strings in. Everything built by code takes strings through `t()` and subscribes to
   `onLang`: the language changes in place, nothing else on the page is rebuilt.

   Choice of language: `?lang=ru` in the address, then the saved choice, then the browser language. The chosen
   language stays in the address, so a shared link opens in the same language. */
import en from "./en";
import ru from "./ru";

export type Lang = "en" | "ru";
export type Key = keyof typeof en;

const DICTS: Record<Lang, Record<Key, string>> = { en, ru };
const KEY = "site-lang";

function saved(): Lang | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "ru" || v === "en" ? v : null;
  } catch {
    return null; // private mode
  }
}

function pick(): Lang {
  const q = new URLSearchParams(location.search).get("lang");
  if (q === "ru" || q === "en") return q;
  const s = saved();
  if (s) return s;
  return (navigator.languages ?? [navigator.language]).some((l) => /^ru\b/i.test(l ?? "")) ? "ru" : "en";
}

let lang: Lang = pick();
const listeners = new Set<(l: Lang) => void>();

export const getLang = () => lang;

/** a string by key; {n} and other substitutions go in the second argument */
export function t(key: Key, vars?: Record<string, string | number>): string {
  const s = DICTS[lang][key] ?? DICTS.en[key] ?? String(key);
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

/** subscribe to language changes; returns the unsubscribe function */
export function onLang(cb: (l: Lang) => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** put the strings into ready markup */
export function applyStatic(root: ParentNode = document) {
  const put = (attr: string, fn: (el: HTMLElement, s: string) => void) => {
    root.querySelectorAll<HTMLElement>(`[${attr}]`).forEach((el) => {
      const key = el.getAttribute(attr) as Key;
      if (key) fn(el, t(key));
    });
  };
  put("data-i18n", (el, s) => (el.textContent = s));
  put("data-i18n-html", (el, s) => (el.innerHTML = s));
  put("data-i18n-label", (el, s) => el.setAttribute("aria-label", s));
  put("data-i18n-alt", (el, s) => el.setAttribute("alt", s));
  put("data-i18n-title", (el, s) => el.setAttribute("title", s));
}

function meta(name: string, attr: "name" | "property", value: string) {
  document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`)?.setAttribute("content", value);
}

function paint() {
  document.documentElement.lang = lang;
  document.body.classList.toggle("lang-ru", lang === "ru");
  document.title = t("doc.title");
  meta("description", "name", t("doc.desc"));
  /* link previews are built by crawlers from the source HTML, but the live page should not disagree */
  meta("og:locale", "property", lang === "ru" ? "ru_RU" : "en_US");
  applyStatic();
}

export function setLang(next: Lang) {
  if (next === lang) return;
  lang = next;
  try { localStorage.setItem(KEY, next); } catch { /* private mode */ }
  /* the language is part of the link: a shared address opens the same way */
  const url = new URL(location.href);
  url.searchParams.set("lang", next);
  history.replaceState(history.state, "", url);
  paint();
  listeners.forEach((cb) => cb(next));
}

export const otherLang = (): Lang => (lang === "en" ? "ru" : "en");

/** first pass, before modules start building their markup */
export function initI18n() {
  paint();
}
