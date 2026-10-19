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

function harness() {
  const nodes = new Map();
  let now = 0,
    nextTimer = 0;
  const timers = new Map(),
    intervals = [],
    listeners = {};
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
        classList: { toggle() {}, add() {}, remove() {} },
        addEventListener() {},
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
    World: class {},
    Phaser: { Game: class {}, AUTO: 0, Scale: { RESIZE: 0 } },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    innerWidth: 1200,
    innerHeight: 800,
    location: {
      search: "",
      protocol: "http:",
      hostname: "localhost",
      host: "localhost:18081",
    },
    document: {
      querySelector: node,
      querySelectorAll: () => [],
      hidden: false,
      addEventListener: (event, fn) => (listeners[event] = fn),
    },
    window: { addEventListener: (event, fn) => (listeners[event] = fn) },
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
      "\n;globalThis.testConnect = connect; globalThis.testDefaultUrl = defaultUrl;",
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
