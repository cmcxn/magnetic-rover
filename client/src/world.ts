import Phaser from "phaser";
import { Motion, type Control } from "./motion";
import { cameraPolicy, type State } from "./types";
export class World extends Phaser.Scene {
  state: State | null = null;
  private motion = new Motion();
  private motionSnapshot: State | null = null;
  private motionRole = "";
  resetMotion() {
    this.motion.reset();
    // Wait for a fresh snapshot after a focus/session reset.
    this.motionSnapshot = this.state;
    this.motionRole = `${this.self}:${this.spectating}`;
    this.smooth.clear();
  }
  private syncMotion(now: number) {
    const role = `${this.self}:${this.spectating}`;
    if (
      this.state &&
      (this.motionSnapshot !== this.state || this.motionRole !== role)
    ) {
      this.motion.receive(this.state, this.self, this.spectating, now);
      this.motionSnapshot = this.state;
      this.motionRole = role;
    }
  }
  inputCommand(control: Control, now = performance.now()) {
    this.syncMotion(now);
    return this.motion.input(control, now);
  }
  self = "";
  spectating = false;
  follow = "";
  diagnostics = false;
  reducedEffects = false;
  liveEffects = true;
  private effectSnapshot: State | null = null;
  private effectAge = 0;
  fps: number | null = null;
  private frameCount = 0;
  private frameElapsed = 0;
  g!: Phaser.GameObjects.Graphics;
  cargoG!: Phaser.GameObjects.Graphics;
  background!: Phaser.GameObjects.Image;
  labels = new Map<string, Phaser.GameObjects.Text>();
  smooth = new Map<string, { x: number; y: number; angle: number }>();
  sprites = new Map<string, Phaser.GameObjects.Image>();
  spriteIds = new Set<string>();
  worldScale = 1;
  ox = 0;
  oy = 0;
  constructor() {
    super("world");
  }
  private pickupRemaining = 0;
  private pickupTotal = 0;
  private pickupLabel?: Phaser.GameObjects.Text;
  clearPickupFeedback() {
    this.pickupRemaining = this.pickupTotal = 0;
    this.pickupLabel?.setVisible(false);
  }
  pickupFeedback(count: number) {
    if (!Number.isSafeInteger(count) || count <= 0) return;
    this.pickupTotal =
      (this.pickupRemaining > 0 ? this.pickupTotal : 0) + count;
    this.pickupRemaining = 650;
  }
  boostFeedback() {
    if (!this.reducedEffects) this.cameras?.main.shake(100, 0.002);
  }
  preload() {
    this.load.image("rover", "/assets/sprites/rover.png");
    this.load.image("battery", "/assets/sprites/battery.png");
    this.load.image("station", "/assets/sprites/recycle-station.png");
  }
  create() {
    // Frames crop transparent padding without altering the generated source artwork.
    for (const [key, x, y, w, h] of [
      ["rover", 101, 271, 1093, 763],
      ["battery", 401, 175, 451, 906],
      ["station", 50, 42, 1154, 1154],
    ] as const) {
      if (this.textures.exists(key))
        this.textures.get(key).add("trim", 0, x, y, w, h);
    }
    this.createBackground();
    this.g = this.add.graphics();
    this.cargoG = this.add.graphics().setDepth(5);
    this.scale.on("resize", () => this.layout());
    this.layout();
  }
  createBackground() {
    const key = "garden-background";
    if (!this.textures.exists(key)) {
      const g = this.add.graphics();
      g.save();
      g.translateCanvas(600, 600);
      const circle = (x: number, y: number, r: number, c: number, a = 1) => {
        g.fillStyle(c, a);
        g.fillCircle(x, y, r);
      };
      // Hand-drawn garden rim and cream arena. Decorations never affect gameplay.
      circle(0, 20, 555, 0x719a77, 0.22);
      circle(0, 0, 550, 0x91b88c);
      for (let i = 0; i < 68; i++) {
        const a = i * 2.39996,
          r = 525 + (i % 3) * 11,
          x = Math.cos(a) * r,
          y = Math.sin(a) * r;
        circle(x + 3, y + 5, 18 + (i % 4) * 4, 0x547f69, 0.4);
        circle(
          x,
          y,
          17 + (i % 4) * 4,
          [0x72a77a, 0x95bc7d, 0x5d9676, 0xb2cd8b][i % 4],
        );
        if (i % 5 === 0) {
          circle(x + 8, y - 8, 4, 0xffedaa);
          circle(x + 4, y - 8, 3, 0xfff9df);
        }
      }
      circle(0, 0, 508, 0xa8b59a);
      circle(0, 0, 500, 0xf7ebce);
      g.lineStyle(9, 0xfff7df);
      g.strokeCircle(0, 0, 499);
      g.lineStyle(2, 0xd7c9aa, 0.8);
      g.strokeCircle(0, 0, 488);
      for (let i = 0; i < 170; i++) {
        const a = i * 2.39996,
          r = Math.sqrt((i + 0.5) / 170) * 475;
        circle(Math.cos(a) * r, Math.sin(a) * r, 1.8 + (i % 3), 0xd7c69e, 0.18);
      }
      g.lineStyle(2, 0xd7c69e, 0.2);
      g.strokeCircle(0, 0, 320);
      g.strokeCircle(0, 0, 160);
      g.restore();
      g.generateTexture(key, 1200, 1200);
      g.destroy();
    }
    this.background = this.add.image(0, 0, key).setDepth(-1);
  }
  layout() {
    const w = this.scale.width,
      h = this.scale.height;
    this.worldScale = Math.min(w / 1160, h / 1160);
    this.ox = w / 2;
    this.oy = h / 2 + 22;
  }
  screenToWorld(x: number, y: number) {
    return {
      x: (x - this.ox) / this.worldScale,
      y: (y - this.oy) / this.worldScale,
    };
  }
  sprite(
    id: string,
    key: string,
    x: number,
    y: number,
    width: number,
    height: number,
    depth: number,
    angle = 0,
  ) {
    if (!this.textures.exists(key)) return false;
    this.spriteIds.add(id);
    let image = this.sprites.get(id);
    if (!image) {
      image = this.add.image(0, 0, key, "trim");
      this.sprites.set(id, image);
    }
    image
      .setPosition(this.ox + x * this.worldScale, this.oy + y * this.worldScale)
      .setDisplaySize(width * this.worldScale, height * this.worldScale)
      .setRotation(angle)
      .setDepth(depth);
    return true;
  }
  update(_time: number, delta: number) {
    if (!this.g) return;
    if (this.diagnostics) {
      if (delta > 1000) {
        this.frameCount = this.frameElapsed = 0;
        this.fps = null;
      } else if (delta > 0) {
        this.frameCount++;
        this.frameElapsed += delta;
        if (this.frameElapsed >= 1000) {
          this.fps = (this.frameCount * 1000) / this.frameElapsed;
          this.frameCount = this.frameElapsed = 0;
        }
      }
    }
    if (this.effectSnapshot !== this.state) {
      this.effectSnapshot = this.state;
      this.effectAge = 0;
    } else this.effectAge += delta;
    const effectsActive =
      this.liveEffects &&
      this.effectAge <= 500 &&
      this.state?.phase === "playing";
    if (!effectsActive) this.cameras?.main.shakeEffect?.reset();
    this.pickupRemaining = effectsActive
      ? Math.max(0, this.pickupRemaining - delta)
      : 0;
    this.pickupLabel?.setVisible(false);
    const g = this.g;
    g.clear();
    this.cargoG.clear();
    this.spriteIds.clear();
    const w = this.scale.width,
      h = this.scale.height;
    // Use one display pose for both camera and rover. Older servers retain the fallback.
    const motionNow = performance.now();
    this.syncMotion(motionNow);
    const poses =
      this.state?.serverTime !== undefined
        ? this.motion.sample(motionNow)
        : null;
    for (const p of this.state?.players ?? []) {
      const pose = poses?.get(p.id);
      if (pose) {
        this.smooth.set(p.id, pose);
        continue;
      }
      let v = this.smooth.get(p.id);
      if (!v) {
        v = { x: p.x, y: p.y, angle: p.angle };
        this.smooth.set(p.id, v);
      }
      // Compatibility fallback for servers without sequenced motion metadata.
      const a = Math.min(1, delta / (p.id === this.self ? 25 : 65));
      v.x += (p.x - v.x) * a;
      v.y += (p.y - v.y) * a;
      let da = Phaser.Math.Angle.Wrap(p.angle - v.angle);
      v.angle += da * a;
    }
    const me = this.state?.players.find(
      (p) => p.id === (this.spectating ? this.follow : this.self),
    );
    const policy = cameraPolicy(
      w,
      h,
      window.matchMedia("(pointer: coarse)").matches,
    );
    if (
      (policy.follows || this.spectating) &&
      this.state?.phase === "playing" &&
      me
    ) {
      this.worldScale = this.spectating
        ? Math.min(w / 620, h / 460)
        : policy.scale;
      const v = this.smooth.get(me.id) ?? me;
      this.ox = w / 2 - v.x * this.worldScale;
      this.oy = h * 0.52 - v.y * this.worldScale;
    } else {
      this.worldScale = Math.min(w / 1160, h / 1160);
      this.ox = w / 2;
      this.oy = h / 2 + 22;
    }
    const s = this.worldScale;
    this.background.setPosition(this.ox, this.oy).setScale(s);
    g.setPosition(this.ox, this.oy);
    g.setScale(s);
    this.cargoG.setPosition(this.ox, this.oy).setScale(s);
    const circle = (x: number, y: number, r: number, c: number, a = 1) => {
      g.fillStyle(c, a);
      g.fillCircle(x, y, r);
    };
    const supply =
      this.state?.phase === "playing" ? this.state.supply : undefined;
    if (supply) {
      g.fillStyle(0x67bba4, 0.055);
      g.fillCircle(0, 0, supply.outerRadius);
      g.lineStyle(3, 0x318f80, 0.8);
      g.strokeCircle(0, 0, supply.outerRadius);
      if (
        supply.nextOuterRadius !== undefined &&
        (supply.secondsToShrink ?? 99) <= 5
      ) {
        g.lineStyle(3, 0xe0a13c, 0.9);
        for (let i = 0; i < 48; i++) {
          g.beginPath();
          g.arc(
            0,
            0,
            supply.nextOuterRadius,
            (i * Math.PI) / 24,
            ((i + 0.55) * Math.PI) / 24,
          );
          g.strokePath();
        }
      }
    }
    const stations = this.state?.stations ?? [
      { x: -330, y: -220, r: 65 },
      { x: 330, y: -220, r: 65 },
      { x: 0, y: 380, r: 65 },
    ];
    stations.forEach((p, i) => {
      if (
        this.sprite(
          `station-${i}`,
          "station",
          p.x,
          p.y,
          (p.r + 5) * 2,
          (p.r + 5) * 2,
          1,
        )
      )
        return;
      circle(p.x, p.y + 6, p.r + 9, 0x768f69, 0.2);
      circle(p.x, p.y, p.r + 8, 0xfff9e6);
      circle(p.x, p.y, p.r, 0x85c9a7);
      circle(p.x, p.y, p.r - 9, 0xbde6c4);
      g.lineStyle(2, 0xf8fff0);
      g.strokeCircle(p.x, p.y, p.r - 10);
      g.lineStyle(5, 0x41866a);
      g.beginPath();
      g.moveTo(p.x - 15, p.y + 6);
      g.lineTo(p.x - 4, p.y + 17);
      g.lineTo(p.x + 20, p.y - 13);
      g.strokePath();
      for (let k = 0; k < 4; k++) {
        let a = (k * Math.PI) / 2;
        circle(
          p.x + Math.cos(a) * (p.r + 2),
          p.y + Math.sin(a) * (p.r + 2),
          5,
          0x608f75,
        );
      }
    });
    for (const b of this.state?.batteries ?? []) {
      // Height is server-owned: the ground shadow remains at the true pickup position.
      const z = Math.max(0, b.z ?? 0),
        y = b.y - z;
      g.fillStyle(0x796b4e, z > 0 ? 0.18 : 0.12);
      g.fillEllipse(b.x, b.y + 6, Math.max(7, 15 - z * 0.12), 7);
      if (this.sprite(`battery-${b.id}`, "battery", b.x, y, 14, 28, 2))
        continue;
      g.fillStyle(0xd7aa33);
      g.fillRoundedRect(b.x - 7, y - 11, 14, 23, 4);
      g.fillStyle(0xffda57);
      g.fillRoundedRect(b.x - 6, y - 12, 12, 21, 3);
      g.fillStyle(0x776e49);
      g.fillRect(b.x - 3, y - 15, 6, 3);
      g.lineStyle(2, 0xfff8d4);
      g.beginPath();
      g.moveTo(b.x + 1, y - 8);
      g.lineTo(b.x - 2, y);
      g.lineTo(b.x + 2, y);
      g.lineTo(b.x - 1, y + 7);
      g.strokePath();
    }
    // All devices show the server body dimensions: 98x68, local +X forward.
    const roverScale = 2;
    // Modern servers advertise a solid boundary. Pickup range remains independent
    // and has no competing circle; old servers retain their legacy magnet guide.
    const boundaryRadius =
      this.state?.collisionRadius ?? this.state?.pickupRadius ?? 20;
    const labelClearance = (_angle: number, _cargo: number) => 68;
    const present = new Set<string>();
    for (const p of this.state?.players ?? []) {
      present.add(p.id);
      const v = this.smooth.get(p.id)!;
      const c = Phaser.Display.Color.HexStringToColor(p.color).color;
      circle(v.x, v.y + 7 * roverScale, 21 * roverScale, 0x51694b, 0.16);
      circle(v.x, v.y, boundaryRadius, c, 0.1);
      g.lineStyle(3, this.state?.collisionRadius ? 0x269ad8 : c, 0.9);
      g.strokeCircle(v.x, v.y, boundaryRadius);
      const hasSprite = this.sprite(
        `car-${p.id}`,
        "rover",
        v.x,
        v.y,
        49 * roverScale,
        34 * roverScale,
        4,
        v.angle,
      );
      if (p.id === this.self) {
        g.lineStyle(2, 0x376e60, 0.65);
        g.strokeCircle(v.x, v.y, boundaryRadius);
      }
      if (!p.connected) circle(v.x, v.y, 25 * roverScale, 0xffffff, 0.5);
      // Car points along +X. Four tires, windscreen, headlights and roof arrow.
      const rot = (x: number, y: number) => ({
        x:
          v!.x + roverScale * (x * Math.cos(v!.angle) - y * Math.sin(v!.angle)),
        y:
          v!.y + roverScale * (x * Math.sin(v!.angle) + y * Math.cos(v!.angle)),
      });
      const box = (
        x: number,
        y: number,
        w: number,
        h: number,
        col: number,
        layer = g,
      ) => {
        const pts = [
          rot(x - w / 2, y - h / 2),
          rot(x + w / 2, y - h / 2),
          rot(x + w / 2, y + h / 2),
          rot(x - w / 2, y + h / 2),
        ];
        layer.fillStyle(col);
        layer.fillPoints(pts, true);
      };
      if (!hasSprite) {
        // Local footprint is 49x34 before the shared 2x body scale.
        for (const x of [-18.5, 18.5])
          for (const y of [-13.5, 13.5]) box(x, y, 12, 7, 0x32554d);
        box(0, 0, 45, 27, 0x476355);
        box(0, -1, 42, 25, c);
        box(7, -1, 8, 19, 0x244e4b);
        box(8, -4, 3, 9, 0xb8f0e5);
        box(22.5, -8, 4, 5, 0xfff8c8);
        box(22.5, 8, 4, 5, 0xfff8c8);
        box(-22.5, -8, 3, 5, 0xc46755);
        box(-22.5, 8, 3, 5, 0xc46755);
        const tip = rot(2, 0),
          u = rot(-5, -5),
          d = rot(-5, 5);
        g.fillStyle(0xffffff, 0.85);
        g.fillTriangle(tip.x, tip.y, u.x, u.y, d.x, d.y);
      }
      // Twenty visible cells on the rear deck, wholly inside the solid radius60.
      const cargo = Math.min(20, Math.max(0, Math.floor(p.cargo)));
      if (cargo > 0) {
        box(-11, 0, 25, 24, 0x476355, this.cargoG);
        for (let k = 0; k < cargo; k++) {
          const x = -1 - Math.floor(k / 4) * 5;
          const y = -9 + (k % 4) * 6;
          box(x, y, 4, 5, 0xedc34f, this.cargoG);
          box(x + 0.8, y - 1, 1, 2.5, 0xfff8d4, this.cargoG);
        }
      }
      if (effectsActive && p.boost > 0) {
        const tail = -24;
        const length = this.reducedEffects
          ? 20
          : 24 + Math.sin(_time * 0.045) * 4;
        const flame = (width: number, len: number, col: number) => {
          const a = rot(tail, -width),
            b = rot(tail - len, 0),
            c = rot(tail, width);
          g.fillStyle(col);
          g.fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y);
        };
        flame(9, length, 0xff7a32);
        flame(5, length * 0.7, 0xffdb69);
        flame(2.5, length * 0.35, 0xfff8dc);
      }
      let label = this.labels.get(p.id);
      if (!label) {
        label = this.add
          .text(0, 0, "", {
            fontFamily: "sans-serif",
            fontSize: "12px",
            color: "#264d40",
            backgroundColor: "#fffbedcc",
            padding: { x: 6, y: 3 },
          })
          .setOrigin(0.5, 1)
          .setDepth(10);
        this.labels.set(p.id, label);
      }
      // Keep text its original size, above the rotated body/rack on phones.
      const labelOffset = labelClearance(v.angle, cargo);
      label
        .setPosition(this.ox + v.x * s, this.oy + (v.y - labelOffset) * s)
        .setText(
          `${p.name}${p.id === this.self ? ` · 你\n${cargo >= 20 ? "满载" : "⚡ "}${cargo}/20` : ""}${p.stun > 0 ? " · 眩晕" : ""}`,
        );
      label.setVisible(this.state?.phase === "playing");
    }
    if (me?.connected && this.pickupRemaining > 0) {
      const v = this.smooth.get(me.id) ?? me;
      const progress = 1 - this.pickupRemaining / 650;
      if (!this.reducedEffects) {
        // Six warm sparks converge onto the local rover, never one emitter per battery.
        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI) / 3;
          const radius = 14 + 46 * (1 - progress);
          circle(
            v.x + Math.cos(angle) * radius,
            v.y + Math.sin(angle) * radius,
            2 + 2 * (1 - progress),
            0xffe66d,
            1 - progress,
          );
        }
        g.lineStyle(3, 0xffe66d, (1 - progress) * 0.7);
        g.strokeCircle(v.x, v.y, 24 + 12 * (1 - progress));
      }
      if (!this.pickupLabel)
        this.pickupLabel = this.add
          .text(0, 0, "", {
            fontFamily: "sans-serif",
            fontSize: "22px",
            fontStyle: "bold",
            color: "#fff3a5",
            stroke: "#426347",
            strokeThickness: 4,
          })
          .setOrigin(0.5, 1)
          .setDepth(12);
      this.pickupLabel
        .setText(`⚡ +${this.pickupTotal}`)
        .setPosition(
          this.ox + v.x * s,
          this.oy +
            (v.y - labelClearance(v.angle, me.cargo) - 44) * s -
            (this.reducedEffects ? 0 : progress * 18),
        )
        .setAlpha(
          this.reducedEffects ? 1 : Math.min(1, this.pickupRemaining / 180),
        )
        .setVisible(true);
    }
    for (const [key, image] of this.sprites)
      if (!this.spriteIds.has(key)) {
        image.destroy();
        this.sprites.delete(key);
      }
    for (const [id, l] of this.labels)
      if (!present.has(id)) {
        l.destroy();
        this.labels.delete(id);
        this.smooth.delete(id);
      }
  }
}
