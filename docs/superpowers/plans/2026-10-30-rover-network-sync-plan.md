> 本地执行记录（2026-10-31）：任务0–7的本地实现及可用层级验收见 verification/network-sync/README.md、COMMANDS.md 和 LEDGER.md。保留原交接计划供追溯；下面的原始检查框不是最终执行状态。必要精度例外见 PROTOCOL.md。原生微信/真机/WAN、真实密集玩家网络与完整Docker Hub构建仍待外部环境验收，未冒充完成。

# 磁力小车网络同步优化 Implementation Plan

> **给执行Codex：**按任务逐步实现并记录证据。若本机有 subagent-driven-development 或 executing-plans 技能，可按适用工作区规则使用；本方案本身不依赖特定技能安装。用户已选择在本机Codex实施，交付本地代码与验收报告。

**Goal:** 将默认8人典型周期的每人游戏下行优化至3–5MB预算，保留当前规则与反馈。

**Architecture:** 权威Game保持原精度；增加Lua网络DTO/房间状态流、共享TypeScript decoder；10Hz玩家绝对状态、电池增删改、metadata缓存、局外1Hz心跳。生产恢复full自包含，旧协议继续兼容。

**Tech Stack:** Skynet/Lua、JSON/WebSocket、TypeScript、共享Phaser World/Motion、微信小游戏、Node test runner、现有Python websockets集成脚本。

**Spec:** ../specs/2026-10-30-rover-network-sync-design.md。先读Spec与交接包ANALYSIS.md；下列任务的全局约束均受Spec约束。

## Global Constraints

- 服务端权威物理精度、100秒规则、20Hz逻辑、10Hz比赛玩家状态不变。
- 普通JSON，独立DTO定点；不全局修改json.lua精度。
- ID、序号与动作计数无损，现有预测字段保留。
- 同房间单一提交序列；heartbeat也提交seq+1并带baseSeq。
- 单连接重连不重置全房epoch；恢复full使用已提交canonical DTO。
- v1缺省兼容；同时适配H5与微信小游戏。
- 原始工作区与用户修改受保护；部署/远端推送不属于本任务。
- 所有“已经通过”必须有本机实际命令和输出，预算实验不替代产品测试。

## Review Focus

1. 同帧拾取加交付/碰撞掉落：电池、cargo、计数与反馈原子一致，任务1/3/6覆盖。
2. 同tick新连接与旧连接广播：相同seq必须对应相同canonical DTO，任务2/5覆盖。
3. finished→lobby roundId未变：旧字段与计数必须清理，任务2/3/4覆盖。
4. H5与小游戏局外等待超过8秒：心跳不能触发误断线，任务4/5覆盖。
5. 观众恢复、旧客户端混房、慢连接：恢复权限、协议分组与基线链正确，任务2/5覆盖。

## Task 0 获取本机基线与验证入口

**Files:** 只读AGENTS.md、Git状态、相关源码、package/构建脚本。记录到新的本地报告，不覆盖历史verification数据。

- [ ] 执行 git status --short、git branch --show-current、git rev-parse HEAD、git diff --stat、git diff --cached --stat。
- [ ] 对照审计SHA f7cd31c6486b82effca2d6a67f0f10cf42730311 阅读相关差异，不为了对齐历史版本清理/回退工作区。
- [ ] 检查Node、Lua、Skynet、Python依赖和本机测试能力；优先使用仓库已有工具链。
- [ ] 在改动前运行可用的相关离线回归，保存已有失败与环境问题。使用下方“实际命令”章节，不能在根目录臆造npm test。
- [ ] 必要时在独立只读审计checkout运行交接包预算实验；该实验不产生产品改动，不要求它在不同平台逐字节复现旧数据。

**完成条件：**明确本地版本、已有修改、可运行的验证层级和原有失败；不存在把旧默认配置失败混入协议回归的歧义。

## Task 1 定义网络DTO与独立状态oracle

**Files:**
- Create server/state_codec.lua。
- Create server/test_state_codec.lua。
- Create client/src/wire-types.ts。
- Create tests/network_fixture.lua，用于产生原始与投影轨迹，接口需写入其帮助。
- Update PROTOCOL.md，先写协议字段、单位、profile、删除和版本语义。

**Interfaces:**
- Lua project(snapshot, profile) -> CanonicalDto。
- Metadata、DynamicFrame、WireFull/WireDelta/WireHeartbeat遵循Spec。
- fixture生成 raw snapshot、独立期望normalized State及输入/采样时间，后续任务复用。

