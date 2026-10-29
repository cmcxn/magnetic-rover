import type { FloatingJoystick, Player, State } from "./types";
/** Shared device-space controls. Safe insets are supplied by the host platform. */
export function controlLayout(
  width: number,
  height: number,
  left = 12,
  right = 12,
) {
  const r = Math.min(68, Math.max(38, Math.min(width, height) * 0.15));
  const y = height - r - 20;
  return {
    joystick: { x: Math.max(18, left) + r + 8, y, r },
    boost: { x: width - Math.max(18, right) - r - 8, y, r },
  };
}
export function joystickPose(
  joystick: FloatingJoystick,
  layout: ReturnType<typeof controlLayout>,
) {
  const active = joystick.owner !== null;
  return {
    ...layout.joystick,
    ...(active ? joystick.origin : {}),
    active,
    dx: joystick.value.x * 38,
    dy: joystick.value.y * 38,
  };
}
/** Visual timer only. An expired estimate cannot grant a server-owned ability. */
export function skillView(
  player:
    | Pick<Player, "cooldown" | "stun" | "boost" | "energy" | "boostHeld">
    | undefined,
  ageMs: number,
  tuning?: { boostCooldown?: number; boostDuration?: number },
) {
  if (player?.energy !== undefined) {
    const age = ageMs <= 500 ? Math.max(0, ageMs) / 1000 : 0;
    const duration = tuning?.boostDuration ?? 0.32,
      recharge = tuning?.boostCooldown ?? 4;
    const boosting = player.boost > 0 && player.stun <= 0;
    const energy = Math.max(
      0,
      Math.min(
        1,
        player.energy +
          (boosting ? -age / duration : player.boostHeld ? 0 : age / recharge),
      ),
    );
    const blocked = player.stun > 0;
    return {
      ready: !blocked && energy > 0.001,
      boosting,
      energy,
      progress: energy,
      seconds: blocked
        ? Math.max(0.1, player.stun - age)
        : boosting
          ? energy * duration
          : (1 - energy) * recharge,
      label: blocked
        ? "眩晕"
        : player.boostHeld && energy <= 0.001
          ? "松开充能"
          : energy < 1
            ? "充能"
            : "冲刺",
    };
  }
  const age = ageMs <= 500 ? Math.max(0, ageMs) / 1000 : 0;
  const blocked = (player?.stun ?? 0) > 0;
  const cooling = (player?.cooldown ?? 0) > 0;
  const boostLeft = Math.max(0, (player?.boost ?? 0) - age);
  const boosting = boostLeft > 0 && !blocked;
  const seconds = blocked
    ? Math.max(0.1, player!.stun - age)
    : boosting
      ? boostLeft
      : cooling
        ? Math.max(0.1, player!.cooldown - age)
        : 0;
  return {
    ready: !!player && !blocked && !cooling && !boosting,
    boosting,
    energy: blocked
      ? 0
      : boosting
        ? Math.min(1, boostLeft / (tuning?.boostDuration ?? 0.32))
        : cooling
          ? Math.min(1, Math.max(0, 1 - seconds / (tuning?.boostCooldown ?? 4)))
          : 1,
    seconds,
    progress: cooling
      ? Math.min(
          1,
          Math.max(
            0,
            1 -
              Math.max(0, (player?.cooldown ?? 0) - age) /
                (tuning?.boostCooldown ?? 4),
          ),
        )
      : blocked
        ? 0
        : 1,
    label: blocked ? "眩晕" : cooling ? "充能" : "冲刺",
  };
}
export function clockText(seconds: number) {
  const n = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(n / 60)
    .toString()
    .padStart(2, "0")}:${(n % 60).toString().padStart(2, "0")}`;
}
export const UI = {
  ink: 0x203a55,
  cream: 0xfff2d9,
  navy: 0x19334c,
  cyan: 0x06c8ed,
  gold: 0xffd44e,
  muted: 0x6b7e89,
};
/** One clipped polygon, shared by SVG and Canvas2D. Never a per-pixel water fill. */
export function orbLiquid(
  cx: number,
  cy: number,
  r: number,
  energy: number,
  time: number,
) {
  const e = Math.max(0, Math.min(1, Number.isFinite(energy) ? energy : 0));
  if (!e || r <= 0) return [];
  if (e === 1)
    return Array.from({ length: 32 }, (_, i) => ({
      x: cx + Math.cos((i * Math.PI) / 16) * r,
      y: cy + Math.sin((i * Math.PI) / 16) * r,
    }));
  const a = Math.asin(1 - 2 * e),
    waterY = cy + r * (1 - 2 * e),
    half = Math.cos(a) * r;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12,
      dx = -half + 2 * half * t,
      limit = Math.sqrt(Math.max(0, r * r - dx * dx));
    const wave =
      Math.sin(time * 0.006 + t * Math.PI * 2) *
      Math.sin(t * Math.PI) *
      Math.min(3, r * 0.06);
    points.push({
      x: cx + dx,
      y: Math.max(cy - limit, Math.min(cy + limit, waterY + wave)),
    });
  }
  for (let i = 1; i <= 24; i++) {
    const angle = a + ((Math.PI - 2 * a) * i) / 24;
    points.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
  }
  return points;
}

export function latencyView(rtt: number | null, timedOut = false) {
  const level = timedOut
    ? "bad"
    : rtt === null || !Number.isFinite(rtt) || rtt < 0
      ? "unknown"
      : rtt <= 100
        ? "good"
        : rtt <= 200
          ? "warn"
          : "bad";
  const color = {
    good: "#40e396",
    warn: "#ffd153",
    bad: "#ff3f4f",
    unknown: "#d1dce2",
  }[level];
  return { level, color };
}
export function compactHudLayout(
  w: number,
  h: number,
  left = 12,
  right = 12,
  top = 8,
  capsuleBottom = 0,
) {
  const panelW = Math.min(288, Math.max(228, w * 0.33)),
    y = Math.max(8, top);
  return {
    timer: { x: w / 2 - 48, y, w: 96, h: 36 },
    map: { x: left + 36, y: y + 36, r: 36 },
    panel: {
      x: w - right - panelW,
      y: Math.max(
        y,
        w < 580 ? y + 64 : y,
        capsuleBottom ? capsuleBottom + 6 : 0,
      ),
      w: panelW,
      h: 76,
    },
  };
}

/** Capabilities are room-wide; never expose player actions to a spectator. */
export function botLobbyView(
  state: Pick<
    State,
    "phase" | "players" | "canAddBot" | "canRemoveBot" | "botCount"
  >,
  self: string,
  spectator: boolean,
) {
  const eligible =
    state.phase === "lobby" &&
    !spectator &&
    state.players.some((p) => p.id === self && p.connected && !p.isBot);
  const action =
    eligible && state.canAddBot
      ? "add_bot"
      : eligible && state.canRemoveBot
        ? "remove_bot"
        : null;
  return {
    action,
    startDisabled: spectator || (state.players.length < 2 && !!state.canAddBot),
    hasBot: (state.botCount ?? 0) > 0,
  };
}
