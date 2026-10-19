import Phaser from "phaser";
import { cameraPolicy, type State } from "./types";
export class World extends Phaser.Scene {
  state: State | null = null;
  self = "";
  g!: Phaser.GameObjects.Graphics;
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
    const g = this.g;
    g.clear();
    this.spriteIds.clear();
    const w = this.scale.width,
      h = this.scale.height;
    // Smooth before camera placement so the local car and follow camera agree.
    for (const p of this.state?.players ?? []) {
      let v = this.smooth.get(p.id);
      if (!v) {
        v = { x: p.x, y: p.y, angle: p.angle };
        this.smooth.set(p.id, v);
      }
      // Follow received authority more promptly for the local driver; no prediction.
      const a = Math.min(1, delta / (p.id === this.self ? 25 : 65));
      v.x += (p.x - v.x) * a;
      v.y += (p.y - v.y) * a;
      let da = Phaser.Math.Angle.Wrap(p.angle - v.angle);
      v.angle += da * a;
    }
    const me = this.state?.players.find((p) => p.id === this.self);
    const policy = cameraPolicy(
      w,
      h,
      window.matchMedia("(pointer: coarse)").matches,
    );
    if (policy.follows && this.state?.phase === "playing" && me) {
      this.worldScale = policy.scale;
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
    const circle = (x: number, y: number, r: number, c: number, a = 1) => {
      g.fillStyle(c, a);
      g.fillCircle(x, y, r);
    };
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
      if (this.sprite(`battery-${b.id}`, "battery", b.x, b.y, 14, 28, 2))
        continue;
      g.fillStyle(0xc7a854, 0.23);
      g.fillEllipse(b.x + 2, b.y + 7, 15, 7);
      g.fillStyle(0xd7aa33);
      g.fillRoundedRect(b.x - 7, b.y - 11, 14, 23, 4);
      g.fillStyle(0xffda57);
      g.fillRoundedRect(b.x - 6, b.y - 12, 12, 21, 3);
      g.fillStyle(0x776e49);
      g.fillRect(b.x - 3, b.y - 15, 6, 3);
      g.lineStyle(2, 0xfff8d4);
      g.beginPath();
      g.moveTo(b.x + 1, b.y - 8);
      g.lineTo(b.x - 2, b.y);
      g.lineTo(b.x + 2, b.y);
      g.lineTo(b.x - 1, b.y + 7);
      g.strokePath();
    }
    const present = new Set<string>();
    for (const p of this.state?.players ?? []) {
      present.add(p.id);
      const v = this.smooth.get(p.id)!;
      const c = Phaser.Display.Color.HexStringToColor(p.color).color;
      circle(v.x, v.y + 7, 21, 0x51694b, 0.16);
      circle(v.x, v.y, 28, c, 0.35);
      g.lineStyle(3, c, 0.9);
      g.strokeCircle(v.x, v.y, 27);
      const hasSprite = this.sprite(
        `car-${p.id}`,
        "rover",
        v.x,
        v.y,
        49,
        34,
        4,
        v.angle,
      );
      if (p.id === this.self) {
        g.lineStyle(2, 0x376e60, 0.65);
        g.strokeCircle(v.x, v.y, 29);
      }
      if (!p.connected) circle(v.x, v.y, 25, 0xffffff, 0.5);
      // Car points along +X. Four tires, windscreen, headlights and roof arrow.
      const rot = (x: number, y: number) => ({
        x: v!.x + x * Math.cos(v!.angle) - y * Math.sin(v!.angle),
        y: v!.y + x * Math.sin(v!.angle) + y * Math.cos(v!.angle),
      });
      const box = (x: number, y: number, w: number, h: number, col: number) => {
        const pts = [
          rot(x - w / 2, y - h / 2),
          rot(x + w / 2, y - h / 2),
          rot(x + w / 2, y + h / 2),
          rot(x - w / 2, y + h / 2),
        ];
        g.fillStyle(col);
        g.fillPoints(pts, true);
      };
      if (!hasSprite) {
        for (const x of [-12, 12])
          for (const y of [-15, 15]) box(x, y, 12, 7, 0x32554d);
        box(0, 0, 37, 27, 0x476355);
        box(0, -1, 34, 25, c);
        box(7, -1, 8, 19, 0x244e4b);
        box(8, -4, 3, 9, 0xb8f0e5);
        box(18, -8, 4, 5, 0xfff8c8);
        box(18, 8, 4, 5, 0xfff8c8);
        box(-17, -8, 3, 5, 0xc46755);
        box(-17, 8, 3, 5, 0xc46755);
        const tip = rot(2, 0),
          u = rot(-5, -5),
          d = rot(-5, 5);
        g.fillStyle(0xffffff, 0.85);
        g.fillTriangle(tip.x, tip.y, u.x, u.y, d.x, d.y);
      }
      for (let k = 0; k < Math.min(p.cargo, 5); k++) {
        const t = rot(-25 - k * 5, Math.sin(k) * 4);
        circle(t.x, t.y, 3.5, 0xedc34f);
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
      label
        .setPosition(this.ox + v.x * s, this.oy + (v.y - 34) * s)
        .setText(
          `${p.name}${p.id === this.self ? " · 你" : ""}${p.cargo ? "  ⚡" + p.cargo : ""}`,
        );
      label.setVisible(this.state?.phase === "playing");
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
