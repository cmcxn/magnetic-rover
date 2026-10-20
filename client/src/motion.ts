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
/** Kinematics only. Collection, deposits, collisions and score remain authoritative. */
export function integrate(p: Player, dt: number, radius: number) {
  p.stun = Math.max(0, p.stun - dt);
  p.cooldown = Math.max(0, p.cooldown - dt);
  if (p.stun > 0 || !p.connected) {
    p.ix = p.iy = 0;
    p.boost = 0;
    return;
  }
  const ix = p.ix ?? 0,
    iy = p.iy ?? 0;
  const bx = p.boost > 0 ? (p.bx ?? Math.cos(p.angle)) : ix;
  const by = p.boost > 0 ? (p.by ?? Math.sin(p.angle)) : iy;
  const dash = Math.min(dt, p.boost),
    speed = 240 * (1 - (0.2 * p.cargo) / 20);
  p.x += speed * (bx * 3 * dash + ix * (dt - dash));
  p.y += speed * (by * 3 * dash + iy * (dt - dash));
  const d = Math.hypot(p.x, p.y);
  if (d > radius) {
    p.x *= radius / d;
    p.y *= radius / d;
  }
  if (bx !== 0 || by !== 0) p.angle = Math.atan2(by, bx);
  p.boost = Math.max(0, p.boost - dt);
}
function apply(p: Player, c: Control) {
  if (p.stun > 0) return;
  const n = Math.hypot(c.x, c.y),
    scale = Math.max(1, n);
  p.ix = c.x / scale;
  p.iy = c.y / scale;
  if (c.boost && p.cooldown <= 0) {
    if (n >= 0.1) p.angle = Math.atan2(c.y, c.x);
    p.bx = Math.cos(p.angle);
    p.by = Math.sin(p.angle);
    p.boost = 0.32;
    p.cooldown = 4;
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
  private correction = { x: 0, y: 0, angle: 0, at: 0 };
  get pendingCount() {
    return this.commands.length;
  }
  reset() {
    this.commands = [];
    this.snapshots = [];
    this.key = "";
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
    if (changed) this.reset();
    this.key = key;
    this.self = self;
    this.spectator = spectator;
    const stamp = (state.serverTime ?? now / 1000) * 1000;
    // Earliest observed delivery offset avoids adding a late packet's jitter to the clock.
    this.offset = changed ? now - stamp : Math.min(this.offset, now - stamp);
    this.snapshots.push({ state, at: now });
    if (this.snapshots.length > 32) this.snapshots.shift();
    const p = state.players.find((p) => p.id === self);
    const hit =
      p &&
      oldPlayer &&
      (p.hitSeq !== oldPlayer.hitSeq || p.stun > oldPlayer.stun);
    if (hit || !p?.connected) this.commands = [];
    else if (p.inputSeq !== undefined)
      this.commands = this.commands.filter((c) => c.seq >= p.inputSeq!);
    this.correction = { x: 0, y: 0, angle: 0, at: now };
    const after = this.predict(now);
    if (!changed && !hit && before && after) {
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
    const result = { ...p };
    if (
      this.spectator ||
      s.phase !== "playing" ||
      p.inputSeq === undefined ||
      now - latest.at > 500 ||
      p.stun > 0
    )
      return result;
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
        integrate(result, dt / 1000, s.radius);
        cursor += dt;
      }
    };
    for (const c of pending) {
      if (c.at > end) break;
      advance(Math.max(cursor, c.at));
      apply(result, c);
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
    return result;
  }
}
