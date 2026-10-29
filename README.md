# 磁力小车：Skynet 联机原型

当前是多人联机验证原型，支持房间大厅与观战；各阶段实测范围和真机验收边界见 STATUS.md。

## 目标
- 不注册账号，选择昵称与颜色，以服务器生成的游客凭证识别本局玩家。
- 手机横屏 / 桌面浏览器；Phaser + TypeScript 客户端，Skynet 权威游戏服务。
- 每个房间 2–8 人，100 秒采集电池、冲刺碰撞、回收计分。房间大厅支持创建、加入和观战；全体参赛玩家准备后开局。
- 第一版只做一张地图，其他设计图不是已实现关卡。

## 工程结构
- `client/`：Phaser 客户端，构建至 `client/dist/`。
- `server/`：独立 Skynet 服务、纯 Lua 规则测试、真实 WebSocket 测试。
- `verification/`：已执行的编译、运行与后续验收证据。
- `PROTOCOL.md`：客户端/服务端约定。
- `STATUS.md`：最近检查点与未完成项。

## Docker Runtime（推荐）

无需本机编译 Skynet，直接使用固定版本的 `chenmins/skynet-demo` 作为基础运行时：

```sh
docker compose up -d --build --wait
```

打开 http://127.0.0.1:18080 。如果本机原服务占用该端口，可使用独立项目和端口：

```sh
ROVER_PORT=18083 docker compose -p magnetic-rover-runtime up -d --build --wait
```

基础镜像固定到 `sha-f1baee5051108fce40588738f4a5960f12edea97` 及多架构 manifest digest；Docker 自动匹配宿主架构。前端和 Lua 游戏代码在构建时验证。默认速度 480，可通过 `ROVER_BASE_SPEED` 覆盖。详细版本及验证记录见 [Docker Runtime](docs/docker-runtime.md)。下面的原生脚本保留为可选开发方式。

## Windows 便携包

下载好 Windows x64 Skynet runtime 后执行 `./scripts/package-windows.sh`，会在下载文件夹生成含游戏和运行时的 ZIP。解压后双击 `start.bat` 即可启动；参数和验收说明见 [Windows 发布包](docs/windows-release.md)。

## 本机运行
1. 准备 Node.js 22+（前端测试需要），以及已编译的 skynet-demo `feat/pluto-aoi-submodule` 分支；验证版本见 `verification/skynet-aoi-runtime.md`。
2. `cd client && npm ci && npm run build`。
3. `SKYNET_ROOT=/absolute/path/to/skynet-demo/vendor/skynet server/run.sh`。
4. 浏览器打开 `http://127.0.0.1:18080`。第二个玩家请使用另一个浏览器或独立浏览器配置，避免共享游客凭证。

具体测试命令见 server 与 client 各自说明。启动脚本默认监听 `0.0.0.0:18080`，支持 localhost 和同一局域网内手机访问电脑 IP；外网无法直接访问。公网发布还需可持续运行的服务端、TLS/WebSocket反向代理及部署安全检查，不能以本机地址充当试玩链接。

## 边界
- 游客不是实名账号，无密码；凭证丢失无法自动认领旧角色。
- 第一版房间与成绩在内存，服务器重启不会保留本局；与客户端断线重连不同。
- 不包含排行榜后台、付费、聊天、账号系统、跨服匹配、持久化运营后台或美术版权保证。
- 8 人是设计上限，不代表经过容量压测。
- 详细完成情况以 STATUS.md 和实际测试报告为准。

## macOS 一键启动与停止

在终端执行（可从任意工作目录调用）：

```sh
~/Documents/magnetic-rover/start.sh
~/Documents/magnetic-rover/stop.sh
```

启动成功后打开 http://127.0.0.1:18080 。后台运行，关闭终端不会停止；不自动打开浏览器。重复启动不会创建第二个服务，重复停止无害。停止会结束当前内存中的游戏。

依赖：Node.js 22.18+ 或兼容 LTS、macOS 的 curl/lsof/ps、已编译的 Skynet，以及 `client/dist/index.html`。脚本不安装软件、不自动构建。缺少前端产物时执行 `cd client && npm ci && npm run build`。默认复用相邻的 `../skynet-demo/vendor/skynet`，其他位置可用 `SKYNET_ROOT="/含空格的路径/skynet" ./start.sh` 指定。

日志追加到 `server/local-play.log`，PID 写入 `server/local-play.pid`。启动会核验进程、监听端口与 HTTP 就绪，失败返回非零。发现无关 PID 或端口占用时拒绝操作，不杀其他服务。若提示 `.control-lock` 残留，先确认没有启动/停止脚本正在执行，再删除该空目录。两名玩家使用不同浏览器或独立浏览器配置。

### 手机局域网试玩

手机连接与电脑相同的 Wi-Fi，打开 `http://<电脑局域网IP>:18080`（电脑 IP 变化时替换地址）。电脑仍可用 `http://127.0.0.1:18080`。WebSocket 默认使用页面主机名及页面端口；若曾手动保存旧地址，在登录页「服务器设置」改为 `ws://<电脑局域网IP>:18080/ws`。

仅本机模式：先 `./stop.sh`，再 `ROVER_BIND=127.0.0.1 ./start.sh`。恢复局域网模式：停止后执行 `./start.sh`。已运行时重复启动不会更改监听，需要先停止再启动。不自动调整系统防火墙或路由设置。

## Docker 部署

已部署地址：http://ai.chenmin.org:18082 。镜像构建、隔离配置、访问验证边界以及启停和更新命令见 [DEPLOYMENT.md](DEPLOYMENT.md)。

## 微信小游戏本地验证

保留 Phaser 的独立小游戏验证工程位于 `minigame/`，复用网页端场景和 Skynet 联机协议。执行 `./scripts/build-wechat.sh` 构建，再用微信开发者工具导入 `minigame/`（测试号、不使用云服务）。原网页端仍可与小游戏端加入同一房间。

运行步骤、构建方式、资源与后端分工、验证记录和正式发布边界见 [小游戏验证说明](minigame/README.md)。当前仅供本地验证，未上传/发布微信。

## 小车尺寸与冲刺环境变量

服务端启动时读取以下配置；不配置、非数字或超出支持范围时使用默认值。

| 环境变量 | 默认值 | 支持范围 | 含义 |
| --- | --- | --- | --- |
| `ROVER_VEHICLE_SCALE` | `1` | `0.25–1.5` | 相对当前车身尺寸的倍数 |
| `ROVER_BOOST_MULTIPLIER` | `3` | `1–10` | 冲刺相对同载货量正常速度的倍数 |
| `ROVER_BOOST_COOLDOWN` | `4` | `0.1–60` | 冲刺冷却秒数，从触发冲刺开始计算 |
| `ROVER_BOOST_DURATION` | `0.32` | `0.01–10` | 冲刺持续秒数 |

例如在项目目录执行：

```sh
ROVER_VEHICLE_SCALE=0.75 ROVER_BOOST_COOLDOWN=5 ROVER_BOOST_DURATION=0.4 docker compose up -d --build
```

也可将这四项写入 Compose 使用的 `.env` 文件。修改后需重新创建服务容器；原生运行需重启服务进程。
小车缩放同步作用于场内车身、碰撞半径、边界约束、拾取半径、碰撞释放间距及出生排列。
地图、电池和回收站本身的尺寸保持原设定；菜单中的小车缩略图为固定布局预览。
实际参数随游戏状态下发，H5 与微信小游戏读取同一份参数进行预测、显示和充能计算；客户端缺失新字段时保留旧默认值。
