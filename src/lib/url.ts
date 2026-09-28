// Every internal link goes through here, so the site works under the /shelf/ base on GitHub Pages.
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export const url = (path = '') => {
  const p = path.replace(/^\//, '');
  return `${base}/${p}`;
};
