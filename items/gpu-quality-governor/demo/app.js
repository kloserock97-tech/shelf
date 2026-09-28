// items/gpu-quality-governor/variants/ts/quality.ts
var MSAA = (m) => m >= 4 ? 1 : m >= 2 ? 0.72 : 0.42;
var tierCost = ([s, m, b]) => 0.3 * b + 0.7 * s * s * MSAA(m);
var QualityGovernor = class {
  constructor(gl2, ladder, opts = {}) {
    this.gl = gl2;
    this.ladder = ladder;
    this.budgetMs = opts.budgetMs ?? 15;
    this.cost = opts.cost ?? tierCost;
    this.onSample = opts.onSample;
    this.ext = opts.timer === false ? null : gl2.getExtension("EXT_disjoint_timer_query_webgl2");
  }
  gl;
  ladder;
  ext;
  pending = [];
  active = null;
  samples = [];
  skip = 30;
  changes = 0;
  calm = 0;
  /** never climb above this tier (a smaller index): the governor has already stepped down from it */
  ceiling = 0;
  budgetMs;
  cost;
  onSample;
  asleep = false;
  /** median of the last full window, ms */
  lastMedian = 0;
  /** "gpu": timer queries. "intervals": no timer in this browser, frame intervals, steps down only */
  get mode() {
    return this.ext ? "gpu" : "intervals";
  }
  /** where the current window stands, for a HUD */
  get stats() {
    const gpu = !!this.ext;
    return {
      changes: this.changes,
      ceiling: this.ceiling,
      calm: this.calm,
      filled: gpu ? this.samples.length : this.intervals.length,
      size: gpu ? 60 : 90,
      skipping: gpu ? this.skip : this.intervalSkip
    };
  }
  /* Without a GPU timer the governor used to fall asleep at once, and only the start-up calibration was left.
     It measures the scene before the interface shows up, while glass, a video in a card and animations over the
     canvas added ~12 ms on an iPhone 11: calibration saw 18 ms, the person got 33 frames a second. The fallback:
     frame intervals while the person is idle. A window median over 22 ms (under 45 fps) means one tier down.
     Only down: intervals are held by the display refresh, headroom doesn't show in them. */
  intervals = [];
  intervalSkip = 90;
  pollIntervals(tier, idle, dt) {
    if (!idle) {
      this.intervals = [];
      return null;
    }
    if (this.intervalSkip > 0) {
      this.intervalSkip--;
      return null;
    }
    this.intervals.push(dt * 1e3);
    this.onSample?.(dt * 1e3);
    if (this.intervals.length < 90) return null;
    const sorted = this.intervals.slice().sort((a, b) => a - b);
    const med = sorted[sorted.length >> 1];
    this.lastMedian = med;
    this.intervals = [];
    if (med > 22 && tier < this.ladder.length - 1 && this.changes < 4) {
      this.changes++;
      this.calm = 0;
      this.intervalSkip = 60;
      return tier + 1;
    }
    if (++this.calm >= 4) this.asleep = true;
    return null;
  }
  /** call right before the frame's draw calls */
  begin() {
    if (this.asleep || !this.ext || this.active || this.pending.length > 4) return;
    const q = this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.active = q;
  }
  /** call right after them */
  end() {
    if (!this.active || !this.ext) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }
  /** drop the window (a tier change, the viewer left the scene) */
  reset(skip = 30) {
    for (const q of this.pending) this.gl.deleteQuery(q);
    this.pending = [];
    this.samples = [];
    this.skip = skip;
  }
  /**
   * Collect finished measurements; return the new tier, or null to stay.
   * tier: the current one. idle: the viewer just looks, nothing animates over the scene.
   * dt: seconds since the last frame (used only on the frame-interval path).
   */
  poll(tier, idle, dt = 0) {
    if (this.asleep) return null;
    if (!this.ext) return this.pollIntervals(tier, idle, dt);
    const gl2 = this.gl;
    const disjoint = gl2.getParameter(this.ext.GPU_DISJOINT_EXT);
    while (this.pending.length) {
      const q = this.pending[0];
      if (!gl2.getQueryParameter(q, gl2.QUERY_RESULT_AVAILABLE)) break;
      const ns = gl2.getQueryParameter(q, gl2.QUERY_RESULT);
      gl2.deleteQuery(q);
      this.pending.shift();
      if (disjoint || !idle) continue;
      this.onSample?.(ns / 1e6);
      if (this.skip > 0) {
        this.skip--;
        continue;
      }
      this.samples.push(ns / 1e6);
    }
    if (!idle) {
      this.samples = [];
      return null;
    }
    if (this.samples.length < 60) return null;
    const sorted = this.samples.slice().sort((a, b) => a - b);
    const med = sorted[sorted.length >> 1];
    this.lastMedian = med;
    this.samples = [];
    const cur = this.cost(this.ladder[tier]);
    if (med > this.budgetMs * 1.12 && tier < this.ladder.length - 1 && this.changes < 4) {
      this.changes++;
      this.calm = 0;
      this.ceiling = tier + 1;
      this.reset();
      return tier + 1;
    }
    if (tier > this.ceiling && this.changes < 4) {
      const next = this.cost(this.ladder[tier - 1]);
      if (med * (next / cur) < this.budgetMs * 0.85) {
        this.changes++;
        this.calm = 0;
        this.reset();
        return tier - 1;
      }
    }
    if (++this.calm >= 3) this.asleep = true;
    return null;
  }
};

