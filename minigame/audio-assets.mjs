import { readFile, mkdir, writeFile, copyFile } from "node:fs/promises";
import { join } from "node:path";
export const SOUND_NAMES = [
  "pickup",
  "boost",
  "hit",
  "deposit",
  "countdown",
  "result",
];
/** PCM WAV only; keep native iOS/Android decoding portable, with no build dependency. */
export function compactWav(input, limitSeconds = Infinity) {
  if (
    input.toString("ascii", 0, 4) !== "RIFF" ||
    input.toString("ascii", 8, 12) !== "WAVE"
  )
    throw new Error("Expected RIFF WAVE");
  let format, data;
  for (let o = 12; o + 8 <= input.length;) {
    const id = input.toString("ascii", o, o + 4),
      n = input.readUInt32LE(o + 4);
    if (o + 8 + n > input.length) throw new Error("Truncated WAV");
    if (id === "fmt ") format = input.subarray(o + 8, o + 8 + n);
    if (id === "data") data = input.subarray(o + 8, o + 8 + n);
    o += 8 + n + (n % 2);
  }
  if (
    !format ||
    !data ||
    format.readUInt16LE(0) !== 1 ||
    format.readUInt16LE(2) !== 1 ||
    format.readUInt16LE(14) !== 16 ||
    format.readUInt32LE(4) !== 44100
  )
    throw new Error("Expected 44.1kHz mono PCM16");
  const rate = 22050,
    frames = Math.min(
      Math.floor(data.length / 4),
      Math.floor(limitSeconds * rate),
    ),
    out = Buffer.alloc(44 + frames * 2);
  out.write("RIFF", 0);
  out.writeUInt32LE(out.length - 8, 4);
  out.write("WAVEfmt ", 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24);
  out.writeUInt32LE(rate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36);
  out.writeUInt32LE(frames * 2, 40);
  const fade = Number.isFinite(limitSeconds)
    ? Math.min(frames, Math.floor(rate * 0.04))
    : 0;
  for (let i = 0; i < frames; i++) {
    const average = (data.readInt16LE(i * 4) + data.readInt16LE(i * 4 + 2)) / 2,
      gain = fade && i >= frames - fade ? (frames - i - 1) / fade : 1;
    out.writeInt16LE(Math.round(average * gain), 44 + i * 2);
  }
  return out;
}
export async function buildAudio(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const name of SOUND_NAMES) {
    const data = await readFile(
      join(source, (name === "boost" ? "boost-engine" : name) + ".wav"),
    );
    await writeFile(
      join(destination, name + ".wav"),
      compactWav(data, name === "pickup" ? 0.22 : Infinity),
    );
  }
  await copyFile(
    join(source, "KENNEY-LICENSE.txt"),
    join(destination, "KENNEY-LICENSE.txt"),
  );
}
