import type { State } from "./types";
const names = [
  "pickup",
  "boost",
  "hit",
  "deposit",
  "countdown",
  "result",
] as const;
type Sound = (typeof names)[number];
export class Sounds {
  context: AudioContext | null = null;
  buffers = new Map<Sound, AudioBuffer>();
  enabled = localStorage.getItem("rover.sound") !== "off";
  last = new Map<Sound, number>();
  async unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      const c = this.context;
      for (const n of names)
        fetch(`/assets/audio/${n}.wav`)
          .then((r) => r.arrayBuffer())
          .then((b) => c.decodeAudioData(b))
          .then((b) => this.buffers.set(n, b))
          .catch(() => {});
    }
    await this.context.resume().catch(() => {});
  }
  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem("rover.sound", this.enabled ? "on" : "off");
    if (this.enabled) void this.unlock().catch(() => {});
    return this.enabled;
  }
  play(n: Sound) {
    const c = this.context,
      b = this.buffers.get(n);
    if (
      !this.enabled ||
      !c ||
      !b ||
      c.state !== "running" ||
      performance.now() - (this.last.get(n) ?? -1000) < 180
    )
      return;
    this.last.set(n, performance.now());
    const src = c.createBufferSource(),
      gain = c.createGain();
    src.buffer = b;
    gain.gain.value = n === "pickup" ? 0.18 : 0.24;
    src.connect(gain);
    gain.connect(c.destination);
    src.start();
  }
  update(prev: State | null, next: State, id: string) {
    if (!prev) return;
    const a = prev.players.find((p) => p.id === id),
      b = next.players.find((p) => p.id === id);
    if (prev.phase === "playing" && next.phase === "finished") {
      this.play("result");
      return;
    }
    if (next.phase !== "playing" || prev.phase !== "playing" || !a || !b)
      return;
    if (b.score > a.score) this.play("deposit");
    else if (b.cargo < a.cargo) this.play("hit");
    else if (b.cargo > a.cargo) this.play("pickup");
    if (b.cooldown > a.cooldown + 0.2) this.play("boost");
    if (
      Math.ceil(next.remaining) < Math.ceil(prev.remaining) &&
      next.remaining <= 5 &&
      next.remaining > 0
    )
      this.play("countdown");
  }
}
