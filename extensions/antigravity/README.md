# Antigravity 插件源码与配置指南 🪐

本目录收录了 **Google Antigravity (Cloud Code Assist)** 针对 Pi Coding Agent 的**完整扩展源码**与国内网络代理配置方案。

---

## 📦 插件源码结构

本插件基于 TypeScript 开发，直接接入 Google Cloud Code Assist / Antigravity 底座：

```text
extensions/antigravity/
├── src/
│   ├── auth/           # Google OAuth 2.0 PKCE 认证流程与本地回调服务器 (51121 端口)
│   ├── client/         # Cloud Code Assist API 客户端与请求构造
│   ├── models/         # Antigravity 静态模型清单与运行时路由映射
│   ├── stream/         # 原生流式传输 (SSE) 解析与错误重试机制
│   ├── diagnostics/    # /antigravity.doctor 诊断与调试信息输出
│   ├── usage/          # /antigravity.usage 配额组与重置时间解析
│   ├── types/          # TypeScript 类型定义
│   ├── utils/          # 敏感信息脱敏与安全辅助函数
│   └── index.ts        # 插件入口，注册 provider、Slash 命令与诊断工具
├── setup-env.ps1       # Windows 一键配置代理与 Node.js flags 脚本
├── setup-env.sh        # macOS / Linux 配置代理脚本
├── package.json        # 插件定义文件 (支持 Pi 扩展清单)
└── tsconfig.json       # TypeScript 编译配置
```

---

## 📖 支持的模型列表

| 模型公开 ID | 输入类型 | 支持思考级别 | 最大输出 Token | 实际路由运行时 |
|---|---|---|---|---|
| `gemini-3.7-flash` | 文本、图像 | Low, Medium, High | 65,536 | `gemini-3.7-flash-tiered` |
| `gemini-3.6-flash` | 文本、图像 | Low, Medium, High | 65,536 | `gemini-3.6-flash-(low/med/high)` |
| `gemini-3.5-flash` | 文本、图像 | Low, Medium, High | 65,536 | `gemini-3.5-flash-low` / `agent` |
| `gemini-3.1-pro` | 文本、图像 | Low, High | 65,535 | `gemini-3.1-pro-low` / `agent` |
| `claude-sonnet-4-6`| 文本、图像 | High | 64,000 | `claude-sonnet-4-6` (Anthropic Vertex) |
| `claude-opus-4-6` | 文本、图像 | High | 64,000 | `claude-opus-4-6-thinking` (Vertex) |
| `gpt-oss-120b` | 文本 | Medium | 32,768 | `gpt-oss-120b-medium` (OpenAI Vertex) |

---

## ⚡ 核心环境准备（解决国内 `fetch failed`）

### 为什么会出现 `fetch failed`？
1. **浏览器授权成功**：浏览器走系统代理完成 Google OAuth 网页授权。
2. **Pi 内部换 Token 失败**：官方 Pi 运行在 Node.js 环境（Node 22/24），Node 的内置 `fetch` 默认**不读取**环境变量代理，导致请求直连 Google 超时报错 `fetch failed`。

### 一键解决命令 (Windows PowerShell)

在 PowerShell 中执行本目录的配置脚本：

```powershell
.\setup-env.ps1 -ProxyUrl "http://127.0.0.1:7890"
```

或者手动设置：
```powershell
setx HTTPS_PROXY "http://127.0.0.1:7890"
setx HTTP_PROXY "http://127.0.0.1:7890"
setx ALL_PROXY "http://127.0.0.1:7890"
setx NO_PROXY "localhost,127.0.0.1,::1"
setx NODE_OPTIONS "--use-env-proxy"
```

---

## 🚀 插件加载与使用方法

### 方式 A：直接加载本目录源码（本地开发/测试推荐）

在 Pi 启动时直接加载本插件：

```bash
pi -e ./extensions/antigravity/src/index.ts
```

### 方式 B：通过 npm 源全局安装

```bash
pi install npm:pi-antigravity
```

---

## 🎮 使用指令流程

1. **登录 Google 账号**：
   ```text
   /login antigravity
   ```
   > 浏览器自动弹出 Google OAuth 页面，使用已开通 Cloud Code Assist 的账号完成授权。

2. **选择模型**：
   ```text
   /model antigravity/gemini-3.7-flash
   ```

3. **查看配额与诊断**：
   - `/antigravity.models`：查看当前账号的可用模型列表与实时共享配额。
   - `/antigravity.usage`：查看配额组与下一次重置时间。
   - `/antigravity.doctor`：输出脱敏诊断信息，排查网络和端点问题。

---

## ⚠️ 注意事项与安全须知 (CRITICAL)

1. 🔒 **Token 凭证安全**：
   - OAuth 授权成功后的 Refresh Token 保存在 `~/.pi/agent/auth.json` 中。
   - **严禁将 `auth.json` 复制到公开仓库或发给他人**（本仓库 `.gitignore` 已配置忽略）。
2. 🌐 **代理软件依赖**：
   - 设置环境变量后，必须保证代理软件（如 Clash 7890）正常运行。
   - 若代理软件关闭，Node 进程发起请求会报错 `ECONNREFUSED`。
3. 🔑 **权限范围说明**：
   - OAuth 登录请求包括 `aicode`、`cloud-platform` 等权限，仅与 Google 官方服务器通信。
