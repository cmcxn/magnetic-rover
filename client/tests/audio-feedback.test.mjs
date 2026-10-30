import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import fs from "node:fs";
import ts from "typescript";
import { pickupCount } from "../src/types.ts";
const source = fs
  .readFileSync(new URL("../src/audio.ts", import.meta.url), "utf8")
  .replace(/^import .*;$/gm, "")
  .replace("export class Sounds", "class Sounds");
function harness() {
  const context = {
    pickupCount,
    localStorage: { getItem: () => null },
    performance: { now: () => 1000 },
  };
  vm.createContext(context);
  vm.runInContext(
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.None,
      },
    }).outputText + ";globalThis.Sounds=Sounds;",
    context,
  );
  return new context.Sounds();
}
test("authoritative hit sequence plays collision sound even with zero cargo", () => {
  const sounds = harness();
  const played = [];
  sounds.play = (n) => played.push(n);
  const state = (hitSeq) => ({
    phase: "playing",
    remaining: 100,
    players: [{ id: "p", cargo: 0, score: 0, cooldown: 0, hitSeq }],
  });
  sounds.update(state(0), state(1), "p");
  assert.deepEqual(played, ["hit"]);
  sounds.update(state(1), state(1), "p");
  assert.deepEqual(played, ["hit"]);
});
test("boost sound is stronger than routine effects and ends within 320 milliseconds with a fade", () => {
  const sounds = harness();
  const starts = [],
    stops = [],
    ramps = [];
  const gain = {
    gain: {
      value: 0,
      setValueAtTime: (...a) => ramps.push(a),
      linearRampToValueAtTime: (...a) => ramps.push(a),
    },
    connect() {},
  };
  sounds.context = {
    currentTime: 10,
    state: "running",
    createBufferSource: () => ({
      connect() {},
      start: (...a) => starts.push(a),
      stop: (t) => stops.push(t),
    }),
    createGain: () => gain,
  };
  sounds.buffers.set("boost", { duration: 1 });
  sounds.play("boost");
  assert.ok(gain.gain.value > 0.24 && gain.gain.value <= 0.4);
  assert.ok(stops[0] > 10 && stops[0] <= 10.32);
  assert.ok(ramps.some((a) => a[0] === 0 && a[1] <= 10.32));
});
test("pickup audio follows authority even if cargo falls, ignores cargo-only increases and initial snapshots", () => {
  const sounds = harness(),
    played = [];
  sounds.play = (n) => played.push(n);
  const state = (pickupSeq, cargo = 0) => ({
    phase: "playing",
    remaining: 80,
    players: [{ id: "p", pickupSeq, cargo, score: 0, cooldown: 0, hitSeq: 0 }],
  });
  sounds.update(null, state(9), "p");
  sounds.update(state(9), state(9, 5), "p");
  assert.deepEqual(played, []);
  sounds.update(state(9, 5), state(12, 1), "p");
  assert.deepEqual(played, ["pickup"]);
  sounds.update(state(12), state(0), "p");
  sounds.update(state(0), state(1), "other");
  assert.deepEqual(played, ["pickup"]);
});
test("pickup sample has a short fade and rapid events cannot stack sources", () => {
  const sounds = harness(),
    starts = [],
    stops = [];
  sounds.context = {
    currentTime: 10,
    state: "running",
    createBufferSource: () => ({
      connect() {},
      start() {
        starts.push(1);
      },
      stop(t) {
        stops.push(t);
      },
    }),
    createGain: () => ({
      gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} },
      connect() {},
    }),
  };
  sounds.buffers.set("pickup", { duration: 1 });
  sounds.play("pickup");
  sounds.play("pickup");
  assert.equal(starts.length, 1);
  assert.ok(stops[0] <= 10.24);
});
test("held boost loop starts once, stops on release and can restart", () => {
  const sounds = harness();
  let starts = 0,
    stops = 0;
  sounds.context = {
    state: "running",
    currentTime: 0,
    destination: {},
    createBufferSource: () => ({
      connect() {},
      disconnect() {},
      start() {
        starts++;
      },
      stop() {
        stops++;
      },
    }),
    createGain: () => ({
      gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} },
      connect() {},
      disconnect() {},
    }),
  };
  sounds.buffers.set("boost", { duration: 0.28 });
  sounds.setBoosting(true);
  sounds.setBoosting(true);
  assert.equal(starts, 1);
  sounds.setBoosting(false);
  assert.equal(stops, 1);
  sounds.setBoosting(true);
  assert.equal(starts, 2);
  sounds.enabled = false;
  sounds.setBoosting(true);
  assert.equal(stops, 2);
});

test("held engine loop starts with clear gain and uses the full sustained cycle", () => {
  const sounds = harness();
  let source, gain;
  sounds.context = {
    state: "running",
    currentTime: 0,
    destination: {},
    createBufferSource: () => (source = { connect() {}, start() {} }),
    createGain: () => (gain = { gain: { value: 0 }, connect() {} }),
  };
  sounds.buffers.set("boost", { duration: 0.48 });
  sounds.setBoosting(true);
  assert.ok(gain.gain.value >= 0.6);
  assert.equal(source.loopEnd, 0.48);
  assert.equal(source.loopStart, 0.08);
});

test("lobby warning sounds once per changed second, never for ready/solo/other players", () => {
  const sounds = harness(),
    played = [];
  sounds.play = (n) => played.push(n);
  const s = (left) => ({
    roomId: "r",
    phase: "lobby",
    players: [{ id: "me", readyIn: left }],
  });
  let prev = s(11);
  for (let left = 10; left >= 1; left--) {
    const next = s(left);
    sounds.update(prev, next, "me");
    sounds.update(next, next, "me");
    prev = next;
  }
  assert.equal(played.length, 10);
  sounds.update(prev, s(undefined), "me");
  sounds.update(s(9), s(8), "other");
  assert.equal(played.length, 10);
});
