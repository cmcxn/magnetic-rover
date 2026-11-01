/** Native confirmation only: renderer choice is applied on the next cold start. */
export function requestPreviewMode(
  platform: {
    showModal(options: {
      title: string;
      content: string;
      confirmText: string;
      success(result: { confirm?: boolean }): void;
    }): void;
    setStorageSync(key: string, value: boolean): void;
    removeStorageSync(key: string): void;
  },
  enable: boolean,
  saved: (enabled: boolean) => void,
) {
  platform.showModal({
    title: enable ? "启用3D预览（实验）" : "切回普通预览",
    content: enable
      ? "3D预览目前是实验模式，画质可能低于普通模式。切换需要重启：确认后请关闭小游戏，再重新打开。遇到异常可切回普通预览。"
      : "普通预览保留原来的高清画质。确认后请关闭小游戏，再重新打开，切换才会生效。",
    confirmText: "确认切换",
    success(result) {
      if (!result.confirm) return;
      platform.setStorageSync("rover.showroom3D", enable);
      if (enable) platform.removeStorageSync("rover.forceCanvas");
      saved(enable);
    },
  });
}
export function previewModeRequested(platform: {
  getStorageSync(key: string): unknown;
}) {
  return (
    platform.getStorageSync("rover.showroom3D") === true &&
    platform.getStorageSync("rover.forceCanvas") !== true
  );
}
