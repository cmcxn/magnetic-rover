# 磁力小车网络同步优化设计

**目标：**在默认地图和补给配置、8真人角色、100秒比赛及约30秒局间阶段的典型周期中，将每位接收者游戏下行控制在3–5MB规划范围，保留玩法、权威判定和客户端反馈。

**范围：**Lua服务端传输层、H5/微信小游戏共享解码层、协议兼容、恢复及验证。首版仍使用JSON和现有WebSocket；不包含广告接入、数据库、房间集群、云部署或自动扩容改造。

**证据：**参见交接包 ANALYSIS.md。精细定点候选3.00–3.10MB为三个离线样本的JSON正文；实装须加入生产头、完整metadata、恢复与实际网络开销。不能承诺任意密集掉落、无限等待或无限重连均低于5MB。

## 1. 设计取舍

| 方案 | 取舍 |
|---|---|
| JSON、电池变化包、定点DTO、静态资料缓存 | 采用。能在保留现有更新频率时达到预算，便于与原始State对照 |
| 全面二进制化，例如sproto/Protobuf | 本轮不作为依赖。以后有额外收益需求再比较跨Lua/TS编码成本 |
| 单纯降低广播频率 | 本轮不采用。现有远端插值使用100ms窗口；保留10Hz更容易维持行为 |

“增量”指变化实体的完整绝对值记录，不是累加dx/dy。玩家只有8名，第一版继续发送全部玩家动态状态；电池按ID增删改。

## 2. 必须保持的约束

- 权威 Game、碰撞、拾取、掉落和补给逻辑继续使用原始浮点；100秒规则、20Hz逻辑、10Hz比赛玩家状态不变。
- 不全局改变 json.lua 的数字精度；只对独立网络DTO转换。
- ID、分数、货物、输入及动作序号无损；JavaScript数值序号保持现有安全整数边界，不做32位截断。
- inputSeq/inputElapsed/ix/iy/bx/by/kx/ky/hitSeq/impactSeq/pickupSeq等字段保留；不是仅发坐标。
- H5和微信小游戏复用同一编解码契约，保留现有State业务接口。
- 旧协议缺省仍为v1；无版本声明的客户端不接收新格式。
- 增量不依赖所有客户端同一时刻加入；观众、重连、换房均可恢复。
- 静态资料可缓存，但改变时必须传播。room lobby的名字、颜色、准备、名单变更不得延迟到下一局。
- 原始审计SHA只是分析依据；本机Codex适配当前代码，不覆盖用户工作区。

## 3. 网络表示与精度

### 3.1 精度档

首个集成版本可使用 conservative；正式目标候选为 fine。完成客户端回放后固定本局档位，不能逐帧自适应切换。档位或量化规则变化须建立新epoch并发自包含full。

| 类别 | conservative | fine |
|---|---:|---:|
| 玩家x/y，电池x/y/z | ×10 | ×100 |
| 玩家angle | ×1000 | ×10000 |
| 玩家kx/ky，电池vx/vy | 原精度 | ×100 |
| 玩家ix/iy/bx/by | 原精度 | ×10000 |
| serverTime/remaining/returnIn、supply.secondsToShrink | 原精度 | ×1000 |
| 玩家cooldown/boost/stun/inputElapsed、电池unlock | 原精度 | ×1000 |
| 玩家energy | 原精度 | ×10000 |

字段单位写入协议或metadata.scales。定点字段在线上DTO中确实是整数，客户端才除以scale。最近整数舍入统一采用半值远离零：n>=0取floor(n+0.5)，n<0取ceil(n-0.5)；规范化负零，验证有限值及范围。

fine位置误差每轴约0.005世界单位；时间误差约0.5ms。预测边界对时间和方向敏感；如回放不达标，可单独提高相关字段scale或保留原精度，更新契约并重新测流量。不得仅为达到字节目标删字段或降低物理精度。

### 3.2 Metadata

Metadata由完整config、profiles和scales组成，带metadataVer：

