/* Demo wiring: the page scroll is the story, one case per 0.7 of a screen (as in the source chapter). */
import { createCardStack, type StackCase } from "./cardStack";

const CASES: StackCase[] = [
  { id: "harbor", title: "Harbor", subtitle: "A neighbourhood noticeboard people actually read", tag: "Web platform · 2024", platform: "Web", stat: { value: "3×", label: "more replies per post" }, look: { stage: ["#fcefe6", "#f6d9c6"], ink: "#3a1d12", accent: "#d9603b" }, object: { src: "objects/harbor.webp", ratio: 900 / 547 } },
  { id: "lumen", title: "Lumen", subtitle: "Alert rules without a single spreadsheet", tag: "Analytics · 2025", platform: "Web", stat: { value: "−40 %", label: "time to set up an alert" }, look: { stage: ["#edf6f0", "#d2e8da"], ink: "#12281c", accent: "#1f8a4c" }, object: { src: "objects/lumen.webp", ratio: 900 / 731 } },
  { id: "northwind", title: "Northwind", subtitle: "An assistant that drafts the next step for you", tag: "AI assistant · 2026", platform: "Web", stat: { value: "12", label: "flows shipped in the first month" }, look: { stage: ["#eef3fb", "#d3e1f6"], ink: "#14213d", accent: "#2f5fd0" }, object: { src: "objects/northwind.webp", ratio: 888 / 851 } },
  { id: "meridian", title: "Meridian", subtitle: "A review queue with fewer clicks per item", tag: "B2B dashboard · 2024", platform: "Web", stat: { value: "−35 %", label: "steps per review" }, look: { stage: ["#f1eef9", "#dbd3ee"], ink: "#231a3a", accent: "#6b55c9" }, object: { src: "objects/meridian.webp", ratio: 900 / 773 } },
  { id: "atlas", title: "Atlas", subtitle: "First-run setup that ends in a working app", tag: "iOS · Android · 2023", platform: "Mobile", stat: { value: "+22 %", label: "finish the setup" }, look: { stage: ["#e9f4f7", "#cbe3ea"], ink: "#0f2a31", accent: "#15899d" }, object: { src: "objects/atlas.webp", ratio: 900 / 698 } },
  { id: "quarry", title: "Quarry", subtitle: "Site inspections that work without a signal", tag: "Field app · 2025", platform: "Mobile", stat: { value: "2 min", label: "to file a report" }, look: { stage: ["#f6f1e7", "#e7dcc6"], ink: "#2a2318", accent: "#a9752b" }, object: { src: "objects/quarry.webp", ratio: 900 / 1156 } },
];

const STEP = 0.7;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const root = document.querySelector<HTMLElement>(".cases")!;
const spacer = document.querySelector<HTMLElement>(".spacer")!;
const toast = document.querySelector<HTMLElement>(".toast")!;
const stepPx = () => innerHeight * STEP;
const run = () => Math.min(CASES.length - 1, Math.max(0, scrollY / stepPx()));

let toastTimer = 0;
const stack = createCardStack(root, {
  cases: CASES,
  goTo: (i) => scrollTo({ top: i * stepPx(), behavior: reduced ? ("instant" as ScrollBehavior) : "smooth" }),
  onOpen: (i) => {
    toast.textContent = `Open “${CASES[i].title}”`;
    toast.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-on"), 1600);
  },
});

addEventListener("scroll", () => stack.set(run()), { passive: true });
const layout = () => {
  spacer.style.height = `${(innerHeight + (CASES.length - 1) * stepPx()).toFixed(0)}px`;
  stack.set(run());
};
addEventListener("resize", () => requestAnimationFrame(layout));
layout();