// items/gpu-quality-governor/variants/ts/main.ts
var LADDER = [[1, 1], [0.89, 1], [0.78, 1], [0.67, 1], [0.67, 0.75], [0.6, 0.6], [0.5, 0.5]];
var cost = ([s, d]) => s * s * d;
var BUDGET_MS = 15;
var OCTAVES = 8;
var PROBE_MS = 24;
var MAX_LOAD = 32;
var VERT = `#version 300 es
void main() {
  gl_Position = vec4(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0, 0.0, 1.0);
}`;
var FRAG = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uRes;
uniform float uTime;
uniform int uOctaves;
uniform int uSamples;
out vec4 outColor;

// integer hash: odd multipliers (golden ratio, sqrt 2) and xor-shifts; sin() hashes lose precision far out
uint mixBits(uint h) {
  h ^= h >> 16; h *= 0x9E3779B1u;
  h ^= h >> 15; h *= 0x6A09E667u;
  h ^= h >> 16;
  return h;
}
float hash(ivec2 p) {
  return float(mixBits(uint(p.x) * 0x9E3779B1u ^ (uint(p.y) + 0x3C6EF372u) * 0x6A09E667u) >> 8) * (1.0 / 16777216.0);
}
float noise(vec2 p) {
  ivec2 i = ivec2(floor(p));
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + ivec2(1, 0)), c = hash(i + ivec2(0, 1)), d = hash(i + ivec2(1, 1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < uOctaves; i++) {
    s += a * noise(p);
    p = mat2(0.8, 0.6, -0.6, 0.8) * p * 2.02 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return s;
}

vec3 scene(vec2 frag) {
  vec2 uv = frag / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y);
  // dusk: warm at the horizon, violet higher up
  vec3 col = mix(vec3(0.99, 0.72, 0.52), vec3(0.53, 0.46, 0.66), smoothstep(0.12, 0.52, uv.y));
  col = mix(col, vec3(0.13, 0.15, 0.31), smoothstep(0.48, 1.0, uv.y));
  float d = length(p - vec2(0.22, 0.2));
  col += vec3(1.0, 0.62, 0.36) * (0.5 * exp(-d * 5.0) + 0.22 * exp(-d * 1.6));
  // clouds: domain-warped fbm drifting with the wind, the heavy part
  vec2 q = p * vec2(1.3, 3.4) + vec2(uTime * 0.018, 0.0);
  vec2 w = vec2(fbm(q + vec2(0.0, uTime * 0.012)), fbm(q + vec2(5.2, 1.3)));
  float c = fbm(q + 1.7 * w);
  float cover = smoothstep(0.46, 0.8, c) * smoothstep(0.22, 0.62, uv.y);
  vec3 lit = mix(vec3(1.0, 0.74, 0.62), vec3(0.78, 0.66, 0.84), smoothstep(0.25, 0.9, uv.y));
  vec3 shade = mix(vec3(0.44, 0.36, 0.52), vec3(0.2, 0.2, 0.36), smoothstep(0.3, 1.0, uv.y));
  col = mix(col, mix(shade, lit, smoothstep(0.35, 0.75, w.x)), cover * 0.9);
  // two ridges: the far one hazy, the near one dark
  float far = 0.24 + 0.05 * sin(p.x * 2.3 + 0.6) + 0.025 * sin(p.x * 6.1 + 1.7);
  float near = 0.13 + 0.045 * sin(p.x * 1.5 - 0.9) + 0.018 * sin(p.x * 4.7 + 0.3);
  float px = 1.5 / uRes.y;
  col = mix(col, vec3(0.42, 0.32, 0.45), smoothstep(far + px, far - px, uv.y) * 0.85);
  col = mix(col, vec3(0.12, 0.11, 0.18), smoothstep(near + px, near - px, uv.y));
  return col;
}

