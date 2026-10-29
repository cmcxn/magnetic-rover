import { writeFile } from "node:fs/promises";
// Original synthesis: bright motor harmonics plus periodic filtered air noise.
const rate = 44100,
  frames = Math.round(0.48 * rate),
  period = Math.round(0.4 * rate),
  out = Buffer.alloc(44 + frames * 2);
out.write("RIFF");
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
const noise = (i) => {
  let x = ((((i % period) + period) % period) + 17) | 0;
  x = Math.imul(x ^ 0x45d9f3b, 0x45d9f3b);
  x ^= x >>> 16;
  return ((x >>> 0) / 0xffffffff) * 2 - 1;
};
for (let i = 0; i < frames; i++) {
  const t = i / rate,
    p = Math.PI * 2 * t;
  const tone =
    0.28 * Math.sin(250 * p) +
    0.24 * Math.sin(500 * p) +
    0.16 * Math.sin(750 * p) +
    0.1 * Math.sin(1000 * p);
  const air = 0.055 * (noise(i) - noise(i - 1));
  const pulse = 0.87 + 0.13 * Math.sin(50 * p);
  const v = (tone + air) * pulse * Math.min(1, t / 0.005);
  out.writeInt16LE(
    Math.round(Math.max(-0.95, Math.min(0.95, v)) * 32767),
    44 + i * 2,
  );
}
await writeFile(
  new URL("../client/public/assets/audio/boost-engine.wav", import.meta.url),
  out,
);
