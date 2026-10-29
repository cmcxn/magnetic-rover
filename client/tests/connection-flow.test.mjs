import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as helpers from "../src/types.ts";
import * as presentation from "../src/presentation.ts";
import { FrameMetrics } from "../src/performance.ts";

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
        style: {
          setProperty(name, value) {
            this[name] = value;
          },
        },
        dataset: {},
        insertAdjacentHTML(_, value) {
          this.innerHTML += value;
        },
        firstElementChild: { style: {} },
        attributes: new Map(),
        getAttribute(name) {
          return this.attributes.get(name) ?? null;
        },
        setAttribute(name, value) {
          this.attributes.set(name, value);
        },
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
    ...presentation,
    FrameMetrics,
    Sounds: class {
      update() {}
      unlock() {
        return Promise.resolve();
      }
    },
    World: class {
      smooth = new Map();
      inputSeq = 0;
      inputCommand(input) {
        return { type: "input", ...input, seq: ++this.inputSeq };
      }
      resetMotion() {
        this.motionResets = (this.motionResets ?? 0) + 1;
      }

      pickupFeedback(n) {
        this.pickups = [...(this.pickups ?? []), n];
      }
      clearPickupFeedback() {
        this.clears = (this.clears ?? 0) + 1;
      }
      boostFeedback() {
        this.boostCount = (this.boostCount ?? 0) + 1;
      }
    },
    Phaser: {
      Game: class {
        events = { on: (event, fn) => register(event, fn) };
      },
      Core: { Events: { POST_RENDER: "postrender" } },
      AUTO: 0,
      Scale: { RESIZE: 0 },
    },
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
      querySelectorAll: (selector) =>
        selector === ".leave-room" ? [node(selector)] : [],
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
  assert.match(h.node("#surface").innerHTML, /房间已满员/);
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
  assert.match(h.node("#surface").innerHTML, /此车手已在另一个页面连接/);
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
  assert.match(h.node("#boost").innerHTML, /0.3秒/);
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

test("pickup feedback uses local authoritative counts, silently baselines reconnects and ignores hidden events", () => {
  const h = harness();
  h.connect();
  const socket = welcome(h);
  playing(h, { pickupSeq: 12, cargo: 12 });
  assert.equal(h.context.testWorld.pickups, undefined);
  playing(h, { pickupSeq: 12, cargo: 19 });
  assert.equal(h.context.testWorld.pickups, undefined);
  playing(h, { pickupSeq: 15, cargo: 2 });
  assert.deepEqual(Array.from(h.context.testWorld.pickups), [3]);
  h.visibility(true);
  const clears = h.context.testWorld.clears;
  assert.ok(clears > 0, "background must clear an in-flight effect");
  playing(h, { pickupSeq: 17, cargo: 4 });
  h.visibility(false);
  playing(h, { pickupSeq: 17, cargo: 4 });
  assert.deepEqual(Array.from(h.context.testWorld.pickups), [3]);
  socket.close();
  h.tick(2000);
  welcome(h);
  playing(h, { pickupSeq: 20, cargo: 7 });
  assert.deepEqual(Array.from(h.context.testWorld.pickups), [3]);
  playing(h, { pickupSeq: 21, cargo: 8 });
  assert.deepEqual(Array.from(h.context.testWorld.pickups), [3, 1]);
});

test("canceled boost touch and resize discard queued dash; normal up keeps the intended tap", () => {
  for (const ending of [
    "pointercancel",
    "lostpointercapture",
    "resize",
    "pointerup",
  ]) {
    const h = harness();
    h.connect();
    const socket = welcome(h);
    playing(h, {});
    h.dispatch("#game:pointerdown", touch(1, 20, 400));
    h.dispatch("pointermove", touch(1, 58, 400));
    h.dispatch("#boost:pointerdown", touch(2));
    h.dispatch(ending, touch(2));
    h.tick(50);
    const input = socket.sent.filter((x) => x.type === "input").at(-1);
    assert.equal(input.boost, ending === "pointerup", ending);
    assert.equal(input.x, ending === "resize" ? 0 : 1, ending);
  }
});

