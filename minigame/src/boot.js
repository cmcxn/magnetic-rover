// This entry stays in the main package. Art must finish loading before Phaser starts.
require("./weapp-adapter.js");
require("./platform.js");

const context = canvas.getContext("2d");
function draw(message) {
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
      require("./main.js");
    },
    fail(error) {
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
