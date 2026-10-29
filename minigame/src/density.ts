/** Keep Phaser scene/input units logical while drawing into a device-pixel canvas. */
export function installCanvasDensity(game: any, canvas: any, info: any) {
  const ratio = Math.min(3, Math.max(1, Number(info.pixelRatio) || 1));
  const renderer = game.renderer,
    context = canvas.getContext("2d");
  const set = context.setTransform.bind(context);
  context.setTransform = (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => set(a * ratio, b * ratio, c * ratio, d * ratio, e * ratio, f * ratio);
  const resize = renderer.resize.bind(renderer);
  renderer.resize = (w: number, h: number) => {
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    resize(canvas.width, canvas.height);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    return renderer;
  };
  renderer.resize(info.windowWidth, info.windowHeight);
  console.info("[rover] canvas density", {
    ratio,
    width: canvas.width,
    height: canvas.height,
  });
  return ratio;
}