- config：boostMultiplier、vehicleScale、boostCooldown、boostDuration、baseSpeed、radius、mapScale、supplySpeed、refillInterval、collisionRadius、pickupRadius、stations、roomCode、maxPlayers、maxSpectators。
- profiles：按玩家id保存name、color、isBot。动态玩家仍含id。
- scales：协议中每类定点倍率及profile标识。

每次metadata更新，metadataVer加1，发送完整新metadata；接收方整体替换config/profiles。名单移除不能留旧profile。full总是带完整metadata，不依赖接收端此前缓存。

### 3.3 动态数据

- frame：完整的动态全局子对象，包括phase、serverTime、remaining、可选returnIn/supply/results、人数和canStart/canAddBot/canRemoveBot等。roomId、roundId位于公共头，type由decoder恢复为state。frame整体替换，省略字段表示已不存在。
- players：所有当前玩家的完整动态记录，保留ready和connected等；整体替换数组，再按id合并对应profile。
- batteries：按id维护。upsert是完整电池网络记录替换，remove是明确ID数组；不做浅字段合并。
- full替换整个电池集合。空集合使用明确数组/对象编码，不能把Lua空table含义交给猜测。

电池比较必须覆盖x/y/z/vx/vy/source/unlock及ID存在性，且先量化再比较。contractSupply原ID搬迁、drop落地后被挤动都应形成变化。168不是总电池数量上限。

## 4. 消息契约

生产协议v2与预算实验中的实验版本号无兼容关系；不要直接照搬实验type/version。

### 4.1 公共头

所有v2状态消息：
- v: 2
- type: state_full | state_delta | state_heartbeat
- roomId: string
- roundId: integer
- epoch: 不透明字符串，标识房间共享状态流
- seq: 非负安全整数，标识本次提交
- metadataVer: 非负安全整数

delta和heartbeat另带baseSeq。每次正式状态提交，包括heartbeat，都使seq加1；发送给多个人不重复增加seq。新epoch首份full为seq=0。

epoch不使用玩家登录token。建议由进程实例前缀、房间实例标识和本房重置计数组成。单个客户端重连不改变全房epoch。

### 4.2 WireFull

公共头 + cause + metadata + frame + players + batteries。

cause取bootstrap、reconnect、resync、keyframe、phase_change、phase_reset：
- bootstrap/reconnect/resync：用于该连接建立或恢复基线；通常引用已经提交的seq，不推进共享seq。
- keyframe：正常连续流的周期全量，替代当帧delta。
- phase_change：playing→finished等连续阶段变化，完整替换状态但保留应有的阶段反馈。
- phase_reset：新局、finished→lobby等需要清零历史的变化，使用新epoch。

full必须自包含metadata、scales和所有当前状态。新连接、恢复full与普通keyframe在内容上都可独立解码，但客户端对历史/效果的处理不同。

### 4.3 WireDelta

公共头 + baseSeq + 可选metadata + frame + players + batteryUpserts + batteryRemoves。

要求baseSeq等于客户端已应用序号，seq=baseSeq+1，epoch匹配。metadataVer变化时，本包必须带完整对应metadata；缺失或版本冲突则不提交部分状态，转为请求full。

同一ID在同一帧不能同时出现upsert和remove；生产者消重，接收者校验。玩家货物、动作计数与电池变化在同一个状态帧中原子提交。

### 4.4 WireHeartbeat

公共头 + baseSeq + clock。clock包含serverTime、remaining和可选returnIn，使用当前profile规定的单位。

仅在非playing且除clock外的状态完全不变时发送。Encoder负责限频：即使publish按10Hz调用，纯clock变化且距上次局外提交不足1秒时返回nil，不提交、不推进seq、不修改已提交基线。到期心跳提交seq+1，更新canonical DTO时钟，客户端也更新appliedSeq并发布新的完整State。这样不引入“心跳序号与状态序号两套规则”。

