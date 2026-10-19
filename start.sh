#!/bin/bash
set -eu
source "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)/server/control-common.sh"
if [ -n "$PID" ]; then
    health || fail "服务 PID $PID 存在但 HTTP 未就绪，请检查 $LOG_FILE"
    echo "已运行：${URL}（PID ${PID}）"; exit 0
fi
command -v node >/dev/null || fail '缺少 Node.js；请使用 Node 22.18+ 或兼容 LTS'
node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)' || fail '需要 Node 22.18+ 或兼容 LTS'
[ -f "$ROOT/client/dist/index.html" ] || fail "缺少构建产物；请执行：cd \"$ROOT/client\" && npm ci && npm run build"
SKYNET_ROOT=${SKYNET_ROOT:-"$ROOT/../skynet-demo/vendor/skynet"}
[ -x "$SKYNET_ROOT/skynet" ] || fail "缺少 Skynet 可执行文件：$SKYNET_ROOT/skynet；可设置 SKYNET_ROOT"
SKYNET_ROOT=$(CDPATH= cd -- "$SKYNET_ROOT" && pwd -P)
export SKYNET_ROOT
node --input-type=module - "$ROOT" <<'JS'
import {spawn} from 'node:child_process';
import {openSync,writeFileSync} from 'node:fs';
const root=process.argv[2];
const log=openSync(root+'/server/local-play.log','a');
const child=spawn(root+'/server/run.sh',[],{cwd:root,env:process.env,detached:true,stdio:['ignore',log,log]});
child.on('error',e=>{console.error(e.message);process.exitCode=1});
child.on('spawn',()=>{writeFileSync(root+'/server/local-play.pid',String(child.pid)+'\n');child.unref()});
JS
PID=$(cat "$PID_FILE")
for ((i=0;i<20;i++)); do
    if owned "$PID" && [ "$(listeners)" = "$PID" ] && health; then
        echo "启动成功：${URL}（PID ${PID}）"; echo "日志：$LOG_FILE"; exit 0
    fi
    kill -0 "$PID" 2>/dev/null || break
    sleep 0.5
done
# Only terminate the process we launched if its identity still matches.
if owned "$PID"; then kill -TERM "$PID"; fi
if ! kill -0 "$PID" 2>/dev/null; then rm -f "$PID_FILE"; fi
fail "启动失败或超时；请查看 $LOG_FILE"