void main() {
  // the load: samples per pixel on a golden-angle spiral, averaged
  vec3 col = vec3(0.0);
  for (int i = 0; i < uSamples; i++) {
    float r = uSamples > 1 ? 0.5 * sqrt((float(i) + 0.5) / float(uSamples)) : 0.0;
    float a = float(i) * 2.3999632;
    col += scene(gl_FragCoord.xy + r * vec2(cos(a), sin(a)));
  }
  col /= float(uSamples);
  col += (hash(ivec2(gl_FragCoord.xy)) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}`;
var $ = (sel) => document.querySelector(sel);
var f1 = (n) => n.toFixed(1);
var params = new URLSearchParams(location.search);
var canvas = $("#scene");
var note = $("[data-note]");
var say = (text) => {
  note.textContent = text;
  note.hidden = false;
};
var gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: "high-performance" });
if (!gl) say("WebGL2 isn't available in this browser, so there is nothing to govern.");
else run(gl);
function program(gl2) {
  const prog = gl2.createProgram();
  for (const [type, src] of [[gl2.VERTEX_SHADER, VERT], [gl2.FRAGMENT_SHADER, FRAG]]) {
    const sh = gl2.createShader(type);
    gl2.shaderSource(sh, src);
    gl2.compileShader(sh);
    if (!gl2.getShaderParameter(sh, gl2.COMPILE_STATUS)) throw new Error(gl2.getShaderInfoLog(sh) ?? "shader");
    gl2.attachShader(prog, sh);
  }
  gl2.linkProgram(prog);
  if (!gl2.getProgramParameter(prog, gl2.LINK_STATUS)) throw new Error(gl2.getProgramInfoLog(prog) ?? "link");
  return prog;
}
function run(gl2) {
  const prog = program(gl2);
  const u = (name) => gl2.getUniformLocation(prog, name);
  const uRes = u("uRes"), uTime = u("uTime"), uOct = u("uOctaves"), uSamples = u("uSamples");
  gl2.bindVertexArray(gl2.createVertexArray());
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let tier = 0;
  const fixed = Number(params.get("load"));
  let load = Math.min(MAX_LOAD, Math.max(1, Math.round(fixed || 4)));
  let probing = !fixed && params.get("timer") !== "0";
  let cssW = canvas.clientWidth, cssH = canvas.clientHeight;
  const size = () => {
    const k = Math.min(window.devicePixelRatio || 1, 2) * LADDER[tier][0];
    canvas.width = Math.max(1, Math.round(cssW * k));
    canvas.height = Math.max(1, Math.round(cssH * k));
  };
  new ResizeObserver(([e]) => {
    cssW = e.contentRect.width;
    cssH = e.contentRect.height;
    size();
  }).observe(canvas);
  const spark = [];
  const log = [];
  let gov = null;
  let started = 0;
  let wasAsleep = false;
  const visit = (why) => {
    gov?.reset();
    size();
    spark.length = 0;
    log.length = 0;
    gov = new QualityGovernor(gl2, LADDER, {
      budgetMs: BUDGET_MS,
      cost,
      timer: params.get("timer") !== "0",
      onSample: (ms2) => {
        spark.push(ms2);
        if (spark.length > 120) spark.shift();
      }
    });
    started = performance.now();
    wasAsleep = false;
    log.push({ t: 0, text: `${why}, from tier ${tier}` });
    if (gov.mode === "intervals") {
      say("No GPU timer here (Safari and every iPhone browser lack EXT_disjoint_timer_query_webgl2). Falling back to frame intervals: one tier down when the median frame is over 22 ms, never up.");
      $("[data-ms-label]").textContent = "Frame interval";
    }
    paint();
  };
  const ms = $("[data-ms]"), rungs = $("[data-rungs]"), tierText = $("[data-tier]"), quality = $("[data-quality]"), win = $("[data-window]");
  const changes = $("[data-changes]"), state = $("[data-state]"), logList = $("[data-log]");
  const sparkCanvas = $("[data-spark]");
  const ctx2d = sparkCanvas.getContext("2d");
  rungs.innerHTML = LADDER.map(() => "<i></i>").join("");
  const paint = () => {
    const g = gov;
    const s = g.stats;
    ms.textContent = spark.length ? f1(spark[spark.length - 1]) : "\u2013";
    [...rungs.children].forEach((el, i) => el.classList.toggle("on", i === tier));
    tierText.textContent = String(tier);
    quality.textContent = `resolution ${LADDER[tier][0]}\xD7 \xB7 detail ${Math.round(LADDER[tier][1] * 100)}%`;
    win.textContent = g.asleep ? "\u2013" : s.skipping > 0 ? `warming up, ${s.skipping} frames` : `${s.filled} of ${s.size} frames`;
    changes.textContent = `${s.changes} of 4`;
    state.textContent = g.asleep ? "asleep" : g.mode === "gpu" ? "measuring GPU time" : "watching frame intervals";
    logList.innerHTML = log.slice(-4).map((e) => `<li><span>${f1(e.t)} s</span> ${e.text}</li>`).join("");
    const w = sparkCanvas.clientWidth, h = sparkCanvas.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (sparkCanvas.width !== Math.round(w * dpr)) {
      sparkCanvas.width = Math.round(w * dpr);
      sparkCanvas.height = Math.round(h * dpr);
    }
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2d.clearRect(0, 0, w, h);
    const top = Math.max(BUDGET_MS * 2, ...spark) * 1.05;
    const y = (v) => h - v / top * h;
    ctx2d.strokeStyle = "rgb(255 214 170 / .55)";
    ctx2d.setLineDash([3, 3]);
    ctx2d.beginPath();
    ctx2d.moveTo(0, y(BUDGET_MS));
    ctx2d.lineTo(w, y(BUDGET_MS));
    ctx2d.stroke();
    ctx2d.setLineDash([]);
    ctx2d.strokeStyle = "#eef0f7";
    ctx2d.lineWidth = 1.25;
    ctx2d.beginPath();
    spark.forEach((v, i) => {
      const x = i / 119 * w;
      if (i) ctx2d.lineTo(x, y(v));
      else ctx2d.moveTo(x, y(v));
    });
    ctx2d.stroke();
  };
  const slider = $("[data-load]");
  const loadText = $("[data-load-text]");
  let dragging = false;
  slider.value = String(load);
  loadText.textContent = `\xD7${load}`;
  slider.addEventListener("pointerdown", () => {
    dragging = true;
  });
  slider.addEventListener("input", () => {
    load = Number(slider.value);
    loadText.textContent = `\xD7${load}`;
  });
  slider.addEventListener("change", () => {
    dragging = false;
    visit(`load \xD7${load}, new visit`);
  });
  addEventListener("pointerup", () => {
    dragging = false;
  });
  $("[data-restart]").addEventListener("click", () => visit("new visit"));
  visit(probing ? `probe at load \xD7${load}` : `load \xD7${load}, first visit`);
  let last = performance.now();
  let hudAt = 0;
  const frame = (now) => {
    const dt = Math.min(0.25, (now - last) / 1e3);
    last = now;
    if (probing && spark.length >= 30) {
      probing = false;
      const med = spark.slice(10).sort((a, b) => a - b)[10];
      const next = Math.min(MAX_LOAD, Math.max(1, Math.round(load * PROBE_MS / med)));
      if (next !== load) {
        const was = load;
        load = next;
        slider.value = String(load);
        loadText.textContent = `\xD7${load}`;
        visit(`${f1(med)} ms at \xD7${was}, so load \xD7${load}`);
      }
    }
    const g = gov;
    gl2.viewport(0, 0, canvas.width, canvas.height);
    gl2.useProgram(prog);
    gl2.uniform2f(uRes, canvas.width, canvas.height);
    gl2.uniform1f(uTime, still ? 40 : 40 + now / 1e3);
    gl2.uniform1i(uOct, Math.max(1, Math.round(OCTAVES * LADDER[tier][1])));
    gl2.uniform1i(uSamples, load);
    g.begin();
    gl2.drawArrays(gl2.TRIANGLES, 0, 3);
    g.end();
    if (!g.asleep) {
      const from = tier;
      const next = g.poll(tier, !dragging && !document.hidden, dt);
      if (next !== null) {
        tier = next;
        size();
        const med = g.lastMedian;
        const why = next > from ? `median ${f1(med)} ms > ${f1(g.mode === "gpu" ? BUDGET_MS * 1.12 : 22)}` : `tier above would take ${f1(med * cost(LADDER[next]) / cost(LADDER[from]))} ms < ${f1(BUDGET_MS * 0.85)}`;
        log.push({ t: (now - started) / 1e3, text: `tier ${from} \u2192 ${next}: ${why}` });
      }
    }
    if (g.asleep && !wasAsleep) {
      wasAsleep = true;
      log.push({ t: (now - started) / 1e3, text: `asleep after ${g.mode === "gpu" ? 3 : 4} calm windows` });
    }
    if (now - hudAt > 125) {
      hudAt = now;
      paint();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  Object.assign(window, { __governor: { get tier() {
    return tier;
  }, get gov() {
    return gov;
  }, log } });
}
