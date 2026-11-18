#!/bin/sh
set -eu
cd "$(dirname "$0")"
mkdir -p .build
test -d .build/box2d || git clone --depth 1 -b v3.1.1 https://github.com/erincatto/box2d .build/box2d
test "$(git -C .build/box2d rev-parse HEAD)" = 8c661469c9507d3ad6fbd2fea3f1aa71669c2fe3
tar xf ../../skynet-source.tar -C .build 3rd/lua
docker run --rm -v "$PWD:/p" -w /p hanxi/skynet-builder@sha256:31b04c011d8d5c28840c51adececb0a5f5ceada0f50aeb46faa205e1ce552ea9 sh -ec 'gcc --version | head -1; gcc -O2 -std=gnu17 -fPIC -shared -I.build/3rd/lua -I.build/box2d/include native.c .build/box2d/src/*.c -lm -o .build/native.next.so; mv .build/native.next.so .build/native.so; sha256sum .build/native.so'