test("movement-owner release or cancellation clears queued dash safely", () => {
  for (const ending of ["pointercancel", "lostpointercapture", "pointerup"]) {
    const h = harness();
    h.connect();
    const socket = welcome(h);
    playing(h, {});
    h.dispatch("#game:pointerdown", touch(1, 20, 400));
    h.dispatch("pointermove", touch(1, 58, 400));
    h.dispatch("#boost:pointerdown", touch(2));
    h.dispatch(ending, touch(1));
    h.tick(50);
    const input = socket.sent.filter((x) => x.type === "input").at(-1);
    assert.equal(input.boost, false, ending);
    assert.equal(input.x, 0, ending);
  }
});

test("playing HUD has separate compact mobile menus and horizontal cargo label", () => {
  const h = harness();
  h.connect();
  welcome(h);
  playing(h, { cargo: 20 });
  const html = h.node("#surface").innerHTML;
  assert.match(html, /id="ranking-toggle"/);
  assert.match(html, /aria-controls="ranking" aria-expanded="false"/);
  assert.match(html, /id="settings-toggle"/);
  assert.match(html, /id="settings"/);
  assert.match(html, /<small>载货<\/small>/);
});

test("mobile menus toggle independently and close the other overlay", () => {
  const h = harness();
  h.connect();
  welcome(h);
  playing(h, {});
  h.node("#ranking-toggle").onclick();
  assert.equal(h.node("#ranking-toggle").getAttribute("aria-expanded"), "true");
  assert.equal(h.node(".leaderboard").classList.values.has("expanded"), true);
  h.node("#settings-toggle").onclick();
  assert.equal(h.node(".leaderboard").classList.values.has("expanded"), false);
  assert.equal(h.node("#settings").classList.values.has("expanded"), true);
  h.node("#settings-toggle").onclick();
  assert.equal(h.node("#settings").classList.values.has("expanded"), false);
});

test("second concurrent field touch queues one boost; third touch and repeated moves do not", () => {
  const h = harness();
  h.connect();
  const socket = welcome(h);
  playing(h, {});
  const down = (id) => h.dispatch("#game:pointerdown", touch(id));
  const input = () => {
    h.tick(50);
    return socket.sent.filter((x) => x.type === "input").at(-1);
  };
  down(1);
  h.dispatch("pointermove", touch(1, 58, 700));
  assert.equal(input().x, 1);
  down(2);
  assert.equal(input().boost, true);
  assert.equal(input().boost, false);
  down(3);
  assert.equal(input().boost, false);
  h.dispatch("pointermove", touch(2, 200, 100));
  assert.equal(input().x, 1);
  h.dispatch("pointerup", touch(2));
  assert.equal(input().x, 1);
  down(4);
  assert.equal(
    input().boost,
    false,
    "existing third finger prevents a new second-touch dash",
  );
  h.dispatch("pointerup", touch(3));
  h.dispatch("pointerup", touch(4));
  down(5);
  h.dispatch("pointerup", touch(5));
  assert.equal(input().boost, true, "normal second tap survives release");
  down(6);
  h.dispatch("pointerup", touch(1));
  assert.equal(input().boost, false, "owner release clears queued dash");
  assert.equal(input().x, 0);
  down(7);
  assert.equal(input().x, 0);
  assert.equal(
    h.node("#joystick").classList.values.has("active"),
    false,
    "wait until remaining fingers lift",
  );
  h.dispatch("pointerup", touch(6));
  h.dispatch("pointerup", touch(7));
  down(8);
  assert.equal(h.node("#joystick").classList.values.has("active"), true);
});

test("field boost cancels cleanly on interruption and is blocked by cooldown or stun", () => {
  for (const ending of [
    "pointercancel",
    "lostpointercapture",
    "blur",
    "resize",
    "orientationchange",
    "hidden",
  ]) {
    const h = harness();
    h.connect();
    const socket = welcome(h);
    playing(h, {});
    h.dispatch("#game:pointerdown", touch(1));
    h.dispatch("#game:pointerdown", touch(2));
    if (ending === "hidden") h.visibility(true);
    else h.dispatch(ending, touch(2));
    h.tick(50);
    assert.equal(
      socket.sent.filter((x) => x.type === "input").at(-1).boost,
      false,
      ending,
    );
  }
  for (const player of [{ cooldown: 2 }, { stun: 1 }]) {
    const h = harness();
    h.connect();
    const socket = welcome(h);
    playing(h, player);
    h.dispatch("#game:pointerdown", touch(1));
    h.dispatch("#game:pointerdown", touch(2));
    h.tick(50);
    assert.equal(
      socket.sent.filter((x) => x.type === "input").at(-1).boost,
      false,
    );
  }
});

