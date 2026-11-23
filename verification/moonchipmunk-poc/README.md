# Skynet + MoonChipmunk 服务端 POC
在 Linux x86-64 下测试。建议在 x86-64 Linux 或该架构的 VM/WSL2 复跑。macOS 原生动态库和 ARM64 不在本次验收范围；云端没有运行任何客户端、生产服务或 PostgreSQL。

## 运行
依赖：Linux、Git、curl、GCC/Make、Python 3、常见构建工具（详见 `build.sh`）。依赖版本见 `deps.lock`。从仓库根目录执行：

```sh
cd verification/moonchipmunk-poc
./build.sh
./smoke.sh
./run.sh test
./bench.py --seconds 60 --out results/local-moonchipmunk
./bench.py --engines baseline --rates 20 --rooms 1,32,128 --seconds 60 --out results/local-baseline
./run.sh clean  # 仅清理 POC 构建产物
```

测试日志应有人可读的各用例结果以及 `PHYSICS_PASS`、`ACTOR_PASS`、`POC_PASS`，如出现 `POC_FAIL` 则失败。Python 压测脚本对每组保存原始输出、进程 CPU/RSS 采样和汇总；即使某组超时或失败也继续记录其他组。

## 范围
- `world.lua` 是试验用物理世界。引擎计算形状碰撞、碰撞冲量、反弹、接触摩擦和角动量；Lua 提供输入、驱动、转向、阻尼、限速、状态采样。没有把游戏的击退、眩晕和电池掉落移入物理引擎。
- `poc_room.lua` 每 Actor 独立普通 Space；4 个 Skynet worker。多房间使用同一进程，各自有 Lua VM。
- `poc_clock.so` 使用 `CLOCK_MONOTONIC` 返回纳秒。Skynet 的 10 ms 定时器只负责唤醒；每次仿真按 1/20 或 1/60 秒固定推进，按绝对时刻追赶，超上限明确记录漏步。这个方法不把 60 Hz 描述成精确的 16.67 ms 线程唤醒。
- 压测包括 10 Hz 状态读取快照，但不含在线连接、网络编码/传输、游戏规则/机器人或真实生产负载。使用固定控制序列；步进耗时包含 Lua 车辆控制与碰撞回调，不含快照；求解子项单独统计绑定开销、引擎求解和碰撞回调，调度延迟单独统计。P95 为直方图桶下界（步进 1 us、延迟 0.1 ms）。CPU 以单逻辑核=100% 表示；RSS 包含运行时、分配器保留页和共享库。
- 纯 Lua 对照调用项目锁定版本中未修改的 `vehicle_collision.lua`，但用圆形车体＋圆形边界，和矩形刚体＋方形边界不等价。对照用于评估计算量级，不用于宣称物理效果等价。

## 应用交付补丁
在磁力小车的独立分支中运行 `git am /path/to/magnetic-rover-moonchipmunk-poc.patch`，或把 ZIP 中的 `verification/moonchipmunk-poc/` 解压到仓库。两种方式二选一。不要把 POC 当作现有游戏的启动配置。
