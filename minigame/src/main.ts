import Phaser from "phaser";
import { WeChatSounds } from "./audio";
import { CartoonPanel } from "./panel";
import { skillView } from "../../client/src/presentation";
import { World } from "../../client/src/world";
import { FrameMetrics, type FrameSample } from "../../client/src/performance";
import {
  pickupCount,
  FloatingJoystick,
  COLORS,
  normalize,
  type RoomSummary,
  type State,
} from "../../client/src/types";
declare const wx: any;
declare const GameGlobal: any;
declare const canvas: HTMLCanvasElement;
const windowInfo = () =>
  wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
const safeLeft = () => Math.max(24, (windowInfo().safeArea?.left || 0) + 12);
const safeRight = () =>
  Math.max(
    24,
    windowInfo().windowWidth -
      (windowInfo().safeArea?.right || windowInfo().windowWidth) +
      12,
  );

// A separate client keeps all outcomes authoritative on the unchanged Skynet server.
const endpoint =
  wx.getStorageSync("rover.spike.endpoint") || "wss://cb.chenmin.org/ws";
const tokenKey = "rover.spike.token:" + endpoint;
let name = wx.getStorageSync("rover.spike.name") || "微信车手";
let color = COLORS.includes(wx.getStorageSync("rover.color"))
  ? wx.getStorageSync("rover.color")
  : COLORS[0];
let spectator = false;
let socket: any,
  connected = false,
  status = "点击连接，进入真实联机大厅";
let rooms: RoomSummary[] = [],
  state: State | null = null,
  self = "",
  roomId: string | null = null;
let panel: CartoonPanel,
  active = true,
  lastSnapshot = 0,
  rtt: number | null = null;
let ping: { id: number; at: number } | null = null,
  pingSeq = 0,
  nextPing = 0;
let boost = false,
  lastInput = 0,
  uiKey = "",
  notice = "";
const sounds = new WeChatSounds(wx);
console.info(
  "[rover] audio backend: wx.createInnerAudioContext (first touch unlocks)",
);
const frames = new FrameMetrics();
let frameSample: FrameSample | null = null;
let scenePeakMs = 0,
  measuredScenePeakMs = 0;
const joystick = new FloatingJoystick();
const world = new (class extends World {
  preload() {
    this.load.image("rover", "art/cartoon/rover.png");
    this.load.image("battery", "art/cartoon/battery.png");
    this.load.image("station", "art/cartoon/station.png");
    this.load.image("island", "art/cartoon/island.png");
  }
  update(time: number, delta: number) {
    const started = Date.now();
    super.update(time, delta);
    scenePeakMs = Math.max(scenePeakMs, Date.now() - started);
  }
})();

function send(message: object) {
  if (connected)
    socket.send({
      data: JSON.stringify(message),
      fail: (e: any) => console.warn("[rover] send", e.errMsg),
    });
}
function resetInput() {
  joystick.reset();
  fieldTouches.clear();
  boost = false;
  world.resetMotion();
  if (connected && state?.phase === "playing")
    send(world.inputCommand({ x: 0, y: 0, boost: false }));
}
function disconnect() {
  resetInput();
  connected = false;
  socket?.close({});
  socket = undefined;
  state = null;
  world.state = null;
  roomId = null;
  rooms = [];
  ping = null;
  rtt = null;
}
function connect() {
  disconnect();
  status = "正在连接 " + endpoint;
  notice = "";
  uiKey = "";
  const current = wx.connectSocket({
    url: endpoint,
    fail: (e: any) => {
      status = "连接失败：" + e.errMsg;
      uiKey = "";
    },
  });
  socket = current;
  current.onOpen(() => {
    if (socket !== current) return;
    connected = true;
    status = "已连接，正在进入大厅";
    send({
      type: "join",
      name,
      color,
      token: wx.getStorageSync(tokenKey) || undefined,
    });
  });
  current.onMessage((event: any) => {
    if (socket !== current) return;
    let data: any;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }
    if (data.type === "welcome") {
      wx.setStorageSync(tokenKey, data.token);
      self = data.id;
      roomId = data.roomId;
      spectator = data.role === "spectator";
      world.spectating = spectator;
      state = null;
      world.state = null;
      world.self = self;
      resetInput();
      status = roomId ? "已进入房间" : "已连接 · 房间大厅";
      uiKey = "";
      console.info("[rover] admitted", { roomId, role: data.role });
    } else if (data.type === "rooms") {
      rooms = data.rooms || [];
      uiKey = "";
    } else if (data.type === "state") {
      if (state?.phase !== data.phase) resetInput();
      if (active) sounds.update(state, data, self);
      const gained = pickupCount(state, data, self);
      if (gained) world.pickupFeedback(gained);
      state = data;
      world.state = data;
      world.self = self;
      lastSnapshot = Date.now();
    } else if (data.type === "pong" && ping && data.id === ping.id) {
      rtt = Date.now() - ping.at;
      ping = null;
    } else if (data.type === "error") {
      notice = data.message;
      uiKey = "";
      console.warn("[rover] server", data.message);
      if (data.message === "Guest already connected") {
        wx.removeStorageSync(tokenKey);
        disconnect();
        status = "身份仍在线，请稍后点连接重试";
      }
    }
  });
  current.onError((e: any) => {
    if (socket === current) {
      status = "网络错误：" + e.errMsg;
      console.error("[rover]", e.errMsg);
      uiKey = "";
    }
  });
  current.onClose(() => {
    if (socket !== current) return;
    resetInput();
    connected = false;
    state = null;
    world.state = null;
    roomId = null;
    status = "连接已关闭，点击连接重试";
    uiKey = "";
    ping = null;
    rtt = null;
  });
}

