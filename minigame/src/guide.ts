import Phaser from "phaser";
import { GUIDE_CARDS } from "../../client/src/onboarding";
type View = {
  visible: boolean;
  canClose: boolean;
  seconds: number;
  ready?: number;
};
export class TutorialScene extends Phaser.Scene {
  private layer?: Phaser.GameObjects.Container;
  private signature = "";
  private button = { x: 0, y: 0, w: 0, h: 0 };
  constructor(
    private model: () => View,
    private dismiss: () => void,
  ) {
    super("tutorial");
  }
  preload() {
    this.load.image("guide-art", "art/cartoon/guide.jpg");
  }
  create() {
    this.layer = this.add.container(0, 0);
    const ratio =
      (this.textures.get("guide-art").getSourceImage() as HTMLImageElement)
        .width / 1659;
    GUIDE_CARDS.forEach((c, i) =>
      this.textures
        .get("guide-art")
        .add(
          i,
          0,
          Math.round(c.x * ratio),
          Math.round(c.y * ratio),
          Math.round(c.w * ratio),
          Math.round(c.h * ratio),
        ),
    );
  }
  press(x: number, y: number) {
    const m = this.model();
    if (!m.visible) return false;
    const b = this.button;
    if (m.canClose && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)
      this.dismiss();
    return true;
  }
  update() {
    if (!this.layer) return;
    const m = this.model(),
      w = this.scale.width,
      h = this.scale.height;
    this.layer.setVisible(m.visible);
    if (!m.visible) {
      this.signature = "";
      return;
    }
    const key = JSON.stringify([m, w, h]);
    if (key === this.signature) return;
    this.signature = key;
    this.layer.removeAll(true);
    const g = this.add.graphics();
    this.layer.add(g);
    g.fillStyle(0x142b3e, 0.78).fillRect(0, 0, w, h);
    const left = 24,
      top = 12,
      width = w - 48;
    g.fillStyle(0xfff7e5, 0.98).fillRoundedRect(left, top, width, h - 24, 20);
    g.lineStyle(2, 0xe5c785).strokeRoundedRect(left, top, width, h - 24, 20);
    const text = (
      x: number,
      y: number,
      s: string,
      size: number,
      color = "#173d63",
    ) => {
      const t = this.add
        .text(x, y, s, {
          fontFamily: "sans-serif",
          fontSize: size + "px",
          color,
          resolution: Math.min(3, this.game.canvas.width / w),
        })
        .setOrigin(0.5);
      this.layer!.add(t);
      return t;
    };
    text(w / 2, top + 25, "玩法说明", 26);
    text(w / 2, top + 50, "100 秒争夺战 · 回收电池，争夺第一", 13);
    const portrait = h > w,
      cols = portrait ? 2 : 4,
      rows = portrait ? 2 : 1;
    const cw = (width - 36) / cols,
      cardTop = top + 72,
      ch = (h - 166) / rows;
    const ratio =
      (this.textures.get("guide-art").getSourceImage() as HTMLImageElement)
        .width / 1659;
    GUIDE_CARDS.forEach((c, i) => {
      const x = left + 18 + (i % cols) * cw,
        y = cardTop + Math.floor(i / cols) * ch;
      g.fillStyle(0xfffaee).fillRoundedRect(x + 3, y, cw - 6, ch - 8, 12);
      text(x + cw / 2, y + 13, `${i + 1} ${c.title}`, Math.min(17, cw / 10));
      const ih = Math.max(30, ch - 85),
        iw = Math.min(cw - 18, (ih * c.w) / c.h);
      const img = this.add
        .image(x + cw / 2, y + 30 + ih / 2, "guide-art", i)
        .setDisplaySize(iw, ih);
      this.layer!.add(img);
      text(x + cw / 2, y + ch - 39, c.text, Math.min(14, cw / 12));
      text(x + cw / 2, y + ch - 20, c.detail, Math.min(12, cw / 13), "#587087");
    });
    this.button = {
      x: w / 2 - Math.min(180, width / 2 - 12),
      y: h - 69,
      w: Math.min(360, width - 24),
      h: 36,
    };
    const b = this.button;
    g.fillStyle(m.canClose ? 0xf4c961 : 0xe6cc94).fillRoundedRect(
      b.x,
      b.y,
      b.w,
      b.h,
      18,
    );
    text(
      w / 2,
      b.y + 18,
      `${m.canClose ? "我知道了 · 点击关闭" : "了解玩法"} · ${m.seconds} 秒后自动关闭`,
      14,
    );
    text(w / 2, h - 23, "关闭后，请在房间中点击准备", 11);
    if (m.ready !== undefined) {
      const warning =
        m.ready <= 10
          ? `请准备，${m.ready} 秒后将被移出房间`
          : `准备倒计时 ${m.ready} 秒`;
      g.fillStyle(m.ready <= 10 ? 0xb82f36 : 0x294966).fillRoundedRect(
        w - 270,
        12,
        244,
        25,
        10,
      );
      text(w - 148, 24, warning, 12, "#ffffff");
    }
  }
}
