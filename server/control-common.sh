#!/bin/bash
# Shared by the root launchers; compatible with macOS Bash 3.2.
ROOT=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
PID_FILE="$ROOT/server/local-play.pid"
LOG_FILE="$ROOT/server/local-play.log"
URL=http://127.0.0.1:18080
fail() { echo "错误：$*" >&2; exit 1; }
for tool in ps lsof curl; do command -v "$tool" >/dev/null || fail "缺少 $tool"; done
LOCK="$ROOT/server/.control-lock"
mkdir "$LOCK" 2>/dev/null || fail "另一启动/停止操作正在执行；若操作已中断，请确认后删除 $LOCK"
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
owned() {
    case "$1" in ''|*[!0-9]*) return 1;; esac
    local exe args
    exe=$(ps -ww -p "$1" -o comm= 2>/dev/null) || return 1
    args=$(ps -ww -p "$1" -o command= 2>/dev/null) || return 1
    case "$exe" in */skynet) ;; *) return 1;; esac
    [ "$args" = "$exe $ROOT/server/config" ]
}
listeners() { lsof -nP -t -iTCP:18080 -sTCP:LISTEN 2>/dev/null | sort -u; }
health() { curl --noproxy '*' -fsS --max-time 2 "$URL/" >/dev/null 2>&1; }
PID=''
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    case "$PID" in ''|*[!0-9]*) fail "PID 文件格式无效：$PID_FILE";; esac
    if ! owned "$PID"; then
        if kill -0 "$PID" 2>/dev/null; then fail "PID $PID 不属于本项目，拒绝操作；请核实 $PID_FILE"; fi
        rm -f "$PID_FILE"
        PID=''
    fi
fi
PORT_PIDS=$(listeners)
if [ -n "$PORT_PIDS" ]; then
    for p in $PORT_PIDS; do
        owned "$p" || fail "18080 被其他服务 PID $p 占用，未对它执行任何操作"
        [ -z "$PID" ] || [ "$PID" = "$p" ] || fail "PID 文件与监听进程不一致"
        PID=$p
    done
    printf '%s\n' "$PID" > "$PID_FILE"
fi
