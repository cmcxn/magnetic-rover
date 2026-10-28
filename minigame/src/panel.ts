import Phaser from "phaser";
import { lobbyCardLayout } from "./lobby-layout";
import {
  COLORS,
  sharedRank,
  type RoomSummary,
  type State,
  type FloatingJoystick,
} from "../../client/src/types";
import {
  UI,
  controlLayout,
  joystickPose,
  skillView,
  clockText,
  orbLiquid,
} from "../../client/src/presentation";
export interface PanelModel {
  connected: boolean;
  soundEnabled?: boolean;
  status: string;
  name: string;
  color: string;
  endpoint: string;
  rooms: RoomSummary[];
  state: State | null;
  self: string;
  roomId: string | null;
  spectator: boolean;
  notice: string;
  rtt: number | null;
  fps: number | null;
  age: number;
}
export interface PanelActions {
  connect(): void;
  toggleSound?(): void;
  rename(): void;
  color(value: string): void;
  server(): void;
  send(message: object): void;
  leave(): void;
  boost(): void;
  joinCode(): void;
  copy(): void;
}
type Hit = {
  x: number;
  y: number;
  w: number;
  h: number;
  circle?: boolean;
  action: () => void;
};
/** Platform shell only: every score and room phase comes from the same server as H5. */
export class CartoonPanel extends Phaser.Scene {
  hits: Hit[] = [];
  private soundHit?: Hit;
  private menu!: Phaser.GameObjects.Container;
  private paint!: Phaser.GameObjects.Graphics;
  private live!: Phaser.GameObjects.Container;
  private dynamic!: Phaser.GameObjects.Graphics;
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private key = "";
  private page = 0;
  private board = false;
  private getModel: () => PanelModel;
  private actions: PanelActions;
  private joystick: FloatingJoystick;
  private insets: () => { left: number; right: number; top: number };
  constructor(
    model: () => PanelModel,
    actions: PanelActions,
    joystick: FloatingJoystick,
    insets: () => { left: number; right: number; top: number },
  ) {
    super("panel");
    this.getModel = model;
    this.actions = actions;
    this.joystick = joystick;
    this.insets = insets;
  }
  create() {
    this.menu = this.add.container(0, 0);
    this.paint = this.add.graphics();
    this.menu.add(this.paint);
    this.live = this.add.container(0, 0);
    this.dynamic = this.add.graphics();
    this.live.add(this.dynamic);
    this.scale.on("resize", () => this.invalidate());
  }
  invalidate() {
    this.key = "";
  }
  press(x: number, y: number) {
    const hit = [...this.hits, ...(this.soundHit ? [this.soundHit] : [])]
      .reverse()
      .find((b) =>
        b.circle
          ? Math.hypot(x - b.x, y - b.y) <= b.w
          : x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h,
      );
    if (hit) {
      hit.action();
      return true;
    }
    return false;
  }
  private text(
    x: number,
    y: number,
    value: string,
    size = 20,
    color = "#203a55",
    parent = this.menu,
  ) {
    const t = this.add.text(x, y, value, {
      fontFamily: "sans-serif",
      fontSize: size + "px",
      fontStyle: "bold",
      color,
    });
    parent.add(t);
    return t;
  }
  private rounded(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    color: number,
    r = 20,
  ) {
    g.fillStyle(0x102c43, 0.24).fillRoundedRect(x, y + 5, w, h, r);
    g.fillStyle(color).fillRoundedRect(x, y, w, h, r);
    g.lineStyle(
      2,
      color === UI.cream ? 0xfff9ed : 0x61869e,
      1,
    ).strokeRoundedRect(x, y, w, h, r);
  }
  private button(
    x: number,
    y: number,
    w: number,
    label: string,
    action: () => void,
    secondary = false,
    enabled = true,
    h = 46,
  ) {
    this.rounded(this.paint, x, y, w, h, secondary ? 0xdce8f5 : UI.cyan, h / 2);
    this.paint
      .lineStyle(2, secondary ? 0xbacddd : 0x9cf9ff)
      .lineBetween(x + 20, y + 5, x + w - 20, y + 5);
    this.text(
      x + w / 2,
      y + h / 2,
      label,
      19,
      secondary ? "#203a55" : "#ffffff",
    )
      .setOrigin(0.5)
      .setAlpha(enabled ? 1 : 0.45);
    if (enabled) {
      const s = this.menu.scaleX;
      this.hits.push({
        x: this.menu.x + x * s,
        y: this.menu.y + y * s,
        w: w * s,
        h: h * s,
        action,
      });
    }
  }
  private car(x: number, y: number, color: string, size = 100, angle = -0.35) {
    const texture = "rover-" + color.slice(1);
    if (this.textures.exists(texture)) {
      const car = this.add
        .image(x, y, texture, "trim")
        .setDisplaySize(size, size * 0.7)
        .setRotation(angle);
      this.menu.add(car);
    } else if (this.textures.exists("rover")) {
      this.menu.add(
        this.add
          .image(x, y, "rover", "trim")
          .setDisplaySize(size, size * 0.7)
          .setRotation(angle),
      );
    }
  }
  private guide(y: number, width: number) {
    this.rounded(this.paint, 26, y, width - 52, 63, 0xefdfc5, 20);
    ["ϟ  收集能量", "❯❯  冲刺撞抢", "♻  回站存分"].forEach((v, i) =>
      this.text((width * (i + 0.5)) / 3, y + 31, v, 18).setOrigin(0.5),
    );
  }
  private renderMenu(m: PanelModel) {
    this.menu.removeAll(true);
    this.paint = this.add.graphics();
    this.menu.add(this.paint);
    this.hits = [];
    if (m.state?.phase === "playing") {
      this.menu.setVisible(false);
      return;
    }
    this.menu.setVisible(true);
    const { left, right, top } = this.insets();
    const availableW = this.scale.width - left - right - 12,
      availableH = this.scale.height - top - 30;
    const W = 860,
      H = 500,
      scale = Math.min(availableW / W, availableH / H, 1.3);
    this.menu
      .setPosition(
        (this.scale.width - W * scale) / 2,
        top + (availableH - H * scale) / 2,
      )
      .setScale(scale);
    this.rounded(this.paint, 0, 0, W, H, UI.cream, 34);
    this.paint.lineStyle(4, 0xfffbef).strokeRoundedRect(4, 4, W - 8, H - 8, 32);
    this.rounded(this.paint, W / 2 - 176, -4, 352, 66, UI.navy, 24);
    this.text(
      W / 2,
      28,
      m.state?.phase === "finished" ? "本局结算" : "磁力小车 ϟ",
      38,
      "#fff9e7",
    ).setOrigin(0.5);
    this.text(W / 2, 77, "100 秒抢运赛 · 2–8 人同场", 17).setOrigin(0.5);
    if (!m.connected) {
      this.car(172, 212, m.color, 190);
      this.text(172, 303, "收集 · 冲刺 · 回收", 20).setOrigin(0.5);
      this.text(400, 112, "你的车手昵称", 18);
      this.button(400, 143, 400, m.name, this.actions.rename, true);
      this.text(400, 207, "挑一辆喜欢的小车", 18);
      COLORS.forEach((c, i) => {
        const x = 429 + i * 66;
        this.paint.fillStyle(parseInt(c.slice(1), 16)).fillCircle(x, 255, 22);
        this.paint
          .lineStyle(c === m.color ? 4 : 2, c === m.color ? UI.navy : 0xffffff)
          .strokeCircle(x, 255, 25);
        const s = this.menu.scaleX;
        this.hits.push({
          x: this.menu.x + (x - 28) * s,
          y: this.menu.y + 227 * s,
          w: 56 * s,
          h: 56 * s,
          action: () => this.actions.color(c),
        });
      });
      this.button(
        400,
        300,
        400,
        "驶入大厅  →",
        this.actions.connect,
        false,
        true,
        55,
      );
      this.button(400, 374, 190, "服务器设置", this.actions.server, true);
      this.text(172, 354, "小车大电量\n出发，抢点电！", 27).setOrigin(0.5);
      this.guide(428, W);
    } else if (!m.roomId) {
      this.text(28, 108, "选择你的赛场", 25);
      this.button(620, 101, 212, "＋ 创建房间", () =>
        this.actions.send({ type: "create_room" }),
      );
      this.button(
        28,
        157,
        520,
        "输入朋友的房间码加入",
        this.actions.joinCode,
        true,
      );
      this.button(
        566,
        157,
        126,
        "刷新",
        () => this.actions.send({ type: "rooms" }),
        true,
      );
      const perPage = 3,
        pages = Math.max(1, Math.ceil(m.rooms.length / perPage));
      this.page = Math.min(this.page, pages - 1);
      if (!m.rooms.length)
        this.text(
          W / 2,
          279,
          "赛场还空着，创建房间邀请朋友来一局！",
          21,
        ).setOrigin(0.5);
      m.rooms
        .slice(this.page * perPage, (this.page + 1) * perPage)
        .forEach((r, i) => {
          const y = 218 + i * 60;
          this.rounded(this.paint, 28, y, W - 56, 54, 0xfff8ea, 16);
          this.text(
            45,
            y + 6,
            `房间 ${r.roomCode} · ${r.playerCount}/8 人`,
            18,
          );
          this.text(
            45,
            y + 30,
            r.phase === "lobby"
              ? `${r.readyCount} 已准备 · 等待发车`
              : r.phase === "playing"
                ? "比赛中"
                : "本局结算",
            14,
            "#647d85",
          );
          this.button(
            577,
            y + 5,
            105,
            "加入",
            () => this.actions.send({ type: "join_room", roomId: r.roomId }),
            false,
            r.canJoin,
            44,
          );
          this.button(
            697,
            y + 5,
            105,
            "观战",
            () => this.actions.send({ type: "spectate", roomId: r.roomId }),
            true,
            r.canSpectate,
            44,
          );
        });
      if (pages > 1) {
        this.button(
          305,
          407,
          100,
          "上一页",
          () => {
            this.page = Math.max(0, this.page - 1);
            this.invalidate();
          },
          true,
          this.page > 0,
          40,
        );
        this.text(430, 427, `${this.page + 1}/${pages}`, 17).setOrigin(0.5);
        this.button(
          460,
          407,
          100,
          "下一页",
          () => {
            this.page++;
            this.invalidate();
          },
          true,
          this.page < pages - 1,
          40,
        );
      }
      this.text(W / 2, 477, "收集能量  ›  冲刺撞抢  ›  回站存分", 19).setOrigin(
        0.5,
      );
    } else if (m.state?.phase === "finished") {
      const results =
        m.state.results ??
        [...m.state.players].sort((a, b) => b.score - a.score);
      this.text(W / 2, 107, "比赛结束 · 只有回收的能量计分", 18).setOrigin(0.5);
      results.slice(0, 8).forEach((p, i) => {
        const col = results.length > 4 ? Math.floor(i / 4) : 0,
          row = i % 4,
          w = results.length > 4 ? 390 : 650,
          x = results.length > 4 ? 28 + col * 412 : 105,
          y = 142 + row * 56;
        this.rounded(this.paint, x, y, w, 47, i === 0 ? UI.gold : 0xeee7db, 22);
        this.text(
          x + 17,
          y + 23,
          String(sharedRank(results, p.score)),
          24,
        ).setOrigin(0, 0.5);
        this.car(x + 80, y + 23, p.color, 59);
        this.text(
          x + 123,
          y + 23,
          (p.id === m.self ? "我 · " : "") + p.name.slice(0, 10),
          18,
        ).setOrigin(0, 0.5);
        this.text(x + w - 20, y + 23, String(p.score), 25).setOrigin(1, 0.5);
      });
      this.button(
        200,
        391,
        250,
        "❯❯ 再来一局",
        () => this.actions.send({ type: "again" }),
        false,
        !m.spectator,
        53,
      );
      this.button(
        475,
        391,
        190,
        "返回大厅",
        this.actions.leave,
        true,
        true,
        53,
      );
      this.text(
        W / 2,
        474,
        "同分共享名次 · 未回收能量不计分",
        17,
        "#667d88",
      ).setOrigin(0.5);
    } else if (m.state) {
      this.button(
        277,
        96,
        306,
        `房间码 ${m.state.roomCode ?? m.roomId}  复制`,
        this.actions.copy,
        true,
        true,
        42,
      );
      const players = m.state.players,
        lobby = lobbyCardLayout(players.length);
      players.forEach((p, i) => {
        const x =
          (W - lobby.columns * (lobby.width + lobby.gap) + lobby.gap) / 2 +
          (i % 4) * (lobby.width + lobby.gap);
        const y = lobby.top + Math.floor(i / 4) * lobby.rowStep;
        this.rounded(
          this.paint,
          x,
          y,
          lobby.width,
          lobby.height,
          parseInt(p.color.slice(1), 16),
          20,
        );
        this.car(
          x + lobby.width / 2,
          y + lobby.carY,
          p.color,
          lobby.carWidth,
          lobby.angle,
        );
        this.paint
          .fillStyle(UI.navy)
          .fillRoundedRect(
            x,
            y + lobby.nameTop,
            lobby.width,
            lobby.nameHeight,
            10,
          );
        const limit = p.id === m.self ? 7 : 10;
        const nickname = [...p.name];
        const caption =
          (p.id === m.self ? "我 · " : "") +
          nickname.slice(0, limit).join("") +
          (nickname.length > limit ? "…" : "");
        this.text(
          x + lobby.width / 2,
          y + lobby.nameY,
          caption,
          lobby.nameFont,
          "#fff8e7",
        ).setOrigin(0.5);
        this.text(
          x + lobby.width / 2,
          y + lobby.readyY,
          !p.connected ? "重连中" : p.ready ? "✓ 已准备" : "等待准备",
          lobby.readyFont,
          p.ready ? "#173e37" : "#203a55",
        ).setOrigin(0.5);
      });
      const me = players.find((p) => p.id === m.self);
      this.text(156, 376, `${players.length} / 8 人`, 26).setOrigin(0.5);
      this.button(
        280,
        348,
        344,
        m.spectator
          ? "观战中 · 等待发车"
          : me?.ready
            ? "✓ 已准备 · 点击取消"
            : "❯❯ 开始比赛",
        () => this.actions.send({ type: "ready", ready: !me?.ready }),
        false,
        !m.spectator,
        58,
      );
      this.button(670, 353, 160, "返回大厅", this.actions.leave, true);
      this.text(
        W / 2,
        425,
        "至少 2 人，全员准备后自动发车",
        17,
        "#637987",
      ).setOrigin(0.5);
      this.text(
        W / 2,
        474,
        "ϟ 收集能量   ›   ❯❯ 冲刺撞抢   ›   ♻ 回站存分",
        20,
      ).setOrigin(0.5);
    }
  }
  private label(
    key: string,
    x: number,
    y: number,
    value: string,
    size = 18,
    color = "#fff6e3",
    origin = 0.5,
  ) {
    let t = this.labels.get(key);
    if (!t) {
      t = this.text(x, y, value, size, color, this.live).setOrigin(origin, 0.5);
      this.labels.set(key, t);
    }
    t.setPosition(x, y).setText(value).setVisible(true);
    return t;
  }
  update() {
    if (!this.menu) return;
    const m = this.getModel(),
      playing = m.state?.phase === "playing",
      me = m.state?.players.find((p) => p.id === m.self);
    const signature = JSON.stringify([
      this.textures.exists("rover"),
      m.connected,
      m.name,
      m.color,
      m.roomId,
      m.spectator,
      m.state?.phase,
      m.state?.players.map((p) => [
        p.id,
        p.name,
        p.color,
        p.ready,
        p.connected,
        p.score,
      ]),
      m.rooms.map(({ remaining, ...r }) => r),
      m.state?.results,
    ]);
    if (signature !== this.key) {
      this.key = signature;
      this.renderMenu(m);
    }
    this.dynamic.clear();
    for (const label of this.labels.values()) label.setVisible(false);
    const g = this.dynamic,
      w = this.scale.width,
      h = this.scale.height,
      { left, right, top } = this.insets();
    if (playing && m.state) {
      const layout = controlLayout(w, h, left, right),
        skill = skillView(me, m.age);
      // The native capsule occupies the upper right; keep HUD centered and actions below it.
      const barW = Math.min(w * 0.43, 410),
        bx = (w - barW) / 2,
        by = Math.max(8, top),
        bh = 48;
      this.rounded(g, bx, by, barW, bh, UI.navy, 16);
      this.label(
        "timer",
        bx + barW * 0.2,
        by + 24,
        clockText(m.state.remaining),
        23,
      );
      this.label(
        "score",
        bx + barW * 0.52,
        by + 24,
        `已存 ${me?.score ?? 0}`,
        18,
        "#ffdc58",
      );
      this.label(
        "cargo",
        bx + barW * 0.83,
        by + 24,
        `${me?.cargo ?? 0}/20`,
        18,
        "#ffdc58",
      );
      this.label(
        "brand",
        left + 8,
        by + 15,
        "磁力小车 ϟ",
        20,
        "#fff9e9",
        0,
      ).setStroke("#17354f", 5);
      this.label(
        "net",
        left + 8,
        by + 40,
        `${m.fps === null ? "—" : Math.round(m.fps)} FPS · ${m.rtt ?? "—"} ms`,
        11,
        "#173e50",
        0,
      );
      const rx = w - right - 142,
        ry = Math.max(65, top + 53);
      this.rounded(g, rx, ry, 142, 35, UI.navy, 13);
      this.label(
        "boardButton",
        rx + 43,
        ry + 18,
        this.board ? "收起排行" : "已存排行",
        13,
      );
      this.label("leaveButton", rx + 111, ry + 18, "离开", 13);
      this.hits = [
        {
          x: rx,
          y: ry,
          w: 86,
          h: 35,
          action: () => {
            this.board = !this.board;
          },
        },
        { x: rx + 86, y: ry, w: 56, h: 35, action: this.actions.leave },
      ];
      if (this.board) {
        const sorted = [...m.state.players].sort((a, b) => b.score - a.score);
        // Two columns keep all eight ranks above the skill on short phones.
        const split = h < 430 && sorted.length > 4;
        const rows = split ? Math.ceil(sorted.length / 2) : sorted.length;
        const boardX = split ? rx - 142 : rx;
        const rowHeight = split ? 21 : 23;
        this.rounded(
          g,
          boardX,
          ry + 41,
          split ? 284 : 142,
          rows * rowHeight + 12,
          UI.navy,
          14,
        );
        sorted.forEach((p, i) =>
          this.label(
            "rank" + i,
            boardX + 9 + (split ? Math.floor(i / rows) * 142 : 0),
            ry + 57 + (i % rows) * rowHeight,
            `${sharedRank(sorted, p.score)}  ${p.id === m.self ? "我" : p.name.slice(0, 5)}  ${p.score}`,
            13,
            p.id === m.self ? "#ffdb58" : "#fff6e3",
            0,
          ),
        );
      }
      if (!m.spectator) {
        const j = joystickPose(this.joystick, layout);
        g.fillStyle(0x1c405b, j.active ? 0.6 : 0.4).fillCircle(j.x, j.y, j.r);
        g.lineStyle(3, 0x98bfd9, 0.75).strokeCircle(j.x, j.y, j.r);
        g.fillStyle(0xaecae9).fillCircle(j.x + j.dx, j.y + j.dy, j.r * 0.43);
        g.lineStyle(3, 0xe8f4ff).strokeCircle(
          j.x + j.dx,
          j.y + j.dy,
          j.r * 0.43,
        );
        const b = layout.boost;
        g.fillStyle(0x12435e, 0.4).fillCircle(b.x, b.y + 5, b.r + 4);
        g.fillStyle(UI.navy, 0.36).fillCircle(b.x, b.y, b.r);
        const liquid = orbLiquid(b.x, b.y, b.r - 5, skill.energy, Date.now());
        if (liquid.length)
          g.fillStyle(skill.boosting ? 0x83faff : UI.cyan, 0.65).fillPoints(
            liquid,
            true,
          );
        if (skill.energy > 0.25) {
          for (let i = 0; i < 3; i++) {
            const dx = (i - 1) * b.r * 0.29,
              dy = b.r * 0.52 - ((Date.now() * 0.025 + i * 17) % (b.r * 0.8));
            if (
              dy > b.r * (1 - 2 * skill.energy) + 7 &&
              dx * dx + dy * dy < (b.r - 10) ** 2
            )
              g.lineStyle(1, 0xe0ffff, 0.48).strokeCircle(
                b.x + dx,
                b.y + dy,
                2 + i * 0.6,
              );
          }
        }
        g.lineStyle(3, 0x9ff8ff, 0.65).strokeCircle(b.x, b.y, b.r - 4);
        g.lineStyle(4, 0x244c66, 0.6).strokeCircle(b.x, b.y, b.r + 1);
        g.lineStyle(3, 0x93f7ff, 0.8);
        g.beginPath();
        g.arc(
          b.x,
          b.y,
          b.r + 1,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * skill.progress,
          false,
        );
        g.strokePath();
        this.label("chevron", b.x, b.y - 14, "❯❯", Math.round(b.r * 0.62));
        this.label(
          "boost",
          b.x,
          b.y + 14,
          skill.boosting
            ? "冲刺中"
            : skill.ready
              ? "冲刺"
              : `${skill.seconds.toFixed(1)}秒`,
          Math.round(b.r * 0.35),
        );
        if (!skill.ready)
          this.label(
            "cooling",
            b.x,
            b.y + 31,
            skill.boosting ? "能量释放" : skill.label,
            11,
          );
        // Store circles as circles: touching their square corners must not fire a boost.
        this.hits.push({
          x: b.x,
          y: b.y,
          w: b.r,
          h: b.r,
          circle: true,
          action: this.actions.boost,
        });
      }
      const supply = m.state.supply;
      if (supply)
        this.label(
          "supply",
          w / 2,
          by + bh + 15,
          supply.banking
            ? "停补给 · 尽快回收"
            : supply.secondsToShrink !== undefined
              ? `${supply.stage}/4 区 · ${Math.ceil(supply.secondsToShrink)}秒后缩圈`
              : "中心争夺",
          13,
          "#203a55",
        );
      // Always visible on short landscape phones, anchored below the upper-left status.
      {
        const r = 40,
          x = left + r + 8,
          y = by + 61 + r;
        g.fillStyle(UI.navy, 0.38).fillCircle(x, y, r);
        g.lineStyle(2, 0x88b3c6).strokeCircle(x, y, r);
        for (const s of m.state.stations) {
          g.fillStyle(0x6eedb1).fillCircle(
            x + (s.x / 500) * r * 0.85,
            y + (s.y / 500) * r * 0.85,
            4,
          );
        }
        for (const p of m.state.players) {
          g.fillStyle(parseInt(p.color.slice(1), 16)).fillCircle(
            x + (p.x / 500) * r * 0.85,
            y + (p.y / 500) * r * 0.85,
            p.id === m.self ? 4 : 3,
          );
        }
      }
    } else {
      this.label(
        "status",
        w / 2,
        h - 12,
        m.notice ||
          (!m.connected
            ? m.status
            : m.roomId
              ? "全员准备后发车"
              : "已连接 · 选择房间开始比赛"),
        12,
        "#fff8e7",
      ).setStroke("#19374c", 3);
    }
    if (this.actions.toggleSound) {
      const sx = playing ? w - right - 218 : left + 4,
        sy = playing ? Math.max(65, top + 53) : Math.max(8, top);
      g.fillStyle(UI.navy, 0.65).fillRoundedRect(sx, sy, 70, 35, 13);
      this.label(
        "sound",
        sx + 35,
        sy + 18,
        m.soundEnabled === false ? "声音 关" : "声音 开",
        13,
      );
      this.soundHit = {
        x: sx,
        y: sy - 4,
        w: 70,
        h: 43,
        action: this.actions.toggleSound,
      };
    }
    if (m.notice && playing)
      this.label(
        "notice",
        w / 2,
        h * 0.27,
        m.notice.slice(0, 36),
        16,
        "#fff4cf",
      ).setStroke("#19374c", 4);
  }
}
