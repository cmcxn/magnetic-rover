import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as helpers from "../src/types.ts";

// Execute the real connection handlers with fake browser dependencies. Removing
// imports through the TypeScript AST remains safe across source formatting changes.
// This is a logic test, not a real browser, network, rendering, or audio test.
const source = fs.readFileSync(
  new URL("../src/main.ts", import.meta.url),
  "utf8",
);
const parsed = ts.createSourceFile(
  "main.ts",
  source,
  ts.ScriptTarget.Latest,
  true,
);
const withoutImports = ts.factory.updateSourceFile(
  parsed,
  parsed.statements.filter((statement) => !ts.isImportDeclaration(statement)),
);
const compiled = ts.transpileModule(
  ts.createPrinter().printFile(withoutImports),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    },
  },
).outputText;

function harness(search = "", options = {}) {
  const nodes = new Map();
  let now = 0,
    nextTimer = 0;
  const timers = new Map(),
    intervals = [],
    listeners = {};
  function register(event, fn) {
    const prior = listeners[event];
    listeners[event] = prior
      ? (e) => {
          prior(e);
          fn(e);
        }
      : fn;
  }
  function node(selector) {
    if (!nodes.has(selector))
      nodes.set(selector, {
        value:
          selector === "#nickname"
            ? "reviewer"
            : selector === "#server"
              ? "ws://server-a.test/ws"
              : "",
        className: "",
        innerHTML: "",
        textContent: "",
        style: {},
        firstElementChild: { style: {} },
        captures: new Set(),
        setPointerCapture(id) {
          this.captures.add(id);
        },
        hasPointerCapture(id) {
          return this.captures.has(id);
        },
        releasePointerCapture(id) {
          this.captures.delete(id);
        },
        getContext: () => null,
        classList: {
          values: new Set(),
          toggle(v, active) {
            active ? this.values.add(v) : this.values.delete(v);
          },
          add(v) {
            this.values.add(v);
          },
          remove(v) {
            this.values.delete(v);
          },
        },
        addEventListener(event, fn) {
          register(`${selector}:${event}`, fn);
        },
      });
    return nodes.get(selector);
  }
  const storage = new Map([
    ["rover.token", "legacy-secret"],
    [helpers.tokenStorageKey("ws://server-a.test/ws"), "token-a"],
    [helpers.tokenStorageKey("ws://server-b.test/ws"), "token-b"],
  ]);
  const sockets = [];
  class Socket {
    static OPEN = 1;
    readyState = 1;
    sent = [];
    constructor(url) {
      this.url = url;
      sockets.push(this);
    }
    send(message) {
      this.sent.push(JSON.parse(message));
    }
    close() {
      this.readyState = 3;
      this.onclose?.();
    }
  }
  const context = {
    ...helpers,
    Sounds: class {
      update() {}
      unlock() {
        return Promise.resolve();
      }
    },
    World: class {
      boostFeedback() {
        this.boostCount = (this.boostCount ?? 0) + 1;
      }
    },
    Phaser: { Game: class {}, AUTO: 0, Scale: { RESIZE: 0 } },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    innerWidth: 1200,
    innerHeight: 800,
    location: {
      search,
      protocol: "http:",
      hostname: "localhost",
      host: "localhost:18081",
    },
    document: {
      querySelector: node,
      querySelectorAll: () => [],
      hidden: false,
      addEventListener: register,
    },
    window: {
      addEventListener: register,
      matchMedia: () => ({
        matches: !!options.reducedMotion,
        addEventListener() {},
      }),
    },
    navigator: { vibrate: options.vibrate ?? (() => {}) },
    URLSearchParams,
    URL,
    Error,
    WebSocket: Socket,
    setTimeout: (fn, delay) => {
      const id = ++nextTimer;
      timers.set(id, { fn, at: now + delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    setInterval: (fn) => intervals.push(fn),
    performance: { now: () => now },
  };
  vm.createContext(context);
  vm.runInContext(
    compiled +
      "\n;globalThis.testConnect = connect; globalThis.testDefaultUrl = defaultUrl; globalThis.testWorld = world;",
    context,
  );
  return {
    tick(ms) {
      now += ms;
      for (const [id, t] of [...timers])
        if (t.at <= now) {
          timers.delete(id);
          t.fn();
        }
      for (const fn of intervals) fn();
    },
    visibility(hidden) {
      context.document.hidden = hidden;
      listeners.visibilitychange();
    },
    dispatch: (event, data = {}) => listeners[event]?.(data),
    context,
    sockets,
    storage,
    node,
    connect: () => context.testConnect(),
  };
}

test("connection handlers isolate server tokens and never transmit legacy global token", () => {
  const h = harness();
  for (const [host, expected] of [
    ["server-a", "token-a"],
    ["server-b", "token-b"],
    ["server-c", undefined],
  ]) {
    h.node("#server").value = `ws://${host}.test/ws`;
    h.connect();
    const socket = h.sockets.at(-1);
    socket.onopen();
    assert.equal(socket.sent.length, 1);
    assert.equal(socket.sent[0].type, "join");
    assert.equal(socket.sent[0].token, expected);
  }
});

test("stale socket onopen and onerror cannot mutate the replacement connection", () => {
  const h = harness();
  h.connect();
  const old = h.sockets[0];
  h.node("#server").value = "ws://server-b.test/ws";
  h.connect();
  const current = h.sockets[1];
  current.onopen();
  const status = h.node("#status").textContent;
  const error = h.node("#error").textContent;
  old.onopen();
  old.onerror();
  assert.equal(old.sent.length, 0);
  assert.equal(current.sent.length, 1);
  assert.equal(h.node("#status").textContent, status);
  assert.equal(h.node("#error").textContent, error);
});

test("join error survives close and renders a retry screen without dropping token", () => {
  const h = harness();
  h.connect();
  const socket = h.sockets[0];
  socket.onopen();
  socket.onmessage({
    data: JSON.stringify({ type: "error", message: "Lobby full" }),
  });
  assert.equal(socket.readyState, 3);
  assert.match(h.node("#surface").innerHTML, /Lobby full/);
  assert.match(h.node("#surface").innerHTML, /重新连接/);
  assert.equal(h.storage.get(helpers.tokenStorageKey(socket.url)), "token-a");
  assert.equal(h.sockets.length, 1, "no automatic retry loop");
});

test("invalid socket URL is rejected before construction and connection remains retryable", () => {
  const h = harness();
  h.node("#server").value = "ws://server-a.test/ws#fragment";
  h.connect();
  assert.equal(h.sockets.length, 0);
  assert.ok(h.node("#error").textContent.length > 0);
  h.node("#server").value = "ws://server-a.test/ws";
  h.connect();
  assert.equal(h.sockets.length, 1);
});

test("default WebSocket uses the actual page port", () => {
  assert.equal(harness().context.testDefaultUrl, "ws://localhost:18081/ws");
});

function welcome(h, socket = h.sockets.at(-1)) {
  socket.onopen();
  socket.onmessage({
    data: JSON.stringify({ type: "welcome", id: "p1", token: "renewed" }),
  });
  return socket;
}
test("default HUD measures actual matching pong RTT, ignores duplicates and expires stale values", () => {
  const h = harness();
  h.connect();
  const socket = welcome(h);
  h.tick(1);
  const ping = socket.sent.find((x) => x.type === "ping");
  assert.ok(ping, "welcome starts low-frequency app ping");
  h.tick(82);
  socket.onmessage({ data: JSON.stringify({ type: "pong", id: ping.id }) });
  assert.match(h.node("#latency").textContent, /82 ms/);
  h.tick(100);
  socket.onmessage({ data: JSON.stringify({ type: "pong", id: ping.id }) });
  assert.match(h.node("#latency").textContent, /82 ms/);
  h.tick(6000);
  assert.doesNotMatch(h.node("#latency").textContent, /82 ms/);
});
test("hide invalidates RTT, foreground reconnects once with pinned endpoint and scoped token", () => {
  const h = harness();
  h.connect();
  const socket = welcome(h);
  h.tick(1);
  h.visibility(true);
  assert.match(h.node("#latency").textContent, /后台/);
  socket.close();
  h.tick(10000);
  assert.equal(h.sockets.length, 1, "no background retries");
  h.node("#server").value = "ws://server-b.test/ws";
  h.visibility(false);
  assert.equal(h.sockets.length, 2);
  h.visibility(false);
  assert.equal(h.sockets.length, 2, "no parallel attempts");
  const fresh = h.sockets[1];
  fresh.onopen();
  assert.equal(fresh.url, "ws://server-a.test/ws");
  assert.equal(fresh.sent[0].token, "renewed");
});
test("network close retries, but rejected join stops automatic retries", () => {
  const h = harness();
  h.connect();
  const socket = welcome(h);
  socket.close();
  h.tick(1000);
  assert.equal(h.sockets.length, 2);
  const retry = h.sockets[1];
  retry.onopen();
  retry.onmessage({
    data: JSON.stringify({ type: "error", message: "Lobby full" }),
  });
  h.tick(30000);
  assert.equal(h.sockets.length, 2);
});
test("pong from replaced socket cannot restore old RTT", () => {
  const h = harness();
  h.connect();
  const old = welcome(h);
  h.tick(1);
  const ping = old.sent.find((x) => x.type === "ping");
  h.connect();
  welcome(h);
  h.tick(100);
  old.onmessage({ data: JSON.stringify({ type: "pong", id: ping?.id }) });
  assert.doesNotMatch(h.node("#latency").textContent, /100 ms/);
});

test("waiting join shows estimate, stays alive, and accepts welcome without sending join again", () => {
  const h = harness();
  h.connect();
  const socket = h.sockets[0];
  socket.onopen();
  socket.onmessage({
    data: JSON.stringify({
      type: "waiting",
      reason: "playing",
      phase: "playing",
      availableIn: 42,
      remaining: 32,
    }),
  });
  assert.match(h.node("#surface").innerHTML, /预计/);
  assert.match(h.node("#wait-estimate").textContent, /42/);
  for (let i = 0; i < 10; i++) {
    h.tick(1000);
    socket.onmessage({
      data: JSON.stringify({
        type: "waiting",
        reason: "playing",
        availableIn: 41 - i,
        remaining: 31 - i,
      }),
    });
  }
  assert.equal(socket.readyState, 1);
  assert.equal(socket.sent.filter((x) => x.type === "join").length, 1);
  socket.onmessage({
    data: JSON.stringify({ type: "welcome", id: "p1", token: "new-token" }),
  });
  assert.equal(h.storage.get(helpers.tokenStorageKey(socket.url)), "new-token");
  assert.match(h.node("#status").textContent, /在线/);
});
test("waiting full has no invented ETA; cancel stops retries and invalidates old socket", () => {
  const h = harness();
  h.connect();
  const socket = h.sockets[0];
  socket.onopen();
  socket.onmessage({
    data: JSON.stringify({
      type: "waiting",
      reason: "full",
      availableIn: null,
      remaining: 0,
    }),
  });
  assert.match(h.node("#wait-estimate").textContent, /预计.*暂无法确定/);
  assert.equal(typeof h.node("#cancel-wait").onclick, "function");
  h.node("#cancel-wait").onclick();
  h.tick(30000);
  h.visibility(true);
  h.visibility(false);
  assert.equal(h.sockets.length, 1);
  socket.onmessage({
    data: JSON.stringify({ type: "welcome", id: "p2", token: "stale" }),
  });
  assert.notEqual(h.storage.get(helpers.tokenStorageKey(socket.url)), "stale");
});

test("cancel during reconnect backoff prevents the scheduled attempt and foreground retry", () => {
  const h = harness();
  h.connect();
  welcome(h).close();
  h.node("#cancel-connect").onclick();
  h.tick(30000);
  h.visibility(true);
  h.visibility(false);
  assert.equal(h.sockets.length, 1);
});
test("waiting connections measure pong RTT and hidden late pong cannot revive it", () => {
  const h = harness();
  h.connect();
  const socket = h.sockets[0];
  socket.onopen();
  socket.onmessage({
    data: JSON.stringify({ type: "waiting", availableIn: 42 }),
  });
  h.tick(1);
  const ping = socket.sent.find((x) => x.type === "ping");
  assert.ok(ping);
  h.tick(45);
  socket.onmessage({ data: JSON.stringify({ type: "pong", id: ping.id }) });
  assert.match(h.node("#latency").textContent, /45 ms/);
  h.visibility(true);
  socket.onmessage({ data: JSON.stringify({ type: "pong", id: ping.id }) });
  assert.match(h.node("#latency").textContent, /后台/);
});

test("finished screen explains automatic return countdown", () => {
  const h = harness();
  h.connect();
  const socket = welcome(h);
  socket.onmessage({
    data: JSON.stringify({
      type: "state",
      phase: "finished",
      remaining: 0,
      returnIn: 7.2,
      players: [],
      results: [],
      stations: [],
      batteries: [],
    }),
  });
  assert.match(h.node("#return-countdown").textContent, /约 8 秒后返回大厅/);
});
test("debug diagnostics are opt-in and snapshots never become network RTT", () => {
  assert.doesNotMatch(harness().node("#app").innerHTML, /id="diagnostics"/);
  const h = harness("?debug=1");
  h.connect();
  const socket = welcome(h);
  assert.match(h.node("#app").innerHTML, /id="diagnostics"/);
  const snapshot = () =>
    socket.onmessage({
      data: JSON.stringify({
        type: "state",
        phase: "lobby",
        remaining: 0,
        players: [],
        stations: [],
        batteries: [],
      }),
    });
  snapshot();
  h.tick(50);
  snapshot();
  h.tick(1);
  assert.match(h.node("#diagnostics").textContent, /快照间隔：50 ms/);
  assert.doesNotMatch(h.node("#latency").textContent, /50 ms/);
});

test("automatic reconnect retries a transient old-socket guest conflict until release", () => {
  const h = harness();
  h.connect();
  welcome(h).close();
  h.tick(1000);
  const retry = h.sockets[1];
  retry.onopen();
  retry.onmessage({
    data: JSON.stringify({
      type: "error",
      message: "Guest already connected; close the other tab first",
    }),
  });
  h.tick(2000);
  assert.equal(h.sockets.length, 3);
  welcome(h);
  assert.match(h.node("#status").textContent, /在线/);
});
test("manual duplicate guest conflict does not retry or take over", () => {
  const h = harness();
  h.connect();
  const socket = h.sockets[0];
  socket.onopen();
  socket.onmessage({
    data: JSON.stringify({
      type: "error",
      message: "Guest already connected; close the other tab first",
    }),
  });
  h.tick(30000);
  assert.equal(h.sockets.length, 1);
  assert.match(h.node("#surface").innerHTML, /Guest already connected/);
});

function playing(h, player) {
  h.sockets.at(-1).onmessage({
    data: JSON.stringify({
      type: "state",
      phase: "playing",
      remaining: 120,
      players: [
        {
          id: "p1",
          name: "car",
          color: "#38bdf8",
          x: 0,
          y: 0,
          cargo: 0,
          score: 0,
          cooldown: 0,
          boost: 0,
          stun: 0,
          hitSeq: 0,
          ...player,
        },
      ],
      batteries: [],
      stations: [],
    }),
  });
}
test("authoritative hit sequence notifies empty-cargo driver and stun blocks boost inputs", () => {
  const h = harness();
  h.connect();
  welcome(h);
  playing(h, {});
  playing(h, { hitSeq: 1, stun: 1 });
  assert.match(h.node("#stun-status").textContent, /被撞！眩晕1秒/);
  assert.equal(h.node("#boost").disabled, true);
  h.tick(50);
  const input = h.sockets
    .at(-1)
    .sent.filter((x) => x.type === "input")
    .at(-1);
  assert.equal(input.boost, false);
  assert.equal(input.x, 0);
  playing(h, { hitSeq: 1, stun: 0.6 });
  assert.match(h.node("#stun-status").textContent, /0.6/);
  playing(h, { hitSeq: 1, stun: 0 });
  assert.equal(h.node("#boost").disabled, false);
  assert.equal(h.node("#stun-status").textContent, "");
});
test("reduced-effects toggle persists choice and updates renderer", () => {
  const h = harness();
  h.connect();
  welcome(h);
  playing(h, {});
  assert.match(h.node("#surface").innerHTML, /id="effects"/);
  h.node("#effects").onclick();
  assert.equal(h.storage.get("rover.reducedEffects"), "on");
});

test("system reduced motion defaults on and suppresses haptics while preserving boost renderer event", () => {
  const vibrations = [];
  const h = harness("", {
    reducedMotion: true,
    vibrate: (n) => vibrations.push(n),
  });
  h.connect();
  welcome(h);
  playing(h, {});
  assert.equal(h.context.testWorld.reducedEffects, true);
  playing(h, { cooldown: 4, boost: 0.32 });
  assert.deepEqual(vibrations, []);
  assert.equal(h.context.testWorld.boostCount, 1);
  h.node("#effects").onclick();
  assert.equal(h.context.testWorld.reducedEffects, false);
  assert.equal(h.storage.get("rover.reducedEffects"), "off");
});
test("boost haptics use 25ms once per authoritative activation and tolerate denied vibration", () => {
  const vibrations = [];
  const h = harness("", {
    vibrate: (n) => {
      vibrations.push(n);
      throw new Error("not supported");
    },
  });
  h.connect();
  welcome(h);
  playing(h, {});
  playing(h, { cooldown: 4, boost: 0.32 });
  playing(h, { cooldown: 3.94, boost: 0.27 });
  assert.deepEqual(vibrations, [25]);
  assert.equal(h.context.testWorld.boostCount, 1);
  assert.match(h.node("#boost").innerHTML, /3.9/);
});

test("hit notice expires with the one-second stun rather than lingering as a stale warning", () => {
  const h = harness();
  h.connect();
  welcome(h);
  playing(h, {});
  playing(h, { hitSeq: 1, stun: 1 });
  assert.equal(h.node("#notice").classList.values.has("hidden"), false);
  h.tick(1000);
  assert.equal(h.node("#notice").classList.values.has("hidden"), true);
});
test("disconnect suspends retained snapshot effects until a fresh state", () => {
  const h = harness();
  h.connect();
  const socket = welcome(h);
  playing(h, { boost: 0.2 });
  socket.close();
  assert.equal(h.context.testWorld.liveEffects, false);
});

function touch(id, x = 20, y = 700) {
  return {
    pointerId: id,
    pointerType: "touch",
    clientX: x,
    clientY: y,
    preventDefault() {},
  };
}
test("floating joystick owns one touch, supports boost on a second finger, and resets on every interruption", () => {
  const h = harness();
  h.connect();
  const socket = welcome(h);
  playing(h, {});
  const drive = (event, p) => h.dispatch(`#game:${event}`, p);
  const input = () => {
    h.tick(50);
    return socket.sent.filter((x) => x.type === "input").at(-1);
  };
  drive("pointerdown", touch(1, 2, 799));
  assert.equal(h.node("#joystick").style.left, "2px");
  assert.equal(input().x, 0);
  h.dispatch("pointermove", touch(1, 40, 799));
  assert.equal(input().x, 1);
  h.dispatch("#boost:pointerdown", touch(2));
  h.dispatch("pointercancel", touch(2));
  assert.equal(input().x, 1);
  h.dispatch("#boost:pointerdown", touch(2));
  assert.equal(input().boost, true);
  for (const ending of [
    "pointerup",
    "pointercancel",
    "lostpointercapture",
    "blur",
    "resize",
    "hidden",
  ]) {
    if (ending === "hidden") h.visibility(true);
    else h.dispatch(ending, touch(1));
    assert.equal(
      h.node("#joystick").classList.values.has("active"),
      false,
      ending,
    );
    assert.equal(input().x, 0, ending);
    h.dispatch("pointermove", touch(1, 300, 200));
    assert.equal(input().x, 0, `no ghost after ${ending}`);
    h.visibility(false);
    drive("pointerdown", touch(1, 150, 300));
    h.dispatch("pointermove", touch(1, 188, 300));
    assert.equal(input().x, 1);
  }
  socket.close();
  assert.equal(h.node("#joystick").classList.values.has("active"), false);
});
test("menus and mouse do not start touch driving; the next touch picks a new origin", () => {
  const h = harness();
  h.connect();
  welcome(h);
  playing(h, {});
  h.dispatch("#boost:pointerdown", touch(2));
  h.dispatch("#game:pointerdown", { ...touch(3), pointerType: "mouse" });
  assert.equal(h.node("#joystick").classList.values.has("active"), false);
  h.dispatch("#game:pointerdown", touch(4, 300, 400));
  h.dispatch("pointerup", touch(4));
  h.dispatch("#game:pointerdown", touch(5, 250, 450));
  assert.equal(h.node("#joystick").style.left, "250px");
  assert.equal(h.node("#joystick").style.top, "450px");
});
