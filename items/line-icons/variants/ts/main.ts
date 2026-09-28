import { icon, iconNames, type IconName } from "./icons";

/* Demo: every icon with its name. Size and line weight switch live (the weight is a CSS override of the
   stroke-width attribute); a click copies that icon's SVG with the weight you see. */

const $ = <E extends Element = HTMLElement>(sel: string) => document.querySelector<E>(sel)!;
const grid = $("[data-grid]");
const status = $("[data-status]");
let weight = "1.25";

grid.innerHTML = iconNames
  .map((n) => `<button type="button" class="tile" data-name="${n}" aria-label="Copy the ${n} icon">${icon(n)}<span>${n}</span></button>`)
  .join("");

const pick = (attr: string, apply: (v: string) => void) =>
  document.querySelectorAll<HTMLButtonElement>(`[${attr}]`).forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll(`[${attr}]`).forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
      apply(b.getAttribute(attr)!);
    }),
  );
pick("data-size", (v) => document.body.style.setProperty("--size", `${v}px`));
pick("data-weight", (v) => { weight = v; document.body.style.setProperty("--weight", v); });
/* ?size=16|20|24|32 and ?weight=1|1.25|1.5|2 preselect the switches (handy for stills) */
const params = new URLSearchParams(location.search);
for (const key of ["size", "weight"]) {
  const v = params.get(key);
  if (v) document.querySelector<HTMLButtonElement>(`[data-${key}="${CSS.escape(v)}"]`)?.click();
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* clipboard API refused (an iframe without the permission, an old browser): the textarea way */
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

let timer = 0;
grid.addEventListener("click", async (e) => {
  const tile = (e.target as Element).closest<HTMLElement>(".tile");
  if (!tile) return;
  const name = tile.dataset.name as IconName;
  const svg = icon(name).replace(' class="ic"', "").replace('stroke-width="1.25"', `stroke-width="${weight}"`);
  const ok = await copy(svg);
  document.querySelectorAll(".tile.is-copied").forEach((t) => t.classList.remove("is-copied"));
  tile.classList.toggle("is-copied", ok);
  status.textContent = ok ? `Copied ${name}.svg` : "Couldn't copy here. Open the demo in its own tab.";
  clearTimeout(timer);
  timer = window.setTimeout(() => {
    tile.classList.remove("is-copied");
    status.textContent = "Click an icon to copy its SVG";
  }, 1800);
});
