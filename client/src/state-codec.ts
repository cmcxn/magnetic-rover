import type { State } from "./types";
import { WIRE_GROUPS, WIRE_SCALES, type DecodeResult } from "./wire-types.ts";
type Obj = Record<string, any>;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const object = (x: any): x is Obj =>
  !!x && typeof x === "object" && !Array.isArray(x);
const integer = (x: any) => Number.isSafeInteger(x) && x >= 0;
function checked(value: any, depth = 0): void {
  if (depth > 32) throw Error("too deep");
  if (
    typeof value === "number" &&
    (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)
  )
    throw Error("invalid number");
  if (object(value) || Array.isArray(value))
    for (const [k, v] of Object.entries(value)) {
      if (["__proto__", "constructor", "prototype"].includes(k))
        throw Error("unsafe key");
      checked(v, depth + 1);
    }
}
function units(value: any, scales: Obj): any {
  if (Array.isArray(value)) return value.map((v) => units(v, scales));
  if (!object(value)) return value;
  const result: Obj = {};
  for (const [k, v] of Object.entries(value)) {
    const scale = scales[WIRE_GROUPS[k]];
    if (scale && typeof v === "number") {
      if (scale !== 1 && !Number.isSafeInteger(v))
        throw Error("noninteger fixed point");
      result[k] = v / scale;
    } else result[k] = units(v, scales);
  }
  return result;
}
function entities(list: any): Obj[] {
  if (!Array.isArray(list)) throw Error("missing entity array");
  const ids = new Set();
  for (const e of list) {
    if (!object(e) || typeof e.id !== "string" || ids.has(e.id))
      throw Error("invalid/duplicate id");
    ids.add(e.id);
  }
  return list;
}
function metadata(m: any): Obj {
  if (
    !object(m) ||
    !object(m.config) ||
    !object(m.profiles) ||
    !object(m.scales)
  )
    throw Error("missing metadata");
  const expected = WIRE_SCALES[m.profile];
  if (
    !expected ||
    Object.keys(m.scales).length !== Object.keys(expected).length
  )
    throw Error("unknown scales");
  for (const [key, value] of Object.entries(expected))
    if (m.scales[key] !== value) throw Error("scale conflict");
  if (
    !Array.isArray(m.config.stations) ||
    !(typeof m.config.radius === "number" && m.config.radius > 0)
  )
    throw Error("invalid config");
  for (const station of m.config.stations)
    if (
      !object(station) ||
      !["x", "y", "r"].every((k) => typeof station[k] === "number") ||
      station.r <= 0
    )
      throw Error("invalid station");
  for (const p of Object.values(m.profiles) as Obj[])
    if (!object(p) || typeof p.name !== "string" || typeof p.color !== "string")
      throw Error("invalid profile");
  return clone(m);
}
export class StateDecoder {
  private room?: string;
  private epoch?: string;
  private seq = -1;
  private version = -1;
  private meta?: Obj;
  private current?: State;
  private recovering = false;
  private retired = new Set<string>();
  reset(roomId?: string) {
    this.room = roomId;
    this.epoch = undefined;
    this.seq = -1;
    this.version = -1;
    this.meta = undefined;
    this.current = undefined;
    this.recovering = false;
    this.retired.clear();
  }
  apply(input: any): DecodeResult {
    try {
      checked(input);
      if (!object(input)) throw Error("invalid packet");
      const m = input;
      if (
        m.v !== 2 ||
        !["state_full", "state_delta", "state_heartbeat"].includes(m.type)
      )
        throw Error("unknown wire version");
      if (typeof m.roomId !== "string" || m.roomId !== this.room)
        return { status: "ignored" };
      if (
        typeof m.epoch !== "string" ||
        !m.epoch ||
        !integer(m.seq) ||
        !integer(m.roundId) ||
        !integer(m.metadataVer)
      )
        throw Error("invalid header");
      const full = m.type === "state_full",
        same = m.epoch === this.epoch;
      if (same && this.current && m.roundId !== this.current.roundId)
        throw Error("round changed without epoch");
      if (full && same && m.metadataVer < this.version)
        throw Error("metadata rewind");
      if (this.retired.has(m.epoch)) return { status: "ignored" };
      if (
        same &&
        m.seq <= this.seq &&
        !(full && this.recovering && m.seq === this.seq)
      )
        return { status: "ignored" };
      if (
        !full &&
        (!same ||
          !this.current ||
          this.recovering ||
          m.baseSeq !== this.seq ||
          m.seq !== this.seq + 1)
      )
        throw Error("missing baseline");
      if (
        full &&
        ![
          "bootstrap",
          "reconnect",
          "resync",
          "keyframe",
          "phase_change",
          "phase_reset",
        ].includes(m.cause)
      )
        throw Error("invalid full cause");
      if (
        !full &&
        m.metadataVer !== this.version &&
        (!m.metadata || m.metadataVer !== this.version + 1)
      )
        throw Error("missing metadata version");
      if (
        m.type === "state_heartbeat" &&
        (m.metadataVer !== this.version || this.current?.phase === "playing")
      )
        throw Error("invalid heartbeat");
      if (full && !m.metadata) throw Error("full must be self-contained");
      const meta = m.metadata ? metadata(m.metadata) : this.meta;
      if (!meta) throw Error("missing metadata");
      if (
        !full &&
        m.metadata &&
        m.metadataVer === this.version &&
        JSON.stringify(meta) !== JSON.stringify(this.meta)
      )
        throw Error("metadata conflict");
      let next: State;
      if (m.type === "state_heartbeat") {
        if (
          !object(m.clock) ||
          typeof m.clock.serverTime !== "number" ||
          typeof m.clock.remaining !== "number"
        )
          throw Error("missing clock");
        if (
          m.clock.returnIn !== undefined &&
          typeof m.clock.returnIn !== "number"
        )
          throw Error("invalid return clock");
        if (
          Object.keys(m.clock).some(
            (k) => !["serverTime", "remaining", "returnIn"].includes(k),
          )
        )
          throw Error("invalid heartbeat fields");
        next = clone(this.current!);
        delete next.returnIn;
        Object.assign(next, units(m.clock, meta.scales));
      } else {
        if (
          !object(m.frame) ||
          !["lobby", "playing", "finished"].includes(m.frame.phase) ||
          typeof m.frame.remaining !== "number" ||
          typeof m.frame.serverTime !== "number"
        )
          throw Error("invalid frame");
        if (m.frame.remaining < 0) throw Error("negative remaining");
        for (const k of ["canStart", "canAddBot", "canRemoveBot"])
          if (m.frame[k] !== undefined && typeof m.frame[k] !== "boolean")
            throw Error("invalid frame flag");
        for (const k of [
          "playerCount",
          "readyCount",
          "spectatorCount",
          "humanCount",
          "botCount",
        ])
          if (m.frame[k] !== undefined && !integer(m.frame[k]))
            throw Error("invalid frame count");
        if (m.frame.supply !== undefined) {
          const supply = m.frame.supply;
          if (
            !object(supply) ||
            !integer(supply.stage) ||
            typeof supply.outerRadius !== "number" ||
            typeof supply.banking !== "boolean"
          )
            throw Error("invalid supply");
        }
        if (m.frame.results !== undefined)
          for (const r of entities(m.frame.results))
            if (
              !integer(r.score) ||
              typeof r.name !== "string" ||
              typeof r.color !== "string"
            )
              throw Error("invalid result");
        const players = entities(m.players).map((p) => {
          const profile = meta.profiles[p.id];
          if (!profile) throw Error("missing player profile");
          for (const k of [
            "x",
            "y",
            "angle",
            "cargo",
            "score",
            "cooldown",
            "boost",
            "stun",
            "hitSeq",
            "pickupSeq",
          ])
            if (typeof p[k] !== "number")
              throw Error("missing player field " + k);
          for (const k of [
            "cargo",
            "score",
            "hitSeq",
            "pickupSeq",
            "inputSeq",
            "impactSeq",
          ])
            if (p[k] !== undefined && !integer(p[k]))
              throw Error("invalid counter");
          for (const k of [
            "energy",
            "inputElapsed",
            "ix",
            "iy",
            "bx",
            "by",
            "kx",
            "ky",
            "readyIn",
          ])
            if (p[k] !== undefined && typeof p[k] !== "number")
              throw Error("invalid player number");
          for (const k of ["ready", "boostHeld"])
            if (p[k] !== undefined && typeof p[k] !== "boolean")
              throw Error("invalid player flag");
          if (typeof p.connected !== "boolean")
            throw Error("invalid connected");
          return {
            ...units(p, {
              ...meta.scales,
              position: meta.scales.playerPosition,
            }),
            ...clone(profile),
          };
        });
        let batteries: Obj[];
        if (full) batteries = entities(m.batteries);
        else {
          const upserts = entities(m.batteryUpserts),
            removed = m.batteryRemoves;
          if (
            !Array.isArray(removed) ||
            removed.some((id) => typeof id !== "string") ||
            new Set(removed).size !== removed.length
          )
            throw Error("invalid removes");
          const ids = new Set(upserts.map((b) => b.id));
          if (removed.some((id) => ids.has(id)))
            throw Error("overlapping battery changes");
          // Existing values are already decoded; assemble absolute records separately.
          const map = new Map(
            this.current!.batteries.map((b) => [b.id, clone(b)]),
          );
          for (const id of removed) map.delete(id);
          for (const b of upserts) {
            if (typeof b.x !== "number" || typeof b.y !== "number")
              throw Error("invalid battery");
            map.set(b.id, units(b, meta.scales));
          }
          batteries = Array.from(map.values());
        }
        if (full) {
          for (const b of batteries)
            if (typeof b.x !== "number" || typeof b.y !== "number")
              throw Error("invalid battery");
          batteries = batteries.map((b) => units(b, meta.scales));
        }
        next = {
          ...clone(meta.config),
          ...units(m.frame, meta.scales),
          type: "state",
          roomId: m.roomId,
          roundId: m.roundId,
          players,
          batteries,
        } as State;
        // Results are unquantized phase metadata, not dynamic player tuples.
        if (m.frame.results) next.results = clone(m.frame.results);
      }
      const mode =
        !same && this.epoch
          ? "phase_reset"
          : same &&
              !this.recovering &&
              m.seq === this.seq + 1 &&
              (!full || ["keyframe", "phase_change"].includes(m.cause))
            ? "continuous"
            : "recover";
      if (!same && this.epoch) this.retired.add(this.epoch);
      this.current = next;
      this.meta = meta;
      this.seq = m.seq;
      this.version = m.metadataVer;
      this.epoch = m.epoch;
      this.recovering = false;
      return { status: "applied", state: next, mode };
    } catch (e) {
      this.recovering = true;
      return { status: "need_full", reason: String(e) };
    }
  }
}
