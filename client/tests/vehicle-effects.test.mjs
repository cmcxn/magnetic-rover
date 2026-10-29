import test from "node:test";
import assert from "node:assert/strict";
import { VehicleMotion, wheelAngle } from "../src/vehicle-effects.ts";
const active = { active: true, scale: 1 };
test("wheel tread advances from actual movement, sprint speed is faster, idle does not roll", () => {
  const a = new VehicleMotion(),
    b = new VehicleMotion();
  a.sample("p", { x: 0, y: 0, angle: 0 }, 16, active);
  b.sample("p", { x: 0, y: 0, angle: 0 }, 16, active);
  const normal = a.sample("p", { x: 4.8, y: 0, angle: 0 }, 10, active),
    fast = b.sample("p", { x: 14.4, y: 0, angle: 0 }, 10, active);
  assert.ok(fast.phase > normal.phase);
  assert.equal(
    a.sample("p", { x: 4.8, y: 0, angle: 0 }, 16, active).phase,
    normal.phase,
  );
});
test("front tires steer in same direction with inner angle larger; rear stays straight", () => {
  const m = new VehicleMotion();
  m.sample("p", { x: 0, y: 0, angle: 0 }, 16, active);
  const v = m.sample("p", { x: 6, y: 1, angle: 0.3 }, 16, active);
  assert.ok(v.steer > 0);
  assert.ok(wheelAngle(v.steer, 1, true) > wheelAngle(v.steer, -1, true));
  assert.ok(wheelAngle(v.steer, -1, true) > 0);
  assert.equal(wheelAngle(v.steer, 1, false), 0);
});
test("teleports, stale input and reset do not create wheel travel or smoke", () => {
  const m = new VehicleMotion();
  m.sample("p", { x: 0, y: 0, angle: 0 }, 16, active);
  assert.equal(m.sample("p", { x: 500, y: 0, angle: 2 }, 16, active).speed, 0);
  assert.equal(
    m.sample("p", { x: 510, y: 0, angle: 2 }, 16, { ...active, active: false })
      .speed,
    0,
  );
  assert.equal(
    m.sample("p", { x: 520, y: 0, angle: 2 }, 1000, active).speed,
    0,
  );
  m.reset();
  assert.equal(m.sample("p", { x: 900, y: 0, angle: 0 }, 16, active).speed, 0);
  m.retain(new Set());
  assert.equal(m.size, 0);
});

test("dust is bounded, expires, and disappears immediately when effects become inactive", async () => {
  const { TireDust } = await import("../src/vehicle-effects.ts");
  const d = new TireDust();
  for (let i = 0; i < 300; i++) d.emit(0, 0, 0, 1, i);
  assert.equal(d.particles.length, 96);
  for (let i = 0; i < 20; i++) d.step(50, true);
  assert.equal(d.particles.length, 0);
  d.emit(0, 0, 0, 1, 1);
  d.step(16, false);
  assert.equal(d.particles.length, 0);
});

test("even quarter-size tires visibly accelerate further during sprint", () => {
  const a = new VehicleMotion(),
    b = new VehicleMotion(),
    opts = { active: true, scale: 0.25 };
  a.sample("p", { x: 0, y: 0, angle: 0 }, 10, opts);
  b.sample("p", { x: 0, y: 0, angle: 0 }, 10, opts);
  const normal = a.sample("p", { x: 4.8, y: 0, angle: 0 }, 10, opts),
    boost = b.sample("p", { x: 14.4, y: 0, angle: 0 }, 10, opts);
  assert.ok(boost.phase > normal.phase + 0.02);
});
