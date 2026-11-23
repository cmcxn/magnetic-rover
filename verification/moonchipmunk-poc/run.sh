#!/bin/sh
set -eu
cd "$(dirname "$0")"
mode=${1:-test}
case "$mode" in
 clean) exec ./build.sh clean ;;
 test|bench|red) ;;
 *) echo "usage: $0 {test|bench|clean}" >&2; exit 2 ;;
esac
if [ ! -x .build/skynet/skynet ] || [ ! -f .build/lib/moonchipmunk.so ]; then
  ./build.sh
fi
if [ ! -f .build/lib/poc_clock.so ] || [ monotime.c -nt .build/lib/poc_clock.so ]; then
  mkdir -p .build/lib
  "${CC:-cc}" -O2 -Wall -Wextra -shared -fPIC -I.build/skynet/3rd/lua -o .build/lib/poc_clock.so monotime.c
fi
if [ "$mode" = test ] || [ "${POC_WORLD:-world}" = baseline ]; then
  ./prepare-baseline.sh
fi
export POC_MODE="$mode"
export LD_LIBRARY_PATH="$(pwd)/.build/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
if [ "$mode" = bench ]; then
  exec .build/skynet/skynet skynet.conf
fi
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT HUP INT TERM
status=0
timeout "${POC_TEST_TIMEOUT:-60}" .build/skynet/skynet skynet.conf >"$tmp" 2>&1 || status=$?
cat "$tmp"
[ "$status" -eq 0 ] && grep -qx 'POC_PASS' "$tmp"

