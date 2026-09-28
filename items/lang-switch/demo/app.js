"use strict";
(() => {
  // items/lang-switch/variants/ts/en.ts
  var en = {
    "doc.title": "Lang Switch",
    "doc.desc": "Two languages on one page, switched without a reload.",
    /* the toggle is labelled with the language it switches TO */
    "nav.lang": "\u0427\u0438\u0442\u0430\u0442\u044C \u043F\u043E-\u0440\u0443\u0441\u0441\u043A\u0438",
    "nav.lang.short": "RU",
    "hero.kicker": "Two languages, one page",
    "hero.title": "Switch the language, keep the page",
    "hero.lede": "Static text comes from data-i18n attributes. Anything built by code asks t() for its strings and listens to onLang.",
    "hero.where": "Your choice lives in the address (<code>?lang=</code>) and in localStorage, so a shared link opens the same way.",
    "inbox.title": "Built by code",
    "inbox.count": "{n} new messages",
    "inbox.add": "Add one",
    "inbox.add.label": "Add a message",
    "uptime": "On this page for {s} s, no reloads",
    "state.url": "Address",
    "state.saved": "Saved",
    "state.none": "nothing yet"
  };
  var en_default = en;

  // items/lang-switch/variants/ts/ru.ts
  var ru = {
    "doc.title": "\u041F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0430\u0442\u0435\u043B\u044C \u044F\u0437\u044B\u043A\u0430",
    "doc.desc": "\u0414\u0432\u0430 \u044F\u0437\u044B\u043A\u0430 \u043D\u0430 \u043E\u0434\u043D\u043E\u0439 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0435, \u043F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0430\u044E\u0442\u0441\u044F \u0431\u0435\u0437 \u043F\u0435\u0440\u0435\u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438.",
    "nav.lang": "Read in English",
    "nav.lang.short": "EN",
    "hero.kicker": "\u0414\u0432\u0430 \u044F\u0437\u044B\u043A\u0430, \u043E\u0434\u043D\u0430 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0430",
    "hero.title": "\u042F\u0437\u044B\u043A \u043C\u0435\u043D\u044F\u0435\u0442\u0441\u044F, \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0430 \u043E\u0441\u0442\u0430\u0451\u0442\u0441\u044F",
    "hero.lede": "\u0421\u0442\u0430\u0442\u0438\u0447\u043D\u044B\u0439 \u0442\u0435\u043A\u0441\u0442 \u043F\u0440\u0438\u0445\u043E\u0434\u0438\u0442 \u0438\u0437 \u0430\u0442\u0440\u0438\u0431\u0443\u0442\u043E\u0432 data-i18n. \u0412\u0441\u0451, \u0447\u0442\u043E \u0441\u043E\u0431\u0438\u0440\u0430\u0435\u0442 \u043A\u043E\u0434, \u0431\u0435\u0440\u0451\u0442 \u0441\u0442\u0440\u043E\u043A\u0438 \u0447\u0435\u0440\u0435\u0437 t() \u0438 \u0441\u043B\u0443\u0448\u0430\u0435\u0442 onLang.",
    "hero.where": "\u0412\u044B\u0431\u043E\u0440 \u0436\u0438\u0432\u0451\u0442 \u0432 \u0430\u0434\u0440\u0435\u0441\u0435 (<code>?lang=</code>) \u0438 \u0432 localStorage, \u043F\u043E\u044D\u0442\u043E\u043C\u0443 \u043F\u0435\u0440\u0435\u0441\u043B\u0430\u043D\u043D\u0430\u044F \u0441\u0441\u044B\u043B\u043A\u0430 \u043E\u0442\u043A\u0440\u043E\u0435\u0442\u0441\u044F \u0442\u0430\u043A \u0436\u0435.",
    "inbox.title": "\u0421\u043E\u0431\u0440\u0430\u043D\u043E \u043A\u043E\u0434\u043E\u043C",
    "inbox.count": "\u041D\u043E\u0432\u044B\u0445 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0439: {n}",
    "inbox.add": "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C",
    "inbox.add.label": "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435",
    "uptime": "\u041D\u0430 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0435 {s} \u0441, \u0431\u0435\u0437 \u043F\u0435\u0440\u0435\u0437\u0430\u0433\u0440\u0443\u0437\u043E\u043A",
    "state.url": "\u0410\u0434\u0440\u0435\u0441",
    "state.saved": "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E",
    "state.none": "\u043F\u043E\u043A\u0430 \u043D\u0438\u0447\u0435\u0433\u043E"
  };
  var ru_default = ru;

  // items/lang-switch/variants/ts/i18n.ts
  var DICTS = { en: en_default, ru: ru_default };
  var KEY = "site-lang";
  function saved() {
    try {
      const v = localStorage.getItem(KEY);
      return v === "ru" || v === "en" ? v : null;
    } catch {
      return null;
    }
  }
  function pick() {
    const q = new URLSearchParams(location.search).get("lang");
    if (q === "ru" || q === "en") return q;
    const s = saved();
    if (s) return s;
    return (navigator.languages ?? [navigator.language]).some((l) => /^ru\b/i.test(l ?? "")) ? "ru" : "en";
  }
  var lang = pick();
  var listeners = /* @__PURE__ */ new Set();
  function t(key, vars) {
    const s = DICTS[lang][key] ?? DICTS.en[key] ?? String(key);
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => k in vars ? String(vars[k]) : m) : s;
  }
  function onLang(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }
  function applyStatic(root = document) {
    const put = (attr, fn) => {
      root.querySelectorAll(`[${attr}]`).forEach((el) => {
        const key = el.getAttribute(attr);
        if (key) fn(el, t(key));
      });
    };
    put("data-i18n", (el, s) => el.textContent = s);
    put("data-i18n-html", (el, s) => el.innerHTML = s);
    put("data-i18n-label", (el, s) => el.setAttribute("aria-label", s));
    put("data-i18n-alt", (el, s) => el.setAttribute("alt", s));
    put("data-i18n-title", (el, s) => el.setAttribute("title", s));
  }
  function meta(name, attr, value) {
    document.head.querySelector(`meta[${attr}="${name}"]`)?.setAttribute("content", value);
  }
  function paint() {
    document.documentElement.lang = lang;
    document.body.classList.toggle("lang-ru", lang === "ru");
    document.title = t("doc.title");
    meta("description", "name", t("doc.desc"));
    meta("og:locale", "property", lang === "ru" ? "ru_RU" : "en_US");
    applyStatic();
  }
  function setLang(next) {
    if (next === lang) return;
    lang = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
    }
    const url = new URL(location.href);
    url.searchParams.set("lang", next);
    history.replaceState(history.state, "", url);
    paint();
    listeners.forEach((cb) => cb(next));
  }
  var otherLang = () => lang === "en" ? "ru" : "en";
  function initI18n() {
    paint();
  }

  // items/lang-switch/variants/ts/langToggle.ts
  function initLangToggle(selector = ".lang-btn") {
    const btn = document.querySelector(selector);
    if (!btn) return;
    const label = btn.querySelector(".lang-l");
    const paint2 = () => {
      if (label) label.textContent = t("nav.lang.short");
      btn.setAttribute("aria-label", t("nav.lang"));
    };
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      setLang(otherLang());
    });
    onLang(paint2);
    paint2();
  }

  // items/lang-switch/variants/ts/main.ts
  initI18n();
  initLangToggle();
  var count = document.querySelector("[data-count]");
  var add = document.querySelector("[data-add]");
  var uptime = document.querySelector("[data-uptime]");
  var urlOut = document.querySelector("[data-url]");
  var savedOut = document.querySelector("[data-saved]");
  var messages = 3;
  var started = performance.now();
  function drawCount() {
    count.textContent = t("inbox.count", { n: messages });
  }
  function drawUptime() {
    uptime.textContent = t("uptime", { s: Math.floor((performance.now() - started) / 1e3) });
  }
  function drawState() {
    urlOut.textContent = location.search || "\u2014";
    let saved2 = null;
    try {
      saved2 = localStorage.getItem("site-lang");
    } catch {
    }
    savedOut.textContent = saved2 ?? t("state.none");
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
  setInterval(drawUptime, 1e3);
})();
