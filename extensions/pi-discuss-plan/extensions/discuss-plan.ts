/**
 * discuss-plan — 讨论式方案模式（Plan Mode，你来拍板版）+ 修改模式（Edit Mode，只改不跑版）
 *
 * 一、方案模式：完成权完全在你手里：
 *
 *   /plan                → 进入方案模式（只读探索 + 方案写入 .plans/PLAN-<会话>-<时间戳>.md）
 *   你：帮我做 XXX
 *   模型：探索项目 → 把方案写入方案文件 → 输出要点供你审阅
 *   你：第 2 步用 LLM 还是模板？
 *   模型：修订方案文件 → 说明改了什么
 *   你：开始执行吧        ← 唯一的"完成"信号
 *   → 弹窗选择：当前窗口执行 / 新窗口执行 / 继续讨论
 *
 * 二、修改模式：能改文件、不能执行任何东西（工作场景：模型改完代码就擅自跑数据）：
 *
 *   /edit                → 进入修改模式（read/edit/write/grep/find/ls + 查询类工具）
 *   模型：改代码 → 精准说明改动
 *   （bash 完全禁用，python/node/npm/curl 等一切命令都跑不了，包括间接方式）
 *   你可以：web_search / fetch_content 查公开资料，lark_doc_fetch 查飞书文档
 *
 * 核心设计（方案模式）：
 * - 没有 plan_complete 之类的"自动提交"工具，模型永远不能自己宣布方案完成；
 *   它只能持续讨论、持续用 plan_update 更新本会话的方案文件。
 * - plan_update 是方案模式下唯一允许的写操作（把完整方案写入方案文件）。
 * - 用户说"开始执行"时，模型调用 plan_execute 工具，弹窗询问执行方式。
 * - 新窗口执行通过 ctx.newSession() 实现（只携带方案，不携带讨论过程）。
 * - 多窗口并行规划不抢文件：方案文件确定性命名（.plans/PLAN-<会话短id>-<HHmmss>.md），
 *   每个窗口每次进入都是独立文件，天然隔离、历史可追溯，无需锁。
 *   （参考 Claude Code .claude/plans/、Codex .codex/plans/ 的目录+命名约定）
 *
 * 核心设计（修改模式）：
 * - 严格工具白名单：只有核心读写工具 + 查询类工具，bash 不在其中。
 * - tool_call 拦截兜底：即使工具被手动激活，白名单外一律拦截（含一切 bash，
 *   因此 python 无论直接还是间接方式都无法执行）。
 * - lark_doc_fetch 包装 lark-cli 的只读 fetch 命令（windowsHide 不弹黑窗口）。
 *
 * 依赖：@earendil-works/pi-coding-agent（pi 运行时注入）、typebox（本目录 node_modules）。
 * bash 只读安全策略（方案模式用）：复用 @piex-dev/plan (MIT) 的词法级白名单实现。
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

// ══════════════════════════════════════════════════════════════════════
// 常量
// ══════════════════════════════════════════════════════════════════════

const STATE_ENTRY_TYPE = "discuss-plan"; // appendEntry 的 customType，用于持久化
const STATUS_KEY = "discuss-plan"; // 状态栏 key

// ── 修改模式（Edit Mode）相关常量 ────────────────────────────────────
// 目标：能改文件、不能执行任何东西（bash 完全禁用，Python 等一律跑不了），
// 但可以调用查询类工具（web 搜索、飞书文档）。

// 修改模式的内置核心工具（只读 + 编辑 + bash——bash 受严格只读白名单约束）
const EDIT_CORE_TOOLS = ["read", "edit", "write", "grep", "find", "ls", "bash"];

// 修改模式附加白名单（查询类工具）：
// - web_search / fetch_content：pi-web-access 提供的 web 查询
// - lark_doc_fetch：本扩展提供的飞书文档只读查询（包装 lark-cli markdown +fetch）
// 想加更多工具：编辑 ~/.pi/agent/discuss-edit.json 的 extraEditTools 数组即可（见 README）
const DEFAULT_EXTRA_EDIT_TOOLS = ["web_search", "fetch_content", "lark_doc_fetch"];

// 修改模式配置文件（可选，缺失时用默认值）
const EDIT_CONFIG_FILE = "discuss-edit.json";

// 修改模式专用工具（退出模式后从工具列表移除）
const EDIT_ONLY_TOOLS = new Set(["edit_exit", "run_request"]);

// 读取修改模式附加白名单（配置文件优先，容错回退默认值）
function loadExtraEditTools(): string[] {
  const agentDir =
    process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), ".pi", "agent");
  try {
    const raw = fs.readFileSync(path.join(agentDir, EDIT_CONFIG_FILE), "utf8");
    const parsed = JSON.parse(raw) as { extraEditTools?: unknown };
    if (
      Array.isArray(parsed.extraEditTools) &&
      parsed.extraEditTools.every((t) => typeof t === "string")
    ) {
      return [...new Set(parsed.extraEditTools)];
    }
  } catch {
    /* 配置文件不存在或损坏：用默认值 */
  }
  return [...DEFAULT_EXTRA_EDIT_TOOLS];
}

// 读取修改模式 bash 额外放行命令（readOnlyCommands，配置文件优先，容错回退空）
function loadReadOnlyCommands(): string[] {
  const agentDir =
    process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), ".pi", "agent");
  try {
    const raw = fs.readFileSync(path.join(agentDir, EDIT_CONFIG_FILE), "utf8");
    const parsed = JSON.parse(raw) as { readOnlyCommands?: unknown };
    if (
      Array.isArray(parsed.readOnlyCommands) &&
      parsed.readOnlyCommands.every((c) => typeof c === "string")
    ) {
      return [...new Set(parsed.readOnlyCommands)];
    }
  } catch {
    /* 配置文件不存在或损坏：用默认值 */
  }
  return [];
}

// 修改模式 bash 严格白名单：纯只读命令 + lark-cli（D4：全放行，无本地执行能力）+ 配置追加
// 注意：READ_ONLY_COMMANDS 在文件后部定义，函数运行时才求值，声明顺序无影响。
function getEditReadOnlyCommands(): Set<string> {
  return new Set([...READ_ONLY_COMMANDS, "lark-cli", ...loadReadOnlyCommands()]);
}

// 修改模式激活工具 = 核心白名单 + 附加白名单 + 模式专用工具（严格白名单，不保留其他工具）
function getEditTools(): string[] {
  return [...new Set([...EDIT_CORE_TOOLS, ...loadExtraEditTools(), ...EDIT_ONLY_TOOLS])];
}

