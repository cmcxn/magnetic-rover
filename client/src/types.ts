export const GAME_NAME = "真的好好玩的游戏";
export interface Player {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  angle: number;
  cargo: number;
  score: number;
  cooldown: number;
  boost: number;
  stun: number;
  hitSeq: number;
  impactSeq?: number;
  kx?: number;
  ky?: number;
  pickupSeq: number;
  connected: boolean;
  ready?: boolean;
  inputSeq?: number;
  inputElapsed?: number;
  ix?: number;
  iy?: number;
  bx?: number;
  by?: number;
}
export interface State {
  type: "state";
  serverTime?: number;
  roundId?: number;
  roomId?: string;
  roomCode?: string;
  canStart?: boolean;
  readyCount?: number;
  playerCount?: number;
  spectatorCount?: number;
  phase: "lobby" | "playing" | "finished";
  remaining: number;
  returnIn?: number;
  players: Player[];
  batteries: {
    id: string;
    x: number;
    y: number;
    z?: number;
    vx?: number;
    vy?: number;
    source?: string;
    unlock?: number;
  }[];
  stations: { x: number; y: number; r: number }[];
  radius: number;
  baseSpeed?: number;
  pickupRadius?: number;
  collisionRadius?: number;
  supply?: {
    stage: number;
    outerRadius: number;
    nextOuterRadius?: number;
    secondsToShrink?: number;
    banking: boolean;
  };
  results?: { id: string; name: string; color: string; score: number }[];
}
export const COLORS = [
  "#38bdf8",
  "#fb7185",
  "#a78bfa",
  "#facc15",
  "#34d399",
  "#fb923c",
  "#e879f9",
  "#cbd5e1",
];
export function escape(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function normalize(x: number, y: number) {
  const l = Math.hypot(x, y);
  return l > 1 ? { x: x / l, y: y / l } : { x, y };
}
export function canonicalServerUrl(raw: string, securePage = false) {
  const u = new URL(raw);
  if (
    !["ws:", "wss:"].includes(u.protocol) ||
    u.hash ||
    u.username ||
    u.password
  )
    throw new Error("请输入不含账号、密码或 # 片段的 ws:// 或 wss:// 地址。");
  if (securePage && u.protocol === "ws:")
    throw new Error("HTTPS 页面需要 wss:// 安全连接。");
  return u.href;
}
export function tokenStorageKey(raw: string) {
  return "rover.token:" + canonicalServerUrl(raw);
}
export function sharedRank(items: { score: number }[], score: number) {
  return items.findIndex((p) => p.score === score) + 1;
}
/** Device-aware camera policy: narrow/coarse/short landscape devices track the rover. */
export function cameraPolicy(
  width: number,
  height: number,
  coarsePointer = false,
) {
  const follows =
    coarsePointer ||
    width < 700 ||
    (Math.min(width, height) < 520 && Math.max(width, height) < 1100);
  return {
    follows,
    scale: follows
      ? Math.min(width / 620, height / 460)
      : Math.min(width / 1160, height / 1160),
  };
}

/** A touch owns its neutral origin until release or cancellation. */
export class FloatingJoystick {
  owner: number | null = null;
  origin = { x: 0, y: 0 };
  value = { x: 0, y: 0 };
  start(id: number, x: number, y: number) {
    if (this.owner !== null) return false;
    this.owner = id;
    this.origin = { x, y };
    this.value = { x: 0, y: 0 };
    return true;
  }
  move(id: number, x: number, y: number) {
    if (id !== this.owner) return;
    this.value = normalize((x - this.origin.x) / 38, (y - this.origin.y) / 38);
  }
  end(id: number) {
    if (id !== this.owner) return false;
    this.reset();
    return true;
  }
  reset() {
    this.owner = null;
    this.value = { x: 0, y: 0 };
  }
}

/** Missing/initial/reset snapshots establish a silent baseline, never a reward. */
export function pickupCount(prev: State | null, next: State, id: string) {
  if (prev?.phase !== "playing" || next.phase !== "playing") return 0;
  const a = prev.players.find((p) => p.id === id)?.pickupSeq;
  const b = next.players.find((p) => p.id === id)?.pickupSeq;
  return Number.isSafeInteger(a) &&
    Number.isSafeInteger(b) &&
    a! >= 0 &&
    b! > a!
    ? b! - a!
    : 0;
}

export type RoomRole = "directory" | "player" | "spectator";
export interface RoomSummary {
  roomId: string;
  roomCode: string;
  phase: State["phase"];
  remaining: number;
  playerCount: number;
  readyCount: number;
  spectatorCount: number;
  maxPlayers: number;
  maxSpectators: number;
  canJoin: boolean;
  canSpectate: boolean;
}
export function roomRenderKey(
  roomId: string | null,
  role: RoomRole,
  phase: string,
) {
  return `${roomId ?? "directory"}:${role}:${phase}`;
}
