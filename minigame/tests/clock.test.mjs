import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const adapter = readFileSync(
  new URL("../vendor/weapp-adapter.js", import.meta.url),
  "utf8",
);
function runtime() {
  let wall = 1700000000000;
  const pending = new Map();
  let id = 0;
  class Base {}
  class NativeCanvas extends Base {}
  const root = {
    console,
    Date: { now: () => wall },
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval,
    requestAnimationFrame: (callback) => {
      pending.set(++id, callback);
      return id;
    },
    cancelAnimationFrame: (key) => pending.delete(key),
    wx: {
      getSystemInfoSync: () => ({
        platform: "android",
        screenWidth: 844,
        screenHeight: 390,
        devicePixelRatio: 2,
      }),
      createCanvas: () => new NativeCanvas(),
      onTouchStart() {},
      onTouchMove() {},
      onTouchEnd() {},
      onTouchCancel() {},
    },
  };
  root.GameGlobal = root;
  root.window = root;
  vm.runInNewContext(adapter, root);
  return {
    root,
    pending,
    advance: (ms) => {
      wall += ms;
    },
  };
}
test("real adapter reports elapsed milliseconds for Phaser and motion interpolation", () => {
  const { root, advance } = runtime();
  const start = root.performance.now();
  advance(250);
  assert.equal(root.performance.now() - start, 250);
});
test("animation callback and performance.now share the same millisecond timeline", () => {
  const { root, pending, advance } = runtime();
  let stamp;
  const key = root.requestAnimationFrame((time) => {
    stamp = time;
  });
  advance(16);
  pending.get(key)(987654321);
  assert.equal(stamp, root.performance.now());
  const cancelled = root.requestAnimationFrame(() => {});
  root.cancelAnimationFrame(cancelled);
  assert.equal(pending.has(cancelled), false);
});
test("wall-clock corrections cannot move the animation clock backwards", () => {
  const { root, advance } = runtime();
  root.performance.now();
  advance(100);
  const before = root.performance.now();
  advance(-50);
  assert.equal(root.performance.now(), before);
  advance(70);
  assert.equal(root.performance.now() - before, 20);
});

test("shared motion advances between authoritative snapshots using adapter time", async () => {
  const { Motion } = await import("../../client/src/motion.ts");
  const { root, advance } = runtime();
  const motion = new Motion();
  const player = {
    id: "1",
    name: "clock-test",
    color: "#38bdf8",
    x: 0,
    y: 0,
    angle: 0,
    cargo: 0,
    score: 0,
    cooldown: 0,
    boost: 0,
    stun: 0,
    hitSeq: 0,
    impactSeq: 0,
    pickupSeq: 0,
    connected: true,
    inputSeq: 0,
    inputElapsed: 0,
    ix: 0,
    iy: 0,
    bx: 1,
    by: 0,
    kx: 0,
    ky: 0,
  };
  motion.receive(
    {
      type: "state",
      serverTime: 0,
      roundId: 1,
      roomId: "clock-test",
      phase: "playing",
      remaining: 100,
      players: [player],
      batteries: [],
      stations: [],
      radius: 500,
      baseSpeed: 240,
      collisionRadius: 60,
    },
    "1",
    false,
    root.performance.now(),
  );
  motion.input({ x: 1, y: 0, boost: false }, root.performance.now());
  advance(50);
  const first = motion.sample(root.performance.now()).get("1").x;
  advance(50);
  const second = motion.sample(root.performance.now()).get("1").x;
  assert.ok(
    first > 11 && first < 13,
    `50ms should show ~12 units, got ${first}`,
  );
  assert.ok(
    second > 23 && second < 25,
    `100ms should show ~24 units, got ${second}`,
  );
});
