# Competitive AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 单人等待房间主动加入竞技 AI，完成 H5 与小游戏一致的完整对局。

**Architecture:** Skynet 管理 AI 生命周期；Lua 规则控制器生成常规输入，由现有权威物理处理。客户端仅添加入口、状态和身份标签。

**Tech Stack:** Lua / Skynet、TypeScript / Phaser、现有 Node 与 Lua 测试。

**Spec:** docs/superpowers/specs/2026-10-29-competitive-ai-design.md

## Global Constraints
- AI 不使用网络会话/token，不修改物理结果，不维持空房间。
- 一房间最多一名 AI；真人主动添加，自动准备；添加后真人必须重新开始。
- 第二真人成功加入等待房间移除 AI；失败加入、观众、重连不触发。
- 运动参数沿用环境变量配置；全局 100 秒期限不变。
- H5 与小游戏同时实现；旧服务器没有能力字段则隐藏入口。

## Review Focus
- 重复点击和同时真人加入不能产生多 AI 或误开赛：任务 2。
- 断线/重连、保留席位不能被当作空房间：任务 2。
- AI 输入失效、服务器长暂停不能补跑攻击：任务 1。
- 缩放和冲刺参数变化不能让攻击决策依赖默认常量：任务 1。
- 结算/再来一局/全员离开不能遗留 AI 准备或会话：任务 2、4。

### Task 1: 竞技控制器与物理接入
**Files:** 新增 server/bot.lua、server/test_bot.lua；修改 server/game.lua、server/test.sh。
**Interfaces:** Bot.new(randomFn) -> controller；Bot.input(controller, game, player, now) -> {x:number,y:number,boost:boolean}。player.isBot 标识机器人；通过 G:input 应用输入，G:step 的每个物理步开始前刷新；控制器按时间限制思考频率。
- [ ] 写失败用例：150ms 决策间隔、目标保持、可拾取电池选择、10 货存分、12 秒紧急存分、攻击保护排除、按住后释放、眩晕和脱困；使用固定随机源。
- [ ] 运行 server/test.sh，确认新增测试因缺少控制器失败。
- [ ] 实现控制器和 G:step 接入；跳时只刷新当前输入，沿用 300ms 输入失效和固定物理步语义；不让 AI 自行写能量和分数。
- [ ] 增加非默认缩放/冲刺参数和完整100秒拾取存分回归；运行 server/test.sh 全通过。
- [ ] 提交 bot 控制器与测试。

### Task 2: 房间生命周期与协议
**Files:** 修改 server/rooms.lua、server/game.lua；新增 server/test_bots_rooms.lua，登记 server/test.sh。
**Interfaces:** add_bot / remove_bot 无负载消息；snapshot 的玩家和结果包含 isBot:boolean，房间含 humanCount、botCount、canAddBot、canRemoveBot。若 snapshot 被广播复用，能力字段代表房间条件，客户端另外检查自身 player 角色；服务端始终检查实际发送者。
- [ ] 写失败用例：单人添加成功、重复幂等、观众拒绝、多真人拒绝、预先准备不自动开局、颜色唯一、移除、第二真人成功加入后替换 AI。
- [ ] 补充失败加入不移除 AI、观众进入不移除、断线保留席位和重连、再来一局准备重置、空房清理；运行并确认失败。
- [ ] 实现生命周期：AI 使用独立内部 fd 标识且与真人 fd 不碰撞，分配沿用可排序数字 player id；不建立 sessions/connections/token，自动准备但不自动替真人开始。
- [ ] 运行 server/test.sh；验证正常八人真人房间和现有颜色/重连测试不回退。
- [ ] 提交房间协议与测试。

### Task 3: 两端单人入口
**Files:** 修改 client/src/main.ts、client/src/style.css 或现有准备页样式文件、client/src/protocol.ts（若类型位于其他文件按实际位置更新）、minigame/src/main.ts、minigame/src/panel.ts；扩充现有客户端测试。
**Interfaces:** 消费任务 2 字段；按钮发送 add_bot / remove_bot。等待列表、排行与结算依 isBot 标记 AI。
- [ ] 定位现有协议类型与准备页渲染入口；为单人真人显示、观众隐藏、旧状态缺字段隐藏、AI 存在显示移除编写失败测试。
- [ ] 两端加入「和 AI 一起玩」与提示「一个人也能开赛，加入 AI 陪练」；AI 存在时显示「移除 AI」。维持原开始按钮，不本地伪造准备/车手状态。
- [ ] 防止重复点击期间多个请求，服务端拒绝后可恢复；验证小游戏触摸区域与窄屏文字不重叠。
- [ ] 运行客户端测试、两端 TypeScript 和构建；提交两端 UI。

### Task 4: 真实联调与交付
**Files:** 新增 verification/competitive-ai/README.md 与实测截图；更新 server/README.md 的协议说明。
- [ ] 使用真实 Skynet 和独立浏览器会话验证单人入口→AI准备→真人开始→100秒比赛→结算→再来一局；确认 AI 有实际捡取、存分及攻击输入。
- [ ] 另开真人会话测试开赛前加入移除 AI；观众、失败加入、重连均不触发移除；退出全部真人，确认房间清理。
- [ ] 用实际小游戏包验证同流程；如只有 wx 桥接条件，截图和记录明确标注非真机。
- [ ] 运行服务端与两端回归、构建、git diff --check；清理测试连接和临时服务。
- [ ] 保存截图与验证结果并提交；说明需同步更新 Skynet，未经实测不宣称真机通过。
