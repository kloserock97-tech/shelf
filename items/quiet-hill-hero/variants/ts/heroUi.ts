/* Живое поведение первого экрана (v30, своё вместо заимствованного):
   · параллакс — слои кадра сдвигаются за курсором на свою глубину (--pd в разметке);
   · док — пункты подрастают, когда к ним подводят курсор, кромка дока загорается в точке курсора;
   · металлические кнопки — блик следует за курсором, по нажатию расходится кольцо;
   · вход интерфейса — классы is-ready и intro-done, сами переходы описаны в CSS.
   Всё считается в одном requestAnimationFrame; DOM пишется только когда значение изменилось. */

type Hooks = {
  burstAt?: (x: number, y: number) => void;
  onGust?: () => void;
};

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const FINE = matchMedia("(hover: hover) and (pointer: fine)");

/** плавное приближение к цели, не зависящее от частоты кадров */
const approach = (value: number, target: number, rate: number, dt: number) => value + (target - value) * (1 - Math.exp(-rate * dt));

export function initHeroUi(hooks: Hooks = {}) {
  const hero = document.getElementById("hero");
  const dock = document.querySelector<HTMLElement>(".dock");
  const items = dock ? [...dock.querySelectorAll<HTMLElement>("[data-dock]")] : [];

  const pointer = { x: 0, y: 0, nx: 0, ny: 0, seen: false };
  const tilt = { x: 0, y: 0, lastX: NaN, lastY: NaN };
  const near = items.map(() => ({ value: 0, written: -1 }));
  let glint = 0;
  let glintWritten = -1;
  let keyboardFocus = -1;

  addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.nx = (e.clientX / innerWidth) * 2 - 1;
    pointer.ny = (e.clientY / innerHeight) * 2 - 1;
    pointer.seen = true;
  }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => { pointer.seen = false; pointer.nx = pointer.ny = 0; });

  /* ── док: близость курсора к каждому пункту ─────────────────────────────── */
  /* v44: прямоугольники дока меряются, когда он изменился (ResizeObserver, resize), а не каждый кадр:
     getBoundingClientRect сразу после записи стилей — принудительный пересчёт раскладки на каждом кадре */
  let dockBox: DOMRect | null = null;
  let centers: number[] = [];
  let dockDirty = true;
  if (dock && "ResizeObserver" in window) new ResizeObserver(() => (dockDirty = true)).observe(dock);
  addEventListener("resize", () => (dockDirty = true));
  /* на узком экране hero прокручивается вместе с доком; на широком она закреплена и скролл дока не двигает */
  addEventListener("scroll", () => { if (innerWidth <= 900) dockDirty = true; }, { passive: true });
  const dockTargets = () => {
    const out = items.map(() => 0);
    if (keyboardFocus >= 0) {
      out[keyboardFocus] = 1;
      return { out, glintTarget: 0.6 };
    }
    if (!dock || !pointer.seen || !FINE.matches || REDUCED) return { out, glintTarget: 0 };
    if (dockDirty || !dockBox) {
      dockDirty = false;
      dockBox = dock.getBoundingClientRect();
      centers = items.map((el) => { const r = el.getBoundingClientRect(); return r.left + r.width / 2; });
    }
    const box = dockBox;
    const reachX = box.height * 2.6;
    const inBand = pointer.y > box.top - box.height && pointer.y < box.bottom + box.height * 2.2 && pointer.x > box.left - reachX && pointer.x < box.right + reachX;
    if (!inBand) return { out, glintTarget: 0 };
    items.forEach((_, i) => {
      const d = Math.abs(pointer.x - centers[i]) / reachX;
      const t = Math.max(0, 1 - d);
      out[i] = t * t * (3 - 2 * t);
    });
    dock.style.setProperty("--gx", `${(pointer.x - box.left).toFixed(0)}px`);
    dock.style.setProperty("--gy", `${(pointer.y - box.top).toFixed(0)}px`);
    return { out, glintTarget: 1 };
  };

  dock?.addEventListener("focusin", (e) => {
    keyboardFocus = items.indexOf((e.target as HTMLElement).closest("[data-dock]") as HTMLElement);
  });
  dock?.addEventListener("focusout", () => requestAnimationFrame(() => { if (!dock.contains(document.activeElement)) keyboardFocus = -1; }));

  /* текущий раздел переезжает за кликом; пункт бросает горсть пыльцы */
  dock?.addEventListener("click", (e) => {
    const item = (e.target as HTMLElement).closest<HTMLElement>("[data-dock]");
    if (!item) return;
    e.preventDefault();
    /* v45: активный пункт ставит dockNav.ts по разделу, где находится человек, а не по последнему клику */
    hooks.burstAt?.(e.clientX, e.clientY);
  });

  /* ── металлические кнопки ───────────────────────────────────────────────── */
  document.querySelectorAll<HTMLElement>(".metal").forEach((button) => {
    button.addEventListener("pointermove", (e) => {
      const r = button.getBoundingClientRect();
      button.style.setProperty("--mx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
      button.style.setProperty("--my", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
    });
    button.addEventListener("pointerleave", () => { button.style.removeProperty("--mx"); button.style.removeProperty("--my"); });
    button.addEventListener("click", (e) => {
      button.classList.remove("is-rippling");
      void button.offsetWidth; // перезапуск анимации кольца
      button.classList.add("is-rippling");
      hooks.burstAt?.(e.clientX, e.clientY);
    });
  });
  document.querySelectorAll<HTMLElement>("[data-action='gust']").forEach((b) => b.addEventListener("click", () => hooks.onGust?.()));
  document.querySelectorAll<HTMLElement>(".knob").forEach((b) => b.addEventListener("click", (e) => hooks.burstAt?.(e.clientX, e.clientY)));

  /* ── один кадр на всё ───────────────────────────────────────────────────── */
  let last = 0;
  let running = false;
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
    last = now;

    if (!REDUCED && hero) {
      tilt.x = approach(tilt.x, pointer.nx, 3.2, dt);
      tilt.y = approach(tilt.y, pointer.ny, 3.2, dt);
      const x = Math.round(tilt.x * 1000) / 1000;
      const y = Math.round(tilt.y * 1000) / 1000;
      if (x !== tilt.lastX || y !== tilt.lastY) {
        tilt.lastX = x;
        tilt.lastY = y;
        hero.style.setProperty("--px", String(x));
        hero.style.setProperty("--py", String(y));
      }
    }

    if (dock) {
      const { out, glintTarget } = dockTargets();
      items.forEach((el, i) => {
        const n = near[i];
        n.value = approach(n.value, out[i], 14, dt);
        if (Math.abs(n.value - out[i]) < 0.002) n.value = out[i];
        const v = Math.round(n.value * 1000) / 1000;
        if (v !== n.written) {
          n.written = v;
          el.style.setProperty("--near", String(v));
          el.dataset.near = v > 0.35 ? "true" : "false";
        }
      });
      glint = approach(glint, glintTarget, 8, dt);
      const g = Math.round(glint * 100) / 100;
      if (g !== glintWritten) {
        glintWritten = g;
        dock.style.setProperty("--glint", String(g));
      }
    }
  };

  const ready = () => {
    if (running) return;
    running = true;
    /* принудительный пересчёт стилей: без него браузер сразу увидит конечное состояние и пропустит вход */
    void document.body.offsetHeight;
    document.body.classList.add("is-ready");
    if (!REDUCED) document.querySelectorAll<HTMLElement>("[style*='--pd']").forEach((el) => el.classList.add("par"));
    requestAnimationFrame(frame);
    window.setTimeout(() => document.body.classList.add("intro-done"), REDUCED ? 0 : 2600);
  };

  return { ready };
}
