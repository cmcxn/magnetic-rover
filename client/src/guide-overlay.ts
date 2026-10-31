import { GUIDE_CARDS } from "./onboarding";
import "./guide.css";
export class GuideOverlay {
  private root?: HTMLElement;
  private last = "";
  constructor(private close: () => void) {}
  render(
    view: { visible: boolean; canClose: boolean; seconds: number },
    ready?: number,
  ) {
    if (!this.root) {
      this.root = document.createElement("div");
      this.root.id = "entry-guide";
      document.body.appendChild(this.root);
    }
    const signature = JSON.stringify([view, ready]);
    if (signature === this.last) return;
    this.last = signature;
    this.root.hidden = !view.visible;
    const surface = document.querySelector<HTMLElement>("#surface");
    if (surface) surface.inert = view.visible;
    if (!view.visible) return;
    this.root.innerHTML = `<section role="dialog" aria-modal="true" aria-label="玩法说明"><h1>玩法说明</h1><p>100 秒争夺战 · 回收电池，争夺第一</p><div class="guide-cards">${GUIDE_CARDS.map((c, i) => `<article><h2>${i + 1} ${c.title}</h2><div class="guide-picture" style="aspect-ratio:${c.w}/${c.h}"><img alt="${c.title}图解" src="/assets/cartoon/guide.jpg" style="width:${(1659 / c.w) * 100}%;left:${(-c.x / c.w) * 100}%;top:${(-c.y / c.h) * 100}%"></div><strong>${c.text}</strong><small>${c.detail}</small></article>`).join("")}</div><button id="guide-close" ${view.canClose ? "" : "disabled"}>${view.canClose ? "我知道了 · 点击关闭" : "了解玩法"} · ${view.seconds} 秒后自动关闭</button><small>关闭后，请在房间中点击准备</small>${ready === undefined ? "" : `<aside class="${ready <= 10 ? "urgent" : ""}">请在 ${ready} 秒内准备</aside>`}</section>`;
    this.root.querySelector("button")!.onclick = this.close;
  }
}
