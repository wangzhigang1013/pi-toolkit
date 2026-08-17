# Antigravity 核心技术解析、踩坑复盘与企业复用指南 🛠️

> **文档定位**：供工程师或企业 AI 助手在复用本套方案时，快速理解底层通信机制、避开全部已知技术陷阱，实现开箱即用。

---

## 🏗️ 一、系统架构与运行环境对比

```text
[用户交互层]      Pi Web (@agegr/pi-web) / Pi CLI TUI
                         │ (RPC / TUI Events / SSE Stream)
                         ▼
[插件代理层]      pi-antigravity (Extensions / Providers / Tools)
                         │ (Google OAuth 2.0 PKCE / HTTP CONNECT 代理)
                         ▼
[底层运行时]      Node.js v22/v24 (需激活 --use-env-proxy 代理支持)
                         │ (fetch POST / v1internal:streamGenerateContent)
                         ▼
[云端提供商]      Google Cloud Code Assist (Antigravity Gateway)
                         ├── Gemini 3.7 / 3.6 / 3.5 / Pro (Google Native)
                         ├── Claude 3.7 / Sonnet 4.6 / Opus 4.6 (Anthropic Vertex)
                         └── GPT-OSS 120B (OpenAI Vertex)
```

---

## ⚠️ 二、核心技术陷阱与解决方案（四大致命坑）

### 坑 1：OAuth 换 Token 报错 `fetch failed`（国内网络/代理陷阱）

* **现象**：浏览器能成功弹出 Google OAuth 登录并显示 `complete`，但 Pi 终端在交换 Token 时报 `Error: Failed to login to Antigravity: fetch failed`。
* **底层根因**：
  - 浏览器走的是系统代理，因此网页授权顺利。
  - Pi 运行在 Node.js 环境（Node 22/24），Node 原生内置的 `fetch`（undici）**默认忽略操作系统的 `HTTPS_PROXY` 环境变量**，直连 Google 超时。
* **解决方案**：
  必须为 Node 进程注入 `--use-env-proxy` 参数，并配置用户环境变量：
  ```powershell
  setx HTTPS_PROXY "http://127.0.0.1:7890"
  setx HTTP_PROXY "http://127.0.0.1:7890"
  setx ALL_PROXY "http://127.0.0.1:7890"
  setx NO_PROXY "localhost,127.0.0.1,::1"
  setx NODE_OPTIONS "--use-env-proxy"
  ```
  *(设置后必须完全重启终端/Pi 进程生效)*

---

### 坑 2：Pi Web 中思考过程完全消失 / 无法唤醒

* **现象**：在 Pi Web 使用 Gemini 3.7 / 3.6 / Claude 等模型时，直接出答案或直接调工具，中间完全没有思考过程。
* **底层根因**：
  1. **缺少 `includeThoughts: true`**：Google Gemini / Cloud Code Assist API 在挂载了工具列表（Function Declarations）时，**若未显式指定 `generationConfig.thinkingConfig.includeThoughts = true`，云端会自动关闭工具调用前的思考流输出**！
  2. **思考强度被静默降级**：原版 `thinkingLevelMap` 丢失了 `max` / `xhigh` 映射（设为 `null`）。Pi Web 默认以最高强度 `max` 请求，导致 Provider 判定为不支持思考，自动降级为 `off` 或 non-thinking 运行时（如 `gemini-3.5-flash-extra-low`、`gemini-pro-low`）。
* **解决方案**：
  1. 在 `models.ts` 中全量补齐 `thinkingLevelMap` 映射（`max` -> `"high"`, `xhigh` -> `"high"`, `low` -> `"low"`）。
  2. 在 `stream.ts` 的 `buildRequest` 中强制注入：
     ```ts
     if (model.reasoning) {
       generationConfig.thinkingConfig = {
         includeThoughts: options.reasoning !== "off",
         thinkingLevel: options.reasoning === "medium" ? "MEDIUM" : options.reasoning === "low" ? "LOW" : "HIGH",
       };
     }
     ```
  3. `streamAntigravity` 入口处确保 `reasoning` 默认回退到 `"high"` 而非 `"off"`。

---

### 坑 3：正文内容被错误“折叠吞进”思考块（状态机单向锁修复）

* **现象**：模型回答的正文被全部截断折叠进思考卡片里，正文区一片空白；或者带有反引号/符号时正文消失。
* **底层根因**：
  - **Pi Web 的前端折叠渲染算法**：Pi Web 在切分“思考过程”与“最终回复”时，寻找的是消息内容数组中的 **最后一个非文本块（last non-text block）**。一旦在正文之后出现任何 `thinking` 块，Pi Web 会将该思考块之前的所有正文**全部当成处理过程折叠隐藏**！
  - **流式状态机缺陷**：之前尝试用文本匹配符号来识别思考，导致正文中的符号或模型偶发输出重新开启了 thinking 块。
* **解决方案**：
  - **彻底移除一切文本符号/正则匹配**，100% 依赖 Google 后端协议原生下发的 `part.thought === true` 字段。
  - **引入单向流锁（`textStarted`）**：在流式生成过程中，一旦模型开始输出正式回复（`textStarted = true`），该轮对话**永久锁定为文本输出状态**，禁止后续任何数据重新开启 thinking 块，彻底从机制上杜绝正文被折叠。

---

### 坑 4：`/antigravity.usage` 额度查询闪退消失

* **现象**：在 Pi Web 输入 `/antigravity.usage` 查看剩余配额时，信息在右上角/顶部弹窗一闪而过（3 秒自动消失），来不及看。
* **底层根因**：
  - 原版扩展仅调用了 `ctx.ui.notify`（临时角标 Toast），Pi Web 默认 3 秒自动隐藏；同时 `console.log` 只输出到后台终端，不进聊天窗口。
* **解决方案**：
  1. **注册专属 Tools**：注册 `antigravity_usage`、`antigravity_models`、`antigravity_doctor` 工具，让用户可以通过自然语言直接问（如“查一下配额”），在聊天流中以 Markdown 表格形式永久留存。
  2. **升级 Slash 命令**：改用 `ctx.ui.editor` / `ctx.ui.confirm` 弹出居中模态对话框，用户阅读完毕前绝不自动关闭。

---

## 🚀 三、企业/新环境 4 步快速复用部署清单

如果明天需要在公司电脑或新机器上部署复用：

### 步骤 1：配置代理与 Node 参数（1 分钟）
在 PowerShell 中运行本仓库提供的脚本：
```powershell
cd extensions/pi-antigravity
.\setup-env.ps1 -ProxyUrl "http://127.0.0.1:7890"  # 填入公司实际代理端口
```

### 步骤 2：部署修补后的插件源码
直接使用本仓库已修复全套 Bug 的 `extensions/pi-antigravity/` 目录：
```bash
# 方式 A：直接在当前项目中引用（推荐）
pi -e ./extensions/pi-antigravity/src/index.ts

# 方式 B：或复制到全局扩展目录
# 将 extensions/pi-antigravity 复制到 ~/.pi/agent/npm/node_modules/pi-antigravity/
```

### 步骤 3：OAuth 登录授权
重新打开终端或在 Pi Web 中执行：
```text
/login antigravity
```
在弹出的浏览器完成 Google 登录授权。

### 步骤 4：选模型使用
```text
/model antigravity/gemini-3.7-flash
```
直接在聊天中说：“查一下 Antigravity 配额”，验证工具与思考流均正常工作。
