# 游戏资源清单

## 运行时已拆分
- 小车：`client/public/assets/sprites/rover.png`，原生车头朝右，旋转跟随服务器角度；白灰车体配六色身份底环。
- 电池：`client/public/assets/sprites/battery.png`，独立拾取物图片。
- 回收站：`client/public/assets/sprites/recycle-station.png`，独立站台图片，实际安全/交付半径由服务端控制。
- 地面、草地、外围装饰、边界、身份底环及反馈线条：Phaser 程序绘制。
- 音效：拾取、冲刺、撞击、交付、倒计时、结束六类，原音频和运行时 WAV 均保留。

## 许可与来源
Kenney Digital Audio 的六个选用音效来自官方素材包，CC0；支持商业使用、修改和再分发，无强制署名。保留 `assets/audio/KENNEY-LICENSE.txt` 与 `SOURCES.json`（来源、原文件名、SHA256、许可链接）。

官方来源：https://kenney.nl/assets/digital-audio
商业使用说明：https://kenney.nl/support
许可：https://creativecommons.org/publicdomain/zero/1.0/

三张 PNG 为本项目基于设计稿生成的图像，原件和生成记录在 `assets/generated/`。它们不是下载的 CC0 素材，不将模型生成等同于独占版权或完整法律清权。未使用第三方品牌角色或收费素材。

客户端 Phaser 使用 MIT 许可；随包保留 `licenses/PHASER-MIT.txt`。Skynet 许可副本在 `licenses/SKYNET-LICENSE.txt`。运行时源码需另备；源版本见 verification/skynet-aoi-runtime.md。开发依赖锁定于 package-lock.json。

## 验证边界
PNG 已检查真透明与可见区域，已接入客户端构建。音效已解码检查并接入。浏览器实际视觉、音量、触屏手感仍需真人或可用浏览器环境验收。当前没有3D模型，也无需以3D模型运行此2D原型。