function editable(
  title: string,
  placeholderText: string,
  action: (value: string) => void,
) {
  wx.showModal({
    title,
    editable: true,
    placeholderText,
    success: (r: any) => {
      if (r.confirm && r.content?.trim()) action(r.content.trim());
    },
  });
}
panel = new CartoonPanel(
  () => ({
    connected,
    status,
    soundEnabled: sounds.enabled,
    name,
    color,
    endpoint,
    rooms,
    state,
    self,
    roomId,
    spectator,
    notice,
    rtt,
    fps: frameSample?.fps ?? null,
    age: Date.now() - lastSnapshot,
  }),
  {
    connect,
    toggleSound: () => sounds.toggle(),
    rename: () =>
      editable("车手昵称", name, (value) => {
        name = value.slice(0, 16);
        wx.setStorageSync("rover.spike.name", name);
      }),
    color: (value) => {
      color = value;
      wx.setStorageSync("rover.color", color);
    },
    server: () =>
      editable("WebSocket 地址", endpoint, (value) => {
        if (/^wss?:\/\/[^\s]+\/ws$/.test(value)) {
          wx.setStorageSync("rover.spike.endpoint", value);
          wx.showModal({
            title: "地址已保存",
            content: "重新进入小游戏后使用新地址",
            showCancel: false,
          });
        } else notice = "请输入有效的 wss:// 域名/ws 地址";
      }),
    send,
    leave: () => {
      resetInput();
      send({ type: "leave_room" });
    },
    boost: () => {
      if (
        !spectator &&
        state?.phase === "playing" &&
        skillView(
          state.players.find((p) => p.id === self),
          Date.now() - lastSnapshot,
        ).ready
      )
        boost = true;
    },
    joinCode: () =>
      editable("加入朋友的房间", "输入房间码", (value) =>
        send({
          type: "join_room",
          roomId: rooms.find((r) => r.roomCode === value)?.roomId ?? value,
        }),
      ),
    copy: () => wx.setClipboardData({ data: state?.roomCode ?? roomId ?? "" }),
  },
  joystick,
  () => ({
    left: safeLeft(),
    right: safeRight(),
    top: Math.max(8, windowInfo().safeArea?.top || 0),
  }),
);
// Network cadence is independent of display cadence. UI never creates score/position state.
function networkTick() {
  const now = Date.now();
  if (
    connected &&
    active &&
    !spectator &&
    state?.phase === "playing" &&
    now - lastInput >= 50
  ) {
    lastInput = now;
    const stunned = (state.players.find((p) => p.id === self)?.stun ?? 0) > 0;
    send(
      world.inputCommand({
        ...normalize(
          stunned ? 0 : joystick.value.x,
          stunned ? 0 : joystick.value.y,
        ),
        boost: boost && !stunned,
      }),
    );
    boost = false;
  }
  if (
    connected &&
    active &&
    now > nextPing &&
    (!ping || now - ping.at > 5000)
  ) {
    ping = { id: ++pingSeq, at: now };
    send({ type: "ping", id: ping.id });
    nextPing = now + 2000;
  }
  if (lastSnapshot && now - lastSnapshot > 5000) rtt = null;
}
let lastTouch: { x: number; y: number; hit: boolean } | null = null;
const fieldTouches = new Set<number>();
wx.onTouchStart((event: any) => {
  sounds.unlock();
  for (const t of event.changedTouches) {
    const x = t.clientX,
      y = t.clientY;
    const hit = panel?.press(x, y) ?? false;
    lastTouch = { x, y, hit };
    if (hit) continue;
    if (active && !spectator && state?.phase === "playing") {
      fieldTouches.add(t.identifier);
      if (fieldTouches.size === 1) joystick.start(t.identifier, x, y);
    }
  }
});
wx.onTouchMove((event: any) => {
  for (const t of event.changedTouches)
    joystick.move(t.identifier, t.clientX, t.clientY);
});
wx.onTouchEnd((event: any) => {
  for (const t of event.changedTouches) {
    fieldTouches.delete(t.identifier);
    if (joystick.end(t.identifier)) {
      boost = false;
      if (connected && !spectator && state?.phase === "playing")
        send(world.inputCommand({ x: 0, y: 0, boost: false }));
    }
  }
});
wx.onTouchCancel((event: any) => {
  if (!event?.changedTouches?.length) {
    resetInput();
    return;
  }
  boost = false;
  for (const t of event.changedTouches) {
    fieldTouches.delete(t.identifier);
    if (
      joystick.end(t.identifier) &&
      connected &&
      !spectator &&
      state?.phase === "playing"
    )
      send(world.inputCommand({ x: 0, y: 0, boost: false }));
  }
});
wx.onHide(() => {
  resetInput();
  active = false;
  sounds.setActive(false);
  rtt = null;
  ping = null;
  frames.reset();
  frameSample = null;
});
wx.onShow(() => {
  active = true;
  sounds.setActive(true);
  world.resetMotion();
  if (connected) send({ type: "rooms" });
});

