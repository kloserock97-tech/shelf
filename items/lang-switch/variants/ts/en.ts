/* English strings. The source language: ru.ts has to repeat every key, or the type check fails. */
const en = {
  "doc.title": "Lang Switch",
  "doc.desc": "Two languages on one page, switched without a reload.",

  /* the toggle is labelled with the language it switches TO */
  "nav.lang": "Читать по-русски",
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
  "state.none": "nothing yet",
};

export default en;
