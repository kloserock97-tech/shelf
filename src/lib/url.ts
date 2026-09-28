// Every internal link goes through here, so the site works under the /shelf/ base on GitHub Pages.
import type { Lang } from './i18n';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export const url = (path = '') => {
  const p = path.replace(/^\//, '');
  return `${base}/${p}`;
};

// Pages in Russian live under /ru/; site files (demos, media, registry, favicon) do not.
export const lurl = (lang: Lang, path = '') => url(`${lang === 'ru' ? 'ru/' : ''}${path.replace(/^\//, '')}`);