clock整体替换；缺失returnIn要删除旧值。任何phase、资料、名单、结果、电池或玩家变化，都在事件提交或最迟下一个100ms广播tick发送正式delta/full，不额外等待1秒，不能塞进clock-only心跳。heartbeat必须匹配已知metadataVer，否则不更新clock或seq而请求full。

第一版沿用Game的serverTime域以及remaining/returnIn，不直接导出game_clock.deadline。Game.serverTime、battery.unlock与Skynet单调deadline并非同一个时间基准。

## 5. 房间基线与发送顺序

一个房间的网络生产者统一提交canonical DTO。它从权威snapshot生成网络投影、计算变化、递增seq，并保留：
- 当前已提交canonical DTO及metadata。
- 上一次用于差分的DTO。
- 当前完整full表示，或可从canonical构造full的不可变数据。
- 当前普通广播消息及按协议版本编码的字符串。
- 上次周期full时间。

加入或resync必须发送准确的已提交DTO(q)，再接q+1。不能临时读取新Game状态却标成旧q，也不能因向一个连接sendState而改动全房差分基线。可把加入/恢复安排到下一个广播提交，或使用已提交缓存；选择一种并测试原子性。

新连接welcome必须先于其full，full先于该连接delta。尚未取得基线的连接不收依赖旧状态的delta。同一fd上的发送队列保持顺序。

周期full每10秒一次，仅比赛阶段需要；替代当帧delta。所有full自包含metadata，比实验的周期电池full多一点开销，应如实计数。单连接请求full可单独编码cause，不要求为了复用字符串改变其他连接状态。

finished→lobby时，即使roundId未变，仍创建新epoch/phase_reset，清掉旧results/supply、电池及动作历史。lobby→playing新round同样全量建立；playing→finished在同epoch正常提交phase_change及结果。

## 6. 客户端解码和效果语义

新增共享decoder，两个入口都先解码，再走原来的音效、HUD、World/Motion流程。

建议接口：
- new StateDecoder()。
- reset(roomId?: string): void；在welcome换房/连接重新建立时明确清除旧流身份。
- apply(message): DecodeResult。
- DecodeResult包含status(applied|ignored|need_full)、state?、mode?(continuous|recover|phase_reset)、reason?。
- request-full只由入口根据need_full发起，decoder自身不访问网络。

规则：
1. 整包校验类型、身份、版本、基线、字段范围后再提交；错误包不改变已有完整状态。
2. delta/heartbeat严格接q+1。旧或重复消息忽略；不连续请求full。
3. full在恢复等待或未建基线时可以接受相同seq；正常连续流中相同/更旧的重复full不得再次触发效果。同epoch跨序号的合法自包含full按recover处理；新epoch的phase_reset seq=0先按流身份判断，不能被旧epoch的大seq当成重复。
4. 两端入口为每次socket连接维护本地connection generation，丢弃已失效连接的迟到回调，包含welcome。未经当前welcome确认的旧房间消息不能把状态切回去；新epoch只能通过匹配当前房间的自包含full建立。
5. 每次应用发布新的State、数组及变化实体，已发布旧State永不被修改。初版优先清晰复制，之后再做结构共享。
6. 当前frame/player/battery子对象按规定整体替换，避免nil消失字段和零值被浅合并误处理。
7. 只有同epoch、紧接appliedSeq且未处于恢复等待的周期full属于continuous，保留插值历史和动作计数比较。若此前已断链或处于恢复等待，即使full.cause=keyframe也按recover处理：静默设定当前计数基线并重建历史，不播放缺失期间累积音效。
8. phase_reset清理Motion、effectSnapshot/impactState、拾取反馈的旧基线；正常playing→finished仍允许原有阶段提示。
9. 状态心跳刷新H5 lastState及小游戏lastSnapshot相关健康状态，不能只依赖Pong。

保留serverTime和inputElapsed的单位与用途；输出给现有业务State时恢复原单位。倒计时由服务器状态决定，本地推导只用于显示，不能据此提前判定结束。

## 7. 兼容、慢连接与观众

