import test from "node:test";
import assert from "node:assert/strict";
import { normalize, escape, COLORS } from "../src/types.ts";
test("normalizes diagonal keyboard input to unit speed", () => {
  const v = normalize(1, 1);
  assert.ok(Math.abs(Math.hypot(v.x, v.y) - 1) < 1e-10);
});
test("preserves joystick partial deflection", () => {
  assert.deepEqual(normalize(0.2, -0.4), { x: 0.2, y: -0.4 });
});
test("idle input stays zero, large mouse vectors stay bounded", () => {
  assert.deepEqual(normalize(0, 0), { x: 0, y: 0 });
  assert.deepEqual(normalize(1000, 0), { x: 1, y: 0 });
});
test("nickname and URL markup are escaped", () => {
  assert.equal(escape("<script>\"&'"), "&lt;script&gt;&quot;&amp;&#39;");
});
test("color choices match authoritative allowlist", () => {
  assert.deepEqual(COLORS, [
    "#38bdf8",
    "#fb7185",
    "#a78bfa",
    "#facc15",
    "#34d399",
    "#fb923c",
  ]);
});
import {
  canonicalServerUrl,
  tokenStorageKey,
  sharedRank,
} from "../src/types.ts";
test("tokens use canonical, isolated server keys", () => {
  assert.equal(
    tokenStorageKey("ws://EXAMPLE.com:80/ws"),
    "rover.token:ws://example.com/ws",
  );
  assert.notEqual(tokenStorageKey("ws://a/ws"), tokenStorageKey("ws://b/ws"));
  assert.notEqual(
    tokenStorageKey("ws://a/ws"),
    tokenStorageKey("ws://a/other"),
  );
});
test("server addresses reject credentials, fragments and mixed content", () => {
  for (const url of ["https://a", "ws://user:pass@a/ws", "ws://a/ws#x"])
    assert.throws(() => canonicalServerUrl(url));
  assert.throws(() => canonicalServerUrl("ws://a/ws", true));
  assert.equal(canonicalServerUrl("wss://a/ws", true), "wss://a/ws");
});
test("ties share ranking without eliminating skipped ranks", () => {
  const rows = [{ score: 8 }, { score: 8 }, { score: 3 }];
  assert.equal(sharedRank(rows, 8), 1);
  assert.equal(sharedRank(rows, 3), 3);
});
import { cameraPolicy } from "../src/types.ts";
test("mobile landscape and portrait follow the car at legible scale", () => {
  const landscape = cameraPolicy(844, 390),
    portrait = cameraPolicy(390, 844);
  assert.equal(landscape.follows, true);
  assert.equal(portrait.follows, true);
  assert.ok(landscape.scale * 49 >= 35);
  assert.ok(portrait.scale * 49 >= 30);
});
test("desktop full arena and coarse-pointer tablet camera policies", () => {
  assert.equal(cameraPolicy(1366, 768).follows, false);
  assert.equal(cameraPolicy(1366, 768, true).follows, true);
});

test("pickup sequence delta never credits another player, baseline, reset or unsupported server", async () => {
  const { pickupCount } = await import("../src/types.ts");
  const state = (self, other, phase = "playing") => ({
    phase,
    players: [
      { id: "self", pickupSeq: self },
      { id: "other", pickupSeq: other },
    ],
  });
  assert.equal(pickupCount(null, state(12, 4), "self"), 0);
  assert.equal(pickupCount(state(12, 4), state(12, 8), "self"), 0);
  assert.equal(pickupCount(state(12, 4), state(15, 8), "self"), 3);
  assert.equal(pickupCount(state(12, 4), state(0, 8), "self"), 0);
  assert.equal(pickupCount(state(undefined, 4), state(2, 8), "self"), 0);
  assert.equal(pickupCount(state(12, 4, "lobby"), state(13, 8), "self"), 0);
  assert.equal(pickupCount(state(12, 4), state(13, 8, "finished"), "self"), 0);
});
