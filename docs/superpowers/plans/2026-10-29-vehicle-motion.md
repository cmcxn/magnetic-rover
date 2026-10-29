# Vehicle Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将已批准的分层小车接入H5与小游戏，加入滚动/转向轮胎、烟尘、尾焰和清晰冲刺声。
**Architecture:** 共享World绘制与纯视觉采样器，技术导出素材小尺寸；原生音频各自管理相同电机音效。
**Tech Stack:** Phaser/TypeScript、PNG、PCM WAV、现有Node测试及Playwright。
**Spec:** docs/superpowers/specs/2026-10-29-vehicle-motion-design.md

## Global Constraints
- 不修改服务端速度、碰撞、计分和协议；现有输入预测沿用。
- 两端共用轮胎视觉逻辑，保留菜单和缺资源回退。
- 不将高分辨率母版打入小游戏；烟尘有数量上限，减少特效下关闭。
- 明确标注桥接截图，微信真机音频听感不作为自动测试结论。

## Review Focus
- 坐标跳变/新局/断线不喷出巨大烟尘或空转：任务1。
- 两个前轮转向符号一致，后轮保持直行：任务1。
- 帧纹理变化复用精灵，玩家离开回收视觉状态：任务1。
- 短按和按住、静音、切后台都正确结束音频：任务2。
- 小游戏分包体积及Canvas兼容：任务3。

### Task 1: 分层车辆和受限效果
- [x] 添加位移/转向/停止/跳变/复位的失败测试，导出共享 VehicleMotion.sample(id,pose,delta,{active,scale})。
- [x] 使用sprite规范导出车身384×289及轮胎128×78透明PNG；胎纹帧在加载时用固定轮廓生成。
- [x] World按真实平滑位移驱动轮胎帧，前轮角度同向，加入固定上限烟尘和三层尾焰；两端加载资源；测试回收与停播效果。
- [x] 跑相关Node测试及两端类型检查。

### Task 2: 加速声音
- [x] 写音频循环起音/音量/停止及微信静音开关行为失败测试。
- [x] 导出原创PCM电机音效；H5循环和微信原生音频使用相同源，恢复/关闭逻辑有回归保护。
- [x] 验证WAV格式/音量包络与小游戏音频导出，跑所有音频测试。

### Task 3: 实际联调
- [x] 两端构建与完整客户端回归，检查小游戏包体。
- [x] 真实房间驾驶、转弯、冲刺；截图和短预览，校准轮轴/遮挡/尾焰及烟尘。
- [x] 用实际小游戏包桥接验证运行，保存日志，清理测试连接与临时服务。
- [x] 独立复查、修复重要问题、提交代码，保留功能分支。