test("sequential single taps never boost and UI taps cannot become the field second finger", () => {
  const h = harness();
  h.connect();
  const socket = welcome(h);
  playing(h, {});
  const input = () => {
    h.tick(50);
    return socket.sent.filter((x) => x.type === "input").at(-1);
  };
  for (const id of [1, 2, 3]) {
    h.dispatch("#game:pointerdown", touch(id));
    h.dispatch("pointerup", touch(id));
    assert.equal(input().boost, false);
  }
  h.dispatch("#game:pointerdown", touch(4));
  h.dispatch("#settings-toggle:pointerdown", touch(5));
  h.node("#settings-toggle").onclick();
  assert.equal(input().boost, false);
  assert.equal(h.node("#joystick").classList.values.has("active"), true);
  h.dispatch("#game:pointerdown", touch(6));
  socket.close();
  h.tick(2000);
  welcome(h);
  playing(h, {});
  assert.equal(input().boost, false);
  assert.equal(input().x, 0);
  h.dispatch("#game:pointerdown", touch(7));
  assert.equal(h.node("#joystick").classList.values.has("active"), true);
});
test("accessible boost activation works without a pointer and respects cooldown", () => {
  const h = harness();
  h.connect();
  const socket = welcome(h);
  playing(h, {});
  h.dispatch("#boost:click", { detail: 0 });
  h.tick(50);
  assert.equal(
    socket.sent.filter((x) => x.type === "input").at(-1).boost,
    true,
  );
  playing(h, { cooldown: 2 });
  h.dispatch("#boost:click", { detail: 0 });
  h.tick(50);
  assert.equal(
    socket.sent.filter((x) => x.type === "input").at(-1).boost,
    false,
  );
});

function deliver(socket, data) {
  socket.onmessage({ data: JSON.stringify(data) });
}
function roomWelcome(socket, roomId, role = "player") {
  deliver(socket, {
    type: "welcome",
    id: role === "player" ? "p1" : "",
    token: "stable-guest",
    roomId,
    role,
  });
}
function roomState(socket, roomId, phase = "lobby", ready = false) {
  deliver(socket, {
    type: "state",
    roomId,
    roomCode: roomId,
    phase,
    remaining: 100,
    readyCount: Number(ready),
    players: [
      {
        id: "p1",
        name: "车手",
        color: "#38bdf8",
        connected: true,
        ready,
        x: 0,
        y: 0,
        angle: 0,
        cargo: 7,
        score: 3,
        cooldown: 0,
        stun: 0,
        boost: 0,
      },
    ],
    batteries: [],
    stations: [],
  });
}
test("directory handshake stays out of matches and lists safe join and spectate actions", () => {
  const h = harness();
  h.connect();
  const socket = h.sockets[0];
  socket.onopen();
  roomWelcome(socket, null, "directory");
  deliver(socket, {
    type: "rooms",
    rooms: [
      {
        roomId: "1234",
        roomCode: "1234",
        phase: "playing",
        remaining: 72,
        playerCount: 8,
        readyCount: 8,
        spectatorCount: 1,
        canJoin: false,
        canSpectate: true,
      },
    ],
  });
  assert.match(h.node("#surface").innerHTML, /创建房间/);
  assert.match(h.node("#room-list").innerHTML, /观战/);
  assert.match(h.node("#room-list").innerHTML, /data-join="1234" disabled/);
  h.node("#create-room").onclick();
  assert.equal(socket.sent.at(-1).type, "create_room");
  roomState(socket, "1234", "playing");
  assert.equal(
    h.context.testWorld.state,
    null,
    "directory ignores unsolicited state",
  );
});
test("ready toggles in a one-player lobby and waits for server authority", () => {
  const h = harness();
  h.connect();
  const socket = h.sockets[0];
  socket.onopen();
  roomWelcome(socket, "1234");
  roomState(socket, "1234");
  assert.equal(h.node("#start").disabled, false);
  h.dispatch("#start:click");
  assert.deepEqual(socket.sent.at(-1), { type: "ready", ready: true });
  roomState(socket, "1234", "lobby", true);
  assert.match(h.node("#start").textContent, /点击取消/);
  h.dispatch("#start:click");
  assert.deepEqual(socket.sent.at(-1), { type: "ready", ready: false });
});
test("room and role transitions rerender the same phase and reject old-room snapshots", () => {
  const h = harness();
  h.connect();
  const socket = h.sockets[0];
  socket.onopen();
  roomWelcome(socket, "1234");
  roomState(socket, "1234", "playing");
  roomWelcome(socket, "5678", "spectator");
  roomState(socket, "5678", "playing");
  assert.match(h.node("#surface").innerHTML, /follow-player/);
  assert.equal(h.context.testWorld.self, "");
  roomState(socket, "1234", "lobby");
  assert.equal(h.context.testWorld.state.roomId, "5678");
  const before = socket.sent.filter((m) => m.type === "input").length;
  h.dispatch("keydown", { key: " ", code: "Space", preventDefault() {} });
  h.tick(50);
  h.dispatch("blur");
  h.visibility(true);
  assert.equal(
    socket.sent.filter((m) => m.type === "input").length,
    before,
    "spectators never send gameplay inputs",
  );
  h.node("#follow-player").onchange({ target: { value: "p1" } });
  assert.equal(h.context.testWorld.follow, "p1");
});
test("directory snapshots keep reconnect heartbeat alive and preserve the guest token", () => {
  const h = harness();
  h.connect();
  const socket = h.sockets[0];
  socket.onopen();
  roomWelcome(socket, null, "directory");
  for (let i = 0; i < 12; i++) {
    h.tick(1000);
    deliver(socket, { type: "rooms", rooms: [] });
  }
  assert.equal(socket.readyState, 1);
  assert.equal(
    h.storage.get(helpers.tokenStorageKey(socket.url)),
    "stable-guest",
  );
});

