# pi-antigravity 插件深度适配与使用指南 🪐

本目录收录 **Google Antigravity (Cloud Code Assist)** 扩展在 Pi 及 **Pi Web (`@agegr/pi-web`)** 环境下的深度适配方案、国内网络代理配置与常见问题解答。

---

## 🚀 1. Pi Web 深度适配优化（核心升级）

针对在 Pi Web 网页端使用 Antigravity 时的两大痛点，已完成底层适配优化：

### 痛点 1：看不到思考过程（Thinking / Reasoning 折叠块）
- **原理解析**：
  1. 原版扩展中 `generationConfig.thinkingConfig` 缺少了关键参数 **`includeThoughts: true`**。在 Google Gemini API 及 Cloud Code Assist 中，当向模型提供工具函数（Function Calling）时，**若未显式指定 `includeThoughts: true`，云端会自动关闭工具调用前的思考过程输出**！
  2. 原版仅针对 `gemini-3.7-flash-tiered` 设置了部分配置，对 `gemini-3.6-flash`、`gemini-3.5-flash`、`gemini-3.1-pro`、`claude-opus-4-6`、`claude-sonnet-4-6` 完全遗漏了思考配置。
  3. `thinkingLevelMap` 原版将 `max` 与 `xhigh` 设为了 `null`，导致在 Pi Web（默认最高思考强度 max）下被识别为不支持思考并静默降级。
- **优化方案**：
  - 全量在 `generationConfig.thinkingConfig` 中注入 `includeThoughts: true` 与对应思考级别（`HIGH` / `MEDIUM` / `LOW`）。
  - 补齐所有标准思考档位映射，确保在工具调用前与最终回复前，均能完整流式渲染思考卡片。

### 痛点 2：`/antigravity.usage` 弹窗闪退、无法常驻查看
- **原理解析**：原版扩展仅通过 `ctx.ui.notify`（临时角标 Toast 弹窗）来显示，几秒钟就自动淡出消失，且在 Web 聊天界面中无法留存。
- **优化方案**：
  1. **对话直查（永久留存）**：注册了 `antigravity_usage`、`antigravity_models`、`antigravity_doctor` 专属工具。在 Pi Web 对话中直接说「帮我查一下 Antigravity 剩余配额」或「列出可用模型」，Agent 将自动调用工具并在聊天流中输出永久保存的 Markdown 配额表格。
  2. **升级 Slash 命令（持久居中模态弹窗）**：在 Pi Web 中执行 `/antigravity.usage` 时，改为调用 `ctx.ui.editor` / `confirm` 弹出居中的持久对话框，不会自动消失，用户查看完毕后可手动点击关闭。

---

## 📖 2. 支持的模型列表

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

## ⚡ 3. 国内网络代理配置（必看避坑）

### 为什么会出现 `fetch failed`？
- **浏览器能正常打开授权**：浏览器走系统代理。
- **Pi 内部换 Token 失败**：官方 Pi 运行在 Node.js 环境（Node 22/24），Node 原生内置的 `fetch` 默认**忽略**环境变量代理，导致请求直连 Google 超时。

### 解决方案：一键配置脚本

必须同时设置代理变量并开启 Node 的代理支持开关 `NODE_OPTIONS=--use-env-proxy`。

#### Windows 用户（PowerShell）：
运行本目录下的 `setup-env.ps1`，或手动执行：
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

> **⚠️ 关键提示**：设置环境变量后，**必须完全关闭并重新启动 Pi / Pi Web 服务**，新环境变量才会生效。

---

## 🚀 4. 安装与使用指引

### 安装命令
```bash
pi install npm:pi-antigravity
```

### 登录授权
在终端或 Pi Web 聊天框输入：
```text
/login antigravity
```
在弹出的浏览器窗口中完成 Google OAuth 授权。

### 切换模型
```text
/model antigravity/gemini-3.7-flash
```

---

## 🛠️ 5. 配额查询与操作方式（Web 端体验优化）

在 Pi Web 中，推荐以下两种方式查看配额与模型：

1. **方式 A：自然语言对话（推荐 🌟）**
   - 直接发送：“帮我查一下 Antigravity 当前剩余配额”
   - 直接发送：“Antigravity 有哪些可用模型？”
   - Agent 会调用内置工具输出完整 Markdown 表格，永久保留在聊天记录中。

2. **方式 B：斜杠命令（Slash Commands）**
   - `/antigravity.usage`：弹出居中的持久对话框，展示完整的配额条与重置时间，手动关闭。
   - `/antigravity.models`：列出所有运行时模型与共享配额百分比。
   - `/antigravity.doctor`：查看连接端点、Project ID 与诊断日志。

---

## ⚠️ 6. 常见注意事项 (FAQ)

1. **凭证安全**：OAuth 凭据存储在 `~/.pi/agent/auth.json`，请勿公开该文件。
2. **代理守护**：开启代理变量后，需保持代理客户端（如 Clash 7890 端口）处于开启状态。
3. **刷新生效**：修改扩展源码或重新安装后，请在 Pi Web 中运行 `/reload` 或重启 `pi-web` 服务。
