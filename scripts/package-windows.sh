#!/usr/bin/env bash
# Build a standalone Windows x64 game ZIP on macOS/Linux (or Git Bash).
set -euo pipefail
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
RUNTIME="${SKYNET_WINDOWS_ROOT:-$HOME/Downloads/skynet-windows-x64}"
OUTPUT="$HOME/Downloads"
NAME="magnetic-rover-windows-x64-$(date +%Y%m%d-%H%M%S)"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --runtime|--output-dir|--name)
      [ "$#" -ge 2 ] || { echo "Missing value for $1" >&2; exit 2; }
      case "$1" in
        --runtime) RUNTIME=$2 ;;
        --output-dir) OUTPUT=$2 ;;
        --name) NAME=$2 ;;
      esac
      shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--runtime DIR] [--output-dir DIR] [--name NAME]"
      echo 'Defaults: ~/Downloads/skynet-windows-x64 -> ~/Downloads/<timestamped-name>.zip'
      exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done
for tool in node npm python3; do
  command -v "$tool" >/dev/null || { echo "Missing required tool: $tool" >&2; exit 1; }
done
# Validate runtime/options before rebuilding; reject Linux/macOS binaries.
python3 "$ROOT/scripts/package-windows.py" --check "$ROOT" "$RUNTIME" "$OUTPUT" "$NAME"
(
  cd "$ROOT/client"
  npm ci
  npm test
  npm run build
)
python3 "$ROOT/scripts/package-windows.py" "$ROOT" "$RUNTIME" "$OUTPUT" "$NAME"
