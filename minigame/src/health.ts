type ProbeResult = { statusCode: number; data: unknown };
type Probe = (complete: (result?: ProbeResult) => void) => { abort(): void };

const HEARTBEAT_MS = 60_000;

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
      const data = response?.data as { ready?: unknown; wechatWs?: unknown } | undefined;
      if (response?.statusCode === 200 && data?.ready === true && data.wechatWs === true) {
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

export function startWeChatWarmup(wx: any, endpoint: string) {
  const url = endpoint.replace(/^ws/, "http").replace(/\/ws(?:\?.*)?$/, "/healthz");
  const warmup = createWarmup((complete) => wx.request({
    url,
    method: "GET",
    timeout: 6000,
    success: complete,
    fail: () => complete(),
  }));
  wx.onHide(() => warmup.pause());
  wx.onShow(() => warmup.start());
  warmup.start();
  return warmup;
}
