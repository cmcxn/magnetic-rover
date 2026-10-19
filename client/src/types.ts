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
  connected: boolean;
}
export interface State {
  type: "state";
  phase: "lobby" | "playing" | "finished";
  remaining: number;
  returnIn?: number;
  players: Player[];
  batteries: { id: string; x: number; y: number }[];
  stations: { x: number; y: number; r: number }[];
  radius: number;
  results?: { id: string; name: string; color: string; score: number }[];
}
export const COLORS = [
  "#38bdf8",
  "#fb7185",
  "#a78bfa",
  "#facc15",
  "#34d399",
  "#fb923c",
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
