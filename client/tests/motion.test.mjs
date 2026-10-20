import test from "node:test";
import assert from "node:assert/strict";
import * as motion from "../src/motion.ts";
const player = (extra = {}) => ({
  id: "1",
  name: "A",
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
  pickupSeq: 0,
  connected: true,
  inputSeq: 0,
  inputElapsed: 0,
  ix: 0,
  iy: 0,
  ...extra,
});
const state = (time = 0, p = player(), extra = {}) => ({
  type: "state",
  roomId: "a",
  roundId: 1,
  serverTime: time,
  phase: "playing",
  remaining: 100,
  players: [p],
  batteries: [],
  stations: [],
  radius: 500,
  ...extra,
});
const setup = () => {
  assert.equal(typeof motion.Motion, "function");
  const m = new motion.Motion();
  m.receive(state(), "1", false, 0);
  return m;
};
test("local control moves before a snapshot; authority stats untouched", () => {
  const m = setup();
  m.input({ x: 1, y: 0, boost: false }, 0);
  const p = m.sample(25).get("1");
  assert.equal(p.x, 6);
  assert.equal(m.sample(50).get("1").x, 12);
});
test("tick acknowledgement reconciles held time without per-packet movement", () => {
  const m = setup();
  const a = m.input({ x: 1, y: 0, boost: false }, 0);
  m.input({ x: 1, y: 0, boost: false }, 50);
  m.input({ x: 1, y: 0, boost: false }, 100);
  m.receive(
    state(0.05, player({ x: 12, ix: 1, inputSeq: a.seq, inputElapsed: 0.05 })),
    "1",
    false,
    100,
  );
  assert.equal(m.sample(100).get("1").x, 24);
  assert.equal(m.sample(125).get("1").x, 30);
});
test("boost locks heading, respects cargo, cooldown and arena clamp", () => {
  assert.equal(typeof motion.integrate, "function");
  const p = player({
    cargo: 20,
    boost: 0.02,
    bx: 1,
    by: 0,
    ix: 0,
    iy: 1,
    cooldown: 2,
  });
  motion.integrate(p, 0.05, 500);
  assert.ok(Math.abs(p.x - 11.52) < 1e-8);
  assert.ok(Math.abs(p.y - 5.76) < 1e-8);
  assert.equal(p.angle, 0);
  const q = player({ x: 499, ix: 1 });
  motion.integrate(q, 0.05, 500);
  assert.equal(q.x, 500);
});
test("collision snapshot immediately cancels boost replay and pending movement", () => {
  const m = setup();
  m.input({ x: 1, y: 0, boost: true }, 0);
  m.sample(50);
  m.receive(
    state(0.05, player({ x: -24, hitSeq: 1, stun: 1 })),
    "1",
    false,
    60,
  );
  assert.equal(m.sample(60).get("1").x, -24);
  assert.equal(m.sample(200).get("1").x, -24);
});
test("remote interpolation follows timestamp buffer and freezes on missing packets", () => {
  const m = new motion.Motion();
  m.receive(state(0, player()), "", true, 0);
  m.receive(state(0.1, player({ x: 24 })), "", true, 100);
  assert.equal(m.sample(150).get("1").x, 12);
  assert.equal(m.sample(5000).get("1").x, 24);
  assert.equal(
    m.receive(state(0.05, player({ x: 100 })), "", true, 160),
    false,
  );
});
test("pending inputs and stale extrapolation are bounded, reset drops prior room", () => {
  const m = setup();
  for (let i = 0; i < 500; i++) m.input({ x: 1, y: 0, boost: false }, i * 50);
  assert.ok(m.pendingCount <= 64);
  assert.equal(m.sample(30000).get("1").x, 0);
  m.reset();
  assert.equal(m.sample(30001).size, 0);
  m.receive(state(0, player({ x: 200 }), { roomId: "b" }), "1", false, 30002);
  assert.equal(m.sample(30002).get("1").x, 200);
});
test("foreground/round and spectator transitions never replay previous control", () => {
  const m = setup();
  m.input({ x: 1, y: 0, boost: true }, 0);
  m.receive(state(0.1, player({ x: 100 }), { roundId: 2 }), "1", false, 100);
  assert.equal(m.sample(110).get("1").x, 100);
  m.receive(state(0.2, player({ x: 200 }), { roundId: 2 }), "1", true, 200);
  assert.equal(m.sample(210).get("1").x, 200);
});
test("jittered remote snapshots interpolate actual time spacing and dropped snapshots do not cause runaway motion", () => {
  const m = new motion.Motion();
  m.receive(state(0, player()), "", true, 0);
  m.receive(state(0.1, player({ x: 24 })), "", true, 130);
  m.receive(state(0.3, player({ x: 72 })), "", true, 340);
  assert.equal(m.sample(350).get("1").x, 60);
  assert.equal(m.sample(450).get("1").x, 72);
  assert.equal(m.sample(9999).get("1").x, 72);
});
test("coalesced burst commands do not each purchase a physics tick", () => {
  const m = setup();
  m.input({ x: 1, y: 0, boost: false }, 0);
  for (let i = 0; i < 20; i++) m.input({ x: 1, y: 0, boost: false }, 10);
  assert.equal(m.sample(50).get("1").x, 12);
});
test("predicted boost cannot bypass cooldown or mutate authoritative cargo score and pickups", () => {
  const m = new motion.Motion(),
    s = state(0, player({ cargo: 20, score: 12, cooldown: 2 }));
  m.receive(s, "1", false, 0);
  m.input({ x: 1, y: 0, boost: true }, 0);
  assert.ok(Math.abs(m.sample(50).get("1").x - 9.6) < 1e-8);
  assert.equal(s.players[0].cargo, 20);
  assert.equal(s.players[0].score, 12);
  assert.equal(s.players[0].cooldown, 2);
  assert.deepEqual(s.batteries, []);
});
test("stunned authority prevents input replay until an unstunned snapshot", () => {
  const m = new motion.Motion();
  m.receive(state(0, player({ stun: 0.01, x: 40 })), "1", false, 0);
  m.input({ x: 1, y: 0, boost: true }, 0);
  assert.equal(m.sample(200).get("1").x, 40);
});
test("late prior-round and phase snapshots cannot resurrect prediction", () => {
  const m = setup();
  m.receive(
    state(2, player(), { roundId: 2, phase: "finished" }),
    "1",
    false,
    2000,
  );
  assert.equal(
    m.receive(state(1, player(), { roundId: 1 }), "1", false, 2010),
    false,
  );
  assert.equal(
    m.receive(state(1.9, player(), { roundId: 2 }), "1", false, 2020),
    false,
  );
});

test("packet silence freezes the bounded prediction horizon rather than walking backward", () => {
  const m = setup();
  m.input({ x: 1, y: 0, boost: false }, 0);
  assert.equal(m.sample(250).get("1").x, 60);
  assert.equal(m.sample(400).get("1").x, 60);
  assert.equal(m.sample(500).get("1").x, 60);
});
test("expired authoritative held input is not resurrected from the acknowledged command", () => {
  const m = setup();
  const c = m.input({ x: 1, y: 0, boost: true }, 0);
  m.receive(
    state(
      0.4,
      player({
        x: 20,
        ix: 0,
        iy: 0,
        boost: 0,
        inputSeq: c.seq,
        inputElapsed: 0.1,
      }),
    ),
    "1",
    false,
    400,
  );
  assert.equal(m.sample(500).get("1").x, 20);
});
