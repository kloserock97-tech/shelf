/* Quality governor: picks a quality tier from the time the GPU really spends on a frame
   (EXT_disjoint_timer_query_webgl2), measured while the viewer is simply looking at the scene.
   Headroom: one tier up. Overload: one tier down.

   Why not frame intervals: they stick to the display refresh and the FPS cap, so headroom is invisible in them,
   and one unlucky start-up measurement on a shared GPU (a busy tab next door, a laptop on battery) used to drop
   the scene to DPR 1.26 without MSAA and keep it there for two weeks.

   Against the picture "breathing": windows of 60 frames, a pause after every change, at most 4 changes a visit,
   never back up to a tier it has already stepped down from, and after 3 calm windows it falls asleep.
   No timer extension (Safari, every browser on iPhone): frame intervals instead, and only downwards. */

/** A rung of the ladder for the default cost model: [share of native DPR, MSAA samples, share of heavy geometry,
 *  extra passes on]. Any other shape works with your own `cost`. */
export type Tier = readonly [scale: number, msaa: number, share: number, extras: boolean];

/* Cost of a tier relative to the top one, as measured in the original scene: the vertex part (grass blades) is
   proportional to their share, the pixel part to DPR² and MSAA. Intel Arc 140T at DPR 1.51: MSAA 4× 20 ms,
   2× 15 ms, none 9 ms. The ladder there was
   [1,4,1,true] [.89,4,1,true] [.78,4,1,true] [.67,4,1,true] [.67,2,1,true] [.6,2,1,true] [.6,2,.8,false] [.56,2,.62,false] [.56,0,.5,false] */
const MSAA = (m: number) => (m >= 4 ? 1 : m >= 2 ? 0.72 : 0.42);
export const tierCost = ([s, m, b]: Tier) => 0.3 * b + 0.7 * s * s * MSAA(m);

export type GovernorOptions<T> = {
  /** GPU milliseconds a frame may take, 15 by default */
  budgetMs?: number;
  /** relative cost of a tier: predicts whether the tier above would fit */
  cost?: (tier: T) => number;
  /** false ignores the timer query and takes the frame-interval path */
  timer?: boolean;
  /** every measurement in ms (GPU time, or the frame interval on the fallback path), for a HUD */
  onSample?: (ms: number) => void;
};

type TimerExt = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };

export class QualityGovernor<T = Tier> {
  private ext: TimerExt | null;
  private pending: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;
  private samples: number[] = [];
  private skip = 30;
  private changes = 0;
  private calm = 0;
  /** never climb above this tier (a smaller index): the governor has already stepped down from it */
  private ceiling = 0;
  private readonly budgetMs: number;
  private readonly cost: (tier: T) => number;
  private readonly onSample?: (ms: number) => void;
  asleep = false;
  /** median of the last full window, ms */
  lastMedian = 0;

  constructor(private gl: WebGL2RenderingContext, private ladder: readonly T[], opts: GovernorOptions<T> = {}) {
    this.budgetMs = opts.budgetMs ?? 15;
    this.cost = opts.cost ?? (tierCost as unknown as (tier: T) => number);
    this.onSample = opts.onSample;
    this.ext = opts.timer === false ? null : (gl.getExtension("EXT_disjoint_timer_query_webgl2") as TimerExt | null);
  }

  /** "gpu": timer queries. "intervals": no timer in this browser, frame intervals, steps down only */
  get mode(): "gpu" | "intervals" {
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
      skipping: gpu ? this.skip : this.intervalSkip,
    };
  }

  /* Without a GPU timer the governor used to fall asleep at once, and only the start-up calibration was left.
     It measures the scene before the interface shows up, while glass, a video in a card and animations over the
     canvas added ~12 ms on an iPhone 11: calibration saw 18 ms, the person got 33 frames a second. The fallback:
     frame intervals while the person is idle. A window median over 22 ms (under 45 fps) means one tier down.
     Only down: intervals are held by the display refresh, headroom doesn't show in them. */
  private intervals: number[] = [];
  private intervalSkip = 90;
  private pollIntervals(tier: number, idle: boolean, dt: number): number | null {
    if (!idle) { this.intervals = []; return null; }
    if (this.intervalSkip > 0) { this.intervalSkip--; return null; }
    this.intervals.push(dt * 1000);
    this.onSample?.(dt * 1000);
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
  poll(tier: number, idle: boolean, dt = 0): number | null {
    if (this.asleep) return null;
    if (!this.ext) return this.pollIntervals(tier, idle, dt);
    const gl = this.gl;
    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    while (this.pending.length) {
      const q = this.pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
      gl.deleteQuery(q);
      this.pending.shift();
      if (disjoint || !idle) continue;
      this.onSample?.(ns / 1e6);
      if (this.skip > 0) { this.skip--; continue; }
      this.samples.push(ns / 1e6);
    }
    if (!idle) { this.samples = []; return null; }
    if (this.samples.length < 60) return null;
    const sorted = this.samples.slice().sort((a, b) => a - b);
    const med = sorted[sorted.length >> 1];
    this.lastMedian = med;
    this.samples = [];

    const cur = this.cost(this.ladder[tier]);
    /* overload: even the median is over budget. One tier down, and never back up there */
    if (med > this.budgetMs * 1.12 && tier < this.ladder.length - 1 && this.changes < 4) {
      this.changes++;
      this.calm = 0;
      this.ceiling = tier + 1;
      this.reset();
      return tier + 1;
    }
    /* headroom: the predicted cost of the tier above fits with 15 % to spare */
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
}
