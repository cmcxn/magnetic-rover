import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  Scene,
  SRGBColorSpace,
  Texture,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ShowroomMotion, normalizeShowroomColor } from "./showroom-motion.ts";

const THEME_NAMES = new Set(["theme_shellaccent", "theme_hub", "theme_light"]);
/** Exact names only: magnets, letters, fixed white shell and rubber are untouched. */
export function applyShowroomColor(root: Object3D, hex: string): void {
  const color = new Color("#" + normalizeShowroomColor(hex));
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      if (!THEME_NAMES.has(material.name)) continue;
      const m = material as MeshStandardMaterial;
      m.color?.copy(color);
      if (m.name === "theme_hub" || m.name === "theme_light")
        m.emissive?.copy(color);
      // Intensity is artist-owned and intentionally not changed.
    }
  });
}
export function disposeShowroomObject(root: Object3D): void {
  const geometries = new Set<Mesh["geometry"]>(),
    materials = new Set<Material>(),
    textures = new Set<Texture>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material))
        if (value instanceof Texture) textures.add(value);
    }
  });
  for (const texture of textures) texture.dispose();
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}
export async function parseShowroomGLB(buffer: ArrayBuffer): Promise<Object3D> {
  return (await new GLTFLoader().parseAsync(buffer, "")).scene;
}

export type ShowroomViewport = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type Showroom3DOptions = {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  context?: WebGLRenderingContext | WebGL2RenderingContext;
};
/**
 * Fixed-camera, Y-up selected-car renderer. No network/World dependency.
 * Shared-context viewport is in framebuffer pixels with a bottom-left origin.
 * The host must flush/reset its own renderer around this external pass.
 */
export class Showroom3D {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly pivot = new Group();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  private readonly motion = new ShowroomMotion();
  private model: Object3D | null = null;
  private readonly modelSize = new Vector3(1, 1, 1);
  private disposed = false;
  private loadVersion = 0;
  private readonly shared: boolean;

  constructor(options: Showroom3DOptions) {
    this.shared = !!options.context;
    this.renderer = new WebGLRenderer({
      canvas: options.canvas,
      context: options.context as WebGLRenderingContext | undefined,
      alpha: true,
      antialias: !this.shared,
      premultipliedAlpha: true,
    });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = SRGBColorSpace;
    // No setSize, setPixelRatio, canvas style mutation or shared-context loss.
    this.scene.add(this.pivot, new AmbientLight(0xffffff, 2));
    const key = new DirectionalLight(0xffffff, 3);
    key.position.set(4, 7, 5);
    this.scene.add(key);
    const fill = new DirectionalLight(0xc6d8ff, 1);
    fill.position.set(-4, 3, -3);
    this.scene.add(fill);
  }

