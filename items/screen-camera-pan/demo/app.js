// items/screen-camera-pan/variants/ts/demoRunner.ts
function mountDemos(root, plays, scroller = null) {
  const runs = /* @__PURE__ */ new Map();
  const start = (wrap) => {
    const play = plays[wrap.dataset.demo ?? ""];
    const stage = wrap.querySelector(".dm");
    if (!play || !stage) return;
    const prev = runs.get(wrap);
    if (prev) prev.stopped = true;
    const run = { stopped: false };
    runs.set(wrap, run);
    wrap.classList.add("is-playing");
    play(stage, run).finally(() => {
      if (runs.get(wrap) === run) wrap.classList.remove("is-playing");
    }).catch(() => {
    });
  };
  const played = /* @__PURE__ */ new WeakSet();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const wrap = e.target;
      if (e.isIntersecting && !played.has(wrap)) {
        played.add(wrap);
        start(wrap);
      }
      if (!e.isIntersecting) {
        const r = runs.get(wrap);
        if (r) r.stopped = true;
        played.delete(wrap);
      }
    }
  }, { root: scroller, threshold: 0.45 });
  root.querySelectorAll(".dm-wrap").forEach((w) => {
    io.observe(w);
    w.querySelector(".dm-replay")?.addEventListener("click", () => start(w));
  });
  return () => {
    io.disconnect();
    runs.forEach((r) => r.stopped = true);
  };
}

// items/screen-camera-pan/variants/ts/screenMotion.ts
var ZOOM = 1.95;
var SIZES = `(max-width: 1040px) ${Math.round(ZOOM * 100)}vw, ${Math.round(1e3 * ZOOM)}px`;
var BEAT = 100;
var BEATS = 32;
var esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function screenMarkup(scenes2, o) {
  const files = [...new Set(scenes2.map((s) => s.src))];
  const imgs = files.map((src, i) => {
    const set = scenes2.find((s) => s.src === src)?.srcset;
    return `<img class="sm-screen${i === 0 ? " is-current" : ""}" data-file="${esc(src)}" src="${esc(src)}" alt="${esc(o.alt)}" decoding="async"${set ? ` srcset="${esc(set)}" sizes="${SIZES}"` : ""}>`;
  });
  const buttons = scenes2.map((s, i) => `<button type="button" data-shot="${i}" aria-label="${esc(s.caption)}" aria-pressed="${i === 0}"><span>0${i + 1}</span><i></i></button>`);
  return `<div class="dm sm" data-focus="${esc(scenes2[0].focus)}">
    <div class="sm-viewport"><div class="sm-camera">${imgs.join("")}</div></div>
    <div class="sm-director"><p class="sm-caption">${esc(scenes2[0].caption)}</p><div class="sm-controls" role="group" aria-label="${esc(o.group ?? "Interface states")}">${buttons.join("")}</div></div>
  </div>`;
}
async function screenPlay(root, scenes2, run) {
  const select = (index) => {
    const shot = scenes2[index];
    root.dataset.focus = shot.focus;
    root.querySelectorAll(".sm-screen").forEach((img) => img.classList.toggle("is-current", img.dataset.file === shot.src));
    root.querySelector(".sm-caption").textContent = shot.caption;
    root.querySelectorAll("[data-shot]").forEach((b, i) => b.setAttribute("aria-pressed", String(i === index)));
  };
  root.querySelectorAll("[data-shot]").forEach((b) => {
    b.onclick = () => {
      run.stopped = true;
      select(Number(b.dataset.shot));
    };
  });
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  if (reduced.matches) {
    select(Math.min(1, scenes2.length - 1));
    return;
  }
  select(0);
  for (let index = 1; index < scenes2.length; index++) {
    for (let tick = 0; tick < BEATS; tick++) {
      await new Promise((resolve) => window.setTimeout(resolve, BEAT));
      if (run.stopped) return;
      if (reduced.matches) {
        select(Math.min(1, scenes2.length - 1));
        return;
      }
      if (document.hidden) {
        tick--;
        continue;
      }
    }
    select(index);
  }
}

// items/screen-camera-pan/variants/ts/main.ts
var scenes = [
  { src: "orders.svg", caption: "Today's orders at a glance", focus: "overview" },
  { src: "orders.svg", caption: "Late orders and refund requests stand out in the list", focus: "late" },
  { src: "orders-refund.svg", caption: "A refund asks for one clear confirmation", focus: "refund" }
];
var replay = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10a6 6 0 1 0 2-4.5"/><path d="M4 3.5V7h3.5"/></svg>`;
var host = document.getElementById("demo");
if (host) {
  host.innerHTML = `<figure class="dm-wrap" data-demo="orders" aria-label="Interface walkthrough">
    <div class="dm-stage">${screenMarkup(scenes, { alt: "Orders dashboard" })}</div>
    <figcaption><span class="dm-live"><i></i>Interface walkthrough</span><button type="button" class="dm-replay">${replay}Play again</button></figcaption>
  </figure>`;
  mountDemos(host, { orders: (stage, run) => screenPlay(stage, scenes, run) });
}