test("unchanged directory ticks preserve room action DOM and focus", () => {
  const h = harness();
  h.connect();
  const socket = h.sockets[0];
  socket.onopen();
  roomWelcome(socket, null, "directory");
  const room = {
    roomId: "1234",
    roomCode: "1234",
    phase: "playing",
    remaining: 70,
    playerCount: 2,
    readyCount: 2,
    spectatorCount: 0,
    canJoin: false,
    canSpectate: true,
  };
  deliver(socket, { type: "rooms", rooms: [room] });
  h.node("#room-list").innerHTML = "existing focused DOM";
  deliver(socket, { type: "rooms", rooms: [{ ...room, remaining: 69 }] });
  assert.equal(h.node("#room-list").innerHTML, "existing focused DOM");
});
test("Space on a native UI control does not hijack activation or boost", () => {
  const h = harness();
  h.connect();
  welcome(h);
  playing(h, {});
  let prevented = false;
  h.dispatch("keydown", {
    key: " ",
    code: "Space",
    target: { closest: () => ({}) },
    preventDefault() {
      prevented = true;
    },
  });
  h.tick(50);
  assert.equal(prevented, false);
  assert.equal(
    h.sockets[0].sent.filter((m) => m.type === "input").at(-1).boost,
    false,
  );
});

test("leaving immediately quiesces all inputs until directory acknowledgement", () => {
  const h = harness();
  h.connect();
  const socket = welcome(h);
  roomWelcome(socket, "1234");
  roomState(socket, "1234", "playing");
  h.dispatch("keydown", { key: "d", code: "KeyD" });
  h.dispatch("#game:pointerdown", touch(1));
  h.dispatch("pointermove", touch(1, 58, 700));
  h.dispatch("#boost:pointerdown", touch(2));
  h.node(".leave-room").onclick();
  const leave = socket.sent.findIndex((m) => m.type === "leave_room");
  assert.ok(leave >= 0);
  assert.equal(h.node("#game").captures.size, 0);
  assert.equal(h.node("#joystick").classList.values.has("active"), false);
  h.node(".leave-room").onclick();
  h.dispatch("keydown", { key: "w", code: "KeyW" });
  h.dispatch("#game:pointerdown", touch(3));
  h.dispatch("#boost:pointerdown", touch(4));
  h.tick(50);
  h.dispatch("blur");
  h.visibility(true);
  h.visibility(false);
  // Old-room snapshots are not an acknowledgement of the leave request.
  roomState(socket, "1234", "playing");
  h.tick(50);
  assert.deepEqual(
    socket.sent.slice(leave + 1).filter((m) => m.type !== "ping"),
    [],
  );
  roomWelcome(socket, null, "directory");
  h.dispatch("blur");
  h.visibility(true);
  h.visibility(false);
  h.tick(50);
  assert.deepEqual(
    socket.sent.slice(leave + 1).filter((m) => m.type !== "ping"),
    [],
  );
  roomWelcome(socket, "5678");
  roomState(socket, "5678", "playing");
  h.tick(50);
  assert.deepEqual(socket.sent.at(-1), {
    type: "input",
    seq: 1,
    x: 0,
    y: 0,
    boost: false,
  });
  h.dispatch("keydown", { key: "d", code: "KeyD" });
  h.tick(50);
  assert.equal(socket.sent.at(-1).x, 1);
});

