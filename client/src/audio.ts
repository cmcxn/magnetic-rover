import { pickupCount, type State } from "./types";
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
  private boostLoop: { source: AudioBufferSourceNode; gain: GainNode } | null =
    null;
  setBoosting(active: boolean) {
    const c = this.context,
      b = this.buffers.get("boost");
    const shouldPlay =
      active && this.enabled && !!c && c.state === "running" && !!b;
    if (!shouldPlay) {
      if (this.boostLoop) {
        const old = this.boostLoop;
        this.boostLoop = null;
        try {
          old.gain.gain.setValueAtTime(
            old.gain.gain.value,
            c?.currentTime ?? 0,
          );
          old.gain.gain.linearRampToValueAtTime(
            0,
            (c?.currentTime ?? 0) + 0.04,
          );
          old.source.stop((c?.currentTime ?? 0) + 0.045);
        } catch {}
      }
      return;
    }
    if (this.boostLoop) return;
    const source = c!.createBufferSource(),
      gain = c!.createGain();
    source.buffer = b!;
    source.loop = true;
    source.loopStart = b!.duration >= 0.48 ? 0.08 : 0;
    source.loopEnd = b!.duration;
    gain.gain.value = 0.65;
    source.connect(gain);
    gain.connect(c!.destination);
    this.boostLoop = { source, gain };
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start();
  }
  async unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      const c = this.context;
      for (const n of names)
        fetch(`/assets/audio/${n === "boost" ? "boost-engine" : n}.wav`)
          .then((r) => r.arrayBuffer())
          .then((b) => c.decodeAudioData(b))
          .then((b) => this.buffers.set(n, b))
          .catch(() => {});
    }
    await this.context.resume().catch(() => {});
  }
  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) this.setBoosting(false);
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
      performance.now() - (this.last.get(n) ?? -1000) <
        (n === "pickup" ? 240 : 180)
    )
      return;
    this.last.set(n, performance.now());
    const src = c.createBufferSource(),
      gain = c.createGain();
    src.buffer = b;
    gain.gain.value = n === "pickup" ? 0.25 : n === "boost" ? 0.34 : 0.24;
    src.connect(gain);
    gain.connect(c.destination);
    if (n === "boost" || n === "pickup") {
      const duration = Math.min(n === "pickup" ? 0.22 : 0.28, b.duration);
      gain.gain.setValueAtTime(gain.gain.value, c.currentTime);
      gain.gain.setValueAtTime(
        gain.gain.value,
        c.currentTime + Math.max(0, duration - 0.06),
      );
      gain.gain.linearRampToValueAtTime(0, c.currentTime + duration);
      src.start();
      src.stop(c.currentTime + duration);
    } else src.start();
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
    else if (b.hitSeq > (a.hitSeq ?? 0)) this.play("hit");
    if (pickupCount(prev, next, id) > 0) this.play("pickup");
    if (b.energy === undefined && b.cooldown > a.cooldown + 0.2)
      this.play("boost");
    if (
      Math.ceil(next.remaining) < Math.ceil(prev.remaining) &&
      next.remaining <= 5 &&
      next.remaining > 0
    )
      this.play("countdown");
  }
}