// 查找 lark-cli 可执行文件（npm 全局包内的原生二进制，可直接 execFile 调用）
function findLarkCli(): string | undefined {
  const candidates = [
    path.join(
      process.env.APPDATA ?? "",
      "npm",
      "node_modules",
      "@larksuite",
      "cli",
      "bin",
      "lark-cli.exe",
    ),
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

// 从飞书文档 URL 中提取 token（https://xxx.feishu.cn/docx/<token> 等），非 URL 则原样返回
function extractLarkToken(document: string): string {
  const trimmed = document.trim();
  const urlMatch = trimmed.match(
    /https?:\/\/[^\s]+\/(?:docx|docs|wiki|file)\/([A-Za-z0-9]+)/,
  );
  return urlMatch ? urlMatch[1] : trimmed;
}

// 方案模式下被禁用的内置工具
const PLAN_BLOCKED_TOOLS = new Set(["edit", "write", "update_plan"]);

// 方案模式专用工具（退出模式后从工具列表移除）
const PLAN_ONLY_TOOLS = new Set(["plan_update", "plan_execute", "plan_exit"]);

// 方案模式激活的工具 = 现有工具去掉写类工具 + 三个专用工具
function getPlanTools(active: string[]): string[] {
  return [...new Set([
    ...active.filter((name) => !PLAN_BLOCKED_TOOLS.has(name)),
    ...PLAN_ONLY_TOOLS,
  ])];
}

// 退出后恢复的工具 = 现有工具去掉专用工具
function getNormalTools(active: string[]): string[] {
  return [
    ...new Set(
      active.filter(
        (name) => !PLAN_ONLY_TOOLS.has(name) && !EDIT_ONLY_TOOLS.has(name),
      ),
    ),
  ];
}

// ══════════════════════════════════════════════════════════════════════
// 方案模式协议提示词（每轮注入 system prompt）
// ══════════════════════════════════════════════════════════════════════

const PLAN_MODE_PROMPT = `[方案模式 DISCUSS-PLAN ACTIVE]

你正处于"方案模式"。目标：与用户反复讨论，把方案写进项目 .plans/ 目录下的方案文件，直到用户明确下令执行。

## 硬性规则
1. 只读探索：可以用 read / grep / find / ls / 只读 bash 调研项目；禁止修改任何文件（方案文件除外）、禁止安装依赖、禁止提交代码、禁止任何变更操作。

### bash 命令边界（重要，违反会被拦截）
- **允许的只读命令**：cat / head / tail / grep / find / ls / pwd / wc / sort / uniq / diff / file / stat / du / df / tree / which / type / printenv / uname / whoami / id / date / uptime / ps / jq / rg / fd / bat / eza；git 只读子命令（status/log/diff/branch/remote/ls-files/grep/rev-parse/blame/describe/merge-base/ls-tree/cat-file）；lark-cli（读飞书用）。
- **禁止的一切执行类命令**：python / python3 / py / node / npm / npx / pip / conda / curl / wget / tsc / pytest / make / docker 等（含 python -c、任何脚本执行、--version 之外的用法）；禁止 git 写操作、文件写命令、重定向写文件、$ 变量展开。
- **探索项目优先用 read 工具**：想看文件内容、解析结构、查看数据，直接用 read / grep / find，不要用 python 命令（即使只是读文件也会被拦截）。
- **rtk 改写属正常现象**：你的 grep/find/ls 等命令可能被 rtk-optimizer 插件自动改写为「export ...; rtk grep ...」形式，结果等价、无需处理，不要因此怀疑命令出错。

2. 方案维护：每轮讨论结束后，调用 plan_update 工具把"完整方案全文"写入本会话的方案文件（全量覆盖，不是增量；文件路径以 plan_update 返回结果为准，形如项目 .plans/PLAN-<会话短id>-<HHmmss>.md——每个窗口每次进入都是独立文件，多窗口互不干扰、历史保留）。若该方案文件已存在，先 read 它，把既有方案作为讨论起点，除非用户要求重写。
3. 推荐方案结构：标题 / 背景与目标 / 关键决策与假设 / 实施步骤（编号） / 涉及文件与接口 / 验收标准 / 待讨论问题（如有）。
4. 讨论节奏：
   - 收到需求 → 先探索、必要时提问澄清 → 写入方案 → 用简洁要点向用户展示方案（方案文件是权威版本，不要全文复述）。
   - 用户提出疑问或修改意见 → 修订方案文件 → 简要说明本次改了什么。
   - 永远不要自己宣布"方案完成/定稿"。方案是否完成由用户决定，你只需要持续维护方案文件。
5. 触发执行：当用户明确说"开始执行 / 执行吧 / 动手吧 / 开干 / 按方案执行"等指令时，调用 plan_execute 工具，它会弹窗询问执行方式。在此之前，禁止自行开始实现方案。
6. 退出：用户说"退出方案模式"时，调用 plan_exit 工具；用户也可以直接输入 /plan 命令退出。`;

// ══════════════════════════════════════════════════════════════════════
// 修改模式协议提示词（每轮注入 system prompt）
// ══════════════════════════════════════════════════════════════════════

const EDIT_MODE_PROMPT = `[修改模式 EDIT-MODE ACTIVE · 只改不跑]

你正处于"修改模式"（只改不跑）。目标：**只修改本地文件 + 运行只读命令，禁止一切执行类命令**（防止改一下就跑模型/调接口，浪费 token）。

## 允许
1. 文件读写：read / edit / write / grep / find / ls。
2. 只读命令（bash）：cat / head / tail / grep / find / ls / pwd / wc / sort / uniq / diff / file / stat / du / df / tree / which / whereis / type / printenv / uname / whoami / id / date / uptime / ps / jq / rg / fd / bat / eza；git 只读子命令（status/log/diff/branch/remote/ls-files/grep/rev-parse/blame/describe/merge-base/ls-tree/cat-file）；lark-cli（任意子命令，读飞书用）。注意：grep/find/ls 等命令可能被 rtk-optimizer 插件自动改写为「export ...; rtk grep ...」形式，结果等价、无需处理。
3. 查询工具：web_search / fetch_content（查公开资料）；lark_doc_fetch（读取飞书线上文档）。

## 绝对禁止（违反即被拦截）
4. 禁止一切执行类命令：python / python3 / py / node / deno / bun / npm / npx / pip / conda / curl / wget / tsc / pytest / make / docker 等（含 --version、npm run 任意脚本）；禁止 git 写操作（commit/push/checkout/merge 等）；禁止 rm/mv/cp/mkdir/tee 等文件写命令；禁止重定向/管道/脚本展开（> < | ; $(...) 反引号）。
5. 禁止通过任何间接方式执行：不写临时脚本再运行、不把命令藏进注释或文件名、不暗示用户替你运行（运行与验证由用户自己决定）。
6. 如需运行被禁止的命令（如 python 脚本、curl 调接口），**唯一通道**：调用 run_request 工具请求用户批准，用户批准后才由扩展代为执行；用户拒绝则继续修改。
7. 你的全部工作就是：阅读代码、修改代码、用只读命令与查询工具获取资料。修改必须精准、最小化，每次修改后简要说明改了什么、为什么。
8. 退出：用户说"退出修改模式"时调用 edit_exit 工具；用户也可以直接输入 /edit 命令退出。`;

// ══════════════════════════════════════════════════════════════════════
// bash 只读安全校验
// 来源：@piex-dev/plan (MIT) —— shell 词法分析 + 白名单，拒绝一切写操作。
// 仅用于方案模式：拦截不安全的 bash 调用。
// ══════════════════════════════════════════════════════════════════════

const MUTATING_COMMANDS = new Set([
  "rm", "rmdir", "mv", "cp", "mkdir", "touch", "chmod", "chown", "chgrp",
  "ln", "tee", "truncate", "dd", "shred", "sudo", "su", "kill", "pkill",
  "killall", "reboot", "shutdown", "vim", "vi", "nano", "emacs", "code",
  "subl",
]);

const READ_ONLY_COMMANDS = new Set([
  "cat", "head", "tail", "grep", "find", "ls", "pwd", "echo", "printf",
  "wc", "sort", "uniq", "diff", "file", "stat", "du", "df", "tree",
  "which", "whereis", "type", "printenv", "uname", "whoami", "id", "date",
  "uptime", "ps", "jq", "rg", "fd", "bat", "eza",
]);

// 剥离安全的丢弃/合并流重定向（>/dev/null、2>/dev/null、2>&1、< /dev/null），
// 写文件重定向（> file、>> file）保留 → 由 splitShellSegments 拒绝。
const SAFE_REDIRECT_RE = /\s*[12]?>\s*(?:\/dev\/null|&[12])\s*/g;
const SAFE_INPUT_NULL_RE = /\s*<\s*\/dev\/null\s*/g;
function stripSafeRedirects(command: string): string {
  return command.replace(SAFE_REDIRECT_RE, " ").replace(SAFE_INPUT_NULL_RE, " ");
}

// ── rtk-optimizer 兼容：校验前还原被改写的命令 ──────────────────────────
//
// pi-rtk-optimizer（token 优化插件）会在 tool_call 事件里把 bash 命令改写，
// 常见形态：
//   export RTK_DB_PATH='...'; rtk grep -l xxx        （加 export 前缀 + rtk 化）
//   export RTK_DB_PATH='...'; grep -l xxx            （仅加 export 前缀）
//   PYTHONIOENCODING=utf-8 python -c "..."          （仅加环境变量）
//   pwd && rtk ls                                    （复合命令中 rtk 化某一段）
// 白名单校验器不认识这些包装 → 模型用安全的 grep 也会被误拦。
// 这里在校验前把 rtk 包装还原为命令本质（仅用于安全性判断，不影响实际执行
// ——实际执行的仍是 rtk 改写后的命令，rtk 的 token 优化能力完整保留）。
const RTK_ENV_ASSIGN_RE = /^(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*=(?:'[^']*'|"[^"]*"|[^;\s]*)\s*;?\s*/;
const RTK_SUBCOMMAND_RE = /\brtk\s+([a-z][a-z0-9-]*)(?=\s|$)/g;
function stripRtkRewrite(command: string): string {
  let c = command.trim();
  // 1) 剥离开头的环境变量赋值前缀（export A='...'; / A='...'; / A=B），可多个
  let prev: string;
  do {
    prev = c;
    c = c.replace(RTK_ENV_ASSIGN_RE, "");
  } while (c !== prev && c.trim() !== prev.trim());
  c = c.trim();
  // 2) 把 rtk <子命令> 还原为 <子命令>（含复合命令中的片段，如 pwd && rtk ls）
  return c.replace(RTK_SUBCOMMAND_RE, "$1");
}

function isSafeCommand(command: string, strict: boolean): boolean {
  const segments = splitShellSegments(stripSafeRedirects(command));
  return (
    segments !== undefined &&
    segments.length > 0 &&
    segments.every((segment) => isSafeSegment(segment, strict))
  );
}

function splitShellSegments(command: string): string[] | undefined {
  const trimmed = command.trim();
  if (!trimmed || /[\n\r`]/.test(trimmed)) return undefined;

  const segments: string[] = [];
  let quote: "'" | '"' | undefined;
  let escaped = false;
  let start = 0;
  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === ">" || character === "<" || character === "(" || character === ")") {
      return undefined;
    }
    const next = trimmed[index + 1];
    if (character === "&" && next !== "&") return undefined;
    const separatorLength =
      character === ";" || character === "|"
        ? next === character ? 2 : 1
        : character === "&" && next === "&" ? 2 : 0;
    if (separatorLength === 0) continue;
    const segment = trimmed.slice(start, index).trim();
    if (!segment) return undefined;
    segments.push(segment);
    index += separatorLength - 1;
    start = index + 1;
  }
  if (quote || escaped) return undefined;
  const finalSegment = trimmed.slice(start).trim();
  if (!finalSegment) return undefined;
  segments.push(finalSegment);
  return segments;
}

function isSafeSegment(segment: string, strict: boolean): boolean {
  if (hasShellExpansion(segment) || /(^|\s)[A-Za-z_][A-Za-z0-9_]*=/.test(segment)) {
    return false;
  }
  const tokens = shellWords(segment);
  if (!tokens || tokens.length === 0) return false;
  const command = tokens[0]?.toLowerCase();
  if (!command || MUTATING_COMMANDS.has(command)) return false;
  const args = tokens.slice(1);
  if (!hasSafeArguments(command, args)) return false;
  if (READ_ONLY_COMMANDS.has(command)) return true;
  // 修改模式（严格）：额外放行命令（lark-cli、配置追加）直接通过（已过参数写检查）
  if (strict && getEditReadOnlyCommands().has(command)) return true;
  return isSafeStructuredCommand(command, args, strict);
}

function hasShellExpansion(segment: string): boolean {
  let quote: "'" | '"' | undefined;
  let escaped = false;
  for (const character of segment) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = undefined;
      else if (character === "$" && quote === '"') return true;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    // 只禁 $（变量展开/命令替换）与反引号（由调用方另行拒绝）；
    // * ? [ { 是 glob/大括号参数展开，不执行命令，读取场景（如 ls *.py）应放行。
    if (character === "$") return true;
  }
  return false;
}

function shellWords(segment: string): string[] | undefined {
  const words: string[] = [];
  let word = "";
  let quote: "'" | '"' | undefined;
  let escaped = false;
  for (const character of segment) {
    if (escaped) {
      word += character;
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = undefined;
      else word += character;
      continue;
    }
    if (character === "'" || character === '"') quote = character;
    else if (/\s/.test(character)) {
      if (word) words.push(word);
      word = "";
    } else word += character;
  }
  if (quote || escaped) return undefined;
  if (word) words.push(word);
  return words;
}

function hasSafeArguments(command: string, args: string[]): boolean {
  // -i 已移除：仅对会原地写文件的命令构成风险（sed -i 已有专项检查；perl/awk 等根本不在白名单），
  // grep -i / rg -i 等只读用法不应被误伤。
  const forbidden = new Set(["--in-place", "--fix", "--write", "-delete", "--delete"]);
  if (args.some((argument) => forbidden.has(argument))) return false;
  if (
    command === "sed" &&
    args.some(
      (argument) =>
        argument.startsWith("--in-place=") ||
        (/^-[^-]+/.test(argument) && argument.slice(1).includes("i")),
    )
  ) {
    return false;
  }
  if (
    command === "find" &&
    args.some((argument) =>
      ["-exec", "-execdir", "-ok", "-okdir", "-fprint", "-fprint0", "-fprintf", "-fls"].includes(argument),
    )
  ) {
    return false;
  }
  if (
    command === "date" &&
    args.some((argument) => argument === "-s" || argument.startsWith("--set"))
  ) {
    return false;
  }
  if (
    (command === "sort" || command === "tree") &&
    args.some(
      (argument) =>
        argument === "-o" ||
        (argument.startsWith("-o") && !argument.startsWith("--")) ||
        argument.startsWith("--output"),
    )
  ) {
    return false;
  }
  if (
    command === "sort" &&
    args.some(
      (argument) =>
        argument === "-T" ||
        (argument.startsWith("-T") && argument.length > 2) ||
        argument.startsWith("--temporary-directory") ||
        argument.startsWith("--compress-program"),
    )
  ) {
    return false;
  }
  if (
    command === "diff" &&
    args.some((argument) => argument === "--output" || argument.startsWith("--output="))
  ) {
    return false;
  }
  if (
    command === "uniq" &&
    args.filter((argument) => !argument.startsWith("-")).length > 1
  ) {
    return false;
  }
  if (
    command === "fd" &&
    args.some((argument) =>
      ["-x", "-X", "--exec", "--exec-batch"].some(
        (flag) => argument === flag || argument.startsWith(`${flag}=`),
      ),
    )
  ) {
    return false;
  }
  if (
    command === "rg" &&
    args.some((argument) => argument === "--pre" || argument.startsWith("--pre="))
  ) {
    return false;
  }
  if (
    command === "bat" &&
    args.some((argument) => argument === "--pager" || argument.startsWith("--pager="))
  ) {
    return false;
  }
  return true;
}

type ArgumentValidator = (args: string[]) => boolean;
const allowReadOnlyArguments: ArgumentValidator = () => true;

const GIT_VALIDATORS: Record<string, ArgumentValidator> = {
  status: allowReadOnlyArguments,
  log: isSafeGitLogArguments,
  diff: isSafeGitDiffArguments,
  show: requiresNoTextconv,
  branch: isSafeGitBranchArguments,
  remote: isSafeGitRemoteArguments,
  "ls-files": allowReadOnlyArguments,
  grep: isSafeGitGrepArguments,
  "rev-parse": allowReadOnlyArguments,
  blame: requiresNoTextconv,
  describe: allowReadOnlyArguments,
  "merge-base": allowReadOnlyArguments,
  "ls-tree": allowReadOnlyArguments,
  "cat-file": isSafeGitCatFileArguments,
};

function isSafeStructuredCommand(command: string, args: string[], strict: boolean): boolean {
  if (command === "git") return isSafeGitCommand(args, strict);

  // 修改模式（严格）：禁止一切解释器/包管理器/构建测试命令（含 --version、npm run 等，D3）
  if (strict) return false;

  const subcommandIndex = args.findIndex((argument) => !argument.startsWith("-"));
  const subcommand = args[subcommandIndex]?.toLowerCase();
  if (command === "sed") {
    const script = args.find((argument) => !argument.startsWith("-"));
    return (
      Boolean(script) &&
      (args.includes("-n") ||
        args.some((argument) => /^-[^-]*n[^-]*$/.test(argument))) &&
      /^\d+(,\d+)?p$/.test(script ?? "")
    );
  }
  if (["node", "python", "python3", "tsc", "biome", "ruff", "ty"].includes(command)) {
    if (args.includes("--version")) return true;
    return (
      command === "tsc" &&
      args.includes("--noEmit") &&
      !args.some(
        (argument) =>
          argument === "--incremental" ||
          argument.startsWith("--incremental=") ||
          argument === "--tsBuildInfoFile" ||
          argument.startsWith("--tsBuildInfoFile=") ||
          argument === "--generateTrace" ||
          argument.startsWith("--generateTrace="),
      )
    );
  }
  if (command === "npm") {
    if (subcommand === "audit" && args.slice(subcommandIndex + 1).includes("fix")) return false;
    if (["list", "ls", "view", "info", "search", "outdated", "audit", "test"].includes(subcommand ?? "")) {
      return true;
    }
    return (
      subcommand === "run" &&
      ["test", "check", "typecheck", "lint"].includes(args[subcommandIndex + 1] ?? "")
    );
  }
  if (["cargo", "go", "pytest", "vitest", "jest"].includes(command)) {
    return (
      ["test", "check"].includes(subcommand ?? "") ||
      ["pytest", "vitest", "jest"].includes(command)
    );
  }
  return false;
}

function isSafeGitCommand(args: string[], strict: boolean): boolean {
  let subcommandIndex = 0;
  while (args[subcommandIndex] === "--no-pager") subcommandIndex += 1;
  const subcommand = args[subcommandIndex]?.toLowerCase();
  if (!subcommand || subcommand.startsWith("-")) return false;
  const subcommandArgs = args.slice(subcommandIndex + 1);
  // 修改模式（严格）：原版要求 git diff 带 --check 或 --no-ext-diff --no-textconv 才放行
  // （防 textconv 执行外部程序）；这里在已过 hasSafeGitArguments 危险参数检查
  // （拦截 --textconv/--ext-diff/--output 等）的前提下放行裸 diff，便于修改模式下查看改动。
  // 方案模式保持原版行为不变。
  if (strict && subcommand === "diff") {
    return hasSafeGitArguments(subcommand, subcommandArgs);
  }
  const validator = GIT_VALIDATORS[subcommand];
  return (
    validator !== undefined &&
    hasSafeGitArguments(subcommand, subcommandArgs) &&
    validator(subcommandArgs)
  );
}

function hasSafeGitArguments(subcommand: string, args: string[]): boolean {
  return !args.some(
    (argument) =>
      argument === "--help" ||
      argument === "--show-signature" ||
      argument.startsWith("--show-signature=") ||
      argument.includes("%G") ||
      argument === "--output" ||
      argument.startsWith("--output=") ||
      argument === "--ext-diff" ||
      argument.startsWith("--ext-diff=") ||
      argument === "--textconv" ||
      argument.startsWith("--textconv=") ||
      argument === "--paginate" ||
      argument === "--open-files-in-pager" ||
      argument.startsWith("--open-files-in-pager=") ||
      (subcommand === "grep" && (argument === "-O" || argument.startsWith("-O"))),
  );
}

function isSafeGitCatFileArguments(args: string[]): boolean {
  return !args.some(
    (argument) =>
      matchesLongOptionPrefix(argument, "--filters", "--fi") ||
      matchesLongOptionPrefix(argument, "--textconv", "--t"),
  );
}

function isSafeGitGrepArguments(args: string[]): boolean {
  return !args.some(
    (argument) =>
      matchesLongOptionPrefix(argument, "--textconv", "--textc") ||
      matchesLongOptionPrefix(argument, "--open-files-in-pager", "--op") ||
      matchesLongOptionPrefix(argument, "--ext-grep", "--ext"),
  );
}

function matchesLongOptionPrefix(argument: string, option: string, shortest: string): boolean {
  const optionName = argument.split("=", 1)[0] ?? "";
  return optionName.length >= shortest.length && option.startsWith(optionName);
}

function isSafeGitDiffArguments(args: string[]): boolean {
  return (
    args.includes("--check") ||
    (args.includes("--no-ext-diff") && args.includes("--no-textconv"))
  );
}

function isSafeGitLogArguments(args: string[]): boolean {
  if (args.includes("--no-textconv")) return true;
  return !args.some(requiresTextconvGuardForGitLog);
}

function requiresTextconvGuardForGitLog(argument: string): boolean {
  return (
    argument === "-p" ||
    argument.startsWith("-p") ||
    argument === "-u" ||
    argument.startsWith("-U") ||
    argument === "-c" ||
    argument === "--patch" ||
    argument.startsWith("--patch=") ||
    argument.startsWith("--patch-with-") ||
    argument === "--unified" ||
    argument.startsWith("--unified=") ||
    argument === "--binary" ||
    argument === "--cc" ||
    argument === "--remerge-diff" ||
    argument.startsWith("-S") ||
    argument.startsWith("-G") ||
    argument === "--find-object" ||
    argument.startsWith("--find-object=")
  );
}

function requiresNoTextconv(args: string[]): boolean {
  return args.includes("--no-textconv");
}

function isSafeGitBranchArguments(args: string[]): boolean {
  if (args.some((argument) => !argument.startsWith("-"))) return false;
  return !args.some(
    (argument) =>
      /^-[^-]*[dDmMcCu]/.test(argument) ||
      matchesLongOptionPrefix(argument, "--delete", "--del") ||
      matchesLongOptionPrefix(argument, "--move", "--mov") ||
      matchesLongOptionPrefix(argument, "--copy", "--cop") ||
      matchesLongOptionPrefix(argument, "--edit-description", "--e") ||
      matchesLongOptionPrefix(argument, "--unset-upstream", "--u") ||
      matchesLongOptionPrefix(argument, "--set-upstream-to", "--set-u") ||
      matchesLongOptionPrefix(argument, "--create-reflog", "--creat"),
  );
}

function isSafeGitRemoteArguments(args: string[]): boolean {
  const actionIndex = args.findIndex((argument) => !argument.startsWith("-"));
  if (actionIndex < 0) return true;
  const action = args[actionIndex];
  if (action === "get-url") return true;
  if (action !== "show") return false;

  const showArgs = args.slice(actionIndex + 1);
  if (showArgs.includes("--")) return false;
  const remotes = showArgs.filter((argument) => !argument.startsWith("-"));
  return (
    remotes.length === 0 || (remotes.length === 1 && showArgs.includes("-n"))
  );
}

// ══════════════════════════════════════════════════════════════════════
// 方案文件位置：.plans/ 目录 + 会话短 id + 时间戳（确定性命名，天然无冲突）
//
// 旧实现用「根目录 PLAN.md + 全局锁文件（pid 存活检测 + 心跳）」分配
// PLAN.md / PLAN-2.md…，但锁的读-改-写非原子（并发进入会都拿到 PLAN.md
// 互相顶掉）、且锁文件名对 cwd 字符串敏感（短路径/大小写差异会读到不同
// 锁）。现改为确定性命名：每个窗口每次进入方案模式都生成独立文件
//   .plans/PLAN-<会话短id>-<HHmmss>.md
// - 不同窗口 → 不同会话 id → 不同文件，天然隔离，无需锁
// - 同一窗口多次进入 → 不同时间戳 → 历史保留，不再覆盖旧方案
// - 同一轮讨论内 plan_update 更新同一文件（活文档语义）
// 参考：Claude Code 用 .claude/plans/、Codex 用 .codex/plans/（目录+命名），
// 单一 PLAN.md 在多会话场景是公认冲突源。
// ══════════════════════════════════════════════════════════════════════

const PLANS_DIR = ".plans";

// 会话短 id：sessionId 形如 019ffc35-c66c-7025-87c2-4d7ae934c2db，取前 8 位
function sessionShortId(ctx: ExtensionContext): string {
  const sessionId = ctx.sessionManager.getSessionId();
  const cleaned = (sessionId ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 8);
  if (cleaned) return cleaned;
  return `${process.pid.toString(36)}${Date.now().toString(36)}`;
}

// 当前进入时刻的时间戳（HHmmss），用于同会话多次进入时区分历史
function nowTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// 本会话本次进入的方案文件路径：.plans/PLAN-<短id>-<HHmmss>.md
function planFilePathFor(ctx: ExtensionContext): string {
  return path.join(ctx.cwd, PLANS_DIR, `PLAN-${sessionShortId(ctx)}-${nowTimestamp()}.md`);
}

// ══════════════════════════════════════════════════════════════════════
// 扩展主体
// ══════════════════════════════════════════════════════════════════════

export default function discussPlanExtension(pi: ExtensionAPI) {
  // ── 内存状态 ──────────────────────────────────────────────────────────

  let planMode = false;
  let editMode = false; // 修改模式（与方案模式互斥）
  let toolsBeforePlanMode: string[] | undefined; // 进入任一模式前的工具快照
  let planFilePath: string | undefined; // 本会话的方案文件（多窗口自动分配独立文件）

  function planPath(ctx: ExtensionContext): string {
    return planFilePath ?? planFilePathFor(ctx);
  }

  function updateStatus(ctx: ExtensionContext) {
    if (editMode) {
      ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("accent", "📝 修改模式·只改不跑"));
      return;
    }
    if (!planMode) {
      ctx.ui.setStatus(STATUS_KEY, undefined);
      return;
    }
    const file = path.basename(planPath(ctx));
    const ready = fs.existsSync(planPath(ctx));
    ctx.ui.setStatus(
      STATUS_KEY,
      ready
        ? ctx.ui.theme.fg("success", `📋 方案·${file} · 已就绪`)
        : ctx.ui.theme.fg("warning", `📋 方案·${file}`),
    );
  }

  function persistState() {
    pi.appendEntry(STATE_ENTRY_TYPE, {
      mode: planMode ? "plan" : editMode ? "edit" : "off",
      toolsBefore: toolsBeforePlanMode,
      planFile: planFilePath,
    });
  }

  // ── 模式切换 ──────────────────────────────────────────────────────────

  function enterPlanMode(ctx: ExtensionContext) {
    if (planMode) return;
    if (editMode) exitEditMode(ctx); // 两种模式互斥
    planMode = true;
    toolsBeforePlanMode ??= pi.getActiveTools();
    pi.setActiveTools(getPlanTools(toolsBeforePlanMode));
    planFilePath = planFilePathFor(ctx); // 每次进入独立文件：.plans/PLAN-<会话id>-<时间戳>.md，多窗口天然隔离
    ctx.ui.notify(
      `方案模式已开启：只读探索 + 方案写入 ${planFilePath}。讨论到满意后对我说「开始执行」`,
      "info",
    );
    updateStatus(ctx);
    persistState();
  }

  function exitPlanMode(ctx: ExtensionContext) {
    if (!planMode) return;
    planMode = false;
    pi.setActiveTools(toolsBeforePlanMode ?? getNormalTools(pi.getActiveTools()));
    toolsBeforePlanMode = undefined;
    planFilePath = undefined; // 退出即归档：.plans/ 下的方案文件保留为历史
    ctx.ui.notify("方案模式已退出，全部工具已恢复。", "info");
    updateStatus(ctx);
    persistState();
  }

  function enterEditMode(ctx: ExtensionContext) {
    if (editMode) return;
    if (planMode) exitPlanMode(ctx); // 两种模式互斥
    editMode = true;
    toolsBeforePlanMode ??= pi.getActiveTools();
    pi.setActiveTools(getEditTools());
    ctx.ui.notify(
      "修改模式已开启（只改不跑）：可改文件 + 只读命令（含 lark-cli）；python/node/npm/curl 等执行类命令一律拦截；确需运行请用 run_request 请求批准。",
      "info",
    );
    updateStatus(ctx);
    persistState();
  }

  function exitEditMode(ctx: ExtensionContext) {
    if (!editMode) return;
    editMode = false;
    pi.setActiveTools(toolsBeforePlanMode ?? getNormalTools(pi.getActiveTools()));
    toolsBeforePlanMode = undefined;
    ctx.ui.notify("修改模式已退出，全部工具已恢复。", "info");
    updateStatus(ctx);
    persistState();
  }

  // ── 在当前窗口开始执行（plan_execute 工具内部使用）─────────────────────

  function activateExecutionHere(ctx: ExtensionContext) {
    planMode = false;
    pi.setActiveTools(toolsBeforePlanMode ?? getNormalTools(pi.getActiveTools()));
    toolsBeforePlanMode = undefined;
    planFilePath = undefined;
    updateStatus(ctx);
    persistState();
  }

  // ── 启动 flag：pi --plan 直接进入方案模式 ──────────────────────────────

  pi.registerFlag("plan", {
    description: "Start in discuss-plan mode (read-only planning, .plans/ files)",
    type: "boolean",
    default: false,
  });

  pi.registerFlag("edit", {
    description: "Start in edit mode (edit files only, no execution at all)",
    type: "boolean",
    default: false,
  });

  // ── 工具：plan_update（方案模式下唯一允许的写操作）──────────────────────

  pi.registerTool({
    name: "plan_update",
    label: "更新方案文档",
    description:
      "把当前完整方案写入本会话的方案文件（项目 .plans/ 目录下，形如 PLAN-<会话短id>-<HHmmss>.md，每个窗口每次进入独立文件；全量覆盖，不是增量）。仅在方案模式下可用。",
    promptSnippet: "把方案写入方案文件",
    promptGuidelines: [
      "方案模式下，每轮讨论后用 plan_update 把完整方案全文写入本会话的方案文件。",
    ],
    parameters: Type.Object({
      content: Type.String({
        description: "完整方案 Markdown 全文（全量覆盖，必须包含完整内容而非增量）",
        minLength: 1,
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!planMode) {
        return {
          content: [
            {
              type: "text",
              text: "错误：plan_update 只能在方案模式中使用（/plan 开启）。",
            },
          ],
          details: { accepted: false },
        };
      }
      const content = typeof params?.content === "string" ? params.content : "";
      if (!content.trim()) {
        return {
          content: [{ type: "text", text: "错误：方案内容不能为空。" }],
          details: { accepted: false },
        };
      }
      const file = planPath(ctx);
      await fs.promises.mkdir(path.dirname(file), { recursive: true }); // .plans/ 目录可能不存在
      await fs.promises.writeFile(file, content, "utf8");
      updateStatus(ctx);
      return {
        content: [
          {
            type: "text",
            text: `✅ 方案已写入 ${file}（${content.length} 字符）。\n请在回复中向用户简要说明方案要点及本次变更（不要全文复述）。`,
          },
        ],
        details: { accepted: true, path: file, chars: content.length },
      };
    },
  });

  // ── 工具：plan_execute（用户说"开始执行"时由模型调用）──────────────────

  pi.registerTool({
    name: "plan_execute",
    label: "开始执行方案",
    description:
      "用户明确表示要执行方案时调用。会弹窗询问：当前窗口执行 / 新窗口执行 / 继续讨论。仅在方案模式下可用。",
    promptSnippet: "用户下令执行时触发执行流程",
    promptGuidelines: [
      "方案模式下，当用户明确说「开始执行 / 执行吧 / 动手吧 / 开干」时，调用 plan_execute，不要自行开始实现。",
    ],
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      if (!planMode) {
        return {
          content: [
            {
              type: "text",
              text: "错误：plan_execute 只能在方案模式中使用（/plan 开启）。",
            },
          ],
          details: { accepted: false },
        };
      }
      const file = planPath(ctx);
      if (!fs.existsSync(file)) {
        return {
          content: [
            {
              type: "text",
              text: `方案文件还不存在。请先用 plan_update 把完整方案写入 ${file}，再让用户确认执行。`,
            },
          ],
          details: { accepted: false, reason: "no_plan" },
        };
      }

      // 无交互 UI（print/json 模式）：直接在当前窗口执行
      if (!ctx.hasUI) {
        activateExecutionHere(ctx);
        return {
          content: [
            {
              type: "text",
              text: `用户已确认执行（非交互模式）。方案模式已退出、全部工具已恢复，请立即开始执行 ${file} 中的方案。`,
            },
          ],
          details: { accepted: true, mode: "here" },
        };
      }

      const choice = await ctx.ui.select("方案已就绪，如何执行？", [
        "在当前窗口执行（继续本对话）",
        "在新窗口执行（只携带方案）",
        "继续讨论，先不执行",
      ]);

      if (!choice || choice.startsWith("继续讨论")) {
        return {
          content: [
            {
              type: "text",
              text: "用户选择继续讨论。请保持方案模式，等待用户的进一步意见，并按需用 plan_update 更新方案文件。",
            },
          ],
          details: { accepted: false, reason: "continue" },
        };
      }

      if (choice.startsWith("在当前窗口")) {
        activateExecutionHere(ctx);
        return {
          content: [
            {
              type: "text",
              text: `用户已确认在当前窗口执行。方案模式已退出、全部工具已恢复，请立即开始执行 ${file} 中的方案。`,
            },
          ],
          details: { accepted: true, mode: "here" },
        };
      }

      // 新窗口执行：pi 平台限制——扩展通过 sendUserMessage 投递的消息（steer/followUp/nextTurn）
      // 均不触发扩展命令处理器（已读源码实测确认），因此无法自动打开新会话。
      // 引导用户手动输入 /plan-execute-new 命令触发（命令本身正常，手动输入即生效）。
      ctx.ui.notify(
        "新窗口执行需手动触发：请在输入框输入 /plan-execute-new（pi 限制：扩展消息不触发命令处理器）",
        "info",
      );
      return {
        content: [
          {
            type: "text",
            text: "用户已确认在新窗口执行。由于 pi 平台限制（扩展投递的消息不会触发命令处理器），请提示用户：在输入框输入 /plan-execute-new 命令，即可在新窗口执行方案（只携带方案，不携带讨论过程）。本会话保持方案模式，可继续讨论。",
          },
        ],
        details: { accepted: true, mode: "new-session-manual" },
      };
    },
  });

  // ── 工具：plan_exit（用户说"退出方案模式"时由模型调用）────────────────

  pi.registerTool({
    name: "plan_exit",
    label: "退出方案模式",
    description: "退出方案模式，恢复全部工具。仅在方案模式下可用。",
    promptSnippet: "用户要求退出方案模式时调用",
    promptGuidelines: [
      "方案模式下，当用户说「退出方案模式 / 不规划了 / 算了」等意图明确的指令时，调用 plan_exit 退出。",
    ],
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      if (!planMode) {
        return {
          content: [{ type: "text", text: "当前不在方案模式中。" }],
          details: { accepted: false },
        };
      }
      exitPlanMode(ctx);
      return {
        content: [
          {
            type: "text",
            text: "已退出方案模式，全部工具已恢复。方案文件保留在 .plans/ 目录，随时可以继续。",
          },
        ],
        details: { accepted: true },
      };
    },
  });

  // ── 工具：edit_exit（用户说"退出修改模式"时由模型调用）────────────────

  pi.registerTool({
    name: "edit_exit",
    label: "退出修改模式",
    description: "退出修改模式，恢复全部工具（含执行能力）。仅在修改模式下可用。",
    promptSnippet: "用户要求退出修改模式时调用",
    promptGuidelines: [
      "修改模式下，当用户说「退出修改模式 / 不修改了 / 好了」等明确指令时，调用 edit_exit 退出。",
    ],
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      if (!editMode) {
        return {
          content: [{ type: "text", text: "当前不在修改模式中。" }],
          details: { accepted: false },
        };
      }
      exitEditMode(ctx);
      return {
        content: [
          {
            type: "text",
            text: "已退出修改模式，全部工具已恢复。你修改的文件保留原样，随时可以继续。",
          },
        ],
        details: { accepted: true },
      };
    },
  });

  // ── 工具：run_request（修改模式下唯一可运行执行类命令的通道，用户批准才执行）──

  pi.registerTool({
    name: "run_request",
    label: "请求运行命令",
    description:
      "修改模式下请求运行一条命令（如 python 脚本、curl 调接口等执行类命令）。弹出确认框，用户批准后由扩展代为执行并返回输出；用户拒绝则不执行。仅在修改模式下可用。",
    promptSnippet: "修改模式下需要运行执行类命令时，用 run_request 请求用户批准",
    promptGuidelines: [
      "修改模式下，如需运行被只读白名单拦截的命令（python/node/npm/curl 等），唯一通道是调用 run_request 请求用户批准，禁止尝试其他方式执行。",
    ],
    parameters: Type.Object({
      command: Type.String({
        description: "要运行的完整命令（如 python run.py --full）",
        minLength: 1,
      }),
      reason: Type.String({
        description: "运行目的说明（必填，如：验证修改后的管线能否跑通）",
        minLength: 1,
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!editMode) {
        return {
          content: [
            { type: "text", text: "错误：run_request 只能在修改模式中使用（/edit 开启）。" },
          ],
          details: { accepted: false },
        };
      }
      const command =
        typeof params?.command === "string" ? params.command.trim() : "";
      const reason =
        typeof params?.reason === "string" ? params.reason.trim() : "";
      if (!command || !reason) {
        return {
          content: [
            { type: "text", text: "错误：必须同时提供 command 与 reason。" },
          ],
          details: { accepted: false },
        };
      }
      if (!ctx.hasUI) {
        return {
          content: [
            {
              type: "text",
              text: "非交互模式不支持运行批准。请退出修改模式后自行运行该命令，或提示用户在终端运行。",
            },
          ],
          details: { accepted: false, reason: "no_ui" },
        };
      }
      const ok = await ctx.ui.confirm(
        "运行请求（修改模式）",
        `命令：${command}\n\n原因：${reason}\n\n是否允许运行？`,
      );
      if (!ok) {
        return {
          content: [
            {
              type: "text",
              text: "用户拒绝了运行请求。请继续修改代码，或提示用户自行在终端运行该命令。",
            },
          ],
          details: { accepted: false, reason: "rejected" },
        };
      }
      try {
        // 用户批准即授权：在项目 cwd 下执行；windowsHide 不弹黑窗口；限时 60s；输出截断防刷屏
        const { stdout, stderr } = await execFile(
          "cmd",
          ["/c", command],
          {
            cwd: ctx.cwd,
            timeout: 60_000,
            maxBuffer: 5 * 1024 * 1024,
            windowsHide: true,
          },
        );
        const text = `${String(stdout ?? "")}\n${String(stderr ?? "")}`.trim();
        const truncated =
          text.length > 40_000
            ? `${text.slice(0, 40_000)}\n\n…（输出过长已截断，共 ${text.length} 字符）`
            : text;
        return {
          content: [
            {
              type: "text",
              text: truncated
                ? `✅ 命令已执行（用户已批准）：\n${truncated}`
                : "✅ 命令已执行（用户已批准），无输出。",
            },
          ],
          details: { accepted: true, command, chars: text.length },
        };
      } catch (error) {
        const err = error as { code?: string | number; stderr?: string; message?: string };
        const stderrText = String(err?.stderr ?? "").trim();
        const message = err?.message ?? String(error);
        return {
          content: [
            {
              type: "text",
              text: `❌ 命令执行失败（用户已批准但执行出错）：\n${message}${stderrText ? `\n${stderrText}` : ""}\n提示：可让用户在终端自行运行该命令排查。`,
            },
          ],
          details: { accepted: true, command, error: err?.code ?? "unknown" },
        };
      }
    },
  });

  // ── 工具：lark_doc_fetch（只读获取飞书线上文档，包装 lark-cli）─────────

  pi.registerTool({
    name: "lark_doc_fetch",
    label: "读取飞书文档",
    description:
      "只读获取飞书（Lark）线上文档内容（Markdown 格式）。传入文档 URL 或文档 token。此工具只执行 lark-cli 的只读 fetch 命令，绝不修改线上内容。",
    promptSnippet: "读取飞书线上文档内容",
    promptGuidelines: [
      "需要查飞书线上文档时使用 lark_doc_fetch（只读，不修改线上内容）。",
    ],
    parameters: Type.Object({
      document: Type.String({
        description: "飞书文档 URL（https://xxx.feishu.cn/docx/...）或文档 token",
        minLength: 1,
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const exe = findLarkCli();
      if (!exe) {
        return {
          content: [
            {
              type: "text",
              text: "未找到 lark-cli（@larksuite/cli）。请先安装：npm install -g @larksuite/cli",
            },
          ],
          details: { accepted: false, reason: "cli_not_found" },
        };
      }
      const document = typeof params?.document === "string" ? params.document.trim() : "";
      if (!document) {
        return {
          content: [{ type: "text", text: "错误：请提供飞书文档 URL 或 token。" }],
          details: { accepted: false },
        };
      }
      const token = extractLarkToken(document);
      try {
        // windowsHide: true —— 不弹出任何控制台窗口；--as bot：用户身份过期时用机器人身份
        const { stdout } = await execFile(
          exe,
          ["markdown", "+fetch", "--file-token", token, "--format", "pretty", "--as", "bot"],
          {
            timeout: 60_000,
            maxBuffer: 5 * 1024 * 1024,
            windowsHide: true,
          },
        );
        const text = String(stdout ?? "").trim();
        const truncated =
          text.length > 40_000 ? `${text.slice(0, 40_000)}\n\n…（内容过长已截断，共 ${text.length} 字符）` : text;
        return {
          content: [{ type: "text", text: truncated || "（文档内容为空）" }],
          details: { accepted: true, chars: text.length },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `读取飞书文档失败：${message}\n可能原因：文档不存在、无权限访问，或 lark-cli 未登录（可运行 lark-cli doctor 检查）。`,
            },
          ],
          details: { accepted: false },
        };
      }
    },
  });

  // ── 命令：/plan（切换方案模式）、/plan-execute-new（内部）───────────────

  pi.registerCommand("plan", {
    description: "切换方案模式（讨论式规划，方案写入 .plans/ 目录；说「开始执行」才执行）",
    handler: async (args, ctx) => {
      const arg = args.trim().toLowerCase();
      if (arg === "exit" || arg === "off") {
        exitPlanMode(ctx);
        return;
      }
      if (arg === "start") {
        enterPlanMode(ctx);
        return;
      }
      if (planMode) exitPlanMode(ctx);
      else enterPlanMode(ctx);
    },
  });

  pi.registerCommand("plan-execute-new", {
    description: "内部命令：在新建窗口中执行当前方案（由 plan_execute 排队触发）",
    handler: async (_args, ctx) => {
      const file = planPath(ctx);
      if (!fs.existsSync(file)) {
        ctx.ui.notify(`${file} 不存在，无法在新窗口执行`, "error");
        return;
      }
      const plan = await fs.promises.readFile(file, "utf8");
      if (!ctx.hasUI) {
        ctx.ui.notify("非交互模式不支持新窗口执行，请使用「当前窗口执行」", "error");
        return;
      }

      // 等待代理完全空闲后再切换会话
      await ctx.waitForIdle();

      const parent = ctx.sessionManager.getSessionFile() ?? undefined;
      const result = await ctx.newSession({
        parentSession: parent,
        setup: async (sm) => {
          sm.appendMessage({
            role: "user",
            content: [
              {
                type: "text",
                text: `请执行以下方案（方案来源：${file}）：\n\n${plan}`,
              },
            ],
            timestamp: Date.now(),
          });
        },
        withSession: async (newCtx) => {
          await newCtx.sendUserMessage(
            `开始执行。请先阅读方案内容，然后按步骤实施。`,
          );
        },
      });
      if (result.cancelled) {
        ctx.ui.notify("新窗口执行已取消，本会话保持方案模式", "info");
      }
    },
  });

  pi.registerCommand("edit", {
    description: "切换修改模式（只改不跑：改文件 + 只读命令；执行类命令一律拦截，可用 run_request 请求批准）",
    handler: async (args, ctx) => {
      const arg = args.trim().toLowerCase();
      if (arg === "exit" || arg === "off") {
        exitEditMode(ctx);
        return;
      }
      if (arg === "start") {
        enterEditMode(ctx);
        return;
      }
      if (editMode) exitEditMode(ctx);
      else enterEditMode(ctx);
    },
  });

  // ── 事件：模式提示词注入 ──────────────────────────────────────────────

  pi.on("before_agent_start", async (event) => {
    if (editMode) {
      return {
        systemPrompt: `${event.systemPrompt}\n\n${EDIT_MODE_PROMPT}`,
      };
    }
    if (planMode) {
      return {
        systemPrompt: `${event.systemPrompt}\n\n${PLAN_MODE_PROMPT}`,
      };
    }
  });

  // ── 事件：模式安全拦截（兜底，防止越权操作）───────────────────────────

  pi.on("tool_call", async (event) => {
    // 修改模式：严格白名单，白名单外一律拦截；bash 额外做只读命令校验（执行类命令一律拦截）
    if (editMode) {
      const allowed = new Set([
        ...EDIT_CORE_TOOLS,
        ...loadExtraEditTools(),
        ...EDIT_ONLY_TOOLS,
      ]);
      if (!allowed.has(event.toolName)) {
        return {
          block: true,
          reason: `修改模式：工具 ${event.toolName} 不在白名单中，已拦截（只允许编辑文件、只读命令与查询类工具）。退出修改模式（/edit）后可恢复全部工具。`,
        };
      }
      if (event.toolName === "bash") {
        const input = event.input as { command?: unknown } | undefined;
        const cmd = typeof input?.command === "string" ? input.command : "";
        const plainCmd = stripRtkRewrite(cmd); // rtk 改写包装不影响判断
        if (!isSafeCommand(plainCmd, true)) {
          return {
            block: true,
            reason: `修改模式（只改不跑）：该命令非只读命令，已拦截（允许 cat/grep/find/ls/read 等只读操作；禁止 python/node/npm/curl 等一切执行类命令）。如确需运行，请调用 run_request 请求用户批准。\n${plainCmd}`,
          };
        }
      }
      return;
    }

    if (!planMode) return;

    if (event.toolName === "bash") {
      const input = event.input as { command?: unknown } | undefined;
      const cmd = typeof input?.command === "string" ? input.command : "";
      const plainCmd = stripRtkRewrite(cmd); // rtk 改写包装不影响判断
      if (!isSafeCommand(plainCmd, false)) {
        return {
          block: true,
          reason: `方案模式：该 bash 命令非只读命令，已拦截（允许 cat/head/tail/grep/find/ls/pwd/wc/sort/uniq/date/ps/jq/rg 等只读命令；禁止 python/node/npm/curl 等执行类命令；探索项目优先用 read 工具）。方案请通过 plan_update 写入方案文件。\n${plainCmd}`,
        };
      }
      return;
    }

    if (event.toolName === "edit" || event.toolName === "write" || event.toolName === "update_plan") {
      return {
        block: true,
        reason: "方案模式：禁止修改文件。方案请通过 plan_update 写入方案文件；执行需等用户下令（plan_execute）。",
      };
    }
  });

  // ── 事件：会话启动时恢复状态 ──────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    if (pi.getFlag("plan") === true) {
      planMode = true;
    }
    if (pi.getFlag("edit") === true) {
      editMode = true;
    }

    const entries = ctx.sessionManager.getEntries();
    const stateEntry = [...entries]
      .reverse()
      .find(
        (e: { type?: string; customType?: string }) =>
          e.type === "custom" && e.customType === STATE_ENTRY_TYPE,
      );
    const data = (stateEntry as
      | {
          data?: {
            mode?: string;
            enabled?: boolean; // 兼容旧版本（enabled=true 表示方案模式）
            toolsBefore?: string[];
            planFile?: string;
          };
        }
      | undefined)?.data;
    if (data) {
      const mode = data.mode ?? (data.enabled ? "plan" : "off");
      planMode = mode === "plan";
      editMode = mode === "edit";
      toolsBeforePlanMode = data.toolsBefore ?? toolsBeforePlanMode;
      planFilePath = data.planFile ?? planFilePath;
    }

    if (planMode && !planFilePath) {
      // 会话恢复且没有记录文件：生成新的独立方案文件（.plans/ 目录）
      planFilePath = planFilePathFor(ctx);
      persistState();
    }

    if (planMode) {
      toolsBeforePlanMode ??= pi.getActiveTools();
      pi.setActiveTools(getPlanTools(toolsBeforePlanMode));
    } else if (editMode) {
      toolsBeforePlanMode ??= pi.getActiveTools();
      pi.setActiveTools(getEditTools());
    }
    updateStatus(ctx);
  });
}
