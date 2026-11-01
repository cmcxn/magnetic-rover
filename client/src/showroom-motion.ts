/** Showroom-only state. Never participates in world/network vehicle motion. */
export function normalizeShowroomColor(
  value: unknown,
  fallback = "38bdf8",
): string {
  const candidate =
    typeof value === "string" ? value.replace(/^#/, "").toLowerCase() : "";
  return /^[0-9a-f]{6}$/.test(candidate) ? candidate : fallback;
}
const wrap = (yaw: number) => Math.atan2(Math.sin(yaw), Math.cos(yaw));
export class ShowroomMotion {
  yaw = 0;
  color = "38bdf8";
  private autoRotate = true;
  private dragging = false;
  /** One full revolution in about 42 seconds. No pitch/zoom state exists. */
  update(deltaMs: number) {
    if (
      this.autoRotate &&
      !this.dragging &&
      Number.isFinite(deltaMs) &&
      deltaMs > 0
    )
      this.setYaw(this.yaw + Math.min(deltaMs, 1000) * 0.00015);
  }
  dragX(dx: number) {
    if (Number.isFinite(dx)) this.setYaw(this.yaw + dx * 0.008);
  }
  setYaw(yaw: number) {
    if (Number.isFinite(yaw)) this.yaw = wrap(yaw);
  }
  setColor(color: string) {
    this.color = normalizeShowroomColor(color, this.color);
  }
  setAutoRotate(enabled: boolean) {
    this.autoRotate = enabled;
  }
  beginDrag() {
    this.dragging = true;
  }
  endDrag() {
    this.dragging = false;
  }
}