- [ ] 先写可失败的纯Lua测试：定点正负半值与零、所有动态字段保留、序号无损、编码不修改原snapshot、空集合编码、可选字段消失、自然电池移动、drop落地后再移动。
- [ ] 使用原始完整snapshot作为oracle，显式规定每字段单位与保留方式。不要仅验证同一个编码/解码函数互相匹配而漏掉双方都删除的字段。
- [ ] 实现独立投影，先支持conservative与fine；所有精度由统一契约定义。
- [ ] 写电池完整记录替换/删除和metadata整体替换测试；源状态中零、false不能当缺失。
- [ ] 用现有Lua解释器执行新测试，确认不需要启动Skynet监听。
- [ ] 输出少量跨语言fixture，后续TS decoder据此校验，不用人造简化状态替代真实全字段快照。

**完成条件：**独立oracle逐字段证明数据完整，Game输入未被修改，量化误差符合Spec；固定快照fixture能够被两端消费。

## Task 2 实现房间统一序列、兼容及全量恢复

**Files:**
- Modify server/state_codec.lua、server/rooms.lua、server/main.lua。
- Create server/test_state_stream.lua。
- Extend server/test_state_codec.lua。

**Interfaces:**
- Codec.new({epochPrefix,profile,keyframeSeconds=10}) -> Encoder。
- Encoder:publish(snapshot,monotonicNow) -> WireMessage | nil；非playing纯clock变化不足1秒返回nil且不提交。
- Encoder:full(cause) -> WireFull，只读当前提交。
- Encoder:getStats() -> counters。
- join.protocolVersion与welcome.protocolVersion；合法房间会话支持request_full。

- [ ] 先写纯Lua流测试：q→q+1、同seq的full内容、连续sendState不改变seq/metadataVer/差分基线、metadataVer变化、周期full替代delta、heartbeat推进seq。
- [ ] 用假的单调时钟按10Hz调用非playing的publish共20秒，断言只有约20次clock提交；nil时序号与基线不变，资料/名单/阶段变化不额外等1秒；混房v1完整state仍正常发送。
- [ ] 测试在一次房间tick前后加入新连接：基线必须是同一canonical DTO，不冒用seq；full前不向新连接发delta。
- [ ] 实现每房间Encoder、已提交canonical缓存、每10秒比赛keyframe与阶段变化即时消息。
- [ ] 明确新round及finished→lobby的新epoch；playing→finished保留正常阶段反馈。
- [ ] 协商v1/v2；无声明v1，v2客户端收到welcome确认后才处理v2消息。各版本同房编码复用。
- [ ] request_full放在房间会话级，允许玩家与观众，合并同连接重复请求（最多每秒一次）。
- [ ] 发送层支持已经编码的字符串，防止字符串又被json.encode套一层引号。按成功排入发送路径的接收者实际计字节，不能把编码一次误计成只发一份。
- [ ] 运行新增Lua测试与相关已有Rooms测试。

**完成条件：**共享广播与连接恢复不存在基线竞争，旧协议保留，阶段/心跳一致，代码测试可观察真实消息数与字节数。

## Task 3 实现共享不可变StateDecoder

**Files:**
- Create client/src/state-codec.ts。
- Create client/tests/state-codec.test.mjs。
- Extend client/src/wire-types.ts。
- Reuse tests/network_fixture.lua生成的跨语言数据。

**Interfaces:**
- StateDecoder.reset(roomId?:string):void。
- StateDecoder.apply(message):DecodeResult。
- DecodeResult = applied/ignored/need_full，带state、continuous/recover/phase_reset模式或原因。

- [ ] 先写full、delta、heartbeat与单位恢复测试；Lua产生的真实字段必须完整恢复为既有State。
- [ ] 深冻结旧State后应用下一包，断言旧State/旧Player/旧Battery未变化，变化帧有新对象引用。
- [ ] 验证整包原子提交：同帧电池移除、cargo、pickupSeq变化只向业务层发布一次。
- [ ] 验证清空results/supply/nextOuterRadius等可选字段；全电池upsert不保留已省略的旧vx/vy等字段。
- [ ] 验证错误epoch、baseSeq间断、metadata缺失不部分修改状态；heartbeat metadataVer未知不更新clock/seq；重复包忽略；恢复等待期间可接受same-seq full。
- [ ] 验证同epoch紧接q+1的keyframe/phase_change为continuous；断链、恢复等待或跨seq的合法full为recover；新epoch phase_reset seq=0不受旧epoch大seq影响；finished→lobby为phase_reset。
- [ ] 实现decoder并执行 node --test client/tests/state-codec.test.mjs 与H5相关既有测试。

**完成条件：**新协议恢复完整业务State，旧快照不可变，错误包可恢复；不是把delta直接交给World。

