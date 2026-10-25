# 碰撞重做验证报告（2026-10-24）

## 交付状态

- 基线：已逐一核验 GitHub 全部远端分支，最新为 `fix/mobile-collision-supply`，提交 `58100e77eb30bebb47994a9fb307a8ee4f0850a7`。
- 新本地分支：`feat/hard-circle-collision-redesign`。
- 没有推送、合并或生产部署；旧工作目录未修改。
- **编码和自动验证已完成；真实浏览器截图未完成。** 浏览器在打开本地页面前被环境策略拦截，未伪造截图、未绕过限制。详见 `runtime-verification.md`。

## 规则

- 蓝圈/车辆边界统一为服务器半径60；车身与20格货架均在圈内，车与车、墙边、眩晕/保护中的车都不能穿透。
- 普通移动接触：双方短暂眩晕、弹开，不掉电池。有效正面冲刺：目标眩晕、击退并掉25%（最多5个）携带电池，攻击者减速回弹但不晕。双正面冲刺双方眩晕/掉落。
- 安全区只豁免掉货：普通双方仍晕，有效冲刺攻击者仍不晕。保护和持续接触不会重复扣货，也不会关闭实体碰撞。
- 电池散落有服务器方向速度、随机偏移、跳起/落地、0.65秒拾取锁；总价值守恒，已存分不受影响。
- 自然电池拾取范围仍为56；已落地掉落电池在车60+电池10的实体接触距离拾取，避免“实体挡住却永远够不到”的问题。
- 客户端只做呈现和有限预测；服务器决定碰撞、眩晕、货物和位置。长时间丢包/大修正时可直接纠正位置，不沿虚构路径穿车，也不永久卡在旧位置。

## 已通过

| 检查 | 命令/证据 | 结果 |
| --- | --- | --- |
| 客户端完整测试 | `cd client && npm test` | 122/122 |
| 类型检查及构建 | `cd client && npm run build` | 通过；既有大包体警告仍在 |
| 服务端完整测试 | `ROVER_BIND=127.0.0.1 sh server/test.sh` | 全部Lua组及真实WebSocket回归通过 |
| 新碰撞回归及压力测试 | `server/test_collision_redesign.lua` | 72,630条断言，含80×25步八车/墙边压力场景 |
| 真实联机碰撞 | `python tests/collision_redesign_runtime.py` | 25/25，真实输入和真实采集，不使用测试后门 |
| 生产核心关键帧 | `tests/collision_scenarios.lua` | 普通、冲刺、双冲刺、三车墙边4组通过 |
| 完整100秒多房间比赛 | `python tests/multi_room.py` | 32/32；实测99.96秒比赛+10.014秒结算，见JSON |
| 独立审查 | `review.md` | 重要问题已修复并加失败→通过回归 |

完整命令输出及JSON证据位于本目录。浏览器渲染、手机真机手感/FPS、截图像素检查均**未验证**，不能由上述纯逻辑/协议测试替代。

## 复现

使用已有 Node22+、项目锁定依赖、编译好的 Skynet：

```sh
cd client && npm test && npm run build && cd ..
SKYNET_ROOT=/absolute/path/to/skynet ROVER_BIND=127.0.0.1 sh server/test.sh
# 单独启动本地服务后：
SKYNET_ROOT=/absolute/path/to/skynet ROVER_BIND=127.0.0.1 sh server/run.sh
python tests/collision_redesign_runtime.py
python tests/multi_room.py --report verification/collision-redesign/full-match-multi-room.json
```

截图脚本：`client/tests/collision-redesign.browser.mjs`，需要能够正常打开本地预览的浏览器环境。其确定性回放使用真实生产Lua核心输出，不是替代物理模拟；回放图应标注“生产模拟回放”，不能标成实时联网图。

源码包不含 `node_modules`、缓存、凭证、`.git`、生产配置密钥或新编译的运行时；本次仅交付当前源码快照，不包含Git历史bundle。没有加入新的物理引擎/依赖。

## 交付检查

源码包仅含当前版本的项目文件和可复现测试/报告，不含内部工作笔记或Git历史bundle。
静态资源默认目录已改为相对服务器目录，标准启动脚本行为不变。
新增目录选择回归4项通过，完整服务端回归重跑通过，真实HTTP的21个构建资源逐字节/MIME核验通过。