  /** Latest load wins; failed replacement preserves the last complete model. */
  async load(buffer: ArrayBuffer): Promise<void> {
    if (this.disposed) throw new Error("Showroom is disposed");
    const version = ++this.loadVersion;
    const next = await parseShowroomGLB(buffer);
    if (this.disposed || version !== this.loadVersion) {
      disposeShowroomObject(next);
      return;
    }
    next.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(next);
    if (bounds.isEmpty()) {
      disposeShowroomObject(next);
      throw new Error("Showroom model has no renderable bounds");
    }
    const center = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3());
    const radius = size.length() / 2;
    if (!Number.isFinite(radius) || radius <= 0) {
      disposeShowroomObject(next);
      throw new Error("Showroom model has invalid bounds");
    }
    next.position.x -= center.x;
    next.position.y -= bounds.min.y;
    next.position.z -= center.z;
    applyShowroomColor(next, this.motion.color);
    if (this.model) {
      this.pivot.remove(this.model);
      disposeShowroomObject(this.model);
    }
    this.model = next;
    this.modelSize.copy(size);
    this.pivot.add(next);
    this.pivot.rotation.y = this.motion.yaw;
    fitShowroomCamera(this.camera, this.modelSize, 1);
  }

  setColor(hex: string): void {
    this.motion.setColor(hex);
    if (this.model) applyShowroomColor(this.model, this.motion.color);
  }
  setYaw(yaw: number): void {
    this.motion.setYaw(yaw);
    this.pivot.rotation.y = this.motion.yaw;
  }
  getYaw(): number {
    return this.motion.yaw;
  }
  dragX(dx: number): void {
    this.motion.dragX(dx);
    this.pivot.rotation.y = this.motion.yaw;
  }
  beginDrag(): void {
    this.motion.beginDrag();
  }
  endDrag(): void {
    this.motion.endDrag();
  }
  setAutoRotate(enabled: boolean): void {
    this.motion.setAutoRotate(enabled);
  }
  update(deltaMs: number): void {
    if (this.disposed) return;
    this.motion.update(deltaMs);
    this.pivot.rotation.y = this.motion.yaw;
  }

  render(viewport?: ShowroomViewport): void {
    if (this.disposed || !this.model) return;
    const gl = this.renderer.getContext();
    if (gl.isContextLost()) return;
    const v = viewport ?? {
      x: 0,
      y: 0,
      width: gl.drawingBufferWidth,
      height: gl.drawingBufferHeight,
    };
    if (
      ![v.x, v.y, v.width, v.height].every(Number.isFinite) ||
      v.width <= 0 ||
      v.height <= 0
    )
      return;
    const oldViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
    const oldScissor = gl.getParameter(gl.SCISSOR_BOX) as Int32Array;
    const oldScissorTest = gl.isEnabled(gl.SCISSOR_TEST);
    const oldFramebuffer = gl.getParameter(
      gl.FRAMEBUFFER_BINDING,
    ) as WebGLFramebuffer | null;
    const oldDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK) as boolean;
    const oldClearColor = gl.getParameter(gl.COLOR_CLEAR_VALUE) as Float32Array;
    const oldClearDepth = gl.getParameter(gl.DEPTH_CLEAR_VALUE) as number;
    // Loss may occur between the entry check and state reads; WebGL then returns null.
    if (gl.isContextLost() || !oldViewport || !oldScissor || !oldClearColor)
      return;
    try {
      this.renderer.resetState();
      // Render into the host's current target, not an assumed on-screen buffer.
      gl.bindFramebuffer(gl.FRAMEBUFFER, oldFramebuffer);
      this.renderer.setViewport(v.x, v.y, v.width, v.height);
      this.renderer.setScissor(v.x, v.y, v.width, v.height);
      this.renderer.setScissorTest(true);
      fitShowroomCamera(this.camera, this.modelSize, v.width / v.height);
      gl.depthMask(true);
      // Dedicated canvas clears transparent; shared canvas must preserve Phaser colour.
      this.renderer.clear(!this.shared, true, false);
      this.renderer.render(this.scene, this.camera);
    } finally {
      // Never restore snapshots or reset cached GL state while the context is lost.
      if (!gl.isContextLost()) {
        this.renderer.resetState();
        gl.bindFramebuffer(gl.FRAMEBUFFER, oldFramebuffer);
        gl.viewport(
          oldViewport[0],
          oldViewport[1],
          oldViewport[2],
          oldViewport[3],
        );
        gl.scissor(oldScissor[0], oldScissor[1], oldScissor[2], oldScissor[3]);
        if (oldScissorTest) gl.enable(gl.SCISSOR_TEST);
        else gl.disable(gl.SCISSOR_TEST);
        gl.depthMask(oldDepthMask);
        gl.clearColor(
          oldClearColor[0],
          oldClearColor[1],
          oldClearColor[2],
          oldClearColor[3],
        );
        gl.clearDepth(oldClearDepth);
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    ++this.loadVersion;
    if (this.model) {
      this.pivot.remove(this.model);
      disposeShowroomObject(this.model);
      this.model = null;
    }
    this.scene.clear();
    // Three.dispose releases only its resources/listeners; never forceContextLoss.
    this.renderer.dispose();
  }
}

/** Tight, yaw-invariant fit around a vertical cylinder enclosing the model.
 * Resize changes only the orthographic frustum, never the camera angle.
 */
export function fitShowroomCamera(
  camera: OrthographicCamera,
  size: Vector3,
  aspect: number,
): void {
  const radius = size.length() / 2;
  const elevation = Math.atan2(1.45, Math.SQRT2 * 2.1);
  const horizontalRadius = Math.hypot(size.x / 2, size.z / 2);
  const projectedHalfHeight =
    (size.y * Math.cos(elevation)) / 2 + horizontalRadius * Math.sin(elevation);
  const halfHeight =
    Math.max(projectedHalfHeight, horizontalRadius / aspect) * 1.08;
  camera.position.set(radius * 2.1, size.y / 2 + radius * 1.45, radius * 2.1);
  camera.lookAt(0, size.y / 2, 0);
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.right = halfHeight * aspect;
  camera.left = -camera.right;
  camera.near = radius * 0.01;
  camera.far = radius * 20;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}
