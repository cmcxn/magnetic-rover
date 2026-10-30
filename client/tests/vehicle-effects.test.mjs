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

test("an instantaneous joystick turn remains visibly steered before centering", () => {
  const m = new VehicleMotion();
  m.sample("p", { x: 0, y: 0, angle: 0 }, 16, active);
  const turn = m.sample("p", { x: 4, y: 4, angle: Math.PI / 4 }, 16, active);
  assert.ok(turn.steer > 0.3, `turn must be visible, got ${turn.steer}`);
  let sample = turn;
  for (let i = 1; i <= 6; i++)
    sample = m.sample(
      "p",
      { x: 4 + i * 4, y: 4 + i * 4, angle: Math.PI / 4 },
      16,
      active,
    );
  assert.ok(sample.steer > 0.25, "turn must remain visible for at least 100ms");
  for (let i = 7; i < 80; i++)
    sample = m.sample(
      "p",
      { x: 4 + i * 4, y: 4 + i * 4, angle: Math.PI / 4 },
      16,
      active,
    );
  assert.ok(Math.abs(sample.steer) < 0.01, "straight driving recenters wheels");
});

test("tread uses sixteen phases and cannot jump backwards perceptually on slow frames", () => {
  const m = new VehicleMotion();
  let x = 0,
    previous = m.sample("p", { x, y: 0, angle: 0 }, 16, active),
    sawUpper = false;
  for (let i = 0; i < 80; i++) {
    x += 144;
    const next = m.sample("p", { x, y: 0, angle: 0 }, 100, active);
    assert.ok(
      next.phase - previous.phase <= 3,
      "limit phase advance on a slow frame",
    );
    if (next.frame >= 8) sawUpper = true;
    previous = next;
  }
  assert.ok(sawUpper, "use the full sixteen-frame cycle");
});

test("normal and dash tread are one hundred percent faster than the prior sixteen-frame rate", () => {
  for (const speed of [480, 1440]) {
    const m = new VehicleMotion();
    m.sample("p", { x: 0, y: 0, angle: 0 }, 16, active);
    const sample = m.sample(
      "p",
      { x: speed * 0.016, y: 0, angle: 0 },
      16,
      active,
    );
    assert.ok(
      Math.abs(sample.phase - 2 * 84 * (1 - Math.exp(-speed / 1200)) * 0.016) <
        1e-9,
    );
  }
});
