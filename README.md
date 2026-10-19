# 磁力小车：Skynet 联机原型

当前是本机验证原型：服务端与客户端实现已保存；实际浏览器画面和触屏体验仍待验收，详见 STATUS.md。

## 目标
- 不注册账号，选择昵称与颜色，以服务器生成的游客凭证识别本局玩家。
- 手机横屏 / 桌面浏览器；Phaser + TypeScript 客户端，Skynet 权威游戏服务。
- 2–8 人开放圆场，180 秒采集电池、冲刺碰撞、回收计分。
- 第一版只做一张地图，其他设计图不是已实现关卡。

## 工程结构
- `client/`：Phaser 客户端，构建至 `client/dist/`。
- `server/`：独立 Skynet 服务、纯 Lua 规则测试、真实 WebSocket 测试。
- `verification/`：已执行的编译、运行与后续验收证据。
- `PROTOCOL.md`：客户端/服务端约定。
- `STATUS.md`：最近检查点与未完成项。

## 本机运行
1. 准备 Node.js 22+（前端测试需要），以及已编译的 skynet-demo `feat/pluto-aoi-submodule` 分支；验证版本见 `verification/skynet-aoi-runtime.md`。
2. `cd client && npm ci && npm run build`。
3. `SKYNET_ROOT=/absolute/path/to/skynet-demo/vendor/skynet server/run.sh`。
4. 浏览器打开 `http://127.0.0.1:18080`。第二个玩家请使用另一个浏览器或独立浏览器配置，避免共享游客凭证。

具体测试命令见 server 与 client 各自说明。默认服务只监听本机回环地址；手机/朋友从外网无法直接访问。公网发布还需可持续运行的服务端、TLS/WebSocket反向代理及部署安全检查，不能以本机地址充当试玩链接。

## 边界
- 游客不是实名账号，无密码；凭证丢失无法自动认领旧角色。
- 第一版房间与成绩在内存，服务器重启不会保留本局；与客户端断线重连不同。
- 不包含排行榜后台、付费、聊天、账号系统、匹配、多房间运营或美术版权保证。
- 8 人是设计上限，不代表经过容量压测。
- 详细完成情况以 STATUS.md 和实际测试报告为准。