test("focus loss sends neutral only for an acknowledged playing player", () => {
  for (const role of ["directory", "spectator", "player"]) {
    for (const phase of ["lobby", "playing", "finished"]) {
      const h = harness();
      h.connect();
      const socket = welcome(h);
      roomWelcome(socket, role === "directory" ? null : "1234", role);
      if (role !== "directory") roomState(socket, "1234", phase);
      const before = socket.sent.length;
      h.dispatch("blur");
      h.visibility(true);
      const inputs = socket.sent
        .slice(before)
        .filter((m) => m.type === "input");
      assert.equal(
        inputs.length,
        role === "player" && phase === "playing" ? 2 : 0,
        `${role} ${phase}`,
      );
      for (const [index, input] of inputs.entries())
        assert.deepEqual(input, {
          type: "input",
          x: 0,
          y: 0,
          boost: false,
          seq: index + 1,
        });
    }
  }
});

test("pending leave survives disconnect and retries only after membership acknowledgement", () => {
  const h = harness();
  h.connect();
  const socket = welcome(h);
  roomWelcome(socket, "1234");
  roomState(socket, "1234", "playing");
  h.node(".leave-room").onclick();
  socket.close();
  h.tick(1000);
  const resumed = h.sockets.at(-1);
  resumed.onopen();
  h.dispatch("blur");
  h.tick(50);
  assert.deepEqual(
    resumed.sent.map((m) => m.type),
    ["join"],
  );
  roomWelcome(resumed, "1234");
  roomState(resumed, "1234", "playing");
  h.tick(50);
  assert.deepEqual(
    resumed.sent.filter((m) => m.type !== "ping").map((m) => m.type),
    ["join", "leave_room"],
  );
  roomWelcome(resumed, null, "directory");
  roomWelcome(resumed, "5678");
  roomState(resumed, "5678", "playing");
  h.tick(50);
  assert.equal(resumed.sent.at(-1).type, "input");
});

test("leave rejection resynchronizes membership before restoring controls", () => {
  const h = harness();
  h.connect();
  const socket = welcome(h);
  roomWelcome(socket, "1234");
  roomState(socket, "1234", "playing");
  h.node(".leave-room").onclick();
  deliver(socket, { type: "error", message: "Leave rejected" });
  assert.equal(socket.readyState, 3);
  h.tick(1000);
  const resumed = h.sockets.at(-1);
  resumed.onopen();
  roomWelcome(resumed, "1234");
  roomState(resumed, "1234", "playing");
  h.tick(50);
  assert.deepEqual(resumed.sent.at(-1), {
    type: "input",
    seq: 1,
    x: 0,
    y: 0,
    boost: false,
  });
});

test("missing leave acknowledgement reconnects despite ongoing room snapshots", () => {
  const h = harness();
  h.connect();
  const socket = welcome(h);
  roomWelcome(socket, "1234");
  roomState(socket, "1234", "playing");
  h.node(".leave-room").onclick();
  for (let i = 0; i < 8; i++) {
    roomState(socket, "1234", "playing");
    h.tick(1000);
  }
  assert.equal(socket.readyState, 3);
  h.tick(1000);
  const resumed = h.sockets.at(-1);
  resumed.onopen();
  // The original leave may have succeeded before the connection was lost.
  roomWelcome(resumed, null, "directory");
  h.tick(50);
  assert.equal(
    resumed.sent.some((m) => m.type === "leave_room" || m.type === "input"),
    false,
  );
  roomWelcome(resumed, "5678");
  roomState(resumed, "5678", "playing");
  h.tick(50);
  assert.equal(resumed.sent.at(-1).type, "input");
});

