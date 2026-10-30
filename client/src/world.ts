import Phaser from "phaser";
import { VehicleMotion, TireDust, wheelAngle } from "./vehicle-effects";
import { Motion, type Control } from "./motion";
import { cameraPolicy, type State } from "./types";
export class World extends Phaser.Scene {
  state: State | null = null;
  private motion = new Motion();
  private wheelMotion = new VehicleMotion();
  private tireDust = new TireDust();
  private dustAt = new Map<string, number>();
  private vehicleSample = { speed: 0, frame: 0, steer: 0 };
  private effectsActive = false;
  private motionSnapshot: State | null = null;
  private motionRole = "";
  resetMotion() {
    this.motion.reset();
    this.wheelMotion.reset();
    this.tireDust.clear();
    this.dustAt.clear();
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
  predictedPlayer(now = performance.now()) {
    this.syncMotion(now);
    return (
      this.motion.predictedSelf(now) ??
      this.state?.players.find((p) => p.id === this.self)
    );
  }
  self = "";
  spectating = false;
  follow = "";
  diagnostics = false;
  reducedEffects = false;
  liveEffects = true;
  private effectSnapshot: State | null = null;
  private effectAge = 0;
  private pickupTrails: { id: string; x: number; y: number; start: number }[] =
    [];
  private impactState = new Map<
    string,
    { seq: number; cargo: number; until: number; lost: number }
  >();
  private boostIndicators = new Map<
    string,
    { cooling: boolean; flashUntil: number }
  >();
  fps: number | null = null;
  private frameCount = 0;
  private frameElapsed = 0;
  g!: Phaser.GameObjects.Graphics;
  cargoG!: Phaser.GameObjects.Graphics;
  wheelG!: Phaser.GameObjects.Graphics;
  background!: Phaser.GameObjects.Image;
  labels = new Map<string, Phaser.GameObjects.Text>();
  smooth = new Map<string, { x: number; y: number; angle: number }>();
  sprites = new Map<string, Phaser.GameObjects.Image>();
  spriteIds = new Set<string>();
  get vehicleDiagnostics() {
    return {
      revision: "wheels-2",
      effectsActive: this.effectsActive,
      snapshotAge: this.effectAge,
      assets: {
        chassis: this.textures.exists("chassis"),
        tire: this.textures.exists("tire"),
        frames: this.textures.exists("tire-roll-0"),
      },
      self: this.vehicleSample,
      dust: this.tireDust.particles.length,
      wheelPlayers: this.wheelMotion.size,
      wheels: [...this.sprites]
        .filter(([id]) => id.startsWith("wheel-"))
        .map(([id, s]) => ({
          id,
          texture: s.texture.key,
          angle: s.rotation,
          x: s.x,
          y: s.y,
        })),
      bodies: [...this.sprites]
        .filter(([id]) => id.startsWith("car-"))
        .map(([id, s]) => ({
          id,
          texture: s.texture.key,
          angle: s.rotation,
          x: s.x,
          y: s.y,
        })),
    };
  }
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
    this.load.image("chassis", "/assets/cartoon/rover-chassis.png");
    this.load.image("tire", "/assets/cartoon/rover-tire.png");
    this.load.image("rover", "/assets/cartoon/rover.png");
    this.load.image("battery", "/assets/cartoon/battery.png");
    this.load.image("station", "/assets/cartoon/station.png");
    this.load.image("island", "/assets/cartoon/island.png");
  }
  create() {
    // Production PNGs are alpha-trimmed at export, retaining their original sources.
    for (const key of ["rover", "chassis", "tire", "battery", "station"]) {
      if (this.textures.exists(key)) {
        const source = this.textures
          .get(key)
          .getSourceImage() as HTMLImageElement;
        this.textures
          .get(key)
          .add("trim", 0, 0, 0, source.width, source.height);
      }
    }
    this.createRoverColors();
    this.createWheelFrames();
    this.createBackground();
    this.g = this.add.graphics();
    this.cargoG = this.add.graphics().setDepth(5);
    this.wheelG = this.add.graphics().setDepth(3.5);
    this.scale.on("resize", () => this.layout());
    this.layout();
  }
  private createRoverColors() {
    for (const base of ["rover", "chassis"]) {
      if (!this.textures.exists(base)) continue;
      const source = this.textures
        .get(base)
        .getSourceImage() as HTMLImageElement;
      for (const color of [
        "38bdf8",
        "fb7185",
        "a78bfa",
        "facc15",
        "34d399",
        "fb923c",
        "e879f9",
        "cbd5e1",
      ]) {
        const key = base + "-" + color;
        if (this.textures.exists(key)) continue;
        const texture = this.textures.createCanvas(key, 192, 134);
        if (!texture) continue;
        const ctx = texture.context;
        ctx.drawImage(source, 0, 0, 192, 134);
        ctx.globalCompositeOperation = "multiply";
        ctx.fillStyle = "#" + color;
        ctx.fillRect(0, 0, 192, 134);
        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(source, 0, 0, 192, 134);
        ctx.globalCompositeOperation = "source-over";
        texture.add("trim", 0, 0, 0, 192, 134);
        texture.refresh();
      }
    }
  }
  private createWheelFrames() {
    if (!this.textures.exists("tire")) return;
    const source = this.textures
      .get("tire")
      .getSourceImage() as HTMLImageElement;
    for (let frame = 0; frame < 16; frame++) {
      const key = `tire-roll-${frame}`;
      if (this.textures.exists(key)) continue;
      const tex = this.textures.createCanvas(key, 128, 78);
      if (!tex) continue;
      const ctx = tex.context;
      ctx.drawImage(source, 0, 0, 128, 78);
      ctx.globalCompositeOperation = "source-atop";
      // Use the approved tire only as an alpha silhouette. Opaque rubber shading
      // replaces its baked-in tread, so there is only ONE moving pattern.
      const rubber = ctx.createLinearGradient(0, 0, 0, 78);
      rubber.addColorStop(0, "#101c2c");
      rubber.addColorStop(0.18, "#263d56");
      rubber.addColorStop(0.45, "#3a536e");
      rubber.addColorStop(0.8, "#21344b");
      rubber.addColorStop(1, "#101b2b");
      ctx.fillStyle = rubber;
      ctx.fillRect(0, 0, 128, 78);
      // Top surface moves toward +X (the nose). Sixteen phases keep forward
      // travel smooth; edge shading stays fixed while tread crosses the tire.
      for (let x = -48 + frame * (42 / 16); x < 180; x += 42) {
        ctx.beginPath();
        ctx.moveTo(x - 9, 6);
        ctx.lineTo(x + 5, 39);
        ctx.lineTo(x - 9, 72);
        ctx.strokeStyle = "#101c2e";
        ctx.lineWidth = 10;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - 5, 6);
        ctx.lineTo(x + 9, 39);
        ctx.lineTo(x - 5, 72);
        ctx.strokeStyle = "rgba(144,176,202,.65)";
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      const edge = ctx.createLinearGradient(0, 0, 128, 0);
      edge.addColorStop(0, "rgba(4,12,24,.8)");
      edge.addColorStop(0.18, "rgba(4,12,24,0)");
      edge.addColorStop(0.82, "rgba(4,12,24,0)");
      edge.addColorStop(1, "rgba(4,12,24,.8)");
      ctx.fillStyle = edge;
      ctx.fillRect(0, 0, 128, 78);
      ctx.globalCompositeOperation = "source-over";
      tex.add("trim", 0, 0, 0, 128, 78);
      tex.refresh();
    }
  }
  createBackground() {
    if (this.textures.exists("island")) {
      this.background = this.add.image(0, 0, "island").setDepth(-1);
      return;
    }
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
    this.worldScale = Math.min(
      w / (1160 * ((this.state?.radius ?? 500) / 500)),
      h / (1160 * ((this.state?.radius ?? 500) / 500)),
    );
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
    if (image.texture?.key !== key) image.setTexture(key, "trim");
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
      const prev = this.effectSnapshot,
        next = this.state;
      if (
        prev?.phase !== "playing" ||
        next?.phase !== "playing" ||
        prev.roundId !== next.roundId
      ) {
        this.impactState.clear();
        this.wheelMotion.reset();
        this.tireDust.clear();
        this.dustAt.clear();
      }
      if (
        prev?.phase === "playing" &&
        next?.phase === "playing" &&
        prev.roundId === next.roundId &&
        !this.spectating
      ) {
        const before = prev.players.find((p) => p.id === this.self),
          after = next.players.find((p) => p.id === this.self);
        const gained = Math.min(
          6,
          Math.max(0, (after?.pickupSeq ?? 0) - (before?.pickupSeq ?? 0)),
        );
        if (gained && after && !this.reducedEffects) {
          const remaining = new Set(next.batteries.map((b) => b.id));
          const removed = prev.batteries
            .filter((b) => !remaining.has(b.id))
            .sort(
              (a, b) =>
                Math.hypot(a.x - after.x, a.y - after.y) -
                Math.hypot(b.x - after.x, b.y - after.y),
            );
          this.pickupTrails.push(
            ...removed.slice(0, gained).map((b) => ({
              id: b.id,
              x: b.x,
              y: b.y - (b.z ?? 0),
              start: _time,
            })),
          );
          this.pickupTrails = this.pickupTrails.slice(-12);
        }
      } else this.pickupTrails = [];
      this.effectSnapshot = this.state;
      this.effectAge = 0;
    } else this.effectAge += delta;
    const effectsActive =
      this.liveEffects &&
      this.effectAge <= 500 &&
      this.state?.phase === "playing";
    this.effectsActive = effectsActive;
    if (!effectsActive) {
      this.cameras?.main.shakeEffect?.reset();
      this.boostIndicators.clear();
    }
    this.pickupRemaining = effectsActive
      ? Math.max(0, this.pickupRemaining - delta)
      : 0;
    this.pickupLabel?.setVisible(false);
    const g = this.g;
    g.clear();
    this.cargoG.clear();
    this.wheelG.clear();
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
      this.worldScale = Math.min(
        w / (1160 * ((this.state?.radius ?? 500) / 500)),
        h / (1160 * ((this.state?.radius ?? 500) / 500)),
      );
      this.ox = w / 2;
      this.oy = h / 2 + 22;
    }
    const s = this.worldScale;
    const mapScale = (this.state?.radius ?? 500) / 500;
    if (this.textures.exists("island"))
      this.background
        .setPosition(this.ox, this.oy + 54 * s * mapScale)
        .setDisplaySize(1390 * s * mapScale, 1390 * s * mapScale);
    else this.background.setPosition(this.ox, this.oy).setScale(s * mapScale);
    g.setPosition(this.ox, this.oy);
    g.setScale(s);
    this.cargoG.setPosition(this.ox, this.oy).setScale(s);
    this.wheelG.setPosition(this.ox, this.oy).setScale(s);
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
    this.pickupTrails = this.pickupTrails.filter(
      (t) => effectsActive && _time - t.start < 240,
    );
    const collector = this.smooth.get(this.self);
    if (collector)
      for (const trail of this.pickupTrails) {
        const t = Math.max(0, Math.min(1, (_time - trail.start) / 240)),
          ease = t * t;
        const x = trail.x + (collector.x - trail.x) * ease,
          y =
            trail.y +
            (collector.y - trail.y) * ease -
            Math.sin(t * Math.PI) * 18;
        this.sprite(
          "pickup-fly-" + trail.id,
          "battery",
          x,
          y,
          14 * (1 - t * 0.5),
          28 * (1 - t * 0.5),
          6,
          t * 0.5,
        );
      }
    // All devices show the server body dimensions: 98x68, local +X forward.
    const roverScale = 2 * (this.state?.vehicleScale ?? 1);
    // Modern servers advertise a solid boundary. Pickup range remains independent
    // and has no competing circle; old servers retain their legacy magnet guide.
    const boundaryRadius =
      this.state?.collisionRadius ?? this.state?.pickupRadius ?? 20;
    const labelClearance = (_angle: number, _cargo: number) =>
      68 * (this.state?.vehicleScale ?? 1);
    this.tireDust.step(delta, effectsActive && !this.reducedEffects);
    for (const p of this.tireDust.particles) {
      const life = 1 - p.age / p.life;
      g.fillStyle(0xad916a, 0.55 * life).fillEllipse(
        p.x,
        p.y,
        p.size * (2 + p.age * 10),
        p.size * (1.3 + p.age * 5),
      );
      g.fillStyle(0xfff1d1, 0.48 * life).fillEllipse(
        p.x - 1,
        p.y - 1,
        p.size * (1 + p.age * 8),
        p.size * (0.8 + p.age * 4),
      );
    }
    const present = new Set<string>();
    for (const p of this.state?.players ?? []) {
      present.add(p.id);
      const v = this.smooth.get(p.id)!;
      const c = Phaser.Display.Color.HexStringToColor(p.color).color;
      let impact = this.impactState.get(p.id);
      const seq = p.impactSeq ?? p.hitSeq ?? 0;
      if (!impact) {
        impact = { seq, cargo: p.cargo, until: 0, lost: 0 };
        this.impactState.set(p.id, impact);
      }
      if (impact.seq !== seq) {
        impact.lost = Math.max(0, impact.cargo - p.cargo);
        impact.until = _time + 400;
        impact.seq = seq;
      }
      impact.cargo = p.cargo;
      if (effectsActive && !this.reducedEffects && _time < impact.until) {
        const t = 1 - (impact.until - _time) / 400;
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4,
            inner = 22 + t * 25,
            outer = inner + 18 * (1 - t);
          g.lineStyle(4, 0xffe76b, 1 - t).lineBetween(
            v.x + Math.cos(a) * inner,
            v.y + Math.sin(a) * inner,
            v.x + Math.cos(a) * outer,
            v.y + Math.sin(a) * outer,
          );
        }
        circle(v.x, v.y, 24, 0xfff5b8, (1 - t) * 0.45);
      }
      circle(v.x, v.y + 7 * roverScale, 21 * roverScale, 0x51694b, 0.16);
      circle(v.x, v.y, boundaryRadius, c, 0.1);
      g.lineStyle(
        2,
        p.id === this.self ? 0x46e5f3 : c,
        p.id === this.self ? 0.65 : 0.15,
      );
      g.strokeCircle(v.x, v.y, boundaryRadius);
      const vehicleScale = this.state?.vehicleScale ?? 1;
      const wheels = this.wheelMotion.sample(p.id, v, delta, {
        active: effectsActive && p.connected && p.stun <= 0,
        scale: vehicleScale,
      });
      if (p.id === this.self)
        this.vehicleSample = {
          speed: wheels.speed,
          frame: wheels.frame,
          steer: wheels.steer,
        };
      const layered =
        this.textures.exists("chassis") && this.textures.exists("tire-roll-0");
      if (layered) {
        for (const front of [false, true])
          for (const side of [-1, 1]) {
            const lx = (front ? 22 : -33) * vehicleScale,
              ly = side * 25 * vehicleScale;
            const x = v.x + lx * Math.cos(v.angle) - ly * Math.sin(v.angle),
              y = v.y + lx * Math.sin(v.angle) + ly * Math.cos(v.angle);
            this.sprite(
              `wheel-${p.id}-${front}-${side}`,
              `tire-roll-${wheels.frame}`,
              x,
              y,
              30 * vehicleScale,
              18 * vehicleScale,
              3,
              v.angle + wheelAngle(wheels.steer, side, front),
            );
            if (
              effectsActive &&
              !this.reducedEffects &&
              wheels.speed > 35 &&
              _time - (this.dustAt.get(p.id) ?? -1000) > 85 &&
              !front
            ) {
              this.tireDust.emit(
                x - Math.cos(v.angle) * 17 * vehicleScale,
                y - Math.sin(v.angle) * 17 * vehicleScale,
                v.angle,
                vehicleScale,
                _time * 0.01 + side * 3,
              );
            }
          }
        if (wheels.speed > 35 && _time - (this.dustAt.get(p.id) ?? -1000) > 85)
          this.dustAt.set(p.id, _time);
      }
      const bodyKey = layered ? "chassis" : "rover";
      const hasSprite = this.sprite(
        `car-${p.id}`,
        this.textures.exists(bodyKey + "-" + p.color.slice(1))
          ? bodyKey + "-" + p.color.slice(1)
          : bodyKey,
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
        layer.fillStyle(
          col,
          layer === this.cargoG && col === 0x476355 ? 0.18 : 1,
        );
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
      // Permanent driver-color badge on the hood, independent of boost state.
      // Above the sprite and ahead of the rear-deck cargo.
      if (!hasSprite) {
        box(15, 0, 11, 16, 0x274f49, this.cargoG);
        box(15, 0, 8, 13, c, this.cargoG);
      }
      // Interpolate only fresh server timers. Readiness still requires server zero.
      const boostVisible = effectsActive && p.connected;
      const visual =
        p.id === this.self && !this.spectating
          ? (this.predictedPlayer(motionNow) ?? p)
          : p;
      const boostLeft = Math.max(
        0,
        visual.boost - (visual === p ? this.effectAge / 1000 : 0),
      );
      const cooldownLeft = Math.max(
        0.1,
        (p.cooldown ?? 0) - this.effectAge / 1000,
      );
      const boosting = boostLeft > 0 && !(visual.stun > 0);
      const cooling = (p.cooldown ?? 0) > 0;
      const ready = !boosting && !cooling && !(p.stun > 0);
      let indicator = this.boostIndicators.get(p.id);
      if (boostVisible) {
        if (!indicator) {
          indicator = { cooling, flashUntil: 0 };
          this.boostIndicators.set(p.id, indicator);
        }
        if (indicator.cooling && ready) indicator.flashUntil = _time + 280;
        indicator.cooling = cooling;
        const flashing =
          !this.reducedEffects && ready && _time < indicator.flashUntil;
        const progress =
          visual.energy !== undefined
            ? visual.energy
            : boosting
              ? Math.min(1, boostLeft / (this.state?.boostDuration ?? 0.32))
              : cooling
                ? Math.min(
                    1,
                    Math.max(
                      0,
                      1 - cooldownLeft / (this.state?.boostCooldown ?? 4),
                    ),
                  )
                : 1;
        const tint = flashing ? 0xfff8dc : boosting ? 0xffbd59 : c;
        for (const y of hasSprite ? [] : [-15, 15]) {
          box(0, y, 32, 4, 0x274f49, this.cargoG);
          if (progress > 0)
            box(-14 + 14 * progress, y, 28 * progress, 2, tint, this.cargoG);
        }
        if (ready) {
          // Small rear lightning lamp, drawn above the sprite.
          const points = [
            [-22, -4],
            [-24, 1],
            [-22, 1],
            [-24, 5],
            [-19, -1],
            [-22, -1],
          ];
          this.cargoG.fillStyle(tint);
          this.cargoG.fillPoints(
            points.map(([x, y]) => rot(x, y)),
            true,
          );
        }
      } else this.boostIndicators.delete(p.id);
      if (boostVisible && boosting) {
        const halo =
          (this.state?.collisionRadius ?? 60) *
          (1.03 + (this.reducedEffects ? 0 : Math.sin(_time * 0.025) * 0.07));
        g.lineStyle(
          3,
          c,
          this.reducedEffects ? 0.35 : 0.45 + 0.2 * Math.sin(_time * 0.025),
        ).strokeCircle(v.x, v.y, halo);
        circle(v.x, v.y, halo, c, 0.1);
        if (!this.reducedEffects) {
          for (const side of [-11, 0, 11]) {
            const a = rot(-18, side),
              b = rot(-70 - boostLeft * 80, side);
            g.lineStyle(
              side === 0 ? 9 : 4,
              0x53edfa,
              side === 0 ? 0.38 : 0.75,
            ).lineBetween(a.x, a.y, b.x, b.y);
          }
        }
        // The approved design includes streaks ON the tires, not only the
        // central exhaust. Draw above tires and below the chassis.
        if (!this.reducedEffects) {
          for (const axle of [-16.5, 11])
            for (const side of [-1, 1]) {
              for (const band of [-2.5, 0, 2.5]) {
                const pulse = Math.sin(_time * 0.05 + band) * 2;
                const a = rot(axle + 3 + pulse, side * 12.5 + band);
                const b = rot(axle - 18 - pulse, side * 12.5 + band);
                this.wheelG
                  .lineStyle(2.6, 0x24cfff, 0.5)
                  .lineBetween(a.x, a.y, b.x, b.y);
                this.wheelG
                  .lineStyle(0.9, 0xdcfbff, 0.95)
                  .lineBetween(a.x, a.y, b.x, b.y);
              }
            }
        }
        const tail = -24;
        const length =
          18 +
          30 * Math.min(1, boostLeft / (this.state?.boostDuration ?? 0.32)) +
          (this.reducedEffects ? 0 : Math.sin(_time * 0.045) * 2);
        const flame = (width: number, len: number, col: number) => {
          const wave = this.reducedEffects
            ? 0
            : Math.sin(_time * 0.065) * width * 0.22;
          const points = [
            rot(tail, -width * 0.65),
            rot(tail - len * 0.22, -width),
            rot(tail - len * 0.49, -width * 0.4),
            rot(tail - len, wave),
            rot(tail - len * 0.58, width * 0.48),
            rot(tail - len * 0.25, width * 0.86),
            rot(tail, width * 0.65),
          ];
          g.fillStyle(col);
          g.fillPoints(points, true);
        };
        flame(10, length * 1.1, c);
        flame(7.5, length, 0xff7a32);
        flame(5, length * 0.72, 0xffe889);
        flame(2.8, length * 0.48, 0xf0ffff);
      }
      const boostText =
        p.id === this.self && !this.spectating && boostVisible
          ? boosting
            ? " · 冲刺中"
            : cooling
              ? ` · 冲刺 ${cooldownLeft.toFixed(1)}s`
              : ready
                ? " · 冲刺就绪"
                : ""
          : "";
      let label = this.labels.get(p.id);
      if (!label) {
        label = this.add
          .text(0, 0, "", {
            resolution: Math.min(
              3,
              this.game?.canvas ? this.game.canvas.width / this.scale.width : 1,
            ),
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
          `${p.name}${p.id === this.self ? ` · 你\n${cargo >= 20 ? "满载" : "⚡ "}${cargo}/20` : ""}${p.stun > 0 ? " · 眩晕" : ""}${boostText}`,
        );
      if (effectsActive && impact && impact.lost > 0 && _time < impact.until)
        label.setText(`掉落 ${impact.lost} · ${p.name}`);
      label.setVisible(this.state?.phase === "playing");
    }
    this.wheelMotion.retain(present);
    for (const id of this.dustAt.keys())
      if (!present.has(id)) this.dustAt.delete(id);
    for (const id of this.impactState.keys())
      if (!present.has(id)) this.impactState.delete(id);
    for (const id of this.boostIndicators.keys()) {
      if (!present.has(id)) this.boostIndicators.delete(id);
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
            resolution: Math.min(
              3,
              this.game?.canvas ? this.game.canvas.width / this.scale.width : 1,
            ),
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
