import { cloudTarget } from "./cloud.ts";

type ProbeResult = { statusCode: number; data: unknown };
type Probe = (complete: (result?: ProbeResult) => void) => { abort(): void } | undefined;

const HEARTBEAT_MS = 60_000;
const AVAILABILITY_MS = 30_000;
const CLOUDBASE_ENDPOINT = "wss://cb.chenmin.org/ws";
const SERVER_KEY = "rover.server";

function isReady(response?: ProbeResult) {
  const data = response?.data as { ready?: unknown; wechatWs?: unknown } | undefined;
  return response?.statusCode === 200 && data?.ready === true && data.wechatWs === true;
}

export function createWarmup(probe: Probe) {
  let state: "idle" | "waiting" | "ready" | "failed" = "idle";
  let started = 0;
  let readyAt = 0;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let request: ReturnType<Probe> | undefined;
  let enter: (() => void) | undefined;

  function stop(next: typeof state) {
    generation++;
    state = next;
    clearTimeout(timer);
    clearTimeout(deadline);
    const pending = request;
    request = undefined;
    pending?.abort();
  }

  function poll() {
    const attempt = ++generation;
    request = probe((response) => {
      if (attempt !== generation) return;
      request = undefined;
      if (isReady(response)) {
        stop("ready");
        readyAt = Date.now();
        timer = setTimeout(refresh, HEARTBEAT_MS);
        const action = enter;
        enter = undefined;
        action?.();
        return;
      }
      const delay = Math.min(4000, 1000 * 2 ** failures++);
      timer = setTimeout(poll, delay);
    });
  }

  function refresh() {
    stop("idle");
    start();
  }

  function start() {
    if (state === "waiting" || state === "ready") return;
    clearTimeout(timer);
    state = "waiting";
    started = Date.now();
    failures = 0;
    deadline = setTimeout(() => {
      enter = undefined;
      stop("failed");
      // End fast retries, but keep checking at the normal foreground cadence.
      timer = setTimeout(refresh, HEARTBEAT_MS);
    }, 45000);
    poll();
  }

  return {
    start,
    pause() { stop("idle"); },
    cancel() {
      const action = enter;
      enter = undefined;
      stop("idle");
      return action;
    },
    join(action: () => void) {
      if (state === "ready" && Date.now() - readyAt >= HEARTBEAT_MS) stop("idle");
      if (state === "ready") action();
      else { enter = action; start(); }
    },
    get waiting() { return state === "waiting"; },
    get failed() { return state === "failed"; },
    get message() {
      if (state === "failed") return "暂时连不上服务器，请稍后重试。";
      if (state !== "waiting") return "";
      const elapsed = Date.now() - started;
      if (elapsed >= 25000) return "这次启动比平时慢，还在为你连接。";
      if (elapsed >= 8000) return enter
        ? "服务器正在启动，准备好后会自动进入大厅。"
        : "服务器正在启动，通常需要几十秒。";
      return "正在唤醒游戏服务器，你可以先选车、填写昵称。";
    },
  };
}

export function startWeChatWarmup(wx: any, override: string) {
  let endpoint = override;
  let cloudInitialized = false;
  let cloudBaseAvailable = false;
  let wechatAvailable: boolean | undefined;
  let restoring = !override && wx.getStorageSync?.(SERVER_KEY) === "cloudbase";
  let restoreAction: (() => void) | undefined;
  let foreground = true;
  let wechatProbeGeneration = 0;
  let availabilityGeneration = 0;
  let availabilityTimer: ReturnType<typeof setTimeout> | undefined;
  let availabilityRequest: ReturnType<Probe> | undefined;

  function publicHealth(target: string, complete: Parameters<Probe>[0]): ReturnType<Probe> {
    const url = target.replace(/^ws/, "http").replace(/\/ws(?:\?.*)?$/, "/healthz");
    return wx.request({ url, method: "GET", timeout: 6000, success: complete, fail: () => complete() });
  }

  function wechatHealth(complete: Parameters<Probe>[0]) {
    const attempt = ++wechatProbeGeneration;
    function finish(response?: ProbeResult) {
      complete(response);
      if (attempt !== wechatProbeGeneration) return;
      wechatAvailable = isReady(response);
      reconcile();
    }
    try {
      if (!cloudInitialized) {
        wx.cloud.init();
        cloudInitialized = true;
      }
      wx.cloud.callContainer({
        config: cloudTarget.config,
        path: "/healthz",
        method: "GET",
        timeout: 6000,
        header: { "X-WX-SERVICE": cloudTarget.service },
      }).then(finish, () => finish());
    } catch {
      void Promise.resolve().then(() => finish());
    }
    // Cloud requests have no abort handle. Warmup ignores stale results.
  }

  const warmup = createWarmup((complete) => {
    if (endpoint) return publicHealth(endpoint, complete);
    wechatHealth(complete);
    return undefined;
  });

  function changeEndpoint(next: string, keepEntry = false) {
    if (next === endpoint) return;
    const action = warmup.cancel();
    endpoint = next;
    servers.onChange?.();
    if (keepEntry && action) warmup.join(action);
    else if (foreground) warmup.start();
  }

  function reconcile() {
    if (override || !servers.canSwitch() || restoring) return;
    if (endpoint && !cloudBaseAvailable) changeEndpoint("", true);
    else if (!endpoint && wechatAvailable === false && cloudBaseAvailable) changeEndpoint(CLOUDBASE_ENDPOINT, true);
  }

  function checkAvailability() {
    if (override || !foreground) return;
    const attempt = ++availabilityGeneration;
    if (endpoint) wechatHealth(() => {});
    availabilityRequest = publicHealth(CLOUDBASE_ENDPOINT, (response) => {
      if (attempt !== availabilityGeneration) return;
      availabilityRequest = undefined;
      cloudBaseAvailable = isReady(response);
      if (restoring) {
        restoring = false;
        if (cloudBaseAvailable && servers.canSwitch()) changeEndpoint(CLOUDBASE_ENDPOINT);
        else reconcile();
        const action = restoreAction;
        restoreAction = undefined;
        if (action) warmup.join(action);
      } else {
        reconcile();
      }
      availabilityTimer = setTimeout(checkAvailability, AVAILABILITY_MS);
    });
  }

  const servers = {
    onChange: undefined as (() => void) | undefined,
    canSwitch: () => true,
    reconcile,
    select(cloudBase: boolean) {
      if (override || !servers.canSwitch() || (cloudBase && !cloudBaseAvailable)) return;
      wx.setStorageSync(SERVER_KEY, cloudBase ? "cloudbase" : "wechat");
      changeEndpoint(cloudBase ? CLOUDBASE_ENDPOINT : "");
    },
    join(action: () => void) {
      if (restoring) {
        restoreAction = action;
        return;
      }
      reconcile();
      warmup.join(action);
    },
    get endpoint() { return endpoint; },
    get cloudBaseAvailable() { return cloudBaseAvailable; },
    get showServerSwitch() { return !override && wechatAvailable === true && cloudBaseAvailable; },
    get waiting() { return restoring || warmup.waiting; },
    get failed() { return !restoring && warmup.failed; },
    get message() { return warmup.message; },
  };

  wx.onHide(() => {
    foreground = false;
    wechatProbeGeneration++;
    warmup.pause();
    availabilityGeneration++;
    clearTimeout(availabilityTimer);
    availabilityRequest?.abort();
    availabilityRequest = undefined;
  });
  wx.onShow(() => {
    if (foreground) return;
    foreground = true;
    warmup.start();
    checkAvailability();
  });
  warmup.start();
  checkAvailability();
  return servers;
}
