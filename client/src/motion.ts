import type { Player, State } from "./types";
export type Control = { x: number; y: number; boost: boolean };
type Command = Control & { seq: number; at: number };
type Pose = { x: number; y: number; angle: number };
const wrap = (n: number) => Math.atan2(Math.sin(n), Math.cos(n));
const mix = (a: Pose, b: Pose, t: number): Pose => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  angle: a.angle + wrap(b.angle - a.angle) * t,
});
/** Presentation constraints only: these never assign hits, stun, cargo or scores. */
function clampPose(p: Pose, limit: number) {
  const d = Math.hypot(p.x, p.y);
  if (d > limit) {
    p.x *= limit / d;
    p.y *= limit / d;
  }
}
function contactTime(a: Pose, av: Pose, b: Pose, bv: Pose, radius: number) {
  const x = b.x - a.x,
    y = b.y - a.y;
  const dx = bv.x - av.x,
    dy = bv.y - av.y;
  const c = x * x + y * y - radius * radius;
  const dot = x * dx + y * dy;
  if (dot >= -1e-9) return;
  if (c <= 1e-7) return 0;
  const speed = dx * dx + dy * dy;
  const disc = dot * dot - speed * c;
  if (disc < 0 || speed < 1e-12) return;
  const t = (-dot - Math.sqrt(disc)) / speed;
  if (t >= 0 && t <= 1) return t;
}
/** Clip simultaneous display paths, then project residual overlaps at walls/piles. */
function constrain(
  poses: Map<string, Pose>,
  starts: Map<string, Pose>,
  radius: number,
  arena: number,
) {
  const ids = [...poses.keys()].sort((a, b) => a.localeCompare(b));
  const pos = new Map<string, Pose>(),
    vel = new Map<string, Pose>();
  for (const id of ids) {
    const target = poses.get(id)!;
    const start = starts.get(id) ?? target;
    pos.set(id, { ...start });
    vel.set(id, { x: target.x - start.x, y: target.y - start.y, angle: 0 });
  }
  let left = 1;
  for (let iteration = 0; iteration < 64 && left > 1e-8; iteration++) {
    let time = 1,
      pair: [string, string] | undefined;
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i],
          b = ids[j],
          va = vel.get(a)!,
          vb = vel.get(b)!;
        const t = contactTime(
          pos.get(a)!,
          { x: va.x * left, y: va.y * left, angle: 0 },
          pos.get(b)!,
          { x: vb.x * left, y: vb.y * left, angle: 0 },
          2 * radius,
        );
        if (t !== undefined && t < time) {
          time = t;
          pair = [a, b];
        }
      }
    for (const id of ids) {
      const p = pos.get(id)!,
        v = vel.get(id)!;
      p.x += v.x * left * time;
      p.y += v.y * left * time;
    }
    left *= 1 - time;
    if (!pair) break;
    const [a, b] = pair,
      pa = pos.get(a)!,
      pb = pos.get(b)!;
    const va = vel.get(a)!,
      vb = vel.get(b)!;
    const d = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    const nx = d > 1e-8 ? (pb.x - pa.x) / d : 1;
    const ny = d > 1e-8 ? (pb.y - pa.y) / d : 0;
    const closing = (va.x - vb.x) * nx + (va.y - vb.y) * ny;
    if (closing > 0) {
      va.x -= (nx * closing) / 2;
      va.y -= (ny * closing) / 2;
      vb.x += (nx * closing) / 2;
      vb.y += (ny * closing) / 2;
    }
  }
  // The solver is presentation-only and bounded for the room's maximum eight cars.
  for (let iteration = 0; iteration < 160; iteration++) {
    let overlap = 0;
    for (const p of pos.values()) clampPose(p, arena - radius);
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = pos.get(ids[i])!,
          b = pos.get(ids[j])!;
        const d = Math.hypot(b.x - a.x, b.y - a.y),
          missing = radius * 2 - d;
        if (missing <= 0) continue;
        overlap = Math.max(overlap, missing);
        // Deterministic non-collinear tie break avoids a jammed pile of coincident cars.
        const angle = (i * 7 + j * 11) * 2.399963;
        const nx = d > 1e-9 ? (b.x - a.x) / d : Math.cos(angle);
        const ny = d > 1e-9 ? (b.y - a.y) / d : Math.sin(angle);
        const push = missing / 2 + 1e-7;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    if (overlap < 1e-7) break;
  }
  for (const id of ids) {
    const p = pos.get(id)!;
    clampPose(p, arena - radius);
    poses.set(id, { ...p, angle: poses.get(id)!.angle });
  }
}
/** Kinematics only. Collection, deposits, collisions and score remain authoritative. */
export function integrate(
  p: Player,
  dt: number,
  radius: number,
  collisionRadius = 0,
  baseSpeed = 240,
  boostMultiplier = 3,
) {
  if (p.energy !== undefined) {
    if (p.boostHeld)
      p.energy = Math.max(
        0,
        p.energy - Math.min(dt, p.boost) / (p.boostCapacity ?? 0.32),
      );
    else p.energy = Math.min(1, p.energy + dt / (p.rechargeTime ?? 4));
  }
  const stunned = p.stun > 0;
  p.stun = Math.max(0, p.stun - dt);
  p.cooldown = Math.max(0, p.cooldown - dt);
  if (stunned || !p.connected) {
    p.ix = p.iy = 0;
    p.boost = 0;
  }
  const ix = p.ix ?? 0,
    iy = p.iy ?? 0;
  const bx = p.boost > 0 ? (p.bx ?? Math.cos(p.angle)) : ix;
  const by = p.boost > 0 ? (p.by ?? Math.sin(p.angle)) : iy;
  const dash = Math.min(dt, p.boost),
    speed = baseSpeed * (1 - (0.2 * p.cargo) / 20);
  const decay = Math.exp(-5 * dt),
    travel = (1 - decay) / 5;
  p.x +=
    speed * (bx * boostMultiplier * dash + ix * (dt - dash)) +
    (p.kx ?? 0) * travel;
  p.y +=
    speed * (by * boostMultiplier * dash + iy * (dt - dash)) +
    (p.ky ?? 0) * travel;
  if (p.kx !== undefined) p.kx *= decay;
  if (p.ky !== undefined) p.ky *= decay;
  clampPose(p, radius - collisionRadius);
  if (bx !== 0 || by !== 0) p.angle = Math.atan2(by, bx);
  p.boost = Math.max(0, p.boost - dt);
}
function apply(p: Player, c: Control, tuning: State) {
  if (p.stun > 0) return;
  const n = Math.hypot(c.x, c.y),
    scale = Math.max(1, n);
  p.ix = c.x / scale;
  p.iy = c.y / scale;
  if (p.energy !== undefined) {
    p.boostCapacity = tuning.boostDuration ?? 0.32;
    p.rechargeTime = tuning.boostCooldown ?? 4;
    if (!c.boost) {
      p.boostHeld = false;
      p.boost = 0;
      return;
    }
    if (!p.boostHeld && p.energy > 0) {
      if (n >= 0.1) p.angle = Math.atan2(c.y, c.x);
      p.bx = Math.cos(p.angle);
      p.by = Math.sin(p.angle);
      p.boost = p.energy * p.boostCapacity;
    }
    p.boostHeld = true;
    return;
  }
  if (c.boost && p.cooldown <= 0) {
    if (n >= 0.1) p.angle = Math.atan2(c.y, c.x);
    p.bx = Math.cos(p.angle);
    p.by = Math.sin(p.angle);
    p.boost = tuning.boostDuration ?? 0.32;
    p.cooldown = tuning.boostCooldown ?? 4;
  }
}
export class Motion {
  private seq = 0;
  private commands: Command[] = [];
  private snapshots: { state: State; at: number }[] = [];
  private key = "";
  private self = "";
  private spectator = false;
  private offset = 0;
  private displayed = new Map<string, Pose>();
  private displayedAt = -Infinity;
  private correction = { x: 0, y: 0, angle: 0, at: 0 };
  get pendingCount() {
    return this.commands.length;
  }
  reset() {
    this.commands = [];
    this.snapshots = [];
    this.key = "";
    this.displayed.clear();
    this.displayedAt = -Infinity;
    this.correction = { x: 0, y: 0, angle: 0, at: 0 };
  }
  input(c: Control, now: number) {
    const cmd = { ...c, seq: ++this.seq, at: now };
    this.commands.push(cmd);
    if (this.commands.length > 64)
      this.commands.splice(0, this.commands.length - 64);
    return {
      type: "input" as const,
      x: c.x,
      y: c.y,
      boost: c.boost,
      seq: cmd.seq,
    };
  }
  receive(state: State, self: string, spectator: boolean, now: number) {
    const key = `${state.roomId}:${state.roundId}:${state.phase}:${self}:${spectator}`;
    const previous = this.snapshots[this.snapshots.length - 1];
    if (
      previous &&
      state.roomId === previous.state.roomId &&
      ((state.roundId !== undefined &&
        previous.state.roundId !== undefined &&
        state.roundId < previous.state.roundId) ||
        (state.serverTime !== undefined &&
          previous.state.serverTime !== undefined &&
          state.serverTime < previous.state.serverTime))
    )
      return false;
    const before = this.sample(now).get(self);
    const oldPlayer = previous?.state.players.find((p) => p.id === self);
    const changed = key !== this.key;
    // A missing route cannot be reconstructed by sweeping a straight line forever.
    // Rebase the whole presentation atomically after silence or a diameter-sized
    // correction. The next sample projects the fresh authority snapshot, never
    // animating a guessed path through another car; ordinary motion still sweeps.
    const rebase = !!(
      state.collisionRadius &&
      previous &&
      (now - previous.at > 500 ||
        state.players.some((p) => {
          const shown = this.displayed.get(p.id);
          return (
            shown &&
            Math.hypot(shown.x - p.x, shown.y - p.y) >=
              state.collisionRadius! * 2 - 1e-6
          );
        }))
    );
    if (changed || rebase) this.reset();
    this.key = key;
    this.self = self;
    this.spectator = spectator;
    const stamp = (state.serverTime ?? now / 1000) * 1000;
    // Earliest observed delivery offset avoids adding a late packet's jitter to the clock.
    this.offset =
      changed || rebase ? now - stamp : Math.min(this.offset, now - stamp);
    this.snapshots.push({ state, at: now });
    if (this.snapshots.length > 32) this.snapshots.shift();
    const p = state.players.find((p) => p.id === self);
    const hit =
      p &&
      oldPlayer &&
      (p.hitSeq !== oldPlayer.hitSeq ||
        p.impactSeq !== oldPlayer.impactSeq ||
        p.stun > oldPlayer.stun);
    if (hit || !p?.connected) this.commands = [];
    else if (p.inputSeq !== undefined)
      this.commands = this.commands.filter((c) => c.seq >= p.inputSeq!);
    this.correction = { x: 0, y: 0, angle: 0, at: now };
    const after = this.predict(now);
    if (!changed && !rebase && !hit && before && after) {
      const d = Math.hypot(before.x - after.x, before.y - after.y);
      if (d < 100)
        this.correction = {
          x: before.x - after.x,
          y: before.y - after.y,
          angle: wrap(before.angle - after.angle),
          at: now,
        };
      else this.commands = [];
    }
    return true;
  }
  private predict(now: number): Player | undefined {
    const latest = this.snapshots[this.snapshots.length - 1];
    if (!latest) return;
    const s = latest.state,
      p = s.players.find((p) => p.id === this.self);
    if (!p) return;
    const result = {
      ...p,
      boostCapacity: s.boostDuration ?? 0.32,
      rechargeTime: s.boostCooldown ?? 4,
    };
    if (
      this.spectator ||
      s.phase !== "playing" ||
      p.inputSeq === undefined ||
      (now - latest.at > 500 && !s.collisionRadius) ||
      (p.stun > 0 && p.kx === undefined && p.ky === undefined)
    )
      return result;
    if (p.stun > 0) {
      // A stun blocks controls, not the server-owned impulse; extrapolate at most 250ms.
      integrate(
        result,
        Math.min(0.25, Math.max(0, (now - latest.at) / 1000)),
        s.radius,
        s.collisionRadius ?? 0,
        s.baseSpeed ?? 240,
        s.boostMultiplier ?? 3,
      );
      return result;
    }
    const ack = this.commands.find((c) => c.seq === p.inputSeq);
    // A held input's actual simulated duration defines the replay boundary. Packet count does not.
    let time = ack ? ack.at + (p.inputElapsed ?? 0) * 1000 : latest.at;
    time = Math.min(now, Math.max(latest.at - 250, time));
    const end = Math.min(now, time + 250);
    const pending = this.commands.filter((c) => c.seq > p.inputSeq!);
    let cursor = time;
    const advance = (end: number) => {
      while (cursor < end - 1e-6) {
        const dt = Math.min(50, end - cursor);
        const start = { ...result };
        integrate(
          result,
          dt / 1000,
          s.radius,
          s.collisionRadius ?? 0,
          s.baseSpeed ?? 240,
          s.boostMultiplier ?? 3,
        );
        if (s.collisionRadius) {
          const velocity = {
            x: result.x - start.x,
            y: result.y - start.y,
            angle: 0,
          };
          let stop = 1;
          for (const peer of s.players)
            if (peer.id !== result.id) {
              const t = contactTime(
                start,
                velocity,
                peer,
                { x: 0, y: 0, angle: 0 },
                2 * s.collisionRadius,
              );
              if (t !== undefined) stop = Math.min(stop, t);
            }
          result.x = start.x + velocity.x * stop;
          result.y = start.y + velocity.y * stop;
        }
        cursor += dt;
      }
    };
    for (const c of pending) {
      if (c.at > end) break;
      advance(Math.max(cursor, c.at));
      apply(result, c, s);
    }
    advance(
      Math.min(
        end,
        (pending[pending.length - 1]?.at ?? ack?.at ?? latest.at) + 300,
      ),
    );
    return result;
  }
  sample(now: number): Map<string, Pose> {
    const result = new Map<string, Pose>(),
      latest = this.snapshots[this.snapshots.length - 1];
    if (!latest) return result;
    const target = now - this.offset - 100;
    for (const p of latest.state.players) {
      if (p.id === this.self && !this.spectator) {
        const v = this.predict(now) ?? p,
          t = Math.max(0, 1 - (now - this.correction.at) / 80);
        result.set(p.id, {
          x: v.x + this.correction.x * t,
          y: v.y + this.correction.y * t,
          angle: v.angle + this.correction.angle * t,
        });
        continue;
      }
      let a = this.snapshots[0],
        b = a;
      for (const entry of this.snapshots) {
        if ((entry.state.serverTime ?? entry.at / 1000) * 1000 <= target)
          a = entry;
        else {
          b = entry;
          break;
        }
        b = entry;
      }
      const pa = a.state.players.find((q) => q.id === p.id) ?? p,
        pb = b.state.players.find((q) => q.id === p.id) ?? p;
      const ta = (a.state.serverTime ?? a.at / 1000) * 1000,
        tb = (b.state.serverTime ?? b.at / 1000) * 1000;
      result.set(
        p.id,
        mix(
          pa,
          pb,
          tb > ta ? Math.max(0, Math.min(1, (target - ta) / (tb - ta))) : 0,
        ),
      );
    }
    if (latest.state.collisionRadius) {
      const starts =
        this.displayed.size && now >= this.displayedAt
          ? this.displayed
          : new Map(
              latest.state.players.map((p) => [
                p.id,
                { x: p.x, y: p.y, angle: p.angle },
              ]),
            );
      constrain(
        result,
        starts,
        latest.state.collisionRadius,
        latest.state.radius,
      );
      if (now >= this.displayedAt) {
        this.displayed = new Map([...result].map(([id, p]) => [id, { ...p }]));
        this.displayedAt = now;
      }
    }
    return result;
  }
}
