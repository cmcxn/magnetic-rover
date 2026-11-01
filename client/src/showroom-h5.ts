import type { Showroom3D } from "./showroom-3d";
type Renderer = Pick<
  Showroom3D,
  | "load"
  | "setColor"
  | "setYaw"
  | "getYaw"
  | "setAutoRotate"
  | "update"
  | "render"
  | "beginDrag"
  | "endDrag"
  | "dragX"
  | "dispose"
>;
type Environment = {
  canvas: HTMLCanvasElement;
  create: (canvas: HTMLCanvasElement) => Promise<Renderer>;
  load: () => Promise<ArrayBuffer>;
  raf: (f: FrameRequestCallback) => number;
  cancel: (id: number) => void;
  hidden: () => boolean;
  reduced: () => boolean;
  pixelRatio: () => number;
};
/** Owns only a selection-card canvas. Never reads or changes game/server state. */
export class H5Showroom {
  private host: HTMLElement | null = null;
  private renderer: Renderer | null = null;
  private yaw = 0.4;
  private color = "#38bdf8";
  private generation = 0;
  private frame = 0;
  private previous = 0;
  private pointer: number | null = null;
  private lastX = 0;
  private loading: Promise<void> | null = null;
  private env: Environment;
  private failed = false;
  constructor(env: Environment) {
    this.env = env;
    const c = env.canvas;
    c.setAttribute("aria-label", "小车3D预览：左右拖动旋转");
    c.setAttribute("role", "img");
    c.style.touchAction = "pan-y";
    c.addEventListener("pointerdown", this.down);
    c.addEventListener("pointermove", this.move);
    c.addEventListener("pointerup", this.up);
    c.addEventListener("pointercancel", this.up);
    c.addEventListener("lostpointercapture", this.up);
    c.addEventListener("webglcontextlost", this.lost);
    c.addEventListener("webglcontextrestored", this.restored);
  }
  async attach(host: HTMLElement, color: string) {
    if (this.host && this.host !== host && this.pointer !== null) {
      this.pointer = null;
      this.renderer?.endDrag();
    }
    this.host = host;
    this.color = color;
    if (this.env.canvas.parentElement !== host) host.append(this.env.canvas);
    if (this.failed) {
      host.dataset.showroomStatus = "fallback";
      return;
    }
    if (this.renderer) {
      this.renderer.setColor(color);
      host.dataset.showroomStatus = "ready";
      return;
    }
    if (this.loading) return this.loading;
    const version = ++this.generation;
    host.dataset.showroomStatus = "loading";
    this.loading = (async () => {
      let candidate: Renderer | null = null;
      try {
        candidate = await this.env.create(this.env.canvas);
        const bytes = await this.env.load();
        await candidate.load(bytes);
        if (version !== this.generation) {
          candidate.dispose();
          return;
        }
        this.renderer = candidate;
        candidate.setYaw(this.yaw);
        candidate.setColor(this.color);
        this.host!.dataset.showroomStatus = "ready";
        this.previous = 0;
        this.frame = this.env.raf(this.tick);
      } catch (error) {
        candidate?.dispose();
        if (version === this.generation && this.host) {
          this.failed = true;
          this.host.dataset.showroomStatus = "fallback";
        }
      } finally {
        if (version === this.generation) this.loading = null;
      }
    })();
    return this.loading;
  }
  detach() {
    ++this.generation;
    this.failed = false;
    this.loading = null;
    this.env.cancel(this.frame);
    this.frame = 0;
    this.previous = 0;
    if (this.renderer) {
      this.yaw = this.renderer.getYaw();
      this.renderer.dispose();
      this.renderer = null;
    }
    this.pointer = null;
    this.env.canvas.remove();
    this.host = null;
  }
  dispose() {
    this.detach();
    const c = this.env.canvas;
    c.removeEventListener("pointerdown", this.down);
    c.removeEventListener("pointermove", this.move);
    c.removeEventListener("pointerup", this.up);
    c.removeEventListener("pointercancel", this.up);
    c.removeEventListener("lostpointercapture", this.up);
    c.removeEventListener("webglcontextlost", this.lost);
    c.removeEventListener("webglcontextrestored", this.restored);
  }
  private tick = (now: number) => {
    if (!this.renderer || !this.host) return;
    if (!this.host.isConnected) {
      this.detach();
      return;
    }
    if (!this.env.hidden()) {
      const c = this.env.canvas,
        w = Math.max(1, this.host.clientWidth),
        h = Math.max(1, this.host.clientHeight),
        dpr = Math.min(2, this.env.pixelRatio());
      if (c.width !== Math.round(w * dpr)) c.width = Math.round(w * dpr);
      if (c.height !== Math.round(h * dpr)) c.height = Math.round(h * dpr);
      try {
        this.renderer.setAutoRotate(!this.env.reduced());
        this.renderer.update(
          this.previous ? Math.min(100, now - this.previous) : 0,
        );
        this.renderer.render();
      } catch {
        this.host.dataset.showroomStatus = "fallback";
        this.failed = true;
        this.yaw = this.renderer.getYaw();
        this.renderer.dispose();
        this.renderer = null;
        return;
      }
    }
    this.previous = now;
    this.frame = this.env.raf(this.tick);
  };
  private down = (e: PointerEvent) => {
    if (this.pointer !== null || !this.renderer || e.button !== 0) return;
    this.pointer = e.pointerId;
    this.lastX = e.clientX;
    this.renderer.beginDrag();
    this.env.canvas.setPointerCapture?.(e.pointerId);
  };
  private move = (e: PointerEvent) => {
    if (e.pointerId !== this.pointer) return;
    this.renderer?.dragX(e.clientX - this.lastX);
    this.lastX = e.clientX;
  };
  private up = (e: PointerEvent) => {
    if (e.pointerId !== this.pointer) return;
    this.pointer = null;
    this.renderer?.endDrag();
  };
  private lost = (e: Event) => {
    e.preventDefault();
    this.failed = true;
    if (this.host) this.host.dataset.showroomStatus = "fallback";
    this.env.cancel(this.frame);
    this.pointer = null;
  };
  private restored = () => {
    const host = this.host,
      color = this.color;
    this.detach();
    if (host?.isConnected) void this.attach(host, color);
  };
}
export function installShowroom(surface: HTMLElement) {
  const canvas = document.createElement("canvas");
  canvas.className = "showroom-canvas";
  let bytes: Promise<ArrayBuffer> | null = null;
  const view = new H5Showroom({
    canvas,
    create: async (c) => {
      const { Showroom3D } = await import("./showroom-3d");
      return new Showroom3D({ canvas: c });
    },
    load: () =>
      (bytes ??= fetch("/assets/cartoon/rover-showroom/rover.glb")
        .then((r) => {
          if (!r.ok) throw Error("Showroom model unavailable");
          return r.arrayBuffer();
        })
        .catch((e) => {
          bytes = null;
          throw e;
        })),
    raf: (callback) => requestAnimationFrame(callback),
    cancel: (id) => cancelAnimationFrame(id),
    hidden: () => document.hidden,
    reduced: () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    pixelRatio: () => devicePixelRatio,
  });
  const sync = () => {
    const host = surface.querySelector<HTMLElement>("[data-showroom-color]");
    if (host) void view.attach(host, host.dataset.showroomColor!);
    else view.detach();
  };
  const observer = new MutationObserver((records) => {
    if (
      records.some(
        (r) =>
          r.type === "attributes" ||
          [...Array.from(r.addedNodes), ...Array.from(r.removedNodes)].some(
            (n) => n !== canvas,
          ),
      )
    )
      sync();
  });
  observer.observe(surface, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-showroom-color"],
  });
  sync();
  return () => {
    observer.disconnect();
    view.dispose();
  };
}

const rosterMarkup = new WeakMap<HTMLElement, string>();
/** Keep the live canvas attached while ordinary unchanged state packets arrive. */
export function updateSelectionRoster(node: HTMLElement, markup: string) {
  if (rosterMarkup.get(node) === markup) return;
  rosterMarkup.set(node, markup);
  node.innerHTML = markup;
}
