import test from "node:test";
import assert from "node:assert/strict";
import {
  ShowroomMotion,
  normalizeShowroomColor,
} from "../src/showroom-motion.ts";
test("auto yaw is slow, time based and does not expose pitch or zoom", () => {
  const m = new ShowroomMotion();
  m.update(1000);
  assert.ok(m.yaw > 0 && m.yaw < 0.5);
  assert.equal(m.pitch, undefined);
  assert.equal(m.zoom, undefined);
  const n = new ShowroomMotion();
  for (let i = 0; i < 10; i++) n.update(100);
  assert.ok(Math.abs(n.yaw - m.yaw) < 1e-10);
});
test("horizontal drag changes only yaw and color changes preserve user orientation", () => {
  const m = new ShowroomMotion();
  m.dragX(100);
  const yaw = m.yaw;
  assert.ok(yaw > 0.2);
  m.setColor("#FB7185");
  assert.equal(m.yaw, yaw);
  assert.equal(m.color, "fb7185");
  m.dragX(-100);
  assert.ok(Math.abs(m.yaw) < 1e-10);
});
test("invalid inputs cannot poison yaw; yaw stays bounded across many turns", () => {
  const m = new ShowroomMotion();
  for (const v of [NaN, Infinity, -1, 0]) m.update(v);
  assert.equal(m.yaw, 0);
  m.setYaw(100 * Math.PI + 0.4);
  assert.ok(Math.abs(m.yaw - 0.4) < 1e-10);
  m.dragX(NaN);
  m.setYaw(Infinity);
  assert.ok(Number.isFinite(m.yaw));
});
test("theme normalization rejects invalid CSS and retains fallback", () => {
  assert.equal(normalizeShowroomColor("#38BDF8"), "38bdf8");
  assert.equal(normalizeShowroomColor("fb7185"), "fb7185");
  assert.equal(normalizeShowroomColor("red", "34d399"), "34d399");
  assert.equal(normalizeShowroomColor(null), "38bdf8");
});
test("drag lifecycle pauses auto yaw and reduced motion disables it", () => {
  const m = new ShowroomMotion();
  m.beginDrag();
  m.update(1000);
  assert.equal(m.yaw, 0);
  m.dragX(20);
  const yaw = m.yaw;
  m.endDrag();
  m.update(100);
  assert.ok(m.yaw > yaw);
  m.setAutoRotate(false);
  const stopped = m.yaw;
  m.update(1000);
  assert.equal(m.yaw, stopped);
});
