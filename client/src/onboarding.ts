export const GUIDE_KEY = "rover.guide.seen.v1";
export const GUIDE_CARDS = [
  {
    title: "驾驶小车",
    text: "拖动摇杆移动",
    detail: "电脑：WASD / 方向键",
    x: 103,
    y: 277,
    w: 354,
    h: 372,
  },
  {
    title: "收集电池",
    text: "靠近自动收集",
    detail: "最多携带 20 个",
    x: 493,
    y: 277,
    w: 318,
    h: 372,
  },
  {
    title: "回收得分",
    text: "送到回收站得分",
    detail: "已存越多，排名越高",
    x: 849,
    y: 277,
    w: 317,
    h: 372,
  },
  {
    title: "冲刺争夺",
    text: "按住冲刺，松开充能",
    detail: "冲撞对手，争抢电池",
    x: 1202,
    y: 277,
    w: 350,
    h: 372,
  },
];
export class EntryGuide {
  private room: string | null = null;
  private until = 0;
  private visible = false;
  private seen: boolean;
  private save: () => void;
  constructor(seen: boolean, save: () => void) {
    this.seen = seen;
    this.save = save;
  }
  enter(room: string | null, now: number) {
    if (room === this.room) return;
    this.room = room;
    this.visible = !!room;
    this.until = now + 5000;
  }
  show(now: number) {
    this.visible = true;
    this.until = now + 5000;
  }
  close(now: number) {
    const view = this.view(now);
    if (view.canClose) this.visible = false;
  }
  view(now: number) {
    if (this.visible && now >= this.until) {
      this.visible = false;
      if (!this.seen) {
        this.seen = true;
        this.save();
      }
    }
    return {
      visible: this.visible,
      canClose: this.seen,
      seconds: Math.max(0, Math.ceil((this.until - now) / 1000)),
    };
  }
}
