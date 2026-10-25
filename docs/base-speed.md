# 默认行驶速度（Docker / Compose）

`ROVER_BASE_SPEED` 控制所有房间小车的普通行驶速度，单位为世界单位/秒。
原默认 **240**；例如 **180** 为原速度的 75%，体验更慢。
支持 **1–480** 的有限数值（含小数）；未设置、空值、非法字符串、NaN、无限、非正数或超出范围时回退 240。
上限保守限制在原速度的两倍。冲刺仍为普通速度的 3 倍，满载仍为普通速度的 80%；碰撞、眩晕及端口规则不变。

配置在服务启动时读取，由服务端权威控制，并通过每个房间的 `state.baseSpeed` 下发。
客户端普通预测、冲刺及重放使用同一值；连接旧服务端缺少该字段时回退 240。

## 先升级镜像

必须先构建/升级到包含本功能的镜像；给旧镜像加环境变量不会生效。
以下命令均在已包含本功能的源码目录执行；不要直接覆盖线上文件。

```sh
docker build -t magnetic-rover:base-speed .
```

## docker run

下面启动一个本地测试容器（容器内部端口仍为 18080）：

```sh
docker run -d --name magnetic-rover-speed-demo \
  -p 127.0.0.1:18083:18080 \
  -e ROVER_BASE_SPEED=180 \
  magnetic-rover:base-speed
```

访问 `http://127.0.0.1:18083`。以后修改变量需要用新环境重新创建容器；
`docker restart` 仍沿用创建时的环境，不会采纳新值。重新创建会中断当前对局。
正式服务应保留原有端口映射和安全选项。

## Docker Compose

仓库 `compose.yaml` 已包含：

```yaml
services:
  game:
    environment:
      ROVER_BASE_SPEED: "${ROVER_BASE_SPEED:-240}"
```

在 `compose.yaml` 同目录的 `.env` 中写入（已有文件只更新对应行，保留其他配置）：

```dotenv
ROVER_BASE_SPEED=180
```

也可在 Compose `environment` 中直接写 `ROVER_BASE_SPEED: "180"`。
`.env` 本身用于插值，必须有上述 `environment` 映射才能进入容器；shell 同名变量优先于 `.env`。

首次从新源码构建并应用：

```sh
docker compose config
docker compose up -d --build --force-recreate game
```

使用发布镜像时，先将 `image` 更新为包含本功能的实际标签，再执行：

```sh
docker compose pull game
docker compose up -d --no-build --force-recreate game
```

已有新版镜像、只调整速度时执行 `docker compose up -d --no-build --force-recreate game`。
仅 `docker compose restart` 不会更新环境变量。保留部署现场现有的 `ROVER_PORT`、项目名和覆盖文件。
通过 `docker compose exec game printenv ROVER_BASE_SPEED` 查看注入值；实际生效值可查看 WebSocket
`state.baseSpeed`（非法值会回退，环境输出仍显示原输入）。

## 回归验证

- `SKYNET_ROOT=/path/to/skynet sh server/test_base_speed.sh`：缺省、自定义、小数、边界及非法值；实际移动、负载、冲刺和快照。
- `npm test --prefix client`：客户端速度同步及现有回归；`npm run build --prefix client`：类型检查和构建。
- `SKYNET_ROOT=/path/to/skynet python3 tests/base_speed_runtime.py`：启动隔离本机服务，核对缺省/180/NaN 在两个真实 WS 客户端同步。需空闲 18080 端口和 Python websockets。

官方依据：[docker run 环境变量](https://docs.docker.com/reference/cli/docker/container/run/)、
[Compose environment / .env](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/)、
[Compose 重建容器](https://docs.docker.com/reference/cli/docker/compose/up/)。
