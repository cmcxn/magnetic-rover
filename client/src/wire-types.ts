import type { State } from "./types";
export type DecodeResult =
  | {
      status: "applied";
      state: State;
      mode: "continuous" | "recover" | "phase_reset";
    }
  | { status: "ignored" }
  | { status: "need_full"; reason: string };
export const WIRE_VERSION = 2;
export const WIRE_GROUPS: Record<string, string> = {
  x: "position",
  y: "position",
  z: "position",
  angle: "angle",
  kx: "velocity",
  ky: "velocity",
  vx: "velocity",
  vy: "velocity",
  ix: "direction",
  iy: "direction",
  bx: "direction",
  by: "direction",
  energy: "energy",
  serverTime: "clock",
  remaining: "time",
  returnIn: "time",
  secondsToShrink: "time",
  cooldown: "time",
  boost: "time",
  stun: "time",
  inputElapsed: "inputTime",
  unlock: "time",
};
export const WIRE_SCALES: Record<string, Record<string, number>> = {
  fine: {
    clock: 1,
    inputTime: 1,
    playerPosition: 100,
    position: 100,
    angle: 10000,
    velocity: 100,
    direction: 10000,
    energy: 10000,
    time: 1000,
  },
  conservative: {
    clock: 1,
    inputTime: 1,
    playerPosition: 10,
    position: 10,
    angle: 1000,
    velocity: 1,
    direction: 1,
    energy: 1,
    time: 1,
  },
};
