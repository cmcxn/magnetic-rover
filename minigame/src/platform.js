// Phaser 3 additions to the MIT WeChat quickstart adapter. No HTML UI is emulated.
const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
const width = info.windowWidth,
  height = info.windowHeight;
window.matchMedia = () => ({
  matches: true,
  addEventListener() {},
  removeEventListener() {},
});
window.focus = () => {};
window.getComputedStyle = (element) => element.style || {};
// Devtools owns some Window properties; strict bundles must not reassign them.
if (!window.screen)
  window.screen = {
    width,
    height,
    orientation: { type: "landscape-primary" },
  };
if (!window.performance) window.performance = wx.getPerformance();
if (!window.CanvasRenderingContext2D)
  window.CanvasRenderingContext2D = canvas.getContext("2d").constructor;
if (!document.documentElement.style) document.documentElement.style = {};
document.documentElement.clientLeft = 0;
document.documentElement.clientTop = 0;
document.body.nodeType = 1;
document.body.contains = () => true;
document.body.getBoundingClientRect = () => ({
  left: 0,
  top: 0,
  right: width,
  bottom: height,
  width,
  height,
});
if (!canvas.style) canvas.style = {};
canvas.getAttribute = (name) => canvas[name];
canvas.setAttribute = (name, value) => {
  canvas[name] = value;
};
canvas.removeAttribute = () => {};
canvas.width = width;
canvas.height = height;
// Native input is handled by wx.onTouch*, without translating it through DOM events.
wx.onHide(() => {
  window.onblur?.();
});
wx.onShow(() => {
  window.onfocus?.();
});
console.info("[rover] WeChat platform ready", width, height);
