# pi-antigravity 插件使用与国内代理踩坑指南 🪐

本目录收录 **Google Antigravity (Cloud Code Assist)** 扩展在 Pi Coding Agent 中的完整安装方法、使用步骤与国内网络代理避坑方案。

---

## 📖 1. 插件简介

**`pi-antigravity`** 是 Pi 生态中用于直接连接 Google Antigravity / Cloud Code Assist 模型的官方扩展包（由 Rahul Arya 维护，发布于 npm 官方源）。

通过该插件，Pi 可以直接使用以下模型：

| 模型公开 ID | 模型类型 | 思考级别 (Thinking) | 最大输出 Token |
|---|---|---|---|
| `antigravity/gemini-3.7-flash` | Gemini 3.7 Flash | Low, Medium, High | 65,536 |
| `antigravity/gemini-3.6-flash` | Gemini 3.6 Flash | Low, Medium, High | 65,536 |
| `antigravity/gemini-3.5-flash` | Gemini 3.5 Flash | Low, Medium, High | 65,536 |
| `antigravity/gemini-3.1-pro` | Gemini 3.1 Pro | Low, High | 65,535 |
| `antigravity/claude-sonnet-4-6` | Claude Sonnet 4.6 (Vertex) | High | 64,000 |
| `antigravity/claude-opus-4-6` | Claude Opus 4.6 (Vertex) | High | 64,000 |
| `antigravity/gpt-oss-120b` | GPT-OSS 120B (Vertex) | Medium | 32,768 |

---

## ⚡ 2. 核心前置：国内网络代理配置（必看避坑）

### 踩坑原因：为什么会出现 `fetch failed`？
- **浏览器能正常打开授权**：因为浏览器走的是系统代理。
- **Pi 内部换 Token 失败**：官方 Pi 运行在 Node.js 环境（Node 22/24），Node 原生内置的 `fetch` 默认**忽略**操作系统的 `HTTPS_PROXY` 环境变量，导致交换 Token 的网络请求直连 Google 超时报错。

### 解决方案：一键配置脚本

必须同时设置代理变量并开启 Node 的代理支持开关 `NODE_OPTIONS=--use-env-proxy`。

#### Windows 用户（推荐直接运行本目录脚本）：
在 PowerShell 中运行本目录下的 `setup-env.ps1`：
```powershell
.\setup-env.ps1 -ProxyUrl "http://127.0.0.1:7890"
```

或者手动在 PowerShell 执行：
```powershell
setx HTTPS_PROXY "http://127.0.0.1:7890"
setx HTTP_PROXY "http://127.0.0.1:7890"
setx ALL_PROXY "http://127.0.0.1:7890"
setx NO_PROXY "localhost,127.0.0.1,::1"
setx NODE_OPTIONS "--use-env-proxy"
```

#### macOS / Linux 用户：
```bash
./setup-env.sh "http://127.0.0.1:7890"
```

> **⚠️ 关键提示**：设置环境变量后，**必须完全关闭并重新打开 Pi / 终端窗口**，新环境变量才会对 Pi 进程生效。

---

## 🚀 3. 安装插件

在终端中执行以下命令安装插件：

```bash
pi install npm:pi-antigravity
```

---

## 🎮 4. 使用操作流程

### 步骤 1：Google OAuth 网页授权
在 Pi 聊天输入框中输入：
```text
/login antigravity
```
1. 浏览器将自动弹出 Google 登录页面。
2. 选择具有 Google Cloud / Cloud Code Assist 权限的账号完成授权。
3. 授权完成后页面提示 `Antigravity authentication complete`，返回 Pi 即可。

### 步骤 2：切换与使用模型
在 Pi 中选择任意 Antigravity 模型：
```text
/model antigravity/gemini-3.7-flash
```

---

## 🛠️ 5. 常用维护与诊断指令

| 指令 | 作用 |
|---|---|
| `/login antigravity` | 启动 Google OAuth 授权登录流程 |
| `/antigravity.models` | 查看当前账号所有可用模型及剩余配额池 |
| `/antigravity.usage` | 查看配额组的详细使用量与下一次重置时间 |
| `/antigravity.doctor` | 输出系统诊断报告（检查网络、端点和授权状态） |

---

## ⚠️ 6. 常见问题与注意事项 (FAQ)

### Q1: 运行 `/login antigravity` 依然报错 `fetch failed` 怎么办？
1. 检查本地代理软件（如 Clash）是否处于运行状态，端口是否为 `7890`。
2. 确认是否配置了 `NODE_OPTIONS=--use-env-proxy`（Node fetch 读代理的关键开关）。
3. 确认是否在设置环境变量后**重新打开了 Pi 终端**。

### Q2: 凭据保存在哪里？如何防范安全泄露？
- 登录成功后，Google OAuth 换取的 Token 会持久化在 `~/.pi/agent/auth.json`。
- **切勿将 `auth.json` 上传到 GitHub 或发送给任何人**（本仓库 `.gitignore` 已做防泄露防护）。

### Q3: 代理端口变了或者不想用代理怎么办？
如果代理软件换端口（如换成 `7897`），重新执行：
```powershell
setx HTTPS_PROXY "http://127.0.0.1:7897"
setx HTTP_PROXY "http://127.0.0.1:7897"
```
若不需要代理，置空即可：`setx HTTPS_PROXY ""`。
