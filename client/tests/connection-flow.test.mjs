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
    location: { search: "", protocol: "http:", hostname: "localhost", host: "localhost:18081" },
    document: {
      querySelector: node,
      querySelectorAll: () => [],
      addEventListener() {},
    },
    window: { addEventListener() {} },
    URLSearchParams,
    URL,
    Error,
    WebSocket: Socket,
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval() {},
    performance: { now: () => 0 },
  };
  vm.createContext(context);
  vm.runInContext(compiled + "\n;globalThis.testConnect = connect; globalThis.testDefaultUrl = defaultUrl;", context);
  return {
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
