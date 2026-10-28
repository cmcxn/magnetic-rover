import { Sounds } from "./audio";
const sounds = new Sounds();
import Phaser from "phaser";
import "./style.css";
import "./cartoon.css";
import {
  controlLayout,
  joystickPose,
  skillView,
  orbLiquid,
} from "./presentation";
import { World } from "./world";
import { FrameMetrics, type FrameSample } from "./performance";
import {
  FloatingJoystick,
  pickupCount,
  COLORS,
  escape,
  normalize,
  canonicalServerUrl,
  tokenStorageKey,
  sharedRank,
  type State,
  type RoomSummary,
  type RoomRole,
  roomRenderKey,
} from "./types";
const world = new World();
const motionPreference = window.matchMedia?.(
  "(prefers-reduced-motion: reduce)",
);
let reducedEffects =
  localStorage.getItem("rover.reducedEffects") === "on" ||
  (localStorage.getItem("rover.reducedEffects") === null &&
    !!motionPreference?.matches);
world.reducedEffects = reducedEffects;
motionPreference?.addEventListener?.("change", (e) => {
  if (localStorage.getItem("rover.reducedEffects") !== null) return;
  reducedEffects = e.matches;
  world.reducedEffects = reducedEffects;
  const button = document.querySelector("#effects");
  if (button) button.textContent = `减少特效：${reducedEffects ? "开" : "关"}`;
});
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#86bed6",
  antialias: true,
  scale: { mode: Phaser.Scale.RESIZE, width: innerWidth, height: innerHeight },
  scene: [world],
});
const app = document.querySelector<HTMLDivElement>("#app")!;
let state: State | null = null,
  id = "",
  ws: WebSocket | null = null,
  connected = false,
  joined = false,
  waiting = false,
  phase = "",
  color = COLORS.includes(localStorage.getItem("rover.color") || "")
    ? localStorage.getItem("rover.color")!
    : COLORS[0],
  error = "",
  mouseMode = false,
  boost = false,
  seq = 0,
  joy = { x: 0, y: 0 },
  mouse = { x: 0, y: 0 },
  mouseDown = false,
  lastState = 0;
let role: RoomRole = "directory",
  roomId: string | null = null;
let leavingRoom = false;
let leaveTimer: ReturnType<typeof setTimeout> | undefined;
let directorySignature = "";
let renderKey = "",
  rooms: RoomSummary[] = [];
const keys = new Set<string>();
const joystick = new FloatingJoystick();
let boostPointer: number | null = null;
const fieldTouches = new Set<number>();
let session: { name: string; url: string; color: string } | null = null;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryAttempt = 0,
  retryAllowed = false,
  connecting = false;
let pingId = 0,
  pendingPing: { id: number; sent: number } | null = null;
let lastSnapshot: number | null = null,
  snapshotInterval: number | null = null;
let nextPing = 0,
  lastPong = 0,
  rtt: number | null = null;
