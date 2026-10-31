import Phaser from "phaser";
import { lobbyCardLayout } from "./lobby-layout";
import {
  GAME_NAME,
  COLORS,
  sharedRank,
  type RoomSummary,
  type State,
  type FloatingJoystick,
} from "../../client/src/types";
import {
  UI,
  latencyView,
  botLobbyView,
  minimapScale,
  compactHudLayout,
  controlLayout,
  joystickPose,
  skillView,
  clockText,
  orbLiquid,
} from "../../client/src/presentation";
export interface PanelModel {
  build?: string;
  connected: boolean;
  selfVisual?: import("../../client/src/types").Player;
  keyboardEnabled?: boolean;
  soundEnabled?: boolean;
  status: string;
  name: string;
  color: string;
  rooms: RoomSummary[];
  state: State | null;
  self: string;
  roomId: string | null;
  spectator: boolean;
  notice: string;
  rtt: number | null;
  fps: number | null;
  networkTimedOut?: boolean;
  age: number;
}
export interface PanelActions {
  showGuide?(): void;
  connect(): void;
  toggleSound?(): void;
  rename(): void;
  color(value: string): void;
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
  private guideHit?: Hit;
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
  private insets: () => {
    left: number;
    right: number;
    top: number;
    capsuleBottom?: number;
  };
  constructor(
    model: () => PanelModel,
    actions: PanelActions,
    joystick: FloatingJoystick,
    insets: () => {
      left: number;
      right: number;
      top: number;
      capsuleBottom?: number;
    },
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
    const hit = [
      ...this.hits,
      ...(this.soundHit ? [this.soundHit] : []),
      ...(this.guideHit ? [this.guideHit] : []),
    ]
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
      resolution: Math.min(
        3,
        this.game?.canvas ? this.game.canvas.width / this.scale.width : 1,
      ),
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
    const start =
      enabled &&
      !secondary &&
      (label.includes("开始比赛") || label.includes("和 AI 一起玩"));
    const ready = enabled && label.includes("已准备");
    this.rounded(
      this.paint,
      x,
      y,
      w,
      h,
      start ? 0xffb51b : ready ? 0x12836c : secondary ? 0xdce8f5 : UI.cyan,
      h / 2,
    );
    if (start)
      this.paint.lineStyle(3, 0xffd868).strokeRoundedRect(x, y, w, h, h / 2);
    this.paint
      .lineStyle(2, start ? 0xffe69b : secondary ? 0xbacddd : 0x9cf9ff)
      .lineBetween(x + 20, y + 5, x + w - 20, y + 5);
    this.text(
      x + w / 2,
      y + h / 2,
      label,
      19,
      secondary || start ? "#203a55" : "#ffffff",
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
  private car(
    x: number,
    y: number,
    color: string,
    size = 100,
    angle = -0.35,
    alpha = 1,
  ) {
    const texture = "rover-" + color.slice(1);
    if (this.textures.exists(texture)) {
      const car = this.add
        .image(x, y, texture, "trim")
        .setDisplaySize(size, size * 0.7)
        .setRotation(angle)
        .setAlpha(alpha);
      this.menu.add(car);
    } else if (this.textures.exists("rover")) {
      this.menu.add(
        this.add
          .image(x, y, "rover", "trim")
          .setDisplaySize(size, size * 0.7)
          .setRotation(angle)
          .setAlpha(alpha),
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
      m.state?.phase === "finished" ? "本局结算" : GAME_NAME + " ϟ",
      28,
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
        const x = 420 + i * 51;
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
      this.text(
        172,
        354,
        m.keyboardEnabled
          ? "WASD / 方向键驾驶\n按住空格冲刺，松开充能\n鼠标也可拖动摇杆"
          : "小车大电量\n出发，抢点电！",
        m.keyboardEnabled ? 16 : 27,
      ).setOrigin(0.5);
      this.guide(428, W);
    } else if (!m.roomId) {
      this.button(
        28,
        101,
        520,
        `昵称：${m.name} · 修改`,
        this.actions.rename,
        true,
        true,
        42,
      );
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
          (p.isBot ? "AI · " : p.id === m.self ? "改名 · " : "") +
            p.name.slice(0, 10),
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
      const occupied = new Set(
        m.state.players.filter((p) => p.id !== m.self).map((p) => p.color),
      );
      const selfColor = m.state.players.find((p) => p.id === m.self)?.color;
      COLORS.forEach((c, i) => {
        const x = 658 + (i % 4) * 46,
          y = 76 + Math.floor(i / 4) * 46;
        const taken = occupied.has(c);
        this.paint
          .fillStyle(parseInt(c.slice(1), 16), taken ? 0.25 : 1)
          .fillCircle(x, y, 20);
        if (c === selfColor)
          this.paint.lineStyle(2, UI.navy).strokeCircle(x, y, 23);
        if (taken) this.text(x, y, "×", 15).setOrigin(0.5);
        if (!taken && !m.spectator) {
          const s = this.menu.scaleX;
          this.hits.push({
            x: this.menu.x + (x - 23) * s,
            y: this.menu.y + (y - 23) * s,
            w: 46 * s,
            h: 46 * s,
            action: () => this.actions.send({ type: "set_color", color: c }),
          });
        }
      });
      const players = m.state.players,
        lobby = lobbyCardLayout(
          m.state.canAddBot !== undefined ? 8 : players.length,
        );
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
          p.ready && p.connected ? parseInt(p.color.slice(1), 16) : 0xe3e9e5,
          20,
        );
        this.car(
          x + lobby.width / 2,
          y + lobby.carY,
          p.color,
          lobby.carWidth,
          lobby.angle,
          p.ready && p.connected ? 1 : 0.35,
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
          (p.isBot ? "AI · " : "") +
          (p.id === m.self ? "改名 · " : "") +
          nickname.slice(0, limit).join("") +
          (nickname.length > limit ? "…" : "");
        this.text(
          x + lobby.width / 2,
          y + lobby.nameY,
          caption,
          lobby.nameFont,
          "#fff8e7",
        ).setOrigin(0.5);
        if (p.id === m.self) {
          const s = this.menu.scaleX;
          this.hits.push({
            x: this.menu.x + x * s,
            y: this.menu.y + (y + lobby.nameTop) * s,
            w: lobby.width * s,
            h: lobby.nameHeight * s,
            action: this.actions.rename,
          });
        }
        this.text(
          x + lobby.width / 2,
          y + lobby.readyY,
          !p.connected ? "重连中" : p.ready ? "✓ 已准备" : "等待准备",
          lobby.readyFont,
          p.ready ? "#173e37" : "#203a55",
        ).setOrigin(0.5);
      });
      if (m.state.canAddBot !== undefined)
        for (let i = players.length; i < 8; i++) {
          const x =
            (W - 4 * (lobby.width + lobby.gap) + lobby.gap) / 2 +
            (i % 4) * (lobby.width + lobby.gap);
          const y = lobby.top + Math.floor(i / 4) * lobby.rowStep;
          this.rounded(
            this.paint,
            x,
            y,
            lobby.width,
            lobby.height,
            0xe4e9eb,
            18,
          );
          this.paint
            .lineStyle(1, 0x9eafbb, 0.65)
            .strokeCircle(x + lobby.width / 2, y + 28, 16);
          this.text(x + lobby.width / 2, y + 28, "+", 25, "#879ba7").setOrigin(
            0.5,
          );
          this.text(
            x + lobby.width / 2,
            y + 73,
            "等待加入",
            14,
            "#667d88",
          ).setOrigin(0.5);
        }
      const me = players.find((p) => p.id === m.self);
      const ai = botLobbyView(m.state, m.self, m.spectator);
      this.text(136, 376, `${players.length} / 8 人`, 26).setOrigin(0.5);
      if (ai.action === "add_bot") {
        this.button(
          245,
          348,
          280,
          "和 AI 一起玩",
          () => this.actions.send({ type: "add_bot" }),
          false,
          true,
          58,
        );
        this.button(545, 355, 110, "开始比赛", () => {}, true, false, 46);
      } else {
        this.button(
          ai.action === "remove_bot" ? 245 : 280,
          348,
          ai.action === "remove_bot" ? 280 : 344,
          m.spectator
            ? "观战中 · 等待发车"
            : me?.ready
              ? "✓ 已准备 · 点击取消"
              : "❯❯ 开始比赛",
          () => this.actions.send({ type: "ready", ready: !me?.ready }),
          false,
          !m.spectator && !ai.startDisabled,
          58,
        );
        if (ai.action === "remove_bot")
          this.button(
            545,
            355,
            110,
            "移除 AI",
            () => this.actions.send({ type: "remove_bot" }),
            true,
            true,
            46,
          );
      }
      this.button(670, 353, 160, "返回大厅", this.actions.leave, true);
      this.text(
        W / 2,
        425,
        ai.action === "add_bot"
          ? "一个人也能开赛，加入 AI 陪练"
          : ai.hasBot
            ? "AI 已准备，点击开始即可出发"
            : "至少 2 人，全员准备后自动发车",
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
    t.setPosition(x, y).setText(value).setColor(color).setVisible(true);
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
      m.keyboardEnabled,
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
        p.isBot,
        p.score,
      ]),
      m.rooms.map(({ remaining, ...r }) => r),
      m.state?.results,
      m.state?.canAddBot,
      m.state?.canRemoveBot,
      m.state?.botCount,
    ]);
    if (signature !== this.key) {
      this.key = signature;
      this.renderMenu(m);
    }
    this.dynamic.clear();
    this.guideHit = undefined;
    for (const label of this.labels.values()) label.setVisible(false);
    if (m.state?.phase === "lobby" && !m.spectator && !me?.ready) {
      const s = this.menu.scaleX;
      this.dynamic
        .lineStyle(3, 0xffba5a, 0.4 + 0.2 * Math.sin(Date.now() / 350))
        .strokeRoundedRect(
          this.menu.x +
            (m.state.canAddBot || m.state.canRemoveBot ? 242 : 277) * s,
          this.menu.y + 345 * s,
          (m.state.canAddBot || m.state.canRemoveBot ? 286 : 350) * s,
          64 * s,
          32 * s,
        );
    }
    const g = this.dynamic,
      w = this.scale.width,
      h = this.scale.height,
      { left, right, top, capsuleBottom } = this.insets();
    if (playing && m.state) {
      if (m.keyboardEnabled)
        this.label(
          "keyboard-help",
          w / 2,
          h - 12,
          "WASD / 方向键驾驶 · 按住空格冲刺",
          12,
        ).setStroke("#17354f", 3);
      const layout = controlLayout(w, h, left, right),
        skill = skillView(
          m.selfVisual ?? me,
          m.selfVisual ? 0 : m.age,
          m.state ?? undefined,
        );
      const hud = compactHudLayout(w, h, left, right, top, capsuleBottom);
      const net = latencyView(m.rtt, m.networkTimedOut);
      if (net.level === "bad") {
        g.fillStyle(0xff2638, 0.08).fillRect(0, 0, w, h);
        g.lineStyle(12, 0xff233f, 0.13).strokeRoundedRect(
          5,
          5,
          w - 10,
          h - 10,
          12,
        );
        g.lineStyle(
          3,
          0xff304a,
          0.75 + 0.15 * Math.sin(Date.now() / 500),
        ).strokeRoundedRect(3, 3, w - 6, h - 6, 10);
      }
      const glass = (x: number, y: number, width: number, height: number) => {
        g.fillStyle(0x657c89, 0.28).fillRoundedRect(x, y, width, height, 15);
        g.lineStyle(1, 0xc0e0eb, 0.65).strokeRoundedRect(
          x,
          y,
          width,
          height,
          15,
        );
      };
      const bx = hud.timer.x,
        by = hud.timer.y,
        bh = hud.timer.h;
      glass(bx, by, hud.timer.w, bh);
      this.label(
        "timer",
        w / 2,
        by + bh / 2,
        clockText(m.state.remaining),
        23,
      ).setStroke("#28404a", 2);
      const rx = hud.panel.x,
        ry = hud.panel.y + 34,
        pw = hud.panel.w,
        py = hud.panel.y;
      glass(rx, py, pw, hud.panel.h);
      g.lineStyle(1, 0xd5e5e8, 0.4).lineBetween(
        rx + 8,
        py + 33,
        rx + pw - 8,
        py + 33,
      );
      const unit = pw / 270;
      // Recycling arrows and battery are drawn as geometry to avoid missing glyphs.
      const iconX = rx + 14 * unit,
        iconY = py + 17;
      g.lineStyle(2, 0x64d9b0)
        .beginPath()
        .arc(iconX, iconY, 7, 0.25, 5.6)
        .strokePath();
      g.fillStyle(0x64d9b0).fillTriangle(
        iconX + 7,
        iconY - 7,
        iconX + 9,
        iconY,
        iconX + 2,
        iconY - 3,
      );
      this.label(
        "score",
        rx + 27 * unit,
        py + 18,
        String(me?.score ?? 0),
        14,
        "#ffe577",
        0,
      ).setStroke("#3b4850", 2);
      g.fillStyle(0xffd25b).fillRoundedRect(rx + 58 * unit, py + 10, 10, 16, 2);
      g.fillStyle(0xffecb4).fillRect(rx + 61 * unit, py + 7, 4, 3);
      this.label(
        "cargo",
        rx + 73 * unit,
        py + 18,
        `${me?.cargo ?? 0}/20`,
        13,
        "#ffe577",
        0,
      ).setStroke("#3b4850", 2);
      this.label(
        "net-fps",
        rx + 121 * unit,
        py + 18,
        `${m.fps === null ? "—" : Math.round(m.fps)} FPS`,
        11,
        "#edf5f7",
        0,
      ).setStroke("#3b4850", 2);
      const netColor = parseInt(net.color.slice(1), 16),
        wifiX = rx + 183 * unit;
      g.lineStyle(2, netColor)
        .beginPath()
        .arc(wifiX, py + 22, 8, Math.PI * 1.2, Math.PI * 1.8)
        .strokePath();
      g.fillStyle(netColor).fillCircle(wifiX, py + 22, 1.5);
      this.label(
        "net",
        rx + pw - 8,
        py + 18,
        m.networkTimedOut
          ? "超时"
          : `${m.rtt === null ? "—" : Math.round(m.rtt)} ms`,
        12,
        net.color,
        1,
      ).setStroke("#3b4850", 2);
      const cell = pw / 3;
      this.label(
        "sound",
        rx + cell * 0.5,
        ry + 20,
        m.soundEnabled === false ? "声音 关" : "声音 开",
        13,
      ).setStroke("#3b4850", 2);
      this.label(
        "boardButton",
        rx + cell * 1.5,
        ry + 20,
        this.board ? "收起" : "排行",
        13,
      ).setStroke("#3b4850", 2);
      this.label("leaveButton", rx + cell * 2.5, ry + 20, "离开", 13).setStroke(
        "#3b4850",
        2,
      );
      this.soundHit = undefined;
      this.hits = [
        {
          x: rx,
          y: ry,
          w: cell,
          h: 42,
          action: () => this.actions.toggleSound?.(),
        },
        {
          x: rx + cell,
          y: ry,
          w: cell,
          h: 42,
          action: () => {
            this.board = !this.board;
          },
        },
        { x: rx + cell * 2, y: ry, w: cell, h: 42, action: this.actions.leave },
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
            `${sharedRank(sorted, p.score)}  ${p.isBot ? "AI · " + p.name.slice(0, 4) : p.id === m.self ? "我" : p.name.slice(0, 5)}  ${p.score}`,
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
          g.fillStyle(
            parseInt((me?.color ?? m.color).slice(1), 16),
            0.65,
          ).fillPoints(liquid, true);
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
        g.lineStyle(
          3,
          parseInt((me?.color ?? m.color).slice(1), 16),
          0.65,
        ).strokeCircle(b.x, b.y, b.r - 4);
        g.lineStyle(4, 0x244c66, 0.6).strokeCircle(b.x, b.y, b.r + 1);
        g.lineStyle(3, parseInt((me?.color ?? m.color).slice(1), 16), 0.8);
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
        if (!skill.ready || skill.boosting || skill.energy < 1)
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
        const r = hud.map.r,
          x = hud.map.x,
          y = hud.map.y;
        g.fillStyle(UI.navy, 0.38).fillCircle(x, y, r);
        g.lineStyle(2, 0x88b3c6).strokeCircle(x, y, r);
        for (const s of m.state.stations) {
          g.fillStyle(0x6eedb1).fillCircle(
            x + s.x * minimapScale(m.state.radius, r * 0.85),
            y + s.y * minimapScale(m.state.radius, r * 0.85),
            4,
          );
        }
        for (const p of m.state.players) {
          g.fillStyle(parseInt(p.color.slice(1), 16)).fillCircle(
            x + p.x * minimapScale(m.state.radius, r * 0.85),
            y + p.y * minimapScale(m.state.radius, r * 0.85),
            p.id === m.self ? 4 : 3,
          );
        }
      }
    } else {
      if (m.build)
        this.label("build", w - right, h - 28, m.build, 10, "#fff8e7")
          .setOrigin(1, 0.5)
          .setStroke("#19374c", 2);
      this.label(
        "status",
        w / 2,
        h - 12,
        m.notice ||
          (!m.connected
            ? m.status
            : m.roomId
              ? ""
              : "已连接 · 选择房间开始比赛"),
        12,
        "#fff8e7",
      ).setStroke("#19374c", 3);
    }
    if (this.actions.toggleSound && !playing) {
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
    if (!playing && m.roomId && m.state?.phase === "lobby") {
      if (this.actions.showGuide) {
        const x = w - right - 70,
          y = Math.max(8, top, (capsuleBottom ?? 0) + 8);
        g.fillStyle(UI.navy, 0.65).fillRoundedRect(x, y, 64, 30, 10);
        this.label("guide-link", x + 32, y + 15, "玩法", 13);
        this.guideHit = { x, y, w: 64, h: 30, action: this.actions.showGuide };
      }
      if (me?.readyIn !== undefined) {
        const s = this.menu.scaleX, x = this.menu.x + 30 * s, y = this.menu.y + 91 * s;
        const urgent = me.readyIn <= 10;
        g.fillStyle(urgent ? 0xffd5ca : 0xffe6ae, 0.92).fillRoundedRect(x, y, 230*s, 48*s, 18*s);
        const color = urgent ? "#c1322b" : "#c46816";
        this.label("ready-prefix", x+15*s, y+25*s, "请在", 19*s, color, 0);
        this.label("ready-deadline", x+85*s, y+24*s, String(me.readyIn), 38*s, color);
        this.label("ready-suffix", x+116*s, y+25*s, "秒内准备", 19*s, color, 0);
      }
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