## Task 4 接入H5、小游戏和基线效果重置

**Files:**
- Modify client/src/main.ts、minigame/src/main.ts。
- Modify client/src/world.ts及现有音效/拾取反馈模块中的最小重置入口。
- Create minigame/tests/state-codec.test.mjs或按仓库现有测试组织等价覆盖。
- Extend client/tests/motion.test.mjs或既有Motion对应测试，避免复制一套预测算法。

**Interfaces:**
- 两端接收消息 -> shared decoder -> 现有State处理。
- 显式统一baseline reset入口处理Motion、effectSnapshot、impactState及拾取计数；名称在实施时一处定义全局复用。
- 入口处理need_full限频、welcome重置、有效状态到达时间。

- [ ] 先写两端入口测试：v1沿用旧路径；v2全量/增量均送入同一decoder；旧socket generation的迟到welcome/full/delta回调全部丢弃。
- [ ] 用假的单调时钟验证20秒大厅/结算等待：1Hz有效heartbeat刷新健康状态，H5不在8秒关闭、小游戏不在5秒误判。
- [ ] 验证recover静默建立计数基线，不播放断线期间累积拾取/碰撞声；普通keyframe不清插值，不每10秒抖动或重播。
- [ ] 验证phase_change的正常结算提示仍触发；phase_reset清理旧结果、电池和计数。
- [ ] 接入两个入口，不改变20Hz逻辑/10Hz玩家动态和现有插值/预测算法。
- [ ] 使用同输入、同消息到达时刻回放原始State和新解码State，报告预测位置偏差、修正距离/频次及动作计数；复用已有Motion容差和行为断言。
- [ ] 如果预测敏感字段导致既有断言失败或新增明显跳变，先提高该字段精度/保留原值，更新profile元数据与字节测量，不直接放宽原测试。
- [ ] 分别执行H5测试、小游戏全测试、两端类型检查与构建。

**完成条件：**双端协议、状态存活、重连和反馈行为一致；量化精度选择有回放依据。

## Task 5 实际本机传输与恢复验证

**Files:**
- Create tests/sync_protocol_ws.py。
- Extend相关Lua连接/Rooms测试。
- 根据真实runtime接口接入发送积压处理；不臆造socket API。

**Interfaces:**
- 新脚本支持 --uri 和 --report。
- 测试目标必须是隔离本机服务，不能默认连接公网endpoint。
- 字节记录按fd、roomId、roundId、协议、消息种类累计。

- [ ] 写集成断言：v1/v2混房、正常八人、观众加入及resync、新用户取full后无缝接共享delta。
- [ ] 验证新局、finished→lobby、断开重连、metadata变更、同seq恢复full和周期keyframe。
- [ ] 核实固定Skynet运行时可用的写缓冲告警/排队字节接口；采用可验证的积压阈值和断开策略，并记录配置。
- [ ] 模拟慢接收者；不能丢一个中间delta后继续其依赖链。若做应用队列合并，必须跟full，并证明未修改已进入socket的字节。
- [ ] 对重复request_full和错误基线验证有合并/限频，观众不被玩家专用gate误拒。
- [ ] 在隔离本机端口运行新脚本与适用已有真实WS脚本，保存报告。

**完成条件：**至少有一次实际Skynet+WebSocket闭环；纯Lua预算结果不替代此层。无法运行的部分如实标记。

## Task 6 产品编码器流量与密集场景预算

**Files:**
- Create或完善 tests/network_fixture.lua、tests/sync_budget.py（如已有合适runner可复用）。
- Create新的验收报告，例如 verification/network-sync/README.md 和机器可读结果。
- 不覆盖analysis/reference-results.jsonl或旧verification历史。

**Interfaces:**
- 报告包含 rawBytes、encodedBytes、实际发送字节、full/delta/metadata/heartbeat/recovery分类、人数、时长、配置、HEAD。
- 生产encoder是被测对象；交接实验脚本只用于参考。

- [ ] 同一原始轨迹同时测旧完整快照和实际新encoder的发送输出；包含t0、100秒战斗、约10秒finished、20秒lobby。
- [ ] 运行三个参考seed，同时运行密集掉落/落地挤动、补给收缩及重连样本。密集场景允许独立固定fixture，但不得修改产品玩法凑数据。
- [ ] 统计每人和全房字节，记录协议开销与实际接收者数；编码一次广播8个人仍计8份出网。
- [ ] 典型三seed产品JSON目标约3.0–3.5MB/人，完整游戏下行规划目标3–5MB；无证据时不声称云账单已达到。
- [ ] 密集/恢复场景单列P50/P95/最大消息、累计量及恢复次数；超过预算解释来源，不能把自然电池168当所有电池上限。
- [ ] 对比精度profile的带宽和预测回放指标，确定本局固定profile，记录任何字段级精度例外。
- [ ] 检查CPU/编码次数、队列、GC的可观测结果；不据离线字节实验推导2核房间容量。

