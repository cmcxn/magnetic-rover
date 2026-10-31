import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { StateDecoder } from "../src/state-codec.ts";
const rows = JSON.parse(
  fs.readFileSync(
    new URL("./fixtures/network-state.json", import.meta.url),
    "utf8",
  ),
);
const full = () => structuredClone(rows[0].message);
const delta = () => structuredClone(rows[1].message);
const start = () => {
  const d = new StateDecoder();
  d.reset("000001");
  assert.equal(d.apply(full()).status, "applied");
  return d;
};
function freeze(x) {
  if (x && typeof x === "object") {
    Object.freeze(x);
    for (const v of Object.values(x)) freeze(v);
  }
}
test("real Lua DTO restores full state and immutable atomic deltas", () => {
  const d = new StateDecoder();
  d.reset("000001");
  const a = d.apply(full());
  freeze(a.state);
  const before = JSON.stringify(a.state);
  const m = delta();
  m.players[0].cargo = 1;
  m.players[0].pickupSeq = 1;
  m.batteryRemoves = [a.state.batteries[0].id];
  m.batteryUpserts = [];
  const b = d.apply(m);
  assert.equal(b.status, "applied");
  assert.equal(b.mode, "continuous");
  assert.equal(JSON.stringify(a.state), before);
  assert.notEqual(b.state, a.state);
  assert.notEqual(b.state.players[0], a.state.players[0]);
  assert.equal(b.state.players[0].cargo, 1);
  assert.equal(b.state.batteries.length, a.state.batteries.length - 1);
});
test("gap, missing metadata, overlap and malformed data are atomic and recoverable", () => {
  for (const mutate of [
    (m) => (m.baseSeq = 9),
    (m) => (m.metadataVer = 9),
    (m) => (m.players[0].inputSeq = -1),
    (m) =>
      (m.batteryUpserts = [{ id: (m.batteryRemoves[0] = "1"), x: 0, y: 0 }]),
    (m) => delete m.players[0].x,
  ]) {
    const d = start(),
      m = delta();
    mutate(m);
    assert.equal(d.apply(m).status, "need_full");
    const r = d.apply(full());
    assert.equal(r.status, "applied");
    assert.equal(r.mode, "recover");
  }
  const d = start();
  const m = full();
  m.seq = 10;
  delete m.metadata;
  assert.equal(d.apply(m).status, "need_full");
});
test("same-epoch keyframes continuous, missing frames recover, resets retire prior epochs", () => {
  const d = start();
  const m = full();
  m.cause = "keyframe";
  m.seq = 1;
  assert.equal(d.apply(m).mode, "continuous");
  assert.equal(d.apply(m).status, "ignored");
  m.seq = 5;
  assert.equal(d.apply(m).mode, "recover");
  const n = full();
  n.epoch = "new-room-stream";
  n.cause = "phase_reset";
  assert.equal(d.apply(n).mode, "phase_reset");
  assert.equal(d.apply(m).status, "ignored");
  d.reset("other");
  assert.equal(d.apply(n).status, "ignored");
});
test("heartbeat advances sequence and removes optional returnIn, metadata mismatch does not commit", () => {
  const d = new StateDecoder();
  d.reset("000001");
  const f = full();
  f.frame.phase = "finished";
  f.frame.returnIn = 10000;
  d.apply(f);
  const hb = {
    v: 2,
    type: "state_heartbeat",
    roomId: f.roomId,
    roundId: f.roundId,
    epoch: f.epoch,
    seq: 1,
    baseSeq: 0,
    metadataVer: f.metadataVer,
    clock: { serverTime: 1, remaining: 0 },
  };
  const r = d.apply(hb);
  assert.equal(r.status, "applied");
  assert.equal(r.state.serverTime, 1);
  assert.equal(r.state.returnIn, undefined);
  assert.equal(
    d.apply({ ...hb, seq: 2, baseSeq: 1, metadataVer: 99 }).status,
    "need_full",
  );
});
test("absolute battery upsert removes absent velocity and metadata changes replace profiles", () => {
  const d = start(),
    m = delta();
  const id = rows[0].raw.batteries[0].id;
  m.batteryUpserts = [{ id, x: 10, y: 20 }];
  m.batteryRemoves = [];
  const r = d.apply(m);
  const b = r.state.batteries.find((b) => b.id === id);
  assert.equal(b.x, 0.1);
  assert.equal(b.unlock, undefined);
  assert.equal(b.vx, undefined);
});