function latency(reason = "测量中") {
  document.querySelector("#latency")!.textContent =
    rtt === null ? `RTT：${reason}` : `RTT：${Math.round(rtt)} ms`;
}
function resetLatency(reason: string) {
  pendingPing = null;
  lastSnapshot = snapshotInterval = null;
  rtt = null;
  lastPong = 0;
  nextPing = 0;
  latency(reason);
}
function scheduleReconnect() {
  if (
    !retryAllowed ||
    document.hidden ||
    retryTimer !== undefined ||
    connecting
  )
    return;
  const delay = Math.min(10000, 1000 * 2 ** Math.min(retryAttempt++, 4));
  status("连接中断 · 自动重连中");
  retryTimer = setTimeout(() => {
    retryTimer = undefined;
    if (retryAllowed && !document.hidden && !connecting) connect(true);
  }, delay);
}
const query = new URLSearchParams(location.search);
const debug = query.get("debug") === "1";
world.diagnostics = debug;
const defaultUrl =
  query.get("ws") ||
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
app.innerHTML = `<div class="brand"><div class="brand-icon">ϟ</div><div><strong>磁力小车</strong><small>MAGNETIC ROVER CLUB</small></div></div><div class="connection pill"><span class="dot"></span><span id="status">尚未连接</span><div class="performance-line"><span id="fps" title="实际渲染循环帧率，约每秒测量一次；不是网络更新率">FPS：—</span><span id="latency" title="网络 RTT：WebSocket 应用层往返时间，不是帧率或快照间隔">RTT：未连接</span></div></div>${debug ? '<div id="diagnostics" class="diagnostics">FPS：— · 快照间隔：—</div>' : ""}<div id="surface"></div><div id="notice" class="toast hidden" role="status"></div>`;
const surface = document.querySelector<HTMLDivElement>("#surface")!;
const frameMetrics = new FrameMetrics();
const fpsElement = document.querySelector<HTMLElement>("#fps")!;
let frameSample: FrameSample | null = null;
// POST_RENDER fires after Phaser's renderer finishes submitting the frame.
// Use wall-clock intervals, never Phaser's smoothed/capped simulation delta.
game.events.on(Phaser.Core.Events.POST_RENDER, () => {
  if (document.hidden) return;
  const sample = frameMetrics.record(performance.now());
  if (!sample) return;
  frameSample = sample;
  fpsElement.textContent = `FPS：${Math.round(sample.fps)}`;
  fpsElement.title = `渲染帧间隔 P95：${sample.p95Ms.toFixed(1)} ms · P99：${sample.p99Ms.toFixed(1)} ms · 本次采样 >50 ms：${sample.longFrames} 帧 · 本页累计：${sample.totalLongFrames} 帧`;
});
function status(text: string) {
  document.querySelector("#status")!.textContent = text;
  document.querySelector(".dot")!.classList.toggle("online", connected);
}
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
function notice(text: string, duration = 3500) {
  const e = document.querySelector<HTMLDivElement>("#notice")!;
  e.textContent = text;
  e.classList.remove("hidden");
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => e.classList.add("hidden"), duration);
}
function canSendInput() {
  return (
    connected &&
    joined &&
    role === "player" &&
    phase === "playing" &&
    state?.phase === "playing" &&
    !leavingRoom
  );
}
function resetControls() {
  world.resetMotion();
  keys.clear();
  resetJoystick();
  mouseDown = false;
  boost = false;
}
function transmitLeave() {
  clearTimeout(leaveTimer);
  send({ type: "leave_room" });
  // A lost acknowledgement must not leave the controls disabled indefinitely.
  // Reconnect to learn membership, then retry if the server kept us in the room.
  leaveTimer = setTimeout(() => {
    leaveTimer = undefined;
    if (leavingRoom) ws?.close();
  }, 8000);
}
function leaveRoom() {
  if (!connected || !joined || role === "directory" || leavingRoom) return;
  leavingRoom = true;
  resetControls();
  transmitLeave();
}
function sendInput(input: { x: number; y: number; boost: boolean }) {
  if (!canSendInput()) return;
  send(world.inputCommand(input));
}
function send(data: object) {
  if ((data as { type?: string }).type === "input" && !canSendInput()) return;
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function showError(s: string) {
  const messages: Record<string, string> = {
    "Room not found": "没有找到这个房间，请检查房间码。",
    "Lobby full": "这个房间已满员，可以观战或创建新房间。",
    "Match in progress; wait for the next lobby":
      "比赛已经开始，可以先观战或另建房间。",
    "Nickname required": "请填写车手昵称。",
    "Invalid nickname": "昵称格式不正确，请换一个试试。",
    "Match not finished": "比赛尚未结束。",
    "Match already started": "比赛已经开始，可以先观战。",
    "Game already started": "比赛已经开始，可以先观战。",
    "Leave your current room first": "请先返回房间大厅，再选择其他房间。",
    "Spectator limit reached (16)": "观战席已满，请稍后再试。",
    "Room limit reached (32); join an existing room":
      "赛场已满，请加入现有房间。",
    "Not in lobby": "比赛已开始，准备状态暂时不能更改。",
    "Guest already connected; close the other tab first":
      "此车手已在另一个页面连接，请先关闭那个页面。",
  };
  s = messages[s] ?? s;
  error = s;
  const el = document.querySelector("#error");
  if (el) el.textContent = s;
  else notice(s);
}
function rememberProfile(profile: { name?: string; color?: string }) {
  if (profile.name) {
    localStorage.setItem("rover.name", profile.name);
    if (session) session.name = profile.name;
    const button = document.querySelector("#edit-name");
    if (button) button.textContent = `昵称：${profile.name} · 修改`;
  }
  if (profile.color && COLORS.includes(profile.color)) {
    color = profile.color;
    localStorage.setItem("rover.color", color);
    if (session) session.color = color;
  }
}
function renameDriver() {
  const value = window.prompt(
    "修改车手昵称（最多16字）",
    localStorage.getItem("rover.name") || "",
  );
  if (value === null) return;
  const name = [...value.trim()].slice(0, 16).join("");
  if (!name) {
    showError("先给你的小车起个昵称吧。");
    return;
  }
  send({ type: "set_name", name });
}
function connect(automatic = false) {
  void sounds.unlock().catch(() => {});
  const name =
    automatic && session
      ? session.name
      : (
          document.querySelector<HTMLInputElement>("#nickname")?.value ||
          localStorage.getItem("rover.name") ||
          ""
        ).trim();
  const url =
    automatic && session
      ? session.url
      : document.querySelector<HTMLInputElement>("#server")?.value ||
        localStorage.getItem("rover.server") ||
        defaultUrl;
  if (!name) {
    showError("先给你的小车起个昵称吧。");
    return;
  }
  try {
    canonicalServerUrl(url, location.protocol === "https:");
  } catch (e) {
    showError(e instanceof Error ? e.message : "服务器地址无效。");
    return;
  }
  localStorage.setItem("rover.name", name);
  localStorage.setItem("rover.color", color);
  localStorage.setItem("rover.server", url);
  if (!automatic) {
    session = { name, url: canonicalServerUrl(url), color };
    retryAttempt = 0;
  }
  retryAllowed = true;
  clearTimeout(retryTimer);
  retryTimer = undefined;
  connecting = true;
  clearTimeout(leaveTimer);
  leaveTimer = undefined;
  resetLatency("测量中");
  error = "";
  joined = false;
  waiting = false;
  connected = false;
  state = null;
  world.clearPickupFeedback();
  phase = "";
  keys.clear();
  resetJoystick();
  boost = false;
  mouseDown = false;
  world.resetMotion();
  status("正在连接");
  const old = ws;
  if (old) {
    old.onclose = null;
    old.close();
  }
  ws = null;
  try {
    ws = new WebSocket(canonicalServerUrl(url));
  } catch {
    showError("无法创建连接，请检查服务器地址或浏览器连接限制。");
    status("连接失败");
    connecting = false;
    scheduleReconnect();
    return;
  }
  const socket = ws;
  const tokenKey = tokenStorageKey(url);
  let received = false;
  const timeout = setTimeout(() => {
    if (!received && socket === ws) {
      showError("连接超时，请检查服务器地址并重试。");
      socket.close();
    }
  }, 8000);
  socket.onopen = () => {
    if (socket !== ws) return;
    connected = true;
    status("已连接");
    socket.send(
      JSON.stringify({
        type: "join",
        name,
        color: session!.color,
        token: localStorage.getItem(tokenKey) || undefined,
      }),
    );
  };
  socket.onmessage = (e) => {
    if (socket !== ws) return;
    let data;
    try {
      data = JSON.parse(e.data);
    } catch {
      return;
    }
    if (data.type === "pong") {
      const now = performance.now();
      if (
        !document.hidden &&
        (joined || waiting) &&
        pendingPing &&
        data.id === pendingPing.id
      ) {
        const elapsed = now - pendingPing.sent;
        pendingPing = null;
        if (elapsed >= 0 && elapsed < 5000) {
          rtt = elapsed;
          lastPong = now;
          latency();
        }
      }
      return;
    }
    if (data.type === "waiting") {
      received = true;
      clearTimeout(timeout);
      connecting = false;
      retryAttempt = 0;
      waiting = true;
      lastState = performance.now();
      showWaiting(data.availableIn);
      return;
    }
    if (data.type === "profile") {
      rememberProfile(data);
      return;
    }
    if (data.type === "welcome") {
      rememberProfile(data);
      clearTimeout(leaveTimer);
      leaveTimer = undefined;
      waiting = false;
      received = true;
      clearTimeout(timeout);
      connecting = false;
      retryAttempt = 0;
      lastState = performance.now();
      id = data.id;
      role = data.role ?? "player";
      roomId = data.roomId ?? null;
      state = world.state = null;
      world.clearPickupFeedback();
      world.smooth.clear();
      world.resetMotion();
      world.spectating = role === "spectator";
      world.follow = "";
      renderKey = "";
      keys.clear();
      resetJoystick();
      world.self = id;
      joined = true;
      localStorage.setItem(tokenKey, data.token);
      status(role === "spectator" ? "在线 · 观战中" : "在线 · 实时联机");
      if (role === "directory") {
        leavingRoom = false;
        showDirectory();
      } else if (leavingRoom) transmitLeave();
    }
    if (data.type === "rooms") {
      lastState = performance.now();
      rooms = data.rooms;
      if (role === "directory" && joined) showDirectory();
    }
    if (data.type === "error") {
      showError(data.message);
      if (leavingRoom && joined) {
        // Errors have no request IDs. Do not assume the old room is still ours:
        // resolve membership with a fresh handshake before enabling input again.
        leavingRoom = false;
        socket.close();
        return;
      }
      if (!joined) {
        // A resumed socket can reach the server before its predecessor closes.
        // Retry only this transient conflict, never take over another live tab.
        retryAllowed =
          automatic &&
          data.message === "Guest already connected; close the other tab first";
        socket.close();
      }
    }
    if (data.type === "state") {
      if (role === "directory" || (data.roomId && data.roomId !== roomId))
        return;
      // Keep HUD, effects and motion on the same authoritative timeline. Equal
      // ticks can carry roster changes and are intentionally still accepted.
      if (
        state &&
        ((data.roundId !== undefined &&
          state.roundId !== undefined &&
          data.roundId < state.roundId) ||
          (data.roundId === state.roundId &&
            data.serverTime !== undefined &&
            state.serverTime !== undefined &&
            data.serverTime < state.serverTime))
      )
        return;
      if (
        state?.phase === "playing" &&
        data.phase === "playing" &&
        state.supply &&
        data.supply &&
        data.supply.stage > state.supply.stage
      ) {
        notice(
          `补给区收缩至第 ${data.supply.stage}/4 阶段，外围补给已向中心集中`,
          2500,
        );
      }
      const previous = state?.players.find((p) => p.id === id);
      const current = (data as State).players.find((p) => p.id === id);
      if (
        state?.phase === "playing" &&
        data.phase === "playing" &&
        previous &&
        current
      ) {
        if (current.cooldown > previous.cooldown + 0.2) {
          world.boostFeedback();
          if (!reducedEffects) {
            try {
              navigator.vibrate?.(25);
            } catch {
              /* Optional browser capability. */
            }
          }
        }
        if (current.hitSeq > (previous.hitSeq ?? 0) && current.stun > 0)
          notice("碰撞！短暂眩晕", current.stun * 1000);
      }
      const collected = pickupCount(state, data, id);
      if (!document.hidden && collected > 0) world.pickupFeedback(collected);
      if (!document.hidden) sounds.update(state, data, id);
      state = data;
      lastState = performance.now();
      snapshotInterval =
        lastSnapshot === null ? null : lastState - lastSnapshot;
      lastSnapshot = lastState;
      world.state = state;
      world.liveEffects = true;
      render();
    }
  };
  socket.onerror = () => {
    if (socket === ws)
      showError("连不上游戏服务器。请确认服务已启动，地址正确。");
  };
  socket.onclose = () => {
    clearTimeout(timeout);
    if (socket !== ws) return;
    clearTimeout(leaveTimer);
    leaveTimer = undefined;
    world.resetMotion();
    world.liveEffects = false;
    world.clearPickupFeedback();
    connected = false;
    connecting = false;
    joined = false;
    resetLatency(document.hidden ? "后台" : "已断开");
    keys.clear();
    resetJoystick();
    mouseDown = false;
    boost = false;
    status("连接已断开");
    phase = "";
    showJoin(true);
    scheduleReconnect();
  };
}
function cancelConnection() {
  world.resetMotion();
  leavingRoom = false;
  clearTimeout(leaveTimer);
  leaveTimer = undefined;
  retryAllowed = false;
  clearTimeout(retryTimer);
  retryTimer = undefined;
  connecting = connected = joined = waiting = false;
  const old = ws;
  ws = null; // Invalidate every old handler before closing.
  old?.close();
  keys.clear();
  resetJoystick();
  mouseDown = boost = false;
  state = world.state = null;
  world.clearPickupFeedback();
  phase = "";
  error = "";
  resetLatency("未连接");
  status("已取消连接");
  showJoin();
}
function showWaiting(availableIn: unknown) {
  status("等待加入 · 将自动进入");
  if (phase !== "waiting") {
    phase = "waiting";
    app.className = "";
    surface.innerHTML = `<div class="center"><section class="card"><div class="eyebrow">NEXT RACE / 等待加入</div><h2>下一趟，等你一起出发。</h2><p id="wait-estimate" class="subtitle">预计加入时间：正在更新</p><p class="subtitle">已保留昵称和小车颜色。<br>有空位且返回大厅时，将自动加入。</p><button class="secondary" id="cancel-wait">取消等待</button></section></div>`;
    document.querySelector<HTMLButtonElement>("#cancel-wait")!.onclick =
      cancelConnection;
  }
  document.querySelector("#wait-estimate")!.textContent =
    typeof availableIn === "number" && Number.isFinite(availableIn)
      ? `预计约 ${Math.max(0, Math.ceil(availableIn))} 秒后可加入（以实际空位为准）`
      : "车位已满，预计加入时间暂无法确定。有空位后将自动加入。";
}
function showJoin(disconnected = false) {
  app.className = "";
  surface.innerHTML = `<div class="center"><section class="card driver-card"><header class="race-logo"><strong>磁力小车<span>ϟ</span></strong><h2>100秒抢运赛</h2></header><h1>出发，抢点电！</h1><p class="subtitle">捡起电池，送回薄荷回收站。<br>100 秒抢运赛，和 2–8 位朋友一起争夺榜首。</p><label class="field-label" for="nickname">你的车手昵称</label><input id="nickname" maxlength="16" autocomplete="nickname" placeholder="比如：薄荷闪电" value="${escape(localStorage.getItem("rover.name") || "")}"><span class="field-label">挑一辆喜欢的小车</span><div class="colors">${COLORS.map((c) => `<button class="color ${c === color ? "selected" : ""}" data-color="${c}" style="background:${c}" aria-label="选择${c}小车" aria-pressed="${c === color}"></button>`).join("")}</div><button class="primary" id="join">${disconnected ? "重新连接 →" : "驶入大厅 →"}</button>${disconnected && retryAllowed ? '<button class="secondary" id="cancel-connect">取消自动重连</button>' : ""}<div class="error" id="error" role="alert">${escape(disconnected ? error || "连接中断；本局身份已保留，重新连接可尝试回到比赛。" : error)}</div><details><summary>服务器设置</summary><input aria-label="WebSocket服务器地址" id="server" value="${escape(localStorage.getItem("rover.server") || defaultUrl)}"></details><div class="instructions"><div><b>01</b>沿途收集电池</div><div><b>02</b>冲刺撞击才掉电池</div><div><b>03</b>进站存入得分</div></div></section></div>`;
  const cancel = document.querySelector<HTMLButtonElement>("#cancel-connect");
  if (cancel) cancel.onclick = cancelConnection;
  document.querySelector("#join")!.addEventListener("click", () => connect());
  document.querySelector("#nickname")!.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") connect();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-color]").forEach(
    (b) =>
      (b.onclick = () => {
        color = b.dataset.color!;
        localStorage.setItem("rover.color", color);
        document.querySelectorAll("[data-color]").forEach((x) => {
          x.classList.toggle(
            "selected",
            (x as HTMLElement).dataset.color === color,
          );
          x.setAttribute(
            "aria-pressed",
            String((x as HTMLElement).dataset.color === color),
          );
        });
      }),
  );
}
function raceGuide() {
  return `<div class="race-guide"><div><b>ϟ</b><strong>收集能量</strong></div><span>›</span><div><b>❯❯</b><strong>冲刺撞抢</strong></div><span>›</span><div><b>♻</b><strong>回站存分</strong></div></div>`;
}
function showDirectory() {
  if (phase !== "directory") {
    phase = "directory";
    directorySignature = "";
    renderKey = "";
    app.className = "directory";
    surface.innerHTML = `<div class="center garage-center"><section class="card garage directory-card"><header class="race-logo"><strong>磁力小车<span>ϟ</span></strong><h1>100秒抢运赛</h1></header><div class="directory-heading"><div><h2>选择你的赛场</h2><p>2–8 人同场 · 全员准备即发车</p></div><button id="create-room" class="primary">＋ 创建房间</button></div><button id="edit-name" class="secondary profile-edit">昵称：${escape(localStorage.getItem("rover.name") || "车手")} · 修改</button><form id="join-code" class="join-code"><input id="room-input" maxlength="16" placeholder="输入朋友的房间码" aria-label="房间码"><button class="secondary" type="submit">加入</button></form><div id="room-list" class="room-list"></div><div class="error" id="error" role="alert"></div>${raceGuide()}</section></div>`;
    document.querySelector<HTMLButtonElement>("#edit-name")!.onclick =
      renameDriver;
    document.querySelector<HTMLButtonElement>("#create-room")!.onclick = () =>
      send({ type: "create_room" });
    document.querySelector<HTMLFormElement>("#join-code")!.onsubmit = (
      event,
    ) => {
      event.preventDefault();
      const code = document
        .querySelector<HTMLInputElement>("#room-input")!
        .value.trim();
      const room = rooms.find(
        (r) =>
          r.roomCode.toLowerCase() === code.toLowerCase() || r.roomId === code,
      );
      if (code) send({ type: "join_room", roomId: room?.roomId ?? code });
    };
  }
  const signature = JSON.stringify(
    rooms.map(({ remaining: _remaining, ...room }) => room),
  );
  if (directorySignature === signature) {
    document
      .querySelectorAll<HTMLElement>("[data-remaining]")
      .forEach((node) => {
        const room = rooms.find((r) => r.roomId === node.dataset.remaining);
        if (room)
          node.textContent = String(Math.max(0, Math.ceil(room.remaining)));
      });
    return;
  }
  directorySignature = signature;
  document.querySelector("#room-list")!.innerHTML = rooms.length
    ? rooms
        .map(
          (room) =>
            `<article class="room-tile"><div><strong>房间 ${escape(room.roomCode)}</strong><span>${room.phase === "lobby" ? "等待发车" : room.phase === "playing" ? `比赛中 · 剩余 <span class="remaining-seconds" data-remaining="${escape(room.roomId)}">${Math.ceil(room.remaining)}</span> 秒` : "本场结算"}</span><small>${room.playerCount} / 8 位车手 · ${room.readyCount} 已准备 · ${room.spectatorCount} 观战</small></div><div class="room-actions"><button class="primary" data-join="${escape(room.roomId)}" ${room.canJoin ? "" : "disabled"}>${room.playerCount >= 8 ? "已满员" : room.phase !== "lobby" ? "比赛中" : "加入"}</button><button class="secondary" data-watch="${escape(room.roomId)}" ${room.canSpectate ? "" : "disabled"}>观战</button></div></article>`,
        )
        .join("")
    : '<p class="empty-rooms">赛场还空着。创建房间，邀请朋友来一局！</p>';
  document
    .querySelectorAll<HTMLButtonElement>("[data-join]")
    .forEach(
      (b) =>
        (b.onclick = () => send({ type: "join_room", roomId: b.dataset.join })),
    );
  document
    .querySelectorAll<HTMLButtonElement>("[data-watch]")
    .forEach(
      (b) =>
        (b.onclick = () => send({ type: "spectate", roomId: b.dataset.watch })),
    );
}
function render() {
  if (!state || !joined) return;
  const nextKey = roomRenderKey(roomId, role, state.phase);
  if (renderKey !== nextKey) {
    renderKey = nextKey;
    phase = state.phase;
    app.className = phase;
    keys.clear();
    resetJoystick();
    mouseMode = false;
    mouseDown = false;
    boost = false;
    if (phase === "lobby")
      surface.innerHTML = `<div class="center garage-center"><section class="card garage"><header class="race-logo"><strong>磁力小车<span>ϟ</span></strong><h1>100秒抢运赛</h1></header><div class="room-code">房间码 <strong id="room-code"></strong><button id="copy-room" class="copy-room" aria-label="复制房间码">复制</button></div><div id="room-palette" class="room-palette" aria-label="房间车身颜色"></div><div id="roster" class="car-roster"></div><div id="slots" class="slots"></div><button id="start" class="primary race-start">❯❯ 开始比赛</button><p id="ready-hint" class="ready-hint"></p><div class="error" id="error" role="alert"></div>${raceGuide()}<button class="secondary leave-room">返回房间大厅</button></section></div>`;
    if (phase === "playing") {
      surface.innerHTML = `<div class="hud"><div class="stat"><small>积分</small><b id="score">0</b></div><div class="stat timer"><small id="supply-status">剩余时间</small><b id="timer">1:40</b></div><div class="stat"><small>载货</small><b id="cargo">0 / 20</b></div></div><div class="match-actions"><button class="secondary mobile-menu ranking-toggle" id="ranking-toggle" aria-controls="ranking" aria-expanded="false">排行</button><button class="secondary mobile-menu settings-toggle" id="settings-toggle" aria-controls="settings" aria-expanded="false">设置</button>${role !== "spectator" ? '<button class="secondary leave-room">返回大厅</button>' : ""}</div><aside class="leaderboard"><h3>已存排行</h3><div id="ranking"></div></aside><canvas class="minimap" id="map" width="200" height="200" aria-label="场地小地图"></canvas><div class="controls" id="settings"><button class="secondary" id="mouse">鼠标驾驶：关</button><button class="secondary" id="sound">声音：${sounds.enabled ? "开" : "关"}</button><button class="secondary" id="effects">减少特效：${reducedEffects ? "开" : "关"}</button></div><div id="stun-status" class="stun-status" role="status" aria-live="polite"></div><div class="joystick" id="joystick" aria-label="拖动摇杆驾驶"><div class="stick"></div></div><button class="boost" id="boost">冲 刺<span class="keyboard-hint">SPACE</span></button><div class="hint">收集 ⚡ → 驶入绿色回收站 → 存入积分</div>`;
      surface.insertAdjacentHTML(
        "beforeend",
        role === "spectator"
          ? '<div class="room-toolbar"><button class="secondary leave-room">返回大厅</button><label>观战视角 <select id="follow-player" aria-label="观战视角"><option value="">全场</option></select></label></div>'
          : "",
      );
      wireControls();
      drawJoystick();
      if (role === "spectator") {
        app.classList.add("spectating");
        document.querySelector<HTMLSelectElement>("#follow-player")!.onchange =
          (event) => {
            world.follow = (event.target as HTMLSelectElement).value;
          };
      } else notice("出发！把电池送到绿色回收站。");
    }
    if (phase === "finished") {
      surface.innerHTML = `<div class="center"><section class="card results-card"><div class="trophy" aria-hidden="true">🏆</div><header class="race-logo"><strong>本局<span>结算</span></strong></header><p class="subtitle" id="resultsubtitle"></p><div id="results"></div><p id="return-countdown" class="footer-note"></p>${role === "player" ? '<button id="again" class="primary">再来一局 →</button>' : ""}<button class="secondary leave-room">返回房间大厅</button><div class="error" id="error" role="alert"></div><p class="footer-note">同分共享名次 · 只有存入回收站的电池计分</p></section></div>`;
      document
        .querySelector("#again")
        ?.addEventListener("click", () => send({ type: "again" }));
    }
    document.querySelector("#start")?.addEventListener("click", () =>
      send({
        type: "ready",
        ready: !state?.players.find((p) => p.id === id)?.ready,
      }),
    );
    document
      .querySelectorAll<HTMLButtonElement>(".leave-room")
      .forEach((button) => (button.onclick = leaveRoom));
    const copy = document.querySelector<HTMLButtonElement>("#copy-room");
    if (copy)
      copy.onclick = async () => {
        const code = state?.roomCode ?? roomId ?? "";
        try {
          await navigator.clipboard.writeText(code);
          notice(`房间码 ${code} 已复制`);
        } catch {
          notice(`房间码：${code}，请手动复制`);
        }
      };
  }
  const me = state.players.find((p) => p.id === id);
  if (phase === "lobby") {
    document.querySelector("#room-code")!.textContent =
      state.roomCode ?? roomId ?? "";
    document.querySelector("#roster")!.innerHTML = state.players
      .map(
        (p) =>
          `<article class="car-card ${p.ready ? "is-ready" : ""}" style="--car-color:${COLORS.includes(p.color) ? p.color : COLORS[0]}"><div class="car-art" aria-hidden="true"><span class="toy-car"><i></i></span></div><strong>${p.id === id ? `<button class="driver-name" aria-label="修改车手昵称">${escape(p.name)} · 你 ✎</button>` : escape(p.name)}</strong><span class="ready-chip">${!p.connected ? "重连中" : p.ready ? "✓ 已准备" : "等待准备"}</span></article>`,
      )
      .join("");
    const rename = document.querySelector<HTMLButtonElement>(".driver-name");
    if (rename) rename.onclick = renameDriver;
    const palette = document.querySelector<HTMLDivElement>("#room-palette")!;
    palette.innerHTML = COLORS.map((c) => {
      const taken = state!.players.some((p) => p.id !== id && p.color === c);
      return `<button data-room-color="${c}" style="background:${c}" ${taken || role !== "player" ? "disabled" : ""} aria-label="${taken ? "已占用" : "选择颜色"} ${c}" aria-pressed="${me?.color === c}" title="${taken ? "已占用" : "选择颜色"}">${taken ? "×" : me?.color === c ? "✓" : ""}</button>`;
    }).join("");

    document
      .querySelectorAll<HTMLButtonElement>("[data-room-color]:not(:disabled)")
      .forEach(
        (b) =>
          (b.onclick = () =>
            send({ type: "set_color", color: b.dataset.roomColor })),
      );
    const n = state.players.length;
    document.querySelector("#slots")!.innerHTML =
      `<strong>${n}</strong> / 8 人`;
    const b = document.querySelector<HTMLButtonElement>("#start")!;
    b.disabled = role !== "player";
    b.textContent =
      role === "spectator"
        ? "观战中 · 等待发车"
        : me?.ready
          ? "✓ 已准备 · 点击取消"
          : "❯❯ 开始比赛";
    b.setAttribute("aria-pressed", String(!!me?.ready));
    document.querySelector("#ready-hint")!.textContent =
      `${state.readyCount ?? state.players.filter((p) => p.ready).length} 人已准备 · 至少 2 人，全部准备后自动发车`;
  }
  if (phase === "playing") {
    document.querySelector("#score")!.textContent = String(me?.score ?? 0);
    document.querySelector("#cargo")!.textContent =
      `${(me?.cargo ?? 0) >= 20 ? "满载 " : ""}${me?.cargo ?? 0} / 20`;
    const supply = state.supply;
    const supplyStatus = document.querySelector<HTMLElement>("#supply-status")!;
    supplyStatus.textContent = !supply
      ? "剩余时间"
      : supply.banking
        ? "停补给 · 快回收"
        : supply.secondsToShrink !== undefined
          ? `${supply.stage}/4区 · ${Math.ceil(supply.secondsToShrink)}秒缩`
          : "4/4区 · 中心争夺";
    supplyStatus.classList.toggle(
      "supply-warning",
      !!supply && (supply.banking || (supply.secondsToShrink ?? 99) <= 5),
    );
    const sec = Math.max(0, Math.ceil(state.remaining));
    document.querySelector("#timer")!.textContent =
      `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    document.querySelector(".timer")!.classList.toggle("urgent", sec <= 30);
    const sorted = [...state.players].sort((a, b) => b.score - a.score);
    document.querySelector("#ranking")!.innerHTML = sorted
      .map(
        (p, i) =>
          `<div class="rankrow ${p.id === id ? "me" : ""}"><span class="ranknum">${sharedRank(sorted, p.score)}</span><span class="swatch" style="background:${COLORS.includes(p.color) ? p.color : COLORS[0]}"></span><span class="name">${escape(p.name)}</span><b>${p.score}</b></div>`,
      )
      .join("");
    if (role === "spectator") {
      const select =
        document.querySelector<HTMLSelectElement>("#follow-player")!;
      const signature = state.players.map((p) => `${p.id}:${p.name}`).join("|");
      if (select.dataset.players !== signature) {
        select.innerHTML =
          '<option value="">全场</option>' +
          state.players
            .map(
              (p) =>
                `<option value="${escape(p.id)}">跟随 ${escape(p.name)}</option>`,
            )
            .join("");
        if (!state.players.some((p) => p.id === world.follow))
          world.follow = "";
        select.value = world.follow;
        select.dataset.players = signature;
      }
    }
    updateSkillButton();
    drawMap();
  }
  if (phase === "finished") {
    document.querySelector("#return-countdown")!.textContent =
      typeof state.returnIn === "number"
        ? `约 ${Math.max(0, Math.ceil(state.returnIn))} 秒后返回大厅`
        : "";
    const results =
      state.results ?? [...state.players].sort((a, b) => b.score - a.score);
    document.querySelector("#resultsubtitle")!.textContent =
      role === "spectator"
        ? "比赛结束 · 一起看看本场成绩"
        : `你存入了 ${me?.score ?? results.find((p) => p.id === id)?.score ?? 0} 点电量。准备好下一趟旅程了吗？`;
    document.querySelector("#results")!.innerHTML = results
      .map(
        (p, i) =>
          `<div class="resultrow"><span>${sharedRank(results, p.score)}</span><span class="swatch" style="background:${COLORS.includes(p.color) ? p.color : COLORS[0]}"></span><span>${escape(p.name)}${p.id === id ? " · 你" : ""}</span><strong>${p.score} ⚡</strong></div>`,
      )
      .join("");
  }
}
function drawMap() {
  const ctx = document
    .querySelector<HTMLCanvasElement>("#map")
    ?.getContext("2d");
  if (!ctx || !state) return;
  ctx.clearRect(0, 0, 200, 200);
  ctx.fillStyle = "#f7ebce";
  ctx.beginPath();
  ctx.arc(100, 100, 95, 0, Math.PI * 2);
  ctx.fill();
  if (state.supply) {
    ctx.strokeStyle = "#318f80";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(100, 100, state.supply.outerRadius * 0.18, 0, Math.PI * 2);
    ctx.stroke();
    if (
      state.supply.nextOuterRadius !== undefined &&
      (state.supply.secondsToShrink ?? 99) <= 5
    ) {
      ctx.strokeStyle = "#d89427";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(100, 100, state.supply.nextOuterRadius * 0.18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  for (const s of state.stations) {
    ctx.fillStyle = "#79b896";
    ctx.beginPath();
    ctx.arc(100 + s.x * 0.18, 100 + s.y * 0.18, 10, 0, 7);
    ctx.fill();
  }
  for (const p of state.players) {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(100 + p.x * 0.18, 100 + p.y * 0.18, p.id === id ? 6 : 4, 0, 7);
    ctx.fill();
    if (p.id === id) {
      ctx.strokeStyle = "#214d3e";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}
function wireControls() {
  for (const [buttonId, panelSelector] of [
    ["ranking-toggle", ".leaderboard"],
    ["settings-toggle", "#settings"],
  ]) {
    const button = document.querySelector<HTMLButtonElement>(`#${buttonId}`)!;
    const panel = document.querySelector<HTMLElement>(panelSelector)!;
    button.onclick = () => {
      const expanded = button.getAttribute("aria-expanded") !== "true";
      // Only one mobile panel can cover the playfield at a time.
      for (const [otherButton, otherPanel] of [
        ["ranking-toggle", ".leaderboard"],
        ["settings-toggle", "#settings"],
      ]) {
        document
          .querySelector(`#${otherButton}`)!
          .setAttribute("aria-expanded", "false");
        document.querySelector(otherPanel)!.classList.remove("expanded");
      }
      button.setAttribute("aria-expanded", String(expanded));
      panel.classList.toggle("expanded", expanded);
    };
  }
  document.querySelector<HTMLButtonElement>("#effects")!.onclick = () => {
    reducedEffects = !reducedEffects;
    world.reducedEffects = reducedEffects;
    localStorage.setItem("rover.reducedEffects", reducedEffects ? "on" : "off");
    document.querySelector("#effects")!.textContent =
      `减少特效：${reducedEffects ? "开" : "关"}`;
  };
  document.querySelector<HTMLButtonElement>("#sound")!.onclick = () => {
    document.querySelector("#sound")!.textContent =
      `声音：${sounds.toggle() ? "开" : "关"}`;
  };
  document.querySelector<HTMLButtonElement>("#mouse")!.onclick = () => {
    mouseMode = !mouseMode;
    document.querySelector("#mouse")!.textContent =
      `鼠标驾驶：${mouseMode ? "开" : "关"}`;
    notice(
      mouseMode ? "按住场地，朝鼠标方向行驶。" : "使用 WASD 或方向键驾驶。",
    );
  };
  document.querySelector("#boost")!.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    requestBoost((e as PointerEvent).pointerId);
  });
  document.querySelector("#boost")!.addEventListener("click", (e) => {
    // Keyboard / assistive activation has no pointerdown.
    if ((e as MouseEvent).detail === 0) requestBoost(null);
  });
}
function requestBoost(pointer: number | null) {
  const me = state?.players.find((player) => player.id === id);
  if (
    !canSendInput() ||
    document.hidden ||
    !me ||
    me.cooldown > 0 ||
    me.stun > 0
  )
    return;
  boost = true;
  boostPointer = pointer;
}
window.addEventListener("keydown", (e) => {
  if (
    !canSendInput() ||
    document.hidden ||
    !!(e.target as HTMLElement | null)?.closest?.(
      "button, select, textarea, input, [contenteditable=true]",
    )
  )
    return;
  if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key))
    e.preventDefault();
  keys.add(e.key.toLowerCase());
  if (e.code === "Space" && !e.repeat) boost = true;
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => {
  world.resetMotion();
  keys.clear();
  resetJoystick();
  mouseDown = false;
  boost = false;
  sendInput({ x: 0, y: 0, boost: false });
});
document.addEventListener("visibilitychange", () => {
  world.resetMotion();
  frameMetrics.reset();
  frameSample = null;
  fpsElement.textContent = "FPS：—";
  if (document.hidden) {
    world.clearPickupFeedback();
    clearTimeout(retryTimer);
    retryTimer = undefined;
    resetLatency("后台");
    keys.clear();
    resetJoystick();
    mouseDown = false;
    boost = false;
    sendInput({ x: 0, y: 0, boost: false });
  } else {
    resetLatency(connected ? "测量中" : "已断开");
    if (retryAllowed && !connecting) {
      if (connected && performance.now() - lastState > 8000) {
        ws?.close();
        connected = false;
      }
      if (!connected) connect(true);
    }
  }
});
document.querySelector("#game")!.addEventListener("pointerdown", (e) => {
  const p = e as PointerEvent;
  if (p.pointerType !== "mouse" || !canSendInput() || document.hidden) return;
  mouseDown = true;
  mouse = { x: p.clientX, y: p.clientY };
});
window.addEventListener(
  "pointermove",
  (e) => (mouse = { x: e.clientX, y: e.clientY }),
);
window.addEventListener("pointerup", () => (mouseDown = false));
window.addEventListener("pointercancel", (e) => {
  if (e.pointerType === "mouse") mouseDown = false;
});
function updateSkillButton() {
  const b = document.querySelector<HTMLButtonElement>("#boost");
  if (!b) return;
  const me = state?.players.find((p) => p.id === id);
  b.style.setProperty("--player-color", me?.color ?? color);
  const view = skillView(me, performance.now() - lastState);
  const stun = me?.stun ?? 0;
  const label = view.boosting
    ? "冲刺中"
    : view.ready
      ? "冲刺"
      : `${view.seconds.toFixed(1)}秒`;
  const signature = label + view.label + view.seconds.toFixed(1);
  if (b.dataset.label !== signature) {
    b.dataset.label = signature;
    b.innerHTML = `<svg class="boost-orb" viewBox="-60 -60 120 120" aria-hidden="true"><circle cx="0" cy="0" r="56"/><polygon id="boost-liquid"/></svg><i aria-hidden="true">❯❯</i><strong>${label}</strong><span class="skill-caption">${view.boosting ? `能量释放 · ${view.seconds.toFixed(1)}秒` : view.ready ? "" : view.label}</span><span class="keyboard-hint">SPACE</span>`;
  }
  b.style.setProperty("--charge", `${view.progress * 360}deg`);
  b.classList.toggle("boosting", view.boosting);
  document.querySelector("#boost-liquid")?.setAttribute(
    "points",
    orbLiquid(0, 0, 56, view.energy, reducedEffects ? 0 : performance.now())
      .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(" "),
  );
  b.disabled = !view.ready;
  const status = document.querySelector("#stun-status");
  if (status)
    status.textContent =
      stun > 0
        ? `被撞！眩晕${view.seconds >= 0.95 ? "1" : view.seconds.toFixed(1)}秒`
        : "";
}
setInterval(() => {
  if (phase === "playing") updateSkillButton();
}, 50);
function drawJoystick() {
  joy = joystick.value;
  const visual = document.querySelector<HTMLElement>("#joystick");
  if (!visual) return;
  const insets = window.getComputedStyle?.(document.documentElement);
  const layout = controlLayout(
    innerWidth,
    innerHeight,
    parseFloat(insets?.getPropertyValue("--safe-left") || "") || 12,
    parseFloat(insets?.getPropertyValue("--safe-right") || "") || 12,
  );
  const pose = joystickPose(joystick, layout);
  visual.classList.toggle("active", pose.active);
  visual.style.left = `${pose.x}px`;
  visual.style.top = `${pose.y}px`;
  visual.style.width = visual.style.height = `${pose.r * 2}px`;
  if (visual.firstElementChild)
    (visual.firstElementChild as HTMLElement).style.transform =
      `translate(calc(-50% + ${pose.dx}px),calc(-50% + ${pose.dy}px))`;
}
function resetJoystick(clearTouches = true) {
  const owner = joystick.owner;
  if (clearTouches) fieldTouches.clear();
  boost = false;
  boostPointer = null;
  joystick.reset();
  drawJoystick();
  const game = document.querySelector<HTMLElement>("#game")!;
  if (owner !== null && game.hasPointerCapture?.(owner))
    game.releasePointerCapture(owner);
}
const driveSurface = document.querySelector<HTMLElement>("#game")!;
driveSurface.addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "touch" || !canSendInput() || document.hidden) return;
  if (fieldTouches.has(e.pointerId)) return;
  fieldTouches.add(e.pointerId);
  e.preventDefault();
  if (fieldTouches.size === 2 && joystick.owner !== null) {
    requestBoost(e.pointerId);
    return;
  }
  // Never promote a held second/third finger after the driving finger lifts.
  if (
    fieldTouches.size !== 1 ||
    !joystick.start(e.pointerId, e.clientX, e.clientY)
  )
    return;
  try {
    driveSurface.setPointerCapture(e.pointerId);
  } catch {
    /* Window listeners remain the fallback. */
  }
  drawJoystick();
});
window.addEventListener("pointermove", (e) => {
  if (e.pointerId !== joystick.owner) return;
  joystick.move(e.pointerId, e.clientX, e.clientY);
  drawJoystick();
});
for (const event of [
  "pointerup",
  "pointercancel",
  "lostpointercapture",
] as const)
  window.addEventListener(event, (e) => {
    fieldTouches.delete(e.pointerId);
    if (e.pointerId === joystick.owner) resetJoystick(false);
    if (e.pointerId === boostPointer) {
      if (event !== "pointerup") boost = false;
      boostPointer = null;
    }
  });
