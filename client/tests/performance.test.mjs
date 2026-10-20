import assert from "node:assert/strict";
import test from "node:test";
import { FrameMetrics } from "../src/performance.ts";

test("reports measured render FPS after one second, not before", () => {
  const meter = new FrameMetrics();
  assert.equal(meter.record(0), null);
  for (let i = 1; i < 50; i++) assert.equal(meter.record(i * 20), null);
  const sample = meter.record(1000);
  assert.equal(sample.fps, 50);
  assert.equal(sample.p95Ms, 20);
  assert.equal(sample.p99Ms, 20);
  assert.equal(sample.longFrames, 0);
});

test("keeps slow frames in actual elapsed time and counts only intervals over 50ms", () => {
  const meter = new FrameMetrics();
  meter.record(0);
  for (let i = 1; i <= 18; i++) meter.record(i * 50);
  const sample = meter.record(1100);
  assert.equal(sample.fps, 19000 / 1100);
  assert.equal(sample.p99Ms, 200);
  assert.equal(sample.longFrames, 1);
  assert.equal(sample.totalLongFrames, 1);
  for (let i = 1; i < 50; i++) meter.record(1100 + i * 20);
  assert.equal(meter.record(2100).totalLongFrames, 1);
});

test("reset discards background time, waits for a fresh sample, preserves session counter", () => {
  const meter = new FrameMetrics();
  meter.record(0);
  assert.equal(meter.record(1000).totalLongFrames, 1);
  meter.reset();
  assert.equal(meter.record(60000), null);
  for (let i = 1; i < 50; i++) assert.equal(meter.record(60000 + i * 20), null);
  const sample = meter.record(61000);
  assert.equal(sample.fps, 50);
  assert.equal(sample.longFrames, 0);
  assert.equal(sample.totalLongFrames, 1);
});

test("ignores duplicate or invalid timestamps without adding frames", () => {
  const meter = new FrameMetrics();
  meter.record(0);
  meter.record(0);
  meter.record(NaN);
  meter.record(-10);
  const sample = meter.record(1000);
  assert.equal(sample.fps, 1);
});
