# Windows x64 发布包

在 macOS/Linux 上使用下载好的 Windows Skynet runtime 打包。目标 Windows 10/11 x64 电脑不需要 Docker、Node.js 或 Lua。

```sh
./scripts/package-windows.sh
```

默认读取 `~/Downloads/skynet-windows-x64`，每次重新安装锁定的前端依赖、运行前端测试并构建，输出带时间戳的 ZIP 和 `.zip.sha256` 到下载目录。需要 Bash、Python 3.9+、Node.js 22.18+ 和 npm。运行时源目录不会修改。

```sh
./scripts/package-windows.sh \
  --runtime "$HOME/Downloads/skynet-windows-x64" \
  --output-dir "$HOME/Downloads" \
  --name magnetic-rover-windows-x64-my-release
```

已有同名发布文件会拒绝覆盖。支持用 `SKYNET_WINDOWS_ROOT` 设置默认运行时目录。运行时必须是完整的已编译 Windows x64 包，脚本会验证 PE 架构；Linux Docker 运行时不能代替 Windows DLL。

脚本把服务端 Lua、构建后的前端、必要的 Windows 运行时及许可证组装到同一个文件夹，附带 `start.bat`、`open-game.bat` 和中文 README。打包辅助逻辑位于 `scripts/package-windows.py`，Windows 模板位于 `packaging/windows/`。

解压后双击 `start.bat`，再打开 `http://127.0.0.1:18080/`；局域网设备使用 Windows 电脑的 IPv4 地址和同一个端口。保持服务窗口开启，Ctrl+C 停止。默认速度 480。发布包的 `server` 不包含 `test_*.lua`，也不包含自检 BAT；浏览器画面、触控、防火墙和真机运行仍需目标 Windows 验收。

包内 `BUILD-INFO.json` 记录游戏提交、工作区是否修改、上游 runtime 原始版本信息；`SHA256SUMS` 校验包内文件。构建工具、Git 元数据、本机日志和 DLL 以外的原生宿主产物不会混入发布包。

## 2026-10-25 验证

产物：`~/Downloads/magnetic-rover-windows-x64-20261025.zip`（约 16.2 MiB），旁附 `.zip.sha256`。来源 Windows runtime 的 BUILD-INFO 提交为 `9fd4eca3830991d5f5a6dd308d79f6569f9e98f8`。

- 前端 125 项测试及 TypeScript/Vite 构建通过。
- ZIP 222 个文件逐一核对 SHA-256，通过归档完整性检查。
- 错误的 runtime 路径、非法包名、已有同名产物及 Windows 保留设备名会在重建前拒绝。
- 在本机 Wine 10.0 x64 Docker 测试环境通过原生 Windows `start.bat` 启动，`test-game.bat` 自检返回 0。
- 映射独立端口 18084，`node smoke.mjs http://127.0.0.1:18084` 验证 HTTP、前端资源、两名独立玩家、房间加入、准备开局和权威移动均通过。
- 测试容器结束后删除；现有 18080/18083 测试服务不受影响。
- Wine 结果不能替代 Windows 真机上的防火墙、浏览器、触控和运行验收。

后续精简：发布包已移除 `server/test_*.lua` 和 `test-game.bat`，源码仓库内测试继续保留。新产物名称带 `-runtime` 后缀，旧产物保留。
