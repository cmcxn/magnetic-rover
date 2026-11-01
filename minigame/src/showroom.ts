/** Selection-only controller: no DOM, Phaser, wx globals or game-state dependencies. */
export type ShowroomRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export interface SelectionRenderer {
  load(data: ArrayBuffer): Promise<void>;
  setColor(color: string): void;
  setYaw(yaw: number): void;
  getYaw(): number;
  update(delta: number): void;
  render(viewport: ShowroomRect): void;
  beginDrag(): void;
  endDrag(): void;
  dragX(dx: number): void;
  dispose(): void;
}
export interface ShowroomOptions {
  create: (
    canvas: HTMLCanvasElement,
    context: WebGLRenderingContext,
  ) => SelectionRenderer;
  load: () => Promise<ArrayBuffer>;
}
export function framebufferViewport(
  r: ShowroomRect,
  logicalWidth: number,
  logicalHeight: number,
  width: number,
  height: number,
): ShowroomRect {
  const sx = width / logicalWidth,
    sy = height / logicalHeight;
  const x = Math.round(r.x * sx),
    top = Math.round(r.y * sy);
  const right = Math.round((r.x + r.width) * sx),
    bottom = Math.round((r.y + r.height) * sy);
  return { x, y: height - bottom, width: right - x, height: bottom - top };
}
export function readShowroomBinary(
  platform: any,
  path = "art/cartoon/rover-showroom/rover.glb",
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const success = (result: any) =>
      result.data instanceof ArrayBuffer
        ? resolve(result.data)
        : reject(new Error("Showroom GLB is not binary"));
    const fs = platform.getFileSystemManager?.();
    if (fs?.readFile) fs.readFile({ filePath: path, success, fail: reject });
    else if (platform.request)
      platform.request({
        url: path,
        responseType: "arraybuffer",
        success,
        fail: reject,
      });
    else reject(new Error("No packaged binary loader"));
  });
}
export class MiniShowroom {
  ready = false;
  loading: Promise<void> = Promise.resolve();
  yaw = 0;
  private renderer?: SelectionRenderer;
  private visible = false;
  private failed = false;
  private generation = 0;
  private color = "";
  private data?: ArrayBuffer;
  private create: () => SelectionRenderer;
  private load: () => Promise<ArrayBuffer>;
  constructor(
    create: () => SelectionRenderer,
    load: () => Promise<ArrayBuffer>,
  ) {
    this.create = create;
    this.load = load;
  }
  show(color: string) {
    this.visible = true;
    this.color = color;
    if (this.failed) return;
    if (this.renderer) {
      this.renderer.setColor(color);
      return;
    }
    const generation = ++this.generation;
    try {
      this.renderer = this.create();
      this.renderer.setYaw(this.yaw);
      this.renderer.setColor(color);
    } catch {
      this.fail();
      return;
    }
    const renderer = this.renderer;
    this.loading = (async () => {
      try {
        const data = this.data ?? (await this.load());
        this.data = data;
        if (generation !== this.generation) return;
        await renderer.load(data);
        if (generation !== this.generation) return;
        renderer.setColor(this.color);
        this.ready = true;
      } catch {
        if (generation === this.generation) {
          this.fail();
        }
      }
    })();
  }
  hide() {
    this.failed = false;
    this.visible = false;
    this.generation++;
    this.ready = false;
    this.releaseRenderer();
  }
  fail() {
    this.failed = true;
    this.generation++;
    this.ready = false;
    this.releaseRenderer();
  }
  private releaseRenderer() {
    const renderer = this.renderer;
    this.renderer = undefined;
    if (!renderer) return;
    try {
      this.yaw = renderer.getYaw();
    } catch {
      /* Keep last known yaw on lost context. */
    }
    try {
      renderer.dispose();
    } catch {
      /* Lost contexts must still return to static fallback. */
    }
  }
  update(delta: number) {
    if (this.visible && this.ready && this.renderer) {
      try {
        this.renderer.update(delta);
        this.yaw = this.renderer.getYaw();
      } catch {
        this.fail();
      }
    }
  }
  render(viewport: ShowroomRect) {
    if (this.visible && this.ready) {
      try {
        this.renderer?.render(viewport);
      } catch {
        this.fail();
      }
    }
  }
  beginDrag() {
    if (this.visible) this.renderer?.beginDrag();
  }
  dragX(dx: number) {
    if (this.visible && this.renderer) {
      this.renderer.dragX(dx);
      this.yaw = this.renderer.getYaw();
    }
  }
  endDrag() {
    this.renderer?.endDrag();
  }
}
