/** Presentation-only speed needle. Never feeds back into vehicle movement. */
export class Speedometer {
  value = 0;
  private filtered = 0;
  private total = 0;
  private elapsed = 0;
  reset() { this.value = this.filtered = this.total = this.elapsed = 0; }
  update(speed: number, dtMs: number) {
    if (!Number.isFinite(speed) || !Number.isFinite(dtMs) || dtMs <= 0) return;
    const dt = Math.min(dtMs, 100);
    this.total += Math.max(0, speed) * dt;
    this.elapsed += dt;
    if (this.elapsed < 100) return;
    const measured = this.total / this.elapsed;
    const duration = this.elapsed / 1000;
    const target = this.filtered + (measured - this.filtered) * (1 - Math.exp(-duration / 0.22));
    const limit = (target > this.filtered ? 1400 : 1100) * duration;
    this.filtered += Math.max(-limit, Math.min(limit, target - this.filtered));
    const next = this.filtered < 5 ? 0 : Math.round(this.filtered / 5) * 5;
    // Schmitt-like display deadband suppresses network/interpolation corrections.
    if (next === 0 || Math.abs(next - this.value) >= 10) this.value = next;
    this.total = this.elapsed = 0;
  }
}
