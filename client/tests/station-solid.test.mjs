import test from "node:test";
import assert from "node:assert/strict";
import { constrainStations } from "../src/motion.ts";
test("station projection blocks fast traversal but preserves tangential travel", () => {
  const s = [{ x: 0, y: 0, r: 65, bodyRadius: 70 }];
  const p = { x: 400, y: 0, angle: 0 };
  constrainStations(p, { x: -200, y: 0, angle: 0 }, 48, s);
  assert.ok(p.x <= -118 + 0.001);
  const q = { x: 0, y: 80, angle: 0 };
  constrainStations(q, { x: -118, y: 0, angle: 0 }, 48, s);
  assert.ok(q.y > 20);
  assert.ok(Math.hypot(q.x, q.y) >= 118 - 0.001);
  const old = { x: 400, y: 0, angle: 0 };
  constrainStations(old, { x: -200, y: 0, angle: 0 }, 48, [
    { x: 0, y: 0, r: 65 },
  ]);
  assert.equal(old.x, 400);
});
