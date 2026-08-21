#!/usr/bin/env bash
# macOS / Linux 快捷同步脚本
set -e
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
node "$DIR/sync.js"
