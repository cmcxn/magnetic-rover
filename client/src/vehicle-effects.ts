type Pose = { x: number; y: number; angle: number };
type Sample = { speed: number; phase: number; frame: number; steer: number };
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Presentation only: no steering, collision or position authority is changed. */
export class VehicleMotion {
  private cars = new Map<string, Pose & Sample>();
  reset() {
    this.cars.clear();
  }
  get size() {
    return this.cars.size;
  }
  retain(ids: Set<string>) {
    for (const id of this.cars.keys()) if (!ids.has(id)) this.cars.delete(id);
  }
  sample(
    id: string,
    pose: Pose,
    delta: number,
    options: { active: boolean; scale: number },
  ): Sample {
    const old = this.cars.get(id),
      dt = delta / 1000;
    const travel = old ? Math.hypot(pose.x - old.x, pose.y - old.y) : 0;
    const valid =
      old &&
      options.active &&
      dt > 0 &&
      dt <= 0.25 &&
      travel <= Math.max(100, 6000 * dt);
    const speed = valid ? travel / dt : 0;
    const moving = speed > 5;
    const phase =
      (old?.phase ?? 0) +
      (moving ? 42 * (1 - Math.exp(-speed / (1200 * options.scale))) * dt : 0);
    const target = moving
      ? Math.max(
          -0.42,
          Math.min(0.42, (wrap(pose.angle - old!.angle) / dt) * 0.12),
        )
      : 0;
    const steer = valid
      ? (old?.steer ?? 0) + (target - (old?.steer ?? 0)) * Math.min(1, dt * 14)
      : 0;
    const result = { speed, phase, frame: Math.floor(phase) % 8, steer };
    this.cars.set(id, { ...pose, ...result });
    return result;
  }
}
export function wheelAngle(steer: number, side: number, front: boolean) {
  return front
    ? steer * (Math.sign(steer) === Math.sign(side) ? 1.12 : 0.88)
    : 0;
}

export class TireDust {
  particles: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    age: number;
    life: number;
    size: number;
  }[] = [];
  clear() {
    this.particles.length = 0;
  }
  step(delta: number, active: boolean) {
    if (!active) {
      this.clear();
      return;
    }
    const dt = Math.min(0.05, Math.max(0, delta / 1000));
    for (const p of this.particles) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
  }
  emit(x: number, y: number, angle: number, scale: number, seed: number) {
    if (this.particles.length >= 96) return;
    this.particles.push({
      x,
      y,
      vx: -Math.cos(angle) * 24 + Math.sin(seed) * 12,
      vy: -Math.sin(angle) * 24 + Math.cos(seed) * 12,
      age: 0,
      life: 0.32 + (Math.sin(seed) + 1) * 0.06,
      size: scale * (3.5 + (Math.cos(seed) + 1) * 1.5),
    });
  }
}