test("manual reconnect cancels the old leave deadline while awaiting a new handshake", () => {
  const h = harness();
  h.connect();
  const socket = welcome(h);
  roomWelcome(socket, "1234");
  roomState(socket, "1234", "playing");
  h.node(".leave-room").onclick();
  h.tick(7000);
  h.connect();
  const resumed = h.sockets.at(-1);
  resumed.onopen();
  h.tick(1000);
  assert.equal(
    resumed.readyState,
    1,
    "old leave deadline cannot close replacement socket",
  );
  roomWelcome(resumed, "1234");
  assert.equal(resumed.sent.at(-1).type, "leave_room");
});

test("FPS is visible by default and measured from completed renders independently of connection", () => {
  const h = harness();
  assert.match(h.node("#app").innerHTML, /id="fps"/);
  h.dispatch("postrender");
  for (let i = 0; i < 50; i++) {
    h.tick(20);
    h.dispatch("postrender");
  }
  assert.equal(h.node("#fps").textContent, "FPS：50");
  h.context.document.hidden = true;
  h.dispatch("visibilitychange");
  assert.equal(h.node("#fps").textContent, "FPS：—");
  h.tick(60000);
  h.context.document.hidden = false;
  h.dispatch("visibilitychange");
  h.dispatch("postrender");
  assert.equal(h.node("#fps").textContent, "FPS：—");
  for (let i = 0; i < 50; i++) {
    h.tick(20);
    h.dispatch("postrender");
  }
  assert.equal(h.node("#fps").textContent, "FPS：50");
});

test("regular and neutral inputs use sequenced prediction commands, resets discard stale control", () => {
  const h = harness();
  h.connect();
  const socket = welcome(h);
  playing(h, {});
  h.tick(50);
  const first = socket.sent.filter((m) => m.type === "input").at(-1);
  assert.equal(first.seq, 1);
  const resets = h.context.testWorld.motionResets;
  h.dispatch("blur");
  const neutral = socket.sent.filter((m) => m.type === "input").at(-1);
  assert.equal(neutral.seq, 2);
  assert.equal(neutral.x, 0);
  assert.equal(neutral.y, 0);
  assert.ok(h.context.testWorld.motionResets > resets);
  const beforeClose = h.context.testWorld.motionResets;
  socket.close();
  assert.ok(h.context.testWorld.motionResets > beforeClose);
});

test("out-of-order snapshots cannot rewind authoritative HUD or effects, equal ticks remain valid", () => {
  const h = harness();
  h.connect();
  const socket = welcome(h);
  playing(h, {});
  const base = { ...h.context.testWorld.state, roundId: 2, serverTime: 10 };
  deliver(socket, base);
  deliver(socket, { ...base, serverTime: 9, remaining: 999 });
  assert.equal(h.context.testWorld.state.serverTime, 10);
  deliver(socket, { ...base, roundId: 1, serverTime: 11, remaining: 999 });
  assert.equal(h.context.testWorld.state.roundId, 2);
  deliver(socket, { ...base, remaining: 77 });
  assert.equal(h.context.testWorld.state.remaining, 77);
});

test("compact supply HUD follows server stage, warns before shrinking and signals final banking", () => {
  const h = harness();
  h.connect();
  const socket = welcome(h);
  const snapshot = (supply) =>
    socket.onmessage({
      data: JSON.stringify({
        type: "state",
        phase: "playing",
        remaining: 50,
        players: [],
        stations: [],
        batteries: [],
        supply,
      }),
    });
  snapshot({
    stage: 2,
    outerRadius: 340,
    nextOuterRadius: 230,
    secondsToShrink: 12,
    banking: false,
  });
  assert.equal(h.node("#supply-status").textContent, "2/4区 · 12秒缩");
  snapshot({
    stage: 3,
    outerRadius: 230,
    nextOuterRadius: 140,
    secondsToShrink: 5,
    banking: false,
  });
  assert.equal(h.node("#supply-status").textContent, "3/4区 · 5秒缩");
  snapshot({ stage: 4, outerRadius: 140, banking: false });
  assert.equal(h.node("#supply-status").textContent, "4/4区 · 中心争夺");
  snapshot({ stage: 4, outerRadius: 140, banking: true });
  assert.equal(h.node("#supply-status").textContent, "停补给 · 快回收");
});

