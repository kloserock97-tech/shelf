/* Russian strings. Typed by en.ts: a missing or misspelt key fails the type check. */
import type en from "./en";

const ru: Record<keyof typeof en, string> = {
  "doc.title": "Переключатель языка",
  "doc.desc": "Два языка на одной странице, переключаются без перезагрузки.",

  "nav.lang": "Read in English",
  "nav.lang.short": "EN",

  "hero.kicker": "Два языка, одна страница",
  "hero.title": "Язык меняется, страница остаётся",
  "hero.lede": "Статичный текст приходит из атрибутов data-i18n. Всё, что собирает код, берёт строки через t() и слушает onLang.",
  "hero.where": "Выбор живёт в адресе (<code>?lang=</code>) и в localStorage, поэтому пересланная ссылка откроется так же.",

  "inbox.title": "Собрано кодом",
  "inbox.count": "Новых сообщений: {n}",
  "inbox.add": "Добавить",
  "inbox.add.label": "Добавить сообщение",
  "uptime": "На странице {s} с, без перезагрузок",

  "state.url": "Адрес",
  "state.saved": "Сохранено",
  "state.none": "пока ничего",
};

export default ru;
