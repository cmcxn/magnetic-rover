// This entry stays in the main package. Art must finish loading before Phaser starts.
require("./weapp-adapter.js");
require("./platform.js");

const selected = GameGlobal.__roverRenderer;
const context = selected.context;
function draw(message) {
  if (selected.mode === "webgl") {
    context.clearColor(0.765, 0.847, 0.725, 1);
    context.clear(context.COLOR_BUFFER_BIT);
    wx.showLoading?.({ title: message, mask: true });
    return;
  }
  context.fillStyle = "#c3d8b9";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#173e37";
  context.font = "20px sans-serif";
  context.textAlign = "center";
  context.fillText(message, canvas.width / 2, canvas.height / 2);
}
function loadArt() {
  draw("正在加载游戏资源…");
  const task = wx.loadSubpackage({
    name: "art",
    success() {
      console.info("[rover] art subpackage ready");
      wx.hideLoading?.();
      require("./main.js");
    },
    fail(error) {
      wx.hideLoading?.();
      console.error("[rover] art subpackage failed", error.errMsg);
      draw("资源加载失败，请重试");
      wx.showModal({
        title: "游戏资源加载失败",
        content: "请检查网络后重试。",
        confirmText: "重试",
        success(result) {
          if (result.confirm) loadArt();
        },
      });
    },
  });
  task.onProgressUpdate?.(({ progress }) =>
    draw(`正在加载游戏资源 ${progress}%`),
  );
}
loadArt();
