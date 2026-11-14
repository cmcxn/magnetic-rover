#!/bin/sh
set -eu
cd "$(dirname "$0")"
revision=e4c7af9903ff306b1066474f4e4bdf9eb41e40e8
target=.build/rover/server/vehicle_collision.lua
checksum=f1a5f5265b1d943f804863c88930525031b7e54140d100e6f866dd95bd1310bb
mkdir -p .build/rover/server
if ! test -f "$target"; then
  curl -fL --retry 3 "https://raw.githubusercontent.com/cmcxn/magnetic-rover/$revision/server/vehicle_collision.lua" -o "$target.tmp"
  mv "$target.tmp" "$target"
fi
printf '%s  %s\n' "$checksum" "$target" | sha256sum -c -
