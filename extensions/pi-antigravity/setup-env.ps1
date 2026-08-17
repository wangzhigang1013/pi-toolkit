<#
.SYNOPSIS
    一键配置 Windows 环境下的 Pi Coding Agent 代理与 Node.js 运行参数
.DESCRIPTION
    设置用户级环境变量 HTTPS_PROXY, HTTP_PROXY, ALL_PROXY, NO_PROXY, 以及 NODE_OPTIONS=--use-env-proxy
#>

param(
    [string]$ProxyUrl = "http://127.0.0.1:7890"
)

Write-Host "正在为当前用户配置代理环境变量 (指向: $ProxyUrl)..." -ForegroundColor Cyan

[Environment]::SetEnvironmentVariable("HTTPS_PROXY", $ProxyUrl, "User")
[Environment]::SetEnvironmentVariable("HTTP_PROXY", $ProxyUrl, "User")
[Environment]::SetEnvironmentVariable("ALL_PROXY", $ProxyUrl, "User")
[Environment]::SetEnvironmentVariable("NO_PROXY", "localhost,127.0.0.1,::1", "User")
[Environment]::SetEnvironmentVariable("NODE_OPTIONS", "--use-env-proxy", "User")

Write-Host "✅ 配置完成！请重新启动终端/Pi 窗口以使环境变量生效。" -ForegroundColor Green
