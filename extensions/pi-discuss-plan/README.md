# 📋 discuss-plan —— 方案模式（你来拍板版）+ 修改模式（只改不跑版）

为 pi 定制的两个工作模式扩展，解决两类实际问题：

1. **方案模式**（`/plan`）：讨论式规划，方案写入项目 `.plans/` 目录（独立文件），你说"开始执行"才执行
2. **修改模式**（`/edit · 只改不跑`）：只允许修改本地文件 + 运行只读命令，**执行类命令一律拦截**（python/node/npm/curl 等跑不了），确需运行须通过 `run_request` 请求用户批准；可以查 web 与飞书文档

---

## 安装（公司/团队分发）

### 方式 A：内网 git 仓库（推荐，可版本管理）

把本包推送到内网 git（如 gitlab），同事安装：

```bash
pi install git:gitlab.company.com/team/pi-discuss-plan
# 或指定版本 tag
pi install git:gitlab.company.com/team/pi-discuss-plan@v1.0.0
```

### 方式 B：本地目录/拷贝

把本目录拷到目标机器任意位置后：

```bash
pi install /绝对/路径/pi-discuss-plan
```

> 本地路径方式 settings 只记录引用路径（不复制），包目录不要删；也可以直接放在
> `~/.pi/agent/extensions/` 下（与源码同目录），那样无需 install 即自动发现。

### 方式 C：公司私有 npm registry

发布后 `pi install npm:@company/pi-discuss-plan@1.0.0`（需先配置 npm registry）。

### 验证 / 卸载 / 升级

```bash
pi list                    # 查看已安装包
pi remove pi-discuss-plan  # 卸载（git/npm 源用完整 spec，如 pi remove git:...）
pi update --extensions     # 升级全部包
pi update npm:@company/pi-discuss-plan  # 升级单个包
```

> 安装/升级后需 `/reload` 或重启 pi 生效。

### 个人配置文件（可选）

修改模式的白名单可用 `~/.pi/agent/discuss-edit.json` 自定义（模板见 `examples/`）：

```json
{
  "extraEditTools": ["web_search", "fetch_content", "lark_doc_fetch"],
  "readOnlyCommands": ["你公司的私有只读 CLI"]
}
```

---

> ⚠️ 安全提示：pi 扩展以用户全权限运行，安装前请先 review 源码（`extensions/discuss-plan.ts`）。
> 校验逻辑复用 @piex-dev/plan (MIT) 的词法级只读白名单实现。

# 一、方案模式（/plan）

与 Codex 式"模型自主提交方案"不同，**完成权完全在你手里**：
方案写入项目 `.plans/` 目录下的独立文件，反复讨论修订，直到你说"开始执行"。

## 工作流

```
/plan                  → 进入方案模式（状态栏显示 📋 方案·PLAN-<会话短id>-<HHmmss>）
你：帮我做 XXX
模型：探索项目 → 把方案写入方案文件 → 输出要点供你审阅
你：第 2 步用 LLM 还是模板？        ← 随时提问
模型：修订方案文件 → 说明改了什么
你：开始执行吧                      ← 唯一的"完成"信号
→ 弹窗选择：在当前窗口执行 / 在新窗口执行 / 继续讨论
```

## 用法

| 操作 | 方式 |
|---|---|
| 进入方案模式 | `/plan` 或 `pi --plan`（启动即进入） |
| 退出方案模式 | `/plan` 再按一次，或对模型说"退出方案模式"，或 `/plan exit` |
| 写/更新方案 | 模型用 `plan_update` 工具自动写入方案文件 |
| 触发执行 | 明确说"开始执行 / 执行吧 / 动手吧 / 开干"，模型调用 `plan_execute` 弹窗询问执行方式 |
| 新窗口执行 | 弹窗选"在新窗口执行"后，**手动在输入框输入 `/plan-execute-new`** 触发（pi 平台限制：扩展消息不触发命令处理器，仅手动输入有效）：新建会话、只携带方案（不含讨论过程） |
| 查看状态 | 状态栏：`📋 方案·PLAN-<会话短id>-<HHmmss>`（讨论中）/ 同前 · 已就绪 |

## 多窗口并行规划（不抢文件）

方案文件**确定性命名**：`.plans/PLAN-<会话短id>-<HHmmss>.md`（参考 Claude Code `.claude/plans/`、Codex `.codex/plans/` 的目录+命名约定）。
- 每个窗口（会话）的短 id 不同 → **天然隔离，无需锁**
- 同一窗口每次进入的时刻不同 → **历史保留，不覆盖旧方案**
- 同一轮讨论内 `plan_update` 更新同一文件（活文档语义）
- 建议把 `.plans/` 加入 `.gitignore`（方案是工作产物，一般不入库）

---

# 二、修改模式（/edit · 只改不跑）

## 解决的问题

模型改完代码后**擅自跑数据**：还没调试完就疯狂尝试执行（python 跑管线、curl 调 LLM 接口），浪费时间和 token。修改模式让模型**只能改文件 + 跑只读命令**，执行类命令一律拦截；确需运行时必须通过 `run_request` 请求用户批准。

## 能力边界

