"use strict";
(() => {
  // items/ru-typograph/variants/ts/typograph.ts
  var NB = "\xA0";
  var SHORT = /(^|[\s («„“"'])([A-Za-zА-Яа-яЁё]{1,2}) (?=\S)/g;
  var PARTICLE = / (же|бы|ли|б|ж)(?=[\s.,;:!?»)]|$)/g;
  var DASH = / ([—–])/g;
  var NUMBER = /(\d[\d.,]*%?) (?=[A-Za-zА-Яа-яЁё%→₽$€])/g;
  var ARROW = /[  ]?→[  ]?(\d)?/g;
  var TAIL = / (\S{1,5})$/;
  function tidy(text) {
    if (!text || text.indexOf(" ") < 0) return text;
    let s = text;
    s = s.replace(SHORT, `$1$2${NB}`).replace(SHORT, `$1$2${NB}`);
    s = s.replace(PARTICLE, `${NB}$1`);
    s = s.replace(DASH, `${NB}$1`);
    s = s.replace(NUMBER, `$1${NB}`);
    s = s.replace(ARROW, (_m, digit) => digit !== void 0 ? `${NB}\u2192${NB}${digit}` : `${NB}\u2192 `);
    if (s.length > 40) s = s.replace(TAIL, `${NB}$1`);
    return s;
  }

  // items/ru-typograph/variants/ts/main.ts
  var EXAMPLES = [
    ["Mixed", "\u041C\u044B \u043F\u0435\u0440\u0435\u043D\u0435\u0441\u043B\u0438 \u0437\u0430\u044F\u0432\u043A\u0438 \u0432 \u043E\u0434\u0438\u043D \u044D\u043A\u0440\u0430\u043D \u2014 \u0438 \u0437\u0430 9 \u043C\u0435\u0441\u044F\u0446\u0435\u0432 \u043E\u0448\u0438\u0431\u043A\u0438 \u0432 \u043E\u0442\u0447\u0451\u0442\u0430\u0445 \u0443\u043F\u0430\u043B\u0438 \u0441 6 \u2192 0. \u041D\u0435 \u0437\u043D\u0430\u044E, \u043A\u0430\u043A \u0431\u044B \u0432\u044B \u043F\u043E\u0441\u0442\u0443\u043F\u0438\u043B\u0438, \u043D\u043E \u043C\u044B \u0440\u0435\u0448\u0438\u043B\u0438 \u0442\u0430\u043A \u0436\u0435 \u0438 \u043D\u0435 \u043F\u043E\u0436\u0430\u043B\u0435\u043B\u0438 \u043E\u0431 \u044D\u0442\u043E\u043C."],
    ["Prepositions", "\u041C\u044B \u043F\u0435\u0440\u0435\u043D\u0435\u0441\u043B\u0438 \u0437\u0430\u044F\u0432\u043A\u0438 \u0432 \u043E\u0434\u0438\u043D \u044D\u043A\u0440\u0430\u043D \u0438 \u0443\u0431\u0440\u0430\u043B\u0438 \u043B\u0438\u0448\u043D\u0438\u0435 \u0448\u0430\u0433\u0438, \u0430 \u0432 \u0438\u0442\u043E\u0433\u0435 \u043B\u044E\u0434\u0438 \u0441\u0442\u0430\u043B\u0438 \u0447\u0430\u0449\u0435 \u0434\u043E\u0445\u043E\u0434\u0438\u0442\u044C \u0434\u043E \u043A\u043E\u043D\u0446\u0430 \u0438 \u043D\u0435 \u0442\u0435\u0440\u044F\u043B\u0438\u0441\u044C \u0432 \u043C\u0435\u043D\u044E."],
    ["Particles", "\u041A\u043D\u043E\u043F\u043A\u0443 \u0431\u044B \u0441\u0434\u0435\u043B\u0430\u0442\u044C \u0437\u0430\u043C\u0435\u0442\u043D\u0435\u0435, \u043D\u043E \u0442\u0430\u043A \u043B\u0438 \u044D\u0442\u043E \u043D\u0443\u0436\u043D\u043E, \u0435\u0441\u043B\u0438 \u0435\u0451 \u0438 \u0442\u0430\u043A \u043D\u0430\u0445\u043E\u0434\u044F\u0442? \u0412\u043E\u0442 \u0438 \u044F \u0431\u044B \u043D\u0435 \u0441\u0442\u0430\u043B."],
    ["Dash", "\u041F\u043E\u0438\u0441\u043A \u2014 \u0441\u0430\u043C\u043E\u0435 \u0447\u0430\u0441\u0442\u043E\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u043D\u0430 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0435, \u0430 \u0444\u0438\u043B\u044C\u0442\u0440\u044B \u2014 \u0441\u0430\u043C\u043E\u0435 \u0440\u0435\u0434\u043A\u043E\u0435, \u0438 \u044D\u0442\u043E \u0432\u0438\u0434\u043D\u043E \u043F\u043E \u0434\u0430\u043D\u043D\u044B\u043C."],
    ["Numbers", "\u0417\u0430 9 \u043C\u0435\u0441\u044F\u0446\u0435\u0432 \u0441\u043E\u043A\u0440\u0430\u0442\u0438\u043B\u0438 \u043F\u0443\u0442\u044C \u0441 6 \u0434\u043E 3 \u0448\u0430\u0433\u043E\u0432, \u043A\u043E\u043D\u0432\u0435\u0440\u0441\u0438\u044F \u0432\u044B\u0440\u043E\u0441\u043B\u0430 \u043D\u0430 38 %, \u0430 \u0436\u0430\u043B\u043E\u0431 \u0441\u0442\u0430\u043B\u043E \u0432 4 \u0440\u0430\u0437\u0430 \u043C\u0435\u043D\u044C\u0448\u0435."],
    ["Arrow", "\u041E\u0448\u0438\u0431\u043A\u0438 \u0432 \u043E\u0442\u0447\u0451\u0442\u0430\u0445: 6 \u2192 0 \u0437\u0430 \u043A\u0432\u0430\u0440\u0442\u0430\u043B. \u0421\u0442\u0430\u0442\u0443\u0441\u044B \u0437\u0430\u044F\u0432\u043A\u0438 \u0438\u0434\u0443\u0442 \u0442\u0430\u043A: \u043D\u043E\u0432\u0430\u044F \u2192 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u2192 \u043E\u0434\u043E\u0431\u0440\u0435\u043D\u0430 \u2192 \u0432 \u0440\u0430\u0431\u043E\u0442\u0435."],
    ["English", "I led it for 9 weeks with a team of 6 \u2014 and if it breaks, it is on me. So we tested it on real people first."]
  ];
  var $ = (sel) => document.querySelector(sel);
  var input = $("#src");
  var chips = $(".chips");
  var range = $("#col");
  var rangeOut = $("#col-out");
  var compare = $(".compare");
  var before = $("[data-before]");
  var after = $("[data-after]");
  var beforeCount = $("[data-before-count]");
  var afterCount = $("[data-after-count]");
  var added = $("[data-added]");
  var esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  function render(el, text) {
    el.innerHTML = text.split(/([  ]+)/).map((part) => {
      if (!part) return "";
      if (/^[  ]+$/.test(part)) return part.replace(/ /g, '<span class="nb">\xA0</span>');
      return `<span class="w">${esc(part)}</span>`;
    }).join("");
  }
  var SHORT_WORD = /^[(«„“"']?[A-Za-zА-Яа-яЁё]{1,2}$/;
  var DASH_WORD = /^[—–]$/;
  function audit(el) {
    const words = [...el.querySelectorAll(".w")];
    words.forEach((w) => w.classList.remove("bad"));
    let problems = 0;
    const top = (w) => w.offsetTop;
    words.forEach((w, i) => {
      const next = words[i + 1];
      const prev = words[i - 1];
      const lineEnd = !!next && top(next) > top(w) + 2;
      const lineStart = !!prev && top(w) > top(prev) + 2;
      const text = w.textContent ?? "";
      const hanging = lineEnd && SHORT_WORD.test(text);
      const dashFirst = lineStart && DASH_WORD.test(text);
      const orphan = !next && lineStart && text.length <= 5 && words.length > 6;
      if (hanging || dashFirst || orphan) {
        w.classList.add("bad");
        problems++;
      }
    });
    return problems;
  }
  var plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  function update() {
    const src = input.value;
    const out = tidy(src);
    render(before, src);
    render(after, out);
    const nb = (out.match(/ /g) ?? []).length - (src.match(/ /g) ?? []).length;
    added.textContent = plural(nb, "non-breaking space added", "non-breaking spaces added");
    measure();
  }
  function measure() {
    beforeCount.textContent = plural(audit(before), "problem", "problems");
    afterCount.textContent = plural(audit(after), "problem", "problems");
  }
  function setWidth() {
    compare.style.setProperty("--col", `${range.value}px`);
    rangeOut.textContent = `${range.value} px`;
    measure();
  }
  chips.innerHTML = EXAMPLES.map(([name], i) => `<button type="button" class="chip" data-i="${i}" aria-pressed="${i === 0}">${name}</button>`).join("");
  chips.addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    chips.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
    input.value = EXAMPLES[Number(b.dataset.i)][1];
    update();
  });
  input.addEventListener("input", () => {
    chips.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
    update();
  });
  range.addEventListener("input", setWidth);
  var resizeRaf = 0;
  addEventListener("resize", () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(measure);
  });
  document.fonts?.ready.then(measure);
  input.value = EXAMPLES[0][1];
  compare.style.setProperty("--col", `${range.value}px`);
  rangeOut.textContent = `${range.value} px`;
  update();
})();
