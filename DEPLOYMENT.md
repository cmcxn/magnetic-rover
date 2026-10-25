# Docker 部署与运维

> 以下为 2026-10-19 已部署版本的历史记录。当前分支已迁移至发布的 Skynet runtime，最新构建方式见 [Docker Runtime](docs/docker-runtime.md)；尚未更新远端服务。

部署日期：2026-10-19。已部署并保持运行。

- 访问地址：http://ai.chenmin.org:18082
- SSH：model@ai.chenmin.org
- 远端目录：/home/model/apps/magnetic-rover-20261019
- Compose 项目：magnetic-rover
- 镜像：magnetic-rover:20261019
- 镜像 ID：sha256:f35fc8a70442ae9f99946d07e8e8a572921a6b1a5673e33eafb09355b24aff89
- 容器：magnetic-rover-game-1
- 端口：0.0.0.0:18082 -> 容器 18080；18080 原有服务占用，18081 有停止容器配置占用，因此选 18082。
- 远端 `.env`：ROVER_PORT=18082

## 启停、日志与更新

登录后在部署目录执行：

```sh
cd /home/model/apps/magnetic-rover-20261019
docker compose ps
docker compose logs -f --tail=100 game
docker compose stop                 # 停止；内存中的本局丢失
docker compose up -d --wait          # 启动
```

更新：只传所需的 client/src、client/public、client/tests、前端 package.json/package-lock.json/tsconfig.json/index.html、server/*.lua/server/config、licenses、Dockerfile、compose.yaml、.dockerignore、skynet-source.tar 和校验文件。保留远端 .env 的 18082 设置。
禁止传 .git、.idea、秘密、日志、node_modules 和本机编译二进制。
更新前留存上一版源码和镜像；维护时段中执行：

```sh
sha256sum -c SOURCE_SHA256SUMS
DOCKER_BUILDKIT=0 docker compose build > build.log 2>&1
docker compose up -d --wait --wait-timeout 90
docker compose ps
```

远端 Docker Engine 19.03.14、Compose 2.21.0，采用已有 classic builder，未升级或安装 Docker。
构建日志保存在远端 build.log。容器日志每份 10 MB，保留 3 份。
更新重建会重启本局；未配置持久化游戏数据。不要使用本机 start.sh/stop.sh 操作远端。

## 固定依赖与运行隔离

Skynet 提交：64391f732e76507ea6615f312cb71be1fd7bfbdd。
skynet-source.tar 是该提交的纯源码 git archive，镜像独立编译 Linux amd64 版本，不依赖 Mac 或相邻项目运行时。
关闭 jemalloc 以消除子模块下载依赖；前端通过 package-lock.json 和 npm ci 固定。
校验和见 SOURCE_SHA256SUMS。多阶段构建最终只保留运行时、游戏源码、前端产物与资源。
客户端默认 WS 跟随网页端口，支持 18082。

容器 UID/GID 10001、runc、只读根文件系统、全部 capabilities 移除、no-new-privileges、512 MiB 内存/2 CPU/128 PID 限制；无 GPU、特权、host 网络或 Docker socket/宿主目录挂载。
远端内核不支持 swap 限额，Docker 已确认内存限制生效但 swap 不受该限制。
未修改防火墙、路由、安全组或现有其他服务。

## 验证与访问边界

- Linux 多阶段 Docker build 成功；镜像内 15 项前端测试、TypeScript/Vite 构建、Lua 规则与时钟测试通过。
- 远端回环 HTTP 200，容器 healthy。
- 从 Mac 现有网络访问 ai.chenmin.org:18082（未走 SSH 隧道）：HTTP、构建 JS/CSS、图片/音频、两名独立真实 WebSocket 客户端、共享玩家状态、开局和权威移动同步通过。
- 双客户端测试后仅重启新容器，清空测试局，保持空大厅运行。
- 可复验：Node 22+ 下 `node smoke.mjs http://ai.chenmin.org:18082`。此命令会入场并开始游戏，应只在无人游玩的维护时段执行。
- 外部验证证明此 Mac 网络到部署域名/端口可达。最终 curl --noproxy 检查为 HTTP 200，但连接 IP 是 198.18.0.173 合成地址，说明系统网络可能使用代理/TUN；未验证独立公网网络直连，不保证所有运营商/网络可达。未作真实浏览器画面、手机触控或容量压测。
- 当前为 HTTP/WS，无 TLS；已有反向代理配置未改变。
- 本机 18080 原游戏未停止、未重启；用户未提交修改已保留，没有推送。
