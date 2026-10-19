#!/bin/bash
set -eu
source "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)/server/control-common.sh"
if [ -z "$PID" ]; then echo '服务已停止。'; exit 0; fi
owned "$PID" || fail "进程身份已变化，拒绝停止 PID $PID"
kill -TERM "$PID" || fail "无法停止 PID $PID"
for ((i=0;i<20;i++)); do
    if ! owned "$PID"; then
        rm -f "$PID_FILE"
        [ -z "$(listeners)" ] || fail '原服务已停止，但端口现被其他进程占用；未处理该进程'
        echo "已停止 PID ${PID}；18080 端口已释放。"; exit 0
    fi
    sleep 0.5
done
fail "PID $PID 未在 10 秒内退出；保留 PID 文件，未强制终止"
