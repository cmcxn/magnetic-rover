# 网络同步优化本地验收报告（2026-10-31）

## 版本与交付边界

起点 main 28a1de2bee0c1c34c69f2d0456608b808aec79e1；分析依据 f7cd31c6486b82effca2d6a67f0f10cf42730311 可读，差异已阅读。实现位于 codex/network-sync。没有适用的AGENTS.md或父目录规则；起点无已跟踪未提交/已暂存改动。原有 .codegraph/、submission/ 保留且未提交。

保留审计后车轮/音效/引导/准备倒计时、掉落拾取修复，以及默认速度360、缩放0.8、充能3秒、冲刺1.3秒、倍率1.5、地图2、补给2。readyIn仍是动态字段。100秒、20Hz权威逻辑、10Hz玩家动态保持。

用户插入的Docker构建修复在分支提交a740095；按明确授权cherry-pick为main efc4c8c并推送。**只有这一构建修复推送远端。网络优化没有推送或CloudBase部署。** 本轮不修改本机18080原服务或公网配置。

## 修改文件与关键实现

| 文件 | 实现 |
|---|---|
| server/state_codec.lua | 纯网络DTO、量化后比较、完整电池upsert/remove、metadata缓存、canonical序列、周期full、局外限频 |
| server/rooms.lua | v1/v2协商、每房唯一提交者、welcome先于full；恢复只读已提交DTO；玩家/观众resync及限频 |
| server/main.lua | 每房/版本编码复用、发送UTF-8字节诊断、fd/房间/轮次/协议分类；真实写缓冲告警关闭慢连接 |
| client/src/wire-types.ts / state-codec.ts | 两端共享契约、整包校验、不可变完整State、缺基线恢复、重复包与退休epoch处理 |
| 两端main.ts、client/src/world.ts | 解码、状态健康时钟、静默恢复与效果基线、跨阶段输入复位；原socket对象身份守卫保留 |
| server/test_state_*.lua、共享decoder和两端入口测试 | 序列/限频/恢复/兼容、字段删除、原对象不变、预测正尾值、跨阶段按键回归 |
| tests/network_fixture.lua、network_replay.mjs | 原Game/Rooms完整轨迹、原Lua JSON字节、实际产品编码器、独立完整State oracle与同输入Motion回放 |
| tests/sync_protocol_ws.mjs、slow_sync_socket.py、network_browser.mjs | 隔离真实Skynet、完整周期/重连/缺帧恢复、慢接收者、H5和小游戏包浏览器验证 |

## 与方案不同的决定

1. 保留命名JSON字段，没有数组化/二进制化；预算已满足，方便审阅与独立对照。
2. serverTime和inputElapsed保留原精度。正stun/boost/energy的定点值至少为1，避免极小正尾值变零。普通误差半单位；正尾值例外小于1单位（stun/boost为1ms，energy为0.0001）。初版完整20Hz回放曾出现约72单位分支偏差，定位为stun=1.387e-17被舍入0；修复后重跑，没有修改Game或放宽断言。
3. 没找到已解压目录，先从所给ZIP解压到仓库外/tmp读取；仅复制方案文档入仓库，没有把实验budget.lua当生产实现。
4. 慢连接使用固定运行时的socket.warning，单位KiB，阈值1024；直接关闭连接，不丢中间delta、不向积压尾部追加假修复。
5. 本机python3缺websockets，使用已有Node原生WebSocket集成测试，没有安装全局依赖。

## 产品编码器流量

默认8个非bot玩家席位，每人20Hz脚本控制，首次full+100秒比赛+约10秒finished+20秒lobby。同一原始Lua轨迹对比，按Lua原json.encode实际字符串长度计数，不用JS重编码原浮点估算。以下为每人，MB=1,000,000B，不能再除以8。

| seed | v1 JSON字节 | v2 JSON字节 | v2含基础WS帧头 | 降幅 |
|---|---:|---:|---:|---:|
| 20261030 | 21,352,212 | 3,214,783 | 3,218,907 | 84.94% |
| 20261031 | 21,435,284 | 3,210,292 | 3,214,416 | 85.02% |
| 20261101 | 21,258,392 | 3,230,289 | 3,234,413 | 84.80% |

seed 20261030 按类型/阶段拆分（阶段为同一数据的子集，不能重复加总）：

| 类别 | 条数 | 字节 |
|---|---:|---:|
| state_full | 12 | 152,230 |
| state_delta | 1009 | 3,060,487 |
| state_heartbeat | 10 | 2,066 |
| playing | 1000 | 3,140,398 |
| finished | 11 | 16,211 |
| lobby | 20 | 58,174 |

首次full 12,564B；metadata嵌入总量 11,784B，已含在full/delta。9次周期keyframe共 121,665B；另有bootstrap、结束phase_change、回大厅phase_reset各一次。8人全房约 25.72MB，对照v1 170.82MB。conservative同轨迹4.139MB，fine更省且回放误差更小；不逐帧切换profile。

## 实际Skynet/WebSocket

最终完整实跑 131.871秒，隔离18089，8个v2玩家与v1/v2观众，脚本控制的真人客户端席位，非AI，不是真人行为统计。连续在线v2玩家总正文3.255–3.270MB；同房v1观众 21,957,270B（21.957MB）。真实报告包含房间建立、欢迎、资料更新、恢复相关提交、100秒比赛、结算/等待及下一局启动验证。建立时刻略有差异，严格同轨迹比较以上一节为准。

Tester1实际接收 3,269,577B；含基础WS帧头 3,273,765B：

