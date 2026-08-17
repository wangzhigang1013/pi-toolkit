# Antigravity 插件与代理配置指南 🪐

本目录收录 **Google Antigravity (Cloud Code Assist)** 在 Pi Coding Agent 中的完整接入方案、国内网络代理配置以及诊断工具。

---

## 📖 什么是 Antigravity？

**Antigravity** 是 Google Cloud Code Assist 背后的多模型底座。通过 Pi 的 Antigravity 扩展，你可以在 Pi 中直接调用：
- **Google Gemini 系列**：`gemini-3.7-flash`、`gemini-3.6-flash`、`gemini-3.5-flash`、`gemini-3.1-pro`
- **Anthropic Claude 系列**（通过 Vertex 路由）：`claude-sonnet-4-6`、`claude-opus-4-6`
- **GPT 系列**：`gpt-oss-120b`

---

## ⚡ 核心痛点与原理：解决国内 `fetch failed`

### 根因分析
- **浏览器授权成功**：浏览器走系统代理完成 Google OAuth。
- **Pi 内部换 Token 失败 (`fetch failed`)**：官方 Pi 运行在 Node.js 环境，Node 22/24 的内置 `fetch` 默认**不读取**系统的 `HTTPS_PROXY` 环境变量，导致交换 Token 请求直连 Google 超时失败。

### 解决方案
必须同时配置 **代理环境变量** 和 **`NODE_OPTIONS=--use-env-proxy`**：
1. `HTTPS_PROXY` / `HTTP_PROXY`: 指定本地代理端口（如 Clash 默认 `http://127.0.0.1:7890`）。
2. `NODE_OPTIONS=--use-env-proxy`: 激活 Node 运行时对环境变量代理的支持。

---

## 🚀 快速开始

### 1. 一键配置环境 (Windows)

以管理员或普通用户在 PowerShell 中运行本目录下的 `setup-env.ps1`，或手动执行：

```powershell
# 写入用户持久环境变量
setx HTTPS_PROXY "http://127.0.0.1:7890"
setx HTTP_PROXY "http://127.0.0.1:7890"
setx ALL_PROXY "http://127.0.0.1:7890"
setx NO_PROXY "localhost,127.0.0.1,::1"
setx NODE_OPTIONS "--use-env-proxy"
```

> **注意**：如果你的代理端口不是 7890（如 v2ray 10809 / Clash Verge 7897），请替换为对应端口。

### 2. 安装 Pi 扩展

```bash
pi install npm:pi-antigravity
```

### 3. 重启 Pi 并登录

**关键**：必须**完全关闭并重新打开 Pi 终端**以加载新的环境变量：

```text
1. /login antigravity
   -> 浏览器将弹出 Google 授权页，登录并允许权限
2. /model antigravity/gemini-3.7-flash
   -> 切换到 Antigravity 模型
```

---

## 🛠️ 常用命令

| 命令 | 功能说明 |
|---|---|
| `/login antigravity` | 启动 Google OAuth 授权登录流程 |
| `/model antigravity/<id>` | 切换到指定的 Antigravity 模型 |
| `/antigravity.models` | 查看当前账号可用的运行时模型和共享配额 |
| `/antigravity.usage` | 查看配额重置时间和配额组 |
| `/antigravity.doctor` | 输出脱敏的系统诊断信息（排错用） |

---

## ⚠️ 注意事项与常见踩坑

1. **凭证安全（极其重要）**：
   - 登录成功后的 Token 保存在 `~/.pi/agent/auth.json`。
   - **绝对不要将 `auth.json` 复制到代码仓库或公开分享**（本项目 `.gitignore` 已默认忽略）。
2. **非官方集成提示**：
   - 授权时请求的 Google Scopes 包括 `aicode`、`cloud-platform` 等权限，请确保使用受信任的网络和账号。
3. **代理未开启时的报错**：
   - 如果开启了环境变量代理但代理软件未运行，Pi 内的所有网络请求都会报错 `ECONNREFUSED`。
   - 如需临时关闭代理，将 `HTTPS_PROXY` 置空即可：`setx HTTPS_PROXY ""`。
4. **账号与地区限制**：
   - 必须使用已开通 Cloud Code Assist 或有 Google Cloud 权限的账号。
