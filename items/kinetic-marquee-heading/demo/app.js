"use strict";
(() => {
  // items/kinetic-marquee-heading/variants/ts/kinetic.ts
  var FONT = 0.72;
  var BASE = 0.76;
  var KINETIC = {
    run: [0, 0.63],
    // runs right to left and brakes to a stop
    morph: [0.63, 0.81],
    // shrinks and moves onto the heading
    keep: [0.63, 0.72],
    // meanwhile everything but the head of the line fades
    swap: [0.8, 0.82],
    // the DOM heading takes over
    words: [0.81, 0.94]
    // the paragraph under it comes in word by word
  };
  var ramp = (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  var smooth = (x) => x * x * (3 - 2 * x);
  var smoother = (x) => x * x * x * (x * (x * 6 - 15) + 10);
  function makeStrip(head2, rest, family, weight = 700, scale = 1) {
    const text = `${head2} ${rest}  \u2726  `;
    const probe = document.createElement("canvas").getContext("2d");
    probe.font = `${weight} 100px ${family}`;
    const per100 = probe.measureText(text).width;
    const H2 = Math.max(120, Math.min(Math.round(300 * scale), Math.floor(8190 / per100 * 100 / FONT)));
    const canvas2 = document.createElement("canvas");
    const ctx2 = canvas2.getContext("2d");
    const font = `${weight} ${Math.round(H2 * FONT)}px ${family}`;
    ctx2.font = font;
    const w = Math.min(8192, Math.ceil(ctx2.measureText(text).width));
    const headW = ctx2.measureText(head2).width;
    canvas2.width = w;
    canvas2.height = H2;
    ctx2.font = font;
    ctx2.fillStyle = "#14140f";
    ctx2.textBaseline = "alphabetic";
    ctx2.fillText(text, 0, H2 * BASE);
    return { canvas: canvas2, ratio: w / H2, headFrac: headW / w, headW };
  }
  function drawKinetic(ctx2, strip2, s, target2, W2, H2) {
    ctx2.clearRect(0, 0, W2, H2);
    const alpha = 1 - ramp(s, ...KINETIC.swap);
    if (alpha <= 1e-3) return;
    const portrait = W2 < H2;
    const bigH = (portrait ? 0.15 : 0.27) * H2;
    const bigY = (1 - (portrait ? 0.5 : 0.47)) * H2;
    const headH = target2.font / FONT;
    const headY = target2.baseline - (BASE - 0.5) * headH;
    const m = smoother(ramp(s, ...KINETIC.morph));
    const bandH = bigH + (headH - bigH) * m;
    const cy = bigY + (headY - bigY) * m;
    const top2 = cy - bandH / 2;
    const stripW = strip2.ratio * bandH;
    const N = 3;
    const run = ramp(s, ...KINETIC.run);
    const approach = (1 - run) * (1 - run);
    const xN = target2.left + approach * 1.35 * stripW;
    const keep = smooth(ramp(s, ...KINETIC.keep));
    const src = strip2.canvas;
    const sw = src.width;
    const sh = src.height;
    const headSw = strip2.headFrac * sw;
    const headDw = strip2.headFrac * stripW;
    const first = Math.floor(-xN / stripW) + N;
    const last = Math.ceil((W2 - xN) / stripW) + N;
    ctx2.imageSmoothingQuality = "high";
    for (let k = first; k <= last; k++) {
      const x = xN + (k - N) * stripW;
      if (k === N) {
        ctx2.globalAlpha = alpha;
        ctx2.drawImage(src, 0, 0, headSw, sh, x, top2, headDw, bandH);
        if (keep < 1) {
          ctx2.globalAlpha = alpha * (1 - keep);
          ctx2.drawImage(src, headSw, 0, sw - headSw, sh, x + headDw, top2, stripW - headDw, bandH);
        }
      } else if (keep < 1) {
        ctx2.globalAlpha = alpha * (1 - keep);
        ctx2.drawImage(src, 0, 0, sw, sh, x, top2, stripW, bandH);
      }
    }
    ctx2.globalAlpha = 1;
  }

  // items/kinetic-marquee-heading/variants/ts/main.ts
  var FAMILY = "Onest, system-ui, sans-serif";
  var HEAD = "Hi there!";
  var REST = "I make complex things simple.";
  var section = document.querySelector(".kh");
  var stage = section.querySelector(".kh-stage");
  var canvas = section.querySelector(".kh-canvas");
  var head = section.querySelector(".kh-hi");
  var base = section.querySelector(".kh-base");
  var intro = section.querySelector(".kh-intro");
  var ctx = canvas.getContext("2d");
  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var words = (intro.textContent ?? "").trim().split(/\s+/);
  intro.setAttribute("aria-label", words.join(" "));
  intro.innerHTML = words.map((w, i) => `<span class="w" aria-hidden="true" style="--i:${i}">${w}</span>`).join(" ");
  intro.style.setProperty("--n", String(words.length));
  var strip = null;
  var target = { left: 0, baseline: 0, font: 64 };
  var W = 0;
  var H = 0;
  var top = 0;
  var span = 1;
  var on = false;
  var buildStrip = () => {
    strip = makeStrip(HEAD, REST, FAMILY, 700, Math.min(2, devicePixelRatio || 1));
    draw();
  };
  var measure = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const sr = stage.getBoundingClientRect();
    W = sr.width;
    H = sr.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    target = {
      left: head.getBoundingClientRect().left - sr.left,
      baseline: base.getBoundingClientRect().top - sr.top,
      font: parseFloat(getComputedStyle(head).fontSize)
    };
    const r = section.getBoundingClientRect();
    top = r.top + scrollY;
    span = Math.max(1, r.height - H);
    draw();
  };
  var raf = 0;
  function draw() {
    raf = 0;
    const pinned = new URLSearchParams(location.search).get("p");
    const s = pinned !== null ? Number(pinned) : Math.min(1, Math.max(0, (scrollY - top) / span));
    if (!reduced && strip) drawKinetic(ctx, strip, s, target, W, H);
    const headA = reduced ? ramp(s, KINETIC.morph[0] + 0.07, KINETIC.swap[1]) : ramp(s, ...KINETIC.swap);
    head.style.opacity = headA.toFixed(3);
    intro.style.setProperty("--r", ramp(s, ...KINETIC.words).toFixed(3));
    const next = on ? s > 0.8 : s > 0.83;
    if (next !== on) {
      on = next;
      section.classList.toggle("is-on", on);
    }
  }
  var schedule = () => {
    if (!raf) raf = requestAnimationFrame(draw);
  };
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", measure);
  var ensure = () => {
    const font = `700 100px ${FAMILY}`;
    document.fonts?.load(font, `${HEAD} ${REST}`).then((faces) => {
      if (faces.length) {
        buildStrip();
        measure();
      } else document.fonts.addEventListener("loadingdone", ensure, { once: true });
    }).catch(() => {
    });
  };
  buildStrip();
  measure();
  ensure();
})();
