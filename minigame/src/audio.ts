import { pickupCount, type State } from "../../client/src/types";
const names = [
  "pickup",
  "boost",
  "hit",
  "deposit",
  "countdown",
  "result",
] as const;
type Sound = (typeof names)[number];
/** WeChat native playback; independent of Phaser's browser-only sound manager. */
export class WeChatSounds {
  enabled: boolean;
  private active = true;
  private unlocked = false;
  private contexts = new Map<Sound, any>();
  private last = new Map<Sound, number>();
  private error = "";
  private played = 0;
  private lastPlayed = "";
  constructor(
    private api: any,
    private now: () => number = () => Date.now(),
  ) {
    this.enabled = api.getStorageSync("rover.sound") !== "off";
  }
  unlock() {
    this.unlocked = true;
    if (!this.enabled || this.contexts.size) return;
    if (!this.api.createInnerAudioContext) {
      this.error = "当前环境不支持微信音频接口";
      return;
    }
    try {
      for (const name of names) {
        const audio = this.api.createInnerAudioContext();
        audio.autoplay = false;
        audio.loop = false;
        audio.obeyMuteSwitch = true;
        audio.volume =
          name === "boost" ? 0.34 : name === "pickup" ? 0.25 : 0.24;
        audio.onError?.((e: any) => {
          this.error = `${name}: ${e.errMsg || e.errCode || "播放失败"}`;
          console.warn("[rover] audio", this.error);
        });
        audio.onPlay?.(() => {
          this.played++;
          this.lastPlayed = name;
          if (this.played === 1)
            console.info?.("[rover] native audio playback started", name);
        });
        audio.src = `art/audio/${name}.wav`;
        this.contexts.set(name, audio);
      }
    } catch (e) {
      this.error = String(e);
      this.stop();
      for (const c of this.contexts.values()) c.destroy?.();
      this.contexts.clear();
    }
  }
  private boostLoop = false;
  setBoosting(active: boolean) {
    const audio = this.contexts.get("boost");
    const shouldPlay =
      active && this.enabled && this.active && this.unlocked && !!audio;
    if (shouldPlay === this.boostLoop) return;
    this.boostLoop = shouldPlay;
    if (!audio) return;
    try {
      audio.stop();
      audio.loop = shouldPlay;
      if (shouldPlay) audio.play();
    } catch (e) {
      this.error = String(e);
    }
  }
  play(name: Sound) {
    if (!this.enabled || !this.active || !this.unlocked) return;
    const audio = this.contexts.get(name),
      now = this.now();
    if (
      !audio ||
      now - (this.last.get(name) ?? -Infinity) < (name === "pickup" ? 240 : 180)
    )
      return;
    this.last.set(name, now);
    try {
      audio.stop();
      audio.play();
    } catch (e) {
      this.error = String(e);
    }
  }
  private stop() {
    this.boostLoop = false;
    for (const audio of this.contexts.values())
      try {
        audio.stop();
        audio.loop = false;
      } catch {}
  }
  toggle() {
    this.enabled = !this.enabled;
    this.api.setStorageSync("rover.sound", this.enabled ? "on" : "off");
    if (this.enabled) {
      this.unlock();
      this.play("pickup");
    } else this.stop();
    return this.enabled;
  }
  setActive(active: boolean) {
    this.active = active;
    if (!active) this.stop();
  }
  update(prev: State | null, next: State, id: string) {
    if (
      !prev ||
      !this.active ||
      prev.roomId !== next.roomId ||
      prev.roundId !== next.roundId
    )
      return;
    if (prev.phase === "playing" && next.phase === "finished") {
      this.play("result");
      return;
    }
    const a = prev.players.find((p) => p.id === id),
      b = next.players.find((p) => p.id === id);
    if (prev.phase !== "playing" || next.phase !== "playing" || !a || !b)
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
  get diagnostics() {
    return {
      enabled: this.enabled,
      backend: "wx.createInnerAudioContext",
      unlocked: this.unlocked,
      active: this.active,
      contexts: this.contexts.size,
      played: this.played,
      lastPlayed: this.lastPlayed,
      error: this.error,
    };
  }
}