- join增加protocolVersion:2；welcome明确返回协商结果。
- 无声明默认v1；服务端同时支持v1 state和v2消息。输入、ping和房间管理现有语义继续兼容。
- 同房间按协议版本各编码一次；不得发给旧客户端它不识别的增量。v1保留既有完整state发送通路；v2的publish返回nil不应停止混房中的v1广播。
- resync在合法房间会话层处理，位于“只有玩家可执行”gate之前，观众也可请求。
- 同连接重复resync合并，建议最多每秒接受一次；恢复等待时避免请求风暴。
- 首版不丢弃已建立依赖链的中间delta。利用固定Skynet运行时实际支持的写缓冲告警或受控应用队列识别积压；超限断开慢连接，由客户端重连取full。
- 若实现应用层合并，只能处理尚未交给socket的消息；清除依赖链后下一条必须是full。把full追加到已经积压的TCP队列末尾不能立即追上最新状态。
- 阈值按现有运行时接口和网络测试确定并记录；不得虚构可获取的队列指标。
- v1和v2实际流量分开统计，不能把仍使用v1的用户计成已享受新流量收益。

## 8. 拟议模块与接口

保留Game:snapshot作为完整权威参考。为避免文档把实现写死在未知本地版本，可在本地规范要求时等价改名，但需更新所有引用与报告。

### Lua
- server/state_codec.lua：
  - project(snapshot, profile) -> CanonicalDto。
  - new({epochPrefix, profile, keyframeSeconds=10}) -> Encoder。
  - Encoder:publish(snapshot, monotonicNow) -> WireMessage | nil，统一处理提交、差分、周期full、phase_reset及局外1Hz限频；nil表示无提交且序号/基线不变。
  - Encoder:full(cause) -> WireFull，读取最近提交，不改变seq或差分基线。
  - Encoder:getStats() -> counters，用于实际字节与恢复次数报告。
- server/rooms.lua：每房一个Encoder；广播和阶段事件统一publish，sendState只读取已提交full。尚无基线时由房间统一初始化提交或延迟到下次提交，不能让每次join/resync独立推进全房序列。另处理协商/resync/阶段事件。
- server/main.lua：发送层接受已编码字符串，按真实接收者累加UTF-8字节；普通消息仍保留原通路。

### TypeScript
- client/src/wire-types.ts：协议类型、profile/scale定义与运行时校验所需规则。
- client/src/state-codec.ts：StateDecoder与完整State重建。
- client/src/main.ts、minigame/src/main.ts：协商、解码、请求full、健康状态更新。
- client/src/world.ts、音效/反馈层：必要的小型统一baseline reset入口，保留现有渲染与预测算法。

## 9. 验收定义

### 状态正确性
实际产品encoder->JSON->decoder恢复结果，逐帧等于同精度canonical State；原Game状态不被编码过程修改。测试需要独立完整快照oracle，不仅编码器和解码器互相迎合。

### 行为
同输入、同消息到达时刻，对原版State流与新解码State流回放。记录本机预测偏差、纠正距离/频次、远端插值、碰撞/拾取/交付/结果反馈。事件计数和阶段顺序必须一致；若预测精度不足，提高对应字段精度并复测。

### 流量
默认8人三seed典型周期，目标产品JSON约3.0–3.5MB、游戏层实际发送及网络预算不超过5MB/人/轮；分别列首次、周期full、delta、metadata、局外消息、恢复、协议开销。3.5MB正文是预留网络余量的内部目标，不是历史实测承诺。

密集掉落、反复挤动、多人重连和更长等待单列，不承诺硬上限；若明显超标给出原因和改进，不篡改玩法或隐藏流量。自然上限168不能用来跳过额外掉落。

### 兼容与可靠性
v1/v2混房、两端入口、首次加入、观众、换房、新局、finished→lobby、重连、缺metadata、重复/不连续包、慢连接均有证据。

### 报告
报告明确实际执行与未执行项目，保留本地HEAD、配置、命令、结果及样本。浏览器/微信真机无法运行时标为待验收，不用构建成功替代。

