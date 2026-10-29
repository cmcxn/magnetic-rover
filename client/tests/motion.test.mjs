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

const solidState = (time, players) =>
  state(time, players[0], { players, collisionRadius: 60 });
function separated(poses, radius = 60) {
  const values = [...poses.values()];
  for (const p of values)
    assert.ok(Math.hypot(p.x, p.y) <= 500 - radius + 1e-5);
  for (let i = 0; i < values.length; i++)
    for (let j = i + 1; j < values.length; j++)
      assert.ok(
        Math.hypot(values[i].x - values[j].x, values[i].y - values[j].y) >=
          radius * 2 - 1e-5,
      );
}
test("solid-circle prediction stops before an opponent rather than tunneling through", () => {
  const m = new motion.Motion();
  const a = player({ x: -140 }),
    b = player({ id: "2", x: 0 });
  m.receive(solidState(0, [a, b]), "1", false, 0);
  m.input({ x: 1, y: 0, boost: true }, 0);
  const poses = m.sample(250);
  separated(poses);
  assert.ok(poses.get("1").x < poses.get("2").x);
  assert.equal(a.x, -140, "display constraints never mutate authority");
});
test("solid-circle prediction keeps the complete vehicle inside the arena", () => {
  const m = new motion.Motion();
  m.receive(solidState(0, [player({ x: 435 })]), "1", false, 0);
  m.input({ x: 1, y: 0, boost: true }, 0);
  assert.equal(m.sample(250).get("1").x, 440);
});
test("opposing timestamp interpolation and local prediction never visually overlap", () => {
  const m = new motion.Motion();
  m.receive(
    solidState(0, [player({ x: -100 }), player({ id: "2", x: 100 })]),
    "1",
    false,
    0,
  );
  m.input({ x: 1, y: 0, boost: true }, 0);
  m.sample(40);
  m.receive(
    solidState(0.1, [
      player({ x: -60, impactSeq: 1, kx: -40 }),
      player({ id: "2", x: 60, stun: 1, kx: 300 }),
    ]),
    "1",
    false,
    100,
  );
  for (let t = 100; t <= 350; t += 10) separated(m.sample(t));
});
test("circle display constraints handle three pinned vehicles and initial coincidence", () => {
  for (const players of [
    [
      player({ x: 440 }),
      player({ id: "2", x: 420 }),
      player({ id: "3", x: 430 }),
    ],
    Array.from({ length: 8 }, (_, i) => player({ id: String(i + 1) })),
  ]) {
    const m = new motion.Motion();
    m.receive(solidState(0, players), "", true, 0);
    separated(m.sample(0));
  }
});
test("recoil impact sequence cancels boost replay even when attacker is not stunned", () => {
  const m = new motion.Motion();
  m.receive(solidState(0, [player({ impactSeq: 0 })]), "1", false, 0);
  m.input({ x: 1, y: 0, boost: true }, 0);
  m.receive(
    solidState(0.05, [player({ x: -10, impactSeq: 1, kx: -100 })]),
    "1",
    false,
    50,
  );
  assert.equal(m.pendingCount, 0);
  assert.ok(m.sample(100).get("1").x < -10);
});
test("stunned knockback moves smoothly but cannot replay user movement or run away on silence", () => {
  const m = new motion.Motion();
  const p = player({ stun: 1, kx: 200, ky: 0, impactSeq: 1 });
  m.receive(solidState(0, [p]), "1", false, 0);
  m.input({ x: -1, y: 0, boost: true }, 0);
  assert.ok(m.sample(50).get("1").x > 0);
  assert.ok(m.sample(100).get("1").x > m.sample(50).get("1").x);
  assert.equal(m.sample(400).get("1").x, m.sample(250).get("1").x);
  assert.equal(p.stun, 1);
});
test("solid-circle packet silence freezes the last bounded pose instead of snapping to pre-impact authority", () => {
  const m = new motion.Motion();
  m.receive(
    solidState(0, [player({ stun: 1, kx: 200, ky: 0 })]),
    "1",
    false,
    0,
  );
  const bounded = m.sample(250).get("1").x;
  assert.equal(m.sample(501).get("1").x, bounded);
  assert.equal(m.sample(5000).get("1").x, bounded);
});

test("lost-packet legal swapped endpoints rebase rather than pinning display at contact forever", () => {
  for (const spectator of [true, false]) {
    const m = new motion.Motion();
    m.receive(
      solidState(0, [player({ x: -150 }), player({ id: "2", x: 150 })]),
      "1",
      spectator,
      0,
    );
    m.sample(0);
    // The server's unseen route went around the other car, not through it.
    for (let t = 2000; t <= 4000; t += 50) {
      m.receive(
        solidState(t / 1000, [
          player({ x: 150 }),
          player({ id: "2", x: -150 }),
        ]),
        "1",
        spectator,
        t,
      );
      separated(m.sample(t));
    }
    const poses = m.sample(4000);
    assert.ok(Math.abs(poses.get("1").x - 150) < 1e-5);
    assert.ok(Math.abs(poses.get("2").x + 150) < 1e-5);
  }
});
test("large authoritative correction without long delivery silence also converges legally", () => {
  const m = new motion.Motion();
  m.receive(
    solidState(0, [player({ x: -150 }), player({ id: "2", x: 150 })]),
    "",
    true,
    0,
  );
  m.sample(0);
  // A buffered receive can have a large server-time jump without >500ms arrival gap.
  for (let t = 400; t <= 1400; t += 50) {
    m.receive(
      solidState(2 + t / 1000, [
        player({ x: 150 }),
        player({ id: "2", x: -150 }),
      ]),
      "",
      true,
      t,
    );
    separated(m.sample(t));
  }
  assert.ok(Math.abs(m.sample(1400).get("1").x - 150) < 1e-5);
});

test("snapshot baseSpeed drives prediction, loaded movement and boost", () => {
  for (const cargo of [0, 20])
    for (const boost of [false, true]) {
      const m = new motion.Motion();
      m.receive(state(0, player({ cargo }), { baseSpeed: 180 }), "1", false, 0);
      m.input({ x: 1, y: 0, boost }, 0);
      assert.ok(
        Math.abs(
          m.sample(50).get("1").x -
            180 * (1 - (0.2 * cargo) / 20) * (boost ? 3 : 1) * 0.05,
        ) < 1e-7,
      );
    }
});
test("dash integration uses configured speed multiplier", () => {
  const p = player({ boost: 1, cooldown: 4, bx: 1, by: 0, ix: 1, iy: 0 });
  motion.integrate(p, 0.1, 500, 0, 100, 5);
  assert.equal(p.x, 50);
});