**完成条件：**产品路径的实际数据支持收益，正确性和反馈验收不因流量目标而被削弱。

## Task 7 汇总交付与自查

- [ ] 自查Spec每条约束都有代码/测试/报告归属；重点核对heartbeat序号、full自包含与cause模式无矛盾。
- [ ] 运行适用完整回归和构建；仅针对剩余具体风险扩展测试，不无限重复相同检查。
- [ ] 更新PROTOCOL.md、相关README、量化/恢复说明及本次新的验收报告。
- [ ] 报告修改文件、设计差异、命令与真实结果、前后字节、行为对比、缺失的真机/网络验证及剩余风险。
- [ ] 输出本地diff/改动摘要。提交、推送、部署遵守本机用户授权；本计划不要求自动推送或上线。

## 实际命令与环境注意

以下从产品仓库根执行，均为已核实的入口；不是本次已运行通过的证明。先核对本机版本是否改变脚本。

### 前端与小游戏

根目录和minigame/没有package.json。client/package.json使用Node test runner。README要求Node22.18+或兼容LTS，审计Dockerfile为Node24.18.1；优先使用仓库相容且支持现有.ts测试导入的Node环境。

```sh
npm --prefix client ci
npm --prefix client test
npm --prefix client run build
node --test minigame/tests/*.test.mjs
client/node_modules/.bin/tsc -p minigame/tsconfig.json --noEmit
node minigame/build.mjs
```

依赖已经可用时不必反复npm ci。小游戏多个测试直接引用client/node_modules/typescript，不能只设置ROVER_NODE_MODULES绕过。minigame/build.mjs只自动跑clock.test.mjs，不替代全部测试或tsc；它会重建minigame/dist生成目录。已有Docker构建入口为 ./scripts/build-wechat.sh。

### Lua与Skynet

新纯Lua测试从server目录执行，Lua使用本机兼容解释器或Skynet自带解释器；在环境变量内使用实际绝对路径，不复制占位路径直接运行。

历史完整脚本：
```sh
SKYNET_ROOT=/absolute/path/to/skynet ROVER_BASE_SPEED=240 ROVER_BIND=127.0.0.1 sh server/test.sh
```

这条命令会启动本机18080并运行test_ws.py，需端口空闲、名为python的解释器及websockets依赖。server/test.sh没有覆盖所有Lua测试；它设置旧地图/补给却未设置旧速度，test_game.lua历史夹具要求240，故上方显式传240。此为现有入口配置差异，不要当作新协议回归。带宽测量使用当前默认速度480、地图2、补给2，不能把历史回归配置当当前负载。

Dockerfile构建会跑H5测试/构建与Lua测试通配循环，不运行server/test.sh的网络部分，也不运行小游戏全部测试。docker build不等同真实对局验收；docker compose up会启动真实服务。

### 隔离本机联机

先确认隔离服务与空闲端口，以下18083只是示例：
```sh
python3 tests/multi_room.py --uri ws://127.0.0.1:18083/ws --report /tmp/rover-multi-room.json
python3 tests/smooth_motion_ws.py --uri ws://127.0.0.1:18083/ws --full-match --report /tmp/rover-smooth-motion.json
python3 tests/collision_redesign_runtime.py --uri ws://127.0.0.1:18083/ws --out /tmp/rover-collision-runtime.json
```

server/test_ws.py的URI固定18080，不支持臆造--uri。tests/static_delivery.py会自行启动server/run.sh，不是单纯读取页面的工具。

浏览器*.browser.mjs不在npm test匹配范围；Playwright/Chromium也不在现有client依赖中。按本机已有环境运行适用测试，不把Node单测和构建称为已通过浏览器或微信真机手感验证。

## 审阅来源

- [client/package.json](https://github.com/cmcxn/magnetic-rover/blob/f7cd31c6486b82effca2d6a67f0f10cf42730311/client/package.json)
- [minigame/build.mjs](https://github.com/cmcxn/magnetic-rover/blob/f7cd31c6486b82effca2d6a67f0f10cf42730311/minigame/build.mjs)
- [server/test.sh](https://github.com/cmcxn/magnetic-rover/blob/f7cd31c6486b82effca2d6a67f0f10cf42730311/server/test.sh)
- [Dockerfile](https://github.com/cmcxn/magnetic-rover/blob/f7cd31c6486b82effca2d6a67f0f10cf42730311/Dockerfile)

