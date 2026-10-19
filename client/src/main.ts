import { Sounds } from "./audio";
const sounds = new Sounds();
import Phaser from "phaser";
import "./style.css";
import { World } from "./world";
import {
  COLORS,
  escape,
  normalize,
  canonicalServerUrl,
  tokenStorageKey,
  sharedRank,
  type State,
} from "./types";
const world = new World();
new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#c3d8b9",
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
const keys = new Set<string>();
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
    rtt === null ? `网络 RTT：${reason}` : `网络 RTT：${Math.round(rtt)} ms`;
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
app.innerHTML = `<div class="brand"><div class="brand-icon">ϟ</div><div><strong>磁力小车</strong><small>MAGNETIC ROVER CLUB</small></div></div><div class="connection pill"><span class="dot"></span><span id="status">尚未连接</span><span id="latency" title="WebSocket 应用层往返时间，不是帧率或快照间隔">网络 RTT：未连接</span></div>${debug ? '<div id="diagnostics" class="diagnostics">FPS：— · 快照间隔：—</div>' : ""}<div id="surface"></div><div id="notice" class="toast hidden" role="status"></div>`;
const surface = document.querySelector<HTMLDivElement>("#surface")!;
function status(text: string) {
  document.querySelector("#status")!.textContent = text;
  document.querySelector(".dot")!.classList.toggle("online", connected);
}
function notice(text: string) {
  const e = document.querySelector<HTMLDivElement>("#notice")!;
  e.textContent = text;
  e.classList.remove("hidden");
  setTimeout(() => e.classList.add("hidden"), 3500);
}
function send(data: object) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function showError(s: string) {
  error = s;
  const el = document.querySelector("#error");
  if (el) el.textContent = s;
  else notice(s);
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
  resetLatency("测量中");
  error = "";
  joined = false;
  waiting = false;
  connected = false;
  state = null;
  phase = "";
  keys.clear();
  joy = { x: 0, y: 0 };
  boost = false;
  mouseDown = false;
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
    if (data.type === "welcome") {
      waiting = false;
      received = true;
      clearTimeout(timeout);
      connecting = false;
      retryAttempt = 0;
      lastState = performance.now();
      id = data.id;
      world.self = id;
      joined = true;
      localStorage.setItem(tokenKey, data.token);
      status("在线 · 实时联机");
    }
    if (data.type === "error") {
      showError(data.message);
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
      sounds.update(state, data, id);
      state = data;
      lastState = performance.now();
      snapshotInterval =
        lastSnapshot === null ? null : lastState - lastSnapshot;
      lastSnapshot = lastState;
      world.state = state;
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
    connected = false;
    connecting = false;
    joined = false;
    resetLatency(document.hidden ? "后台" : "已断开");
    keys.clear();
    joy = { x: 0, y: 0 };
    mouseDown = false;
    boost = false;
    status("连接已断开");
    phase = "";
    showJoin(true);
    scheduleReconnect();
  };
}
function cancelConnection() {
  retryAllowed = false;
  clearTimeout(retryTimer);
  retryTimer = undefined;
  connecting = connected = joined = waiting = false;
  const old = ws;
  ws = null; // Invalidate every old handler before closing.
  old?.close();
  keys.clear();
  joy = { x: 0, y: 0 };
  mouseDown = boost = false;
  state = world.state = null;
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
  surface.innerHTML = `<div class="center"><section class="card"><div class="eyebrow">COLLECT · BOOST · BANK</div><h1>小车大电量。<br>出发，抢点电！</h1><p class="subtitle">捡起电池，送回薄荷回收站。<br>3 分钟轻松竞速，和 2–8 位朋友一起争夺榜首。</p><label class="field-label" for="nickname">你的车手昵称</label><input id="nickname" maxlength="16" autocomplete="nickname" placeholder="比如：薄荷闪电" value="${escape(localStorage.getItem("rover.name") || "")}"><span class="field-label">挑一辆喜欢的小车</span><div class="colors">${COLORS.map((c) => `<button class="color ${c === color ? "selected" : ""}" data-color="${c}" style="background:${c}" aria-label="选择${c}小车" aria-pressed="${c === color}"></button>`).join("")}</div><button class="primary" id="join">${disconnected ? "重新连接 →" : "驶入大厅 →"}</button>${disconnected && retryAllowed ? '<button class="secondary" id="cancel-connect">取消自动重连</button>' : ""}<div class="error" id="error" role="alert">${escape(disconnected ? error || "连接中断；本局身份已保留，重新连接可尝试回到比赛。" : error)}</div><details><summary>服务器设置</summary><input aria-label="WebSocket服务器地址" id="server" value="${escape(localStorage.getItem("rover.server") || defaultUrl)}"></details><div class="instructions"><div><b>01</b>沿途收集电池</div><div><b>02</b>碰撞也会掉落电池</div><div><b>03</b>进站存入得分</div></div></section></div>`;
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
function render() {
  if (!state || !joined) return;
  if (phase !== state.phase) {
    phase = state.phase;
    app.className = phase;
    keys.clear();
    joy = { x: 0, y: 0 };
    mouseMode = false;
    mouseDown = false;
    boost = false;
    if (phase === "lobby")
      surface.innerHTML = `<div class="center"><section class="card"><div class="eyebrow">THE GARAGE / 准备大厅</div><h2>车手们，准备好了吗？</h2><p class="subtitle">打开同一个游戏地址，朋友就能加入。<br>至少 2 位车手到齐，即可开始比赛。</p><div id="roster" class="roster"></div><div id="slots" class="slots"></div><button id="start" class="primary">开始比赛 →</button><div class="error" id="error" role="alert"></div><div class="instructions"><div><b>WASD</b>或方向键移动</div><div><b>SPACE</b>空格冲刺 · 4 秒冷却</div><div><b>⚡</b>手机摇杆 + 冲刺</div></div><p class="footer-note">身上的电池还不算分。驶入任意回收站，才会存入积分！</p></section></div>`;
    if (phase === "playing") {
      surface.innerHTML = `<div class="hud"><div class="stat"><small>已存积分</small><b id="score">0</b></div><div class="stat timer"><small>剩余时间</small><b id="timer">3:00</b></div><div class="stat"><small>随车电池</small><b id="cargo">0<small>/20</small></b></div></div><aside class="leaderboard"><h3>实时排行榜</h3><div id="ranking"></div></aside><canvas class="minimap" id="map" width="200" height="200" aria-label="场地小地图"></canvas><div class="controls"><button class="secondary" id="mouse">鼠标驾驶：关</button><button class="secondary" id="sound">声音：${sounds.enabled ? "开" : "关"}</button></div><div class="joystick" id="joystick" aria-label="拖动摇杆驾驶"><div class="stick"></div></div><button class="boost" id="boost">冲 刺<span>SPACE</span></button><div class="hint">收集 ⚡ → 驶入绿色回收站 → 存入积分</div>`;
      wireControls();
      notice("出发！把电池送到绿色回收站。");
    }
    if (phase === "finished") {
      surface.innerHTML = `<div class="center"><section class="card"><div class="eyebrow">FINISH LINE / 本局结束</div><h1>好电量，好成绩。</h1><p class="subtitle" id="resultsubtitle"></p><div id="results"></div><p id="return-countdown" class="footer-note"></p><button id="again" class="primary">再来一局 →</button><div class="error" id="error" role="alert"></div><p class="footer-note">同分共享名次 · 只有存入回收站的电池计分</p></section></div>`;
      document
        .querySelector("#again")!
        .addEventListener("click", () => send({ type: "again" }));
    }
    document
      .querySelector("#start")
      ?.addEventListener("click", () => send({ type: "start" }));
  }
  const me = state.players.find((p) => p.id === id);
  if (phase === "lobby") {
    document.querySelector("#roster")!.innerHTML = state.players
      .map(
        (p) =>
          `<div class="person"><span class="swatch" style="background:${COLORS.includes(p.color) ? p.color : COLORS[0]}"></span><span>${escape(p.name)}${p.id === id ? " · 你" : ""}${p.connected ? "" : " · 离线"}</span></div>`,
      )
      .join("");
    const n = state.players.filter((p) => p.connected).length;
    document.querySelector("#slots")!.textContent =
      `${n} / 8 位车手已就位${n < 2 ? " · 等待朋友加入" : ""}`;
    const b = document.querySelector<HTMLButtonElement>("#start")!;
    b.disabled = n < 2;
    b.textContent = n < 2 ? "等待至少 2 位车手" : "开始比赛 →";
  }
  if (phase === "playing") {
    document.querySelector("#score")!.textContent = String(me?.score ?? 0);
    document.querySelector("#cargo")!.textContent = `${me?.cargo ?? 0} / 20`;
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
    const cooldown = me?.cooldown ?? 0;
    const b = document.querySelector<HTMLButtonElement>("#boost")!;
    b.innerHTML =
      cooldown > 0
        ? `${cooldown.toFixed(1)} 秒<span>充能中</span>`
        : "冲 刺<span>SPACE</span>";
    b.disabled = cooldown > 0;
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
      `你存入了 ${me?.score ?? results.find((p) => p.id === id)?.score ?? 0} 点电量。准备好下一趟旅程了吗？`;
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
    boost = true;
  });
  const j = document.querySelector<HTMLDivElement>("#joystick")!;
  const update = (e: PointerEvent) => {
    const r = j.getBoundingClientRect();
    const v = normalize(
      (e.clientX - r.left - r.width / 2) / 38,
      (e.clientY - r.top - r.height / 2) / 38,
    );
    joy = v;
    (j.firstElementChild as HTMLElement).style.transform =
      `translate(${v.x * 32}px,${v.y * 32}px)`;
  };
  j.onpointerdown = (e) => {
    j.setPointerCapture(e.pointerId);
    update(e);
  };
  j.onpointermove = (e) => {
    if (j.hasPointerCapture(e.pointerId)) update(e);
  };
  const reset = () => {
    joy = { x: 0, y: 0 };
    (j.firstElementChild as HTMLElement).style.transform = "";
  };
  j.onpointerup = reset;
  j.onpointercancel = reset;
  j.onlostpointercapture = reset;
}
window.addEventListener("keydown", (e) => {
  if (phase !== "playing" || e.target instanceof HTMLInputElement) return;
  if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key))
    e.preventDefault();
  keys.add(e.key.toLowerCase());
  if (e.code === "Space" && !e.repeat) boost = true;
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => {
  keys.clear();
  joy = { x: 0, y: 0 };
  mouseDown = false;
  boost = false;
  send({ type: "input", x: 0, y: 0, boost: false });
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearTimeout(retryTimer);
    retryTimer = undefined;
    resetLatency("后台");
    keys.clear();
    joy = { x: 0, y: 0 };
    mouseDown = false;
    boost = false;
    send({ type: "input", x: 0, y: 0, boost: false });
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
  mouseDown = true;
  mouse = { x: p.clientX, y: p.clientY };
});
window.addEventListener(
  "pointermove",
  (e) => (mouse = { x: e.clientX, y: e.clientY }),
);
window.addEventListener("pointerup", () => (mouseDown = false));
window.addEventListener("pointercancel", () => {
  mouseDown = false;
  boost = false;
  joy = { x: 0, y: 0 };
});
// One outstanding ping at a time. Never infer RTT from snapshots or rendering.
setInterval(() => {
  if (debug) {
    const valid = !document.hidden && connected;
    const fps = valid && world.fps != null ? Math.round(world.fps) : "—";
    const interval =
      valid && snapshotInterval !== null
        ? `${Math.round(snapshotInterval)} ms`
        : "—";
    document.querySelector("#diagnostics")!.textContent =
      `FPS：${fps} · 快照间隔：${interval}`;
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
  if (document.hidden || phase !== "playing" || !connected || !joined) return;
  let x =
      joy.x +
      (keys.has("d") || keys.has("arrowright") ? 1 : 0) -
      (keys.has("a") || keys.has("arrowleft") ? 1 : 0),
    y =
      joy.y +
      (keys.has("s") || keys.has("arrowdown") ? 1 : 0) -
      (keys.has("w") || keys.has("arrowup") ? 1 : 0);
  if (mouseMode && mouseDown && x === 0 && y === 0) {
    const me = state?.players.find((p) => p.id === id);
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
  send({ type: "input", ...v, boost });
  boost = false;
  seq++;
  if (seq % 20 === 0 && performance.now() - lastState > 3000)
    status("网络延迟 · 等待同步");
  else if (seq % 20 === 0) status("在线 · 实时联机");
}, 50);
showJoin();