| 消息 | 条数 | 字节 |
|---|---:|---:|
| welcome | 2 | 348 |
| rooms | 1 | 282 |
| state_full | 14 | 176,473 |
| state_delta | 1021 | 3,090,614 |
| state_heartbeat | 9 | 1,860 |

重连玩家Tester0与Changed分段计量，未把断开的半程连接当整轮低流量样本。final-real-ws.json保存每个连接数据。final-server.log为实际成功排入websocket.write的UTF-8字节，含fd/room/round/protocol/type；客户端报告在清理前生成，服务器日志还可能包含清理welcome/rooms，总和有少量差异。

没有测TLS/TCP/IP头、重传、云账单或首次图片/Phaser资源下载；不是宣称任意公网网络或初次完整资源下载也固定在5MB。基础WS帧头按实际正文长度计算。当前游戏同步3.27MB为5MB预算留有余量。

## 预测、碰撞、拾取、结算与恢复

| seed | 最大位置差 | 平均差 | >1单位纠正次数 原/新 | 最大纠正向量差 |
|---|---:|---:|---:|---:|
| 20261030 | 0.030835 | 0.003194 | 154/154 | 0.038178 |
| 20261031 | 0.027788 | 0.003199 | 144/144 | 0.028352 |
| 20261101 | 0.024746 | 0.003234 | 156/156 | 0.027981 |

- 每样本1031次新快照、8248个玩家状态，所有字段与独立原始State投影对照；旧对象深冻结后不变。电池按ID比较，字段删除、零/false、元数据替换和事件序号完整。
- 普通样本每次2000个20Hz本地控制，按时间排序，与原始流使用相同70/77/84ms到达延迟、0/16/33/66/99ms采样。三样本共123720个显示姿态对比，包含本地预测和远端插值。
- 小于1单位纠正计数在0.01阈值附近会因量化噪声增加；未宣称完全相同。没有放宽原Motion/碰撞断言。
- cargo/score、inputSeq、hitSeq/impactSeq/pickupSeq每帧无损。25/50/75秒补给原ID迁移与掉落飞行/落地移动均恢复；真实v1/v2最终8人结果一致。
- H5/小游戏入口20秒心跳健康测试通过。连续keyframe保留历史；恢复full静默设定基线。缺baseSeq/metadata或错误包不部分提交，同seq full在恢复等待可接受，旧epoch忽略。
- 最终短实跑主动丢一个delta，验证need_full→request_full→canonical full→后续delta恢复。观众恢复、重复resync限频通过。完整实跑另覆盖单人重连不改全房epoch、结算/回大厅清results、下一局新epoch。
- 新鲜只读复核发现小游戏跨阶段先替换state的问题，已修正并加按住D/Space跨阶段回归；复核者再次运行12项测试通过，无剩余重要问题。

## 密集压力、队列、编码与CPU边界

极端dense夹具每3秒让8辆车各掉20个测试电池，峰值1241个电池（1231个drop）。这是人工压力注入，不是正常资源速率。v1 145,016,051B，v2 15,383,330B；超过普通5MB预算，下降 89.39%。P50/P95/最大消息 15,870/19,562/109,743B。独立State恢复通过；此早期压力轨迹没有奇数tick控制历史，不把其Motion数字当完整20Hz输入验收。密集压力测了产品Encoder，未在真人/WAN密集对抗中实测。

慢接收测试：真实v1观众SO_RCVBUF=1024，45秒不读。运行时日志在1038KiB排队时关闭连接，没有丢delta。包括OS缓冲在内的已排入字节大于1MiB不等于应用队列阈值失效。

8个v2+1个v1广播断言恰好2次JSON编码、分别8份与1份下行。局外nil输出不推进seq或差分基线。fixture-runtime.json记录整套模拟+双编码+文件IO CPU 6.520秒，观测Lua峰值 949.5KiB。这不是服务器容量/GC停顿基准，不能推断2核房间数。

## 执行、环境问题、待验收与建议

- COMMANDS.md保存实际命令；基线193项测试与两端tsc通过。最终201项测试、两端tsc、H5 Vite和小游戏构建通过；小游戏构建另运行4项时钟测试。
- 默认/覆盖/非法配置、全部历史Lua与新增codec/stream测试通过：server-final.log、server-new-tests.log、server-codec-final.log。
- 原Docker错误为参数测试重复执行，已修复并按用户要求推main。完整原Docker镜像构建另遇Docker Hub元数据DeadlineExceeded，不能称完整Dockerfile构建成功；改用本机已有固定运行时镜像作真实隔离验证。网络恢复后应再运行原Dockerfile构建。
- 系统python3无websockets，以Node测试替代。
- 真实Edge浏览器H5连接隔离Skynet，加入AI并开赛，无页面错误；实际小游戏打包JS通过wx桥接浏览器进入房间，无错误。browser.log和两张截图为证据，**不是原生微信或iPhone测试**。
- 微信开发者工具原生、iPhone/Android真机、蜂窝/WSS弱网、实际TCP/TLS抓包与密集真人比赛仍待验收。所有已使用测试连接和隔离服务在验收后清理，原18080服务保持。
- 小游戏总包4093KiB，余量很小，后续改动必须继续大小检查；建议另做静态资源瘦身。
- 建议fine、10秒keyframe、局外1Hz、每连接resync至多1Hz、写队列>=1024KiB断开恢复。旧v1仍有原完整流量，双端升级后才节省。
- 本地代码、报告及可用层级验收已交付；网络优化未经远端推送和CloudBase部署。