| 类别 | 允许 | 禁止 |
|---|---|---|
| 文件查看 | `read` / `grep` / `find` / `ls` | — |
| 文件修改 | `edit` / `write` | — |
| 只读命令 | `cat`/`head`/`tail`/`grep`/`find`/`ls`/`pwd`/`wc`/`sort`/`uniq`/`diff`/`file`/`stat`/`du`/`df`/`tree`/`which`/`whereis`/`type`/`printenv`/`uname`/`whoami`/`id`/`date`/`uptime`/`ps`/`jq`/`rg`/`fd`/`bat`/`eza`（支持 `-i`、通配符 `*.py`、`2>/dev/null`/`2>&1` 等安全用法，`;`/`|`/`&&` 组合逐段校验）；`git` 只读子命令（status/log/diff/branch/remote/ls-files/grep/rev-parse/blame/describe/merge-base/ls-tree/cat-file）；**`lark-cli`（全部子命令，读飞书用）** | — |
| 执行类命令 | — | **一切**：python/python3/py、node/npm/npx/deno/bun、pip/conda、curl/wget、tsc、pytest、make、docker（**含 `--version`**）、git 写操作（commit/push/checkout…）、rm/mv/cp/mkdir/tee 等写命令、重定向/管道/脚本展开 |
| 运行批准 | `run_request`（弹窗确认，用户批准后执行并返回输出；每次都要批准，不记忆） | — |
| 资料查询 | `web_search` / `fetch_content` / `lark_doc_fetch`（飞书文档） | — |

## 三道防线（执行类命令一律跑不了）

1. **命令级白名单**：bash 工具在激活列表内，但每条命令经词法级只读校验（复用方案模式的 `isSafeCommand` + 修改模式严格策略）——只放行纯只读命令，python/node/npm/curl 等执行类命令全部拦截
2. **拦截兜底**：即使工具被手动激活（如 `/tools`），白名单外的工具调用与不安全命令一律被拦截
3. **提示词约束**：系统提示词明确列出全部允许/禁止项，并禁止一切间接执行方式（写脚本、藏命令、暗示用户代跑）

## run_request（运行授权）

修改模式下模型想运行执行类命令（如 `python run.py`、`curl` 调接口）时，**唯一通道**是调用 `run_request` 工具：

1. 模型调用 `run_request`，传 `command`（完整命令）与 `reason`（运行目的）
2. 弹确认框显示命令原文 + 原因，你选择批准或拒绝
3. 批准 → 扩展代为执行（项目目录下，限时 60s，输出截断 40KB）并把输出返回模型；拒绝 → 模型继续改代码

> 每次调用都弹确认，**绝不记忆批准**——"跑模型"的控制权始终在你手里。

## 用法

| 操作 | 方式 |
|---|---|
| 进入修改模式 | `/edit` 或 `pi --edit`（启动即进入） |
| 退出修改模式 | `/edit` 再按一次，或对模型说"退出修改模式"，或 `/edit exit` |
| 查看状态 | 状态栏显示 `📝 修改模式·只改不跑` |

## 与方案模式的关系

两种模式**互斥**：进入一个自动退出另一个（`/plan` ↔ `/edit`）。

---

# 三、飞书文档查询（lark_doc_fetch）

修改模式下可以读取飞书线上文档。扩展内置 `lark_doc_fetch` 工具：
- 包装飞书官方 CLI（`@larksuite/cli`，命令 `lark-cli`）的**只读** `markdown +fetch` 命令
- 只读，绝不修改线上内容；`windowsHide` 保证不弹出任何控制台窗口
- 支持传文档 URL（自动提取 token）或直接传 token
- 需要机器上已安装 `@larksuite/cli`（`npm install -g @larksuite/cli`）并已登录（`lark-cli doctor` 检查）

## 附加白名单配置

修改模式的附加工具白名单默认是：
`web_search`、`fetch_content`、`lark_doc_fetch`

想加更多（比如你的其他查询工具），创建 `~/.pi/agent/discuss-edit.json`：

```json
{
  "extraEditTools": ["web_search", "fetch_content", "lark_doc_fetch", "你的工具名"],
  "readOnlyCommands": ["你的只读命令名"]
}
```

- `extraEditTools`：追加查询类工具。**只应放纯查询/只读类工具**——任何有执行能力的工具放进去都会破坏"只改不跑"的保证
- `readOnlyCommands`：追加 bash 只读命令白名单（默认已有 `lark-cli`），仍会过参数级写检查（`-i`/`--delete` 等参数会被拦截）

改完 `/reload` 生效。配置文件缺失或损坏时自动回退默认值。

---

# 运行时文件（本机）

- 扩展：包安装到 `~/.pi/agent/npm/`（npm 源）或 `~/.pi/agent/git/`（git 源）后自动加载；`/reload` 热重载
- 方案文件：项目 `.plans/PLAN-<会话短id>-<HHmmss>.md`（每个窗口每次进入独立文件，多窗口天然隔离、历史保留；建议加入 `.gitignore`）
- 修改模式配置：`~/.pi/agent/discuss-edit.json`（可选，见上文模板）

# 修改扩展

`extensions/discuss-plan.ts` 是单文件、全中文注释。改完本地源码后：

```bash
# 本机（个人环境）直接放 ~/.pi/agent/extensions/ 下，/reload 生效
# 团队分发：改完推 git → 同事 pi update --extensions
```

类型检查（需 typebox 与 typescript）：

```bash
npm install
./node_modules/.bin/tsc --noEmit
```
