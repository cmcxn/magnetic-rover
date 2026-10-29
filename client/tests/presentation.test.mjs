import test from "node:test";
import assert from "node:assert/strict";
import { controlLayout, joystickPose, skillView } from "../src/presentation.ts";
import { FloatingJoystick } from "../src/types.ts";
test("idle joystick is visible at safe default; active origin stays exactly under touch", () => {
  const layout = controlLayout(844, 390, 44, 20);
  const j = new FloatingJoystick();
  assert.deepEqual(joystickPose(j, layout), {
    ...layout.joystick,
    active: false,
    dx: 0,
    dy: 0,
  });
  j.start(1, 3, 200);
  j.move(1, 22, 200);
  assert.deepEqual(joystickPose(j, layout), {
    x: 3,
    y: 200,
    r: layout.joystick.r,
    active: true,
    dx: 19,
    dy: 0,
  });
  j.end(1);
  assert.equal(joystickPose(j, layout).x, layout.joystick.x);
});
test("controls stay in safe area in short landscape and portrait", () => {
  for (const [w, h] of [
    [667, 320],
    [844, 390],
    [390, 844],
    [1440, 900],
  ]) {
    const l = controlLayout(w, h, 30, 20);
    for (const c of [l.joystick, l.boost]) {
      assert.ok(c.x - c.r >= 30);
      assert.ok(c.x + c.r <= w - 20);
      assert.ok(c.y + c.r <= h - 12);
    }
    assert.ok(l.joystick.x + l.joystick.r < l.boost.x - l.boost.r);
  }
});
test("cooldown interpolates but never unlocks before server zero; stale snapshot freezes", () => {
  const p = { cooldown: 4, stun: 0, boost: 0 };
  assert.equal(skillView(p, 500).seconds, 3.5);
  assert.equal(skillView(p, 5000).seconds, 4);
  assert.equal(skillView({ ...p, cooldown: 0.1 }, 500).ready, false);
  assert.equal(skillView({ ...p, cooldown: 0 }, 500).ready, true);
  assert.equal(skillView({ ...p, cooldown: 0, stun: 0.5 }, 0).ready, false);
  assert.equal(skillView(undefined, 0).ready, false);
});
test("boost orb depletes during authoritative dash then recharges during cooldown", () => {
  const p = { boost: 0.32, cooldown: 4, stun: 0 };
  assert.equal(skillView(p, 0).boosting, true);
  assert.equal(skillView(p, 0).energy, 1);
  assert.ok(Math.abs(skillView(p, 160).energy - 0.5) < 0.001);
  assert.equal(skillView({ ...p, boost: 0, cooldown: 2 }, 0).energy, 0.5);
  assert.equal(skillView({ ...p, boost: 0, cooldown: 0 }, 0).energy, 1);
  assert.equal(
    skillView({ ...p, boost: 0, cooldown: 0, stun: 0.65 }, 0).energy,
    0,
  );
});
test("liquid surface stays inside a circular orb with bounded geometry at every charge", async () => {
  const { orbLiquid } = await import("../src/presentation.ts");
  assert.equal(typeof orbLiquid, "function");
  assert.deepEqual(orbLiquid(20, 30, 50, 0, 0), []);
  for (const energy of [0.01, 0.25, 0.5, 0.99, 1])
    for (const time of [0, 500, 2000]) {
      const points = orbLiquid(20, 30, 50, energy, time);
      assert.ok(points.length > 3 && points.length <= 42);
      for (const p of points)
        assert.ok(Math.hypot(p.x - 20, p.y - 30) <= 50.00001);
    }
});
test("skill energy follows server duration and cooldown", () => {
  const tuning = { boostCooldown: 8, boostDuration: 1 };
  const release = skillView({ cooldown: 8, boost: 0.5, stun: 0 }, 0, tuning);
  assert.equal(release.energy, 0.5);
  assert.equal(release.seconds, 0.5);
  const charge = skillView({ cooldown: 4, boost: 0, stun: 0 }, 0, tuning);
  assert.equal(charge.progress, 0.5);
});
