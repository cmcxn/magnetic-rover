import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compactWav, SOUND_NAMES } from "../audio-assets.mjs";
test("all six packaged WAVs stay native-compatible; short effects fade out and preserve sources", async () => {
  let total = 0;
  for (const name of SOUND_NAMES) {
    const input = await readFile(
        new URL(
          `../../client/public/assets/audio/${name}.wav`,
          import.meta.url,
        ),
      ),
      copy = Buffer.from(input);
    const out = compactWav(
      input,
      name === "pickup" ? 0.22 : name === "boost" ? 0.28 : Infinity,
    );
    assert.ok(input.equals(copy));
    assert.equal(out.readUInt32LE(24), 22050);
    assert.equal(out.readUInt16LE(22), 1);
    assert.equal(out.readUInt16LE(34), 16);
    assert.equal(out.readUInt32LE(40), out.length - 44);
    assert.ok(out.length < input.length);
    if (["pickup", "boost"].includes(name))
      assert.equal(out.readInt16LE(out.length - 2), 0);
    total += out.length;
  }
  assert.ok(
    total < 180 * 1024,
    "audio must not recreate the previous package-size failure",
  );
});
