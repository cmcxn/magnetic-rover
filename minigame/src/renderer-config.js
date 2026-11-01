/**
 * Keep the high-density legacy Canvas renderer by default.
 * Restart with wx.setStorageSync('rover.showroom3D', true) for experimental
 * shared-canvas WebGL previews (currently 1x backing resolution).
 * rover.forceCanvas=true always overrides the experimental opt-in.
 */
export function selectMiniRenderer(canvas, platform) {
  const forceCanvas = platform.getStorageSync?.("rover.forceCanvas") === true;
  let context;
  const experimental = platform.getStorageSync?.("rover.showroom3D") === true;
  if (experimental && !forceCanvas) {
    try {
      context =
        canvas.getContext("webgl", {
          alpha: false,
          depth: true,
          stencil: true,
          antialias: true,
          premultipliedAlpha: true,
        }) ||
        canvas.getContext("experimental-webgl", {
          alpha: false,
          depth: true,
          stencil: true,
          antialias: true,
          premultipliedAlpha: true,
        });
    } catch {
      /* No context was created: 2D fallback remains safe. */
    }
  }
  return context
    ? { mode: "webgl", context }
    : { mode: "canvas", context: canvas.getContext("2d") };
}
