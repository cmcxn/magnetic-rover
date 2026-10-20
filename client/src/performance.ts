export interface FrameSample {
  fps: number;
  p95Ms: number;
  p99Ms: number;
  longFrames: number;
  totalLongFrames: number;
}

/** Completed Phaser render cadence, measured with unfiltered wall-clock intervals.
 * This measures render-loop delivery, not GPU execution time or display scanout.
 */
export class FrameMetrics {
  private previous: number | null = null;
  private started = 0;
  private intervals: number[] = [];
  private totalLongFrames = 0;

  reset() {
    this.previous = null;
    this.intervals = [];
  }

  record(now: number): FrameSample | null {
    if (!Number.isFinite(now)) return null;
    if (this.previous === null) {
      this.previous = this.started = now;
      return null;
    }
    const delta = now - this.previous;
    if (delta <= 0) return null;
    this.previous = now;
    this.intervals.push(delta);
    if (delta > 50) this.totalLongFrames++;
    const elapsed = now - this.started;
    if (elapsed < 1000) return null;
    const sorted = this.intervals.sort((a, b) => a - b);
    const sample = {
      fps: (sorted.length * 1000) / elapsed,
      p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
      p99Ms: sorted[Math.ceil(sorted.length * 0.99) - 1],
      longFrames: sorted.filter((ms) => ms > 50).length,
      totalLongFrames: this.totalLongFrames,
    };
    this.started = now;
    this.intervals = [];
    return sample;
  }
}