const info = windowInfo();
const game = new Phaser.Game({
  type: Phaser.CANVAS,
  canvas,
  customEnvironment: true,
  parent: null,
  width: info.windowWidth,
  height: info.windowHeight,
  backgroundColor: "#86bed6",
  // Audio uses wx.createInnerAudioContext; keep the browser audio manager off.
  audio: { noAudio: true },
  input: { keyboard: false, mouse: false, touch: false, gamepad: false },
  loader: { imageLoadType: "HTMLImageElement" },
  scale: { mode: Phaser.Scale.NONE },
  scene: [world, panel],
  callbacks: {
    postBoot: (g) => {
      g.scene.start("panel");
    },
  },
});
game.events.on(Phaser.Core.Events.POST_RENDER, () => {
  networkTick();
  if (!active) return;
  const sample = frames.record(Date.now());
  if (sample) {
    frameSample = sample;
    measuredScenePeakMs = scenePeakMs;
    scenePeakMs = 0;
  }
});
wx.onWindowResize?.((event: any) => {
  resetInput();
  game.scale.resize(event.windowWidth, event.windowHeight);
});
// Read-only diagnostics for the developer console, no score/position mutation hooks.
Object.defineProperty(GameGlobal, "roverSpike", {
  configurable: true,
  get: () => ({
    endpoint,
    connected,
    audio: sounds.diagnostics,
    status,
    lastTouch,
    hitAreas: panel?.hits.map(({ action, ...hit }) => hit),
    roomId,
    phase: state?.phase,
    self,
    players: state?.players.map((p) => ({
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      cargo: p.cargo,
      score: p.score,
    })),
    rtt,
    phaser: Phaser.VERSION,
    renderer: game.renderer?.type,
    controls: {
      owner: joystick.owner,
      origin: joystick.origin,
      value: joystick.value,
    },
    frameSample,
    scenePeakMs: measuredScenePeakMs,
    snapshotsFresh: Date.now() - lastSnapshot < 1000,
  }),
});