for (const event of ["resize", "orientationchange"])
  window.addEventListener(event, () => {
    resetJoystick();
    mouseDown = false;
  });
// One outstanding ping at a time. Never infer RTT from snapshots or rendering.
setInterval(() => {
  if (debug) {
    const valid = !document.hidden && connected;
    const fps =
      !document.hidden && frameSample ? Math.round(frameSample.fps) : "—";
    const interval =
      valid && snapshotInterval !== null
        ? `${Math.round(snapshotInterval)} ms`
        : "—";
    const detail =
      frameSample && !document.hidden
        ? ` · P95/P99：${frameSample.p95Ms.toFixed(1)}/${frameSample.p99Ms.toFixed(1)} ms · >50 ms：${frameSample.longFrames}（累计 ${frameSample.totalLongFrames}）`
        : "";
    const diagnostics = document.querySelector("#diagnostics")!;
    const text = `渲染 FPS：${fps} · 快照间隔：${interval}${detail}`;
    if (diagnostics.textContent !== text) diagnostics.textContent = text;
  }
  if (document.hidden || !connected || (!joined && !waiting)) return;
  const now = performance.now();
  if (
    (pendingPing && now - pendingPing.sent >= 5000) ||
    (rtt !== null && now - lastPong >= 5000)
  ) {
    pendingPing = null;
    rtt = null;
    latency("超时");
  }
  if (!pendingPing && now >= nextPing) {
    pingId = (pingId % 2147483647) + 1;
    pendingPing = { id: pingId, sent: now };
    nextPing = now + 2000;
    send({ type: "ping", id: pingId });
  }
  if (now - lastState > 8000) ws?.close();
}, 250);
setInterval(() => {
  if (!canSendInput() || document.hidden) return;
  let x =
      joy.x +
      (keys.has("d") || keys.has("arrowright") ? 1 : 0) -
      (keys.has("a") || keys.has("arrowleft") ? 1 : 0),
    y =
      joy.y +
      (keys.has("s") || keys.has("arrowdown") ? 1 : 0) -
      (keys.has("w") || keys.has("arrowup") ? 1 : 0);
  if (mouseMode && mouseDown && x === 0 && y === 0) {
    const me = world.smooth.get(id) ?? state?.players.find((p) => p.id === id);
    if (me) {
      const target = world.screenToWorld(mouse.x, mouse.y),
        dx = target.x - me.x,
        dy = target.y - me.y;
      if (Math.hypot(dx, dy) > 15) {
        x = dx;
        y = dy;
      }
    }
  }
  const v = normalize(x, y);
  const stunned = (state?.players.find((p) => p.id === id)?.stun ?? 0) > 0;
  sendInput({
    ...(stunned ? { x: 0, y: 0 } : v),
    boost: boost && !stunned,
  });
  boost = false;
  seq++;
  if (seq % 20 === 0 && performance.now() - lastState > 3000)
    status("网络延迟 · 等待同步");
  else if (seq % 20 === 0) status("在线 · 实时联机");
}, 50);
showJoin();
