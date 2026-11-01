import test from "node:test";
import assert from "node:assert/strict";
import {
  MiniTextDecoder,
  installMiniTextDecoder,
} from "../src/text-decoder.js";
const encoded = (s) => new TextEncoder().encode(s);
test("scoped UTF8 decoder handles GLB JSON ASCII, Chinese and non-BMP text", () => {
  const decoder = new MiniTextDecoder();
  for (const value of ['{"meshes":[]}', "磁力小车 🚙", "é\u0000"])
    assert.equal(decoder.decode(encoded(value)), value);
  const bytes = encoded("xx磁力yy");
  assert.equal(decoder.decode(bytes.subarray(2, 8)), "磁力");
});
test("UTF8 fallback matches replacement handling and BOM behavior", () => {
  const decoder = new MiniTextDecoder(),
    native = new TextDecoder();
  for (const bytes of [
    [0xe2, 0x28, 0xa1],
    [0xe2, 0x82],
    [0xed, 0xa0, 0x80],
    [0xf4, 0x90, 0x80, 0x80],
    [0xef, 0xbb, 0xbf, 65],
    [0xc0, 0xaf],
  ])
    assert.equal(
      decoder.decode(new Uint8Array(bytes)),
      native.decode(new Uint8Array(bytes)),
    );
  assert.equal(
    new MiniTextDecoder("utf-8", { ignoreBOM: true }).decode(
      new Uint8Array([239, 187, 191, 65]),
    ),
    "\ufeffA",
  );
  assert.throws(
    () =>
      new MiniTextDecoder("utf-8", { fatal: true }).decode(
        new Uint8Array([255]),
      ),
    TypeError,
  );
});
test("installation retains native decoder and fills only missing hosts", () => {
  const native = { TextDecoder };
  const missing = {};
  installMiniTextDecoder(native, missing);
  assert.equal(native.TextDecoder, TextDecoder);
  assert.equal(missing.TextDecoder, TextDecoder);
  const absent = {};
  installMiniTextDecoder(absent);
  assert.equal(absent.TextDecoder, MiniTextDecoder);
});
test("delivered texture-free GLB parses through actual GLTFLoader with fallback decoder", async () => {
  const { readFile } = await import("node:fs/promises");
  const { GLTFLoader } =
    await import("../../client/node_modules/three/examples/jsm/loaders/GLTFLoader.js");
  const bytes = await readFile(
    new URL(
      "../../client/public/assets/cartoon/rover-showroom/rover.glb",
      import.meta.url,
    ),
  );
  const data = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  const json = JSON.parse(
    new MiniTextDecoder().decode(
      new Uint8Array(data, 20, new DataView(data).getUint32(12, true)),
    ),
  );
  assert.equal(json.textures?.length ?? 0, 0);
  assert.equal(json.images?.length ?? 0, 0);
  assert.ok(json.buffers.every((buffer) => !buffer.uri));
  const native = globalThis.TextDecoder;
  try {
    globalThis.TextDecoder = MiniTextDecoder;
    const loaded = await new GLTFLoader().parseAsync(data, "");
    let meshes = 0;
    loaded.scene.traverse((object) => {
      if (object.isMesh) meshes++;
    });
    assert.ok(meshes > 0);
  } finally {
    globalThis.TextDecoder = native;
  }
});