test("normal collision notice ends with server stun instead of claiming one second", () => {
  const h = harness();
  h.connect();
  welcome(h);
  playing(h, {});
  playing(h, { hitSeq: 1, stun: 0.65 });
  assert.doesNotMatch(h.node("#notice").textContent, /眩晕1秒/);
  h.tick(650);
  assert.equal(h.node("#notice").classList.values.has("hidden"), true);
});
test("login instructions distinguish boosted drops from ordinary contact", () => {
  const h = harness();
  assert.doesNotMatch(h.node("#surface").innerHTML, /碰撞也会掉落电池/);
  assert.match(h.node("#surface").innerHTML, /冲刺撞击才掉电池/);
});
test("confirmed profile persists name and preferred color for reconnect", () => {
  const h = harness();
  h.connect();
  const socket = h.sockets[0];
  socket.onopen();
  socket.onmessage({
    data: JSON.stringify({
      type: "welcome",
      id: "p1",
      token: "t",
      role: "directory",
      roomId: null,
    }),
  });
  socket.onmessage({
    data: JSON.stringify({
      type: "profile",
      name: "薄荷车手",
      color: helpers.COLORS[6],
    }),
  });
  assert.equal(h.storage.get("rover.name"), "薄荷车手");
  assert.equal(h.storage.get("rover.color"), helpers.COLORS[6]);
});
test("unchanged lobby snapshots preserve color buttons while a click is in progress", () => {
  const h = harness();
  h.connect();
  const socket = h.sockets[0];
  socket.onopen();
  socket.onmessage({
    data: JSON.stringify({
      type: "welcome",
      id: "p1",
      token: "t",
      role: "player",
      roomId: "1",
    }),
  });
  const palette = h.node("#room-palette");
  let writes = 0,
    html = "";
  Object.defineProperty(palette, "innerHTML", {
    get: () => html,
    set: (value) => {
      writes++;
      html = value;
    },
  });
  const snapshot = {
    type: "state",
    phase: "lobby",
    roomId: "1",
    roomCode: "1",
    remaining: 100,
    players: [
      {
        id: "p1",
        name: "Driver",
        color: helpers.COLORS[0],
        connected: true,
        ready: false,
      },
    ],
    batteries: [],
    stations: [],
  };
  socket.onmessage({ data: JSON.stringify(snapshot) });
  const before = writes;
  socket.onmessage({ data: JSON.stringify(snapshot) });
  assert.equal(
    writes,
    before,
    "state heartbeats must not replace clickable buttons",
  );
});
test("hold boost persists across input ticks and space release stops it", () => {
  const h = harness();
  h.connect();
  welcome(h);
  playing(h, { energy: 1, boostHeld: false });
  h.dispatch("keydown", {
    key: " ",
    code: "Space",
    repeat: false,
    preventDefault() {},
  });
  h.tick(50);
  h.tick(50);
  const socket = h.sockets.at(-1);
  let inputs = socket.sent.filter((m) => m.type === "input");
  assert.equal(inputs.at(-1).boost, true);
  h.dispatch("keyup", { key: " ", code: "Space" });
  h.tick(50);
  inputs = socket.sent.filter((m) => m.type === "input");
  assert.equal(inputs.at(-1).boost, false);
});
test("boost click accepts the same predicted recovery state shown by the button", () => {
  const h = harness();
  h.connect();
  const socket = welcome(h);
  playing(h, { energy: 0.5, boostHeld: false, boost: 0, stun: 0.1 });
  h.context.testWorld.predictedPlayer = () => ({
    energy: 0.5,
    boostHeld: false,
    boost: 0,
    stun: 0,
    cooldown: 2,
  });
  h.dispatch("#boost:pointerdown", touch(22));
  assert.equal(
    socket.sent.filter((m) => m.type === "input").at(-1).boost,
    true,
  );
});
