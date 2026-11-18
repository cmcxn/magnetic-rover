# Box2D / Skynet POC

在项目根目录执行以下命令。依赖 Git、Docker、POSIX shell、gzip 和 Python 3；首次构建需要获取固定依赖。构建器与运行时必须使用同一 CPU 架构。此次运行平台为 Linux arm64 容器。

```sh
cd verification/box2d-poc
./build.sh && ./run.sh test && ./run.sh compat && ./run.sh bench && python3 summarize.py
```

* `build.sh` 核验 Box2D 源码 commit，从仓库的 skynet-source.tar 提取 Lua 头文件，用 GCC 编译带 Box2D 的单个共享库。库由运行中的 Skynet 导出 Lua 符号。依赖和产物均在本地 .build/。
* `run.sh test` 在 snlua 服务中运行几何、World 生命周期、原 Game 判定、原 Rooms 编码、旧规则与新形状的时序探针，以及两种原生微基准。退出 0 代表必需断言通过。2200 单位/秒的探针独立打印首次越位 tick。
* `run.sh compat` 用主仓 Dockerfile 的历史参数对照 10 个原测试文件。输出每个文件第一处失败。基线必须全绿，实验组允许记录不兼容。三组使用相同脚本。
* `run.sh bench` 顺序生成 32、16、8 房的九组结果，每个容器预热约 3 秒再测至少 60 秒。0、1、3 分别代表原 Lua、一次 Box2D、三次 Box2D。每次重新运行会更新对应的 results 日志、计时样本。
* `./run.sh primary` 单独复测三组 32 房，覆盖顶层的 32 房日志与 trace。
* `python3 summarize.py` 解压并独立重算每个百分位，检查测量时长及数据完整性，打印报告表格。trace.gz 中每行依次为 TRACE、指标名、按采样顺序排列的纳秒整数。
* `IMAGE` 可指定同 ABI 的项目 Skynet 镜像。run.sh 优先使用本地项目镜像 magnetic-rover:skynet-runtime-f1baee5；缺失时使用主仓 Dockerfile 的固定上游镜像。文件挂载使用本分支 server/。
* H5 需要 Node、已安装的 client 依赖、Node 可解析的 playwright-core，以及本机 Chromium 或 Edge。设置 BROWSER 为浏览器可执行文件的绝对路径，按需设置 NODE、NODE_PATH 和 IMAGE，执行 `./h5.sh`。脚本临时占用本机回环端口 18982 和 18983，运行约 100 秒。房间的第一辆车由原 H5 驾驶，第二辆车通过真实 WebSocket 加入并准备。操控与观察仅在本机进行。

入口 config 沿用项目 Skynet 引导，启动实验服务 poc.lua。h5.lua 为可复现的侧撞安排初始位置，再运行原 server/main.lua。两者均只在实验容器加载。项目正常启动仍走原 Lua resolver。
