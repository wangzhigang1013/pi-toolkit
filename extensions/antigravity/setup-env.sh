#!/usr/bin/env bash
# macOS / Linux 环境变量配置示例
PROXY_URL=${1:-"http://127.0.0.1:7890"}

echo "配置代理环境变量至: $PROXY_URL"
export HTTPS_PROXY="$PROXY_URL"
export HTTP_PROXY="$PROXY_URL"
export ALL_PROXY="$PROXY_URL"
export NO_PROXY="localhost,127.0.0.1,::1"
export NODE_OPTIONS="--use-env-proxy"

echo "✅ 当前会话代理已设置。如需永久生效，请将上述 export 语句添加到 ~/.bashrc 或 ~/.zshrc 中。"
