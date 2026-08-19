// How fast is it going, and what is it spending its time on?
//
// Written because "it feels laggy near the water on the old laptop" is a real
// report and an unfalsifiable one. There is no arguing about an optimisation
// without a number before it and a number after it, and the number has to come
// off the machine that is slow rather than off the one doing the optimising.
//
// Two customers: the overlay a player can turn on (F3, or the Sound screen),
// and the test harness, which reads the same figures out of window.__perf and
// fails if a frame budget is blown.

const KEEP = 120;                      // two seconds of frames at sixty

export class Perf {
  constructor() {
    this.frames = [];                  // recent frame costs, in milliseconds
    this.gaps = [];                    // wall clock between frames — the real fps
    this.last = 0;
    this.show = false;
    this.counts = {};                  // whatever the renderer felt like counting
    this.worst = 0;
  }

  /** One frame's work, in milliseconds, and when it landed. */
  sample(ts, ms) {
    this.frames.push(ms);
    if (this.frames.length > KEEP) this.frames.shift();
    if (this.last) {
      this.gaps.push(ts - this.last);
      if (this.gaps.length > KEEP) this.gaps.shift();
    }
    this.last = ts;
    if (ms > this.worst) this.worst = ms;
    // Somewhere a scenario can read without reaching into the game.
    if (typeof window !== 'undefined') window.__perf = this.report();
  }

  /** Count something per frame — draw calls, tiles, whatever is suspected. */
  count(what, n = 1) { this.counts[what] = (this.counts[what] || 0) + n; }

  /** Start of a frame's counting. */
  resetCounts() { this.lastCounts = this.counts; this.counts = {}; }

  report() {
    const sorted = [...this.frames].sort((a, b) => a - b);
    const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] || 0;
    const gaps = [...this.gaps].sort((a, b) => a - b);
    const gapAt = (q) => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * q))] || 0;
    return {
      frames: sorted.length,
      // The median is what it usually costs; the 95th is what makes it stutter,
      // and stutter is what somebody actually notices.
      ms: +at(0.5).toFixed(2),
      ms95: +at(0.95).toFixed(2),
      worst: +this.worst.toFixed(2),
      fps: gapAt(0.5) ? +(1000 / gapAt(0.5)).toFixed(1) : 0,
      counts: this.lastCounts || {},
    };
  }

  /** Wipe the history — for measuring one thing at a time. */
  clear() {
    this.frames.length = 0;
    this.gaps.length = 0;
    this.worst = 0;
    this.last = 0;
  }

  /**
   * Bottom left, out of the way of the clock and the money — the two things
   * you are most likely to be watching when you notice the game stuttering.
   */
  draw(ctx, drawText, colour, w, h) {
    if (!this.show) return;
    const r = this.report();
    const lines = [
      `${r.fps} fps   ${r.ms}ms   95th ${r.ms95}ms`,
      Object.entries(r.counts).map(([k, v]) => `${k} ${v}`).join('  '),
    ].filter(Boolean);
    const boxH = 6 + lines.length * 10;
    const y = h - boxH - 2;
    ctx.fillStyle = 'rgba(20,17,32,0.72)';
    ctx.fillRect(2, y, 176, boxH);
    lines.forEach((line, i) => drawText(ctx, line, 6, y + 3 + i * 10, { color: colour }));
  }
}
