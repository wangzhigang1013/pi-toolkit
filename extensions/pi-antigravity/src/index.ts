import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getApiKey, loginAntigravity, refreshAntigravityToken } from "./auth/index.js";
import { DEFAULT_ENDPOINT } from "./client/index.js";
import { getLastDiagnostics, runWithDiagnostics } from "./diagnostics/index.js";
import { ANTIGRAVITY_MODELS, PROVIDER_ID, PROVIDER_NAME } from "./models/index.js";
import { ANTIGRAVITY_API, streamAntigravity } from "./stream/index.js";
import {
  fetchAccountUsage,
  formatModelsList,
  formatUsageSummary,
  resolveApiKeyFromContext,
} from "./usage/index.js";
import { redactSecrets } from "./utils/index.js";

async function getAntigravityApiKey(ctx?: ExtensionContext): Promise<string | undefined> {
  if (ctx) {
    try {
      const key = await resolveApiKeyFromContext(ctx as ExtensionCommandContext);
      if (key) return key;
    } catch {}
  }
  try {
    const authPath = path.join(os.homedir(), ".pi", "agent", "auth.json");
    if (fs.existsSync(authPath)) {
      const data = JSON.parse(fs.readFileSync(authPath, "utf8")) as Record<string, any>;
      if (data.antigravity) {
        return getApiKey(data.antigravity);
      }
    }
  } catch {}
  return undefined;
}

async function withUsage(
  ctx: ExtensionCommandContext,
  title: string,
  fn: (usage: Awaited<ReturnType<typeof fetchAccountUsage>>) => string,
): Promise<void> {
  try {
    const apiKey = await getAntigravityApiKey(ctx);
    if (!apiKey) {
      const msg = "未找到 Antigravity 登录凭据，请先执行 `/login antigravity` 进行授权。";
      if (ctx.hasUI) {
        if (typeof ctx.ui.confirm === "function") {
          await ctx.ui.confirm("Antigravity 提示", msg);
        } else {
          ctx.ui.notify(msg, "warning");
        }
      } else {
        console.log(msg);
      }
      return;
    }
    if (ctx.hasUI) ctx.ui.notify("正在获取 Antigravity 配额数据…", "info");
    const usage = await runWithDiagnostics(() => fetchAccountUsage(apiKey));
    const text = fn(usage);
    if (ctx.hasUI) {
      // 在 Pi Web 中使用持久弹窗展示，不会自动消失，用户查看完毕后手动关闭
      if (typeof ctx.ui.editor === "function") {
        await ctx.ui.editor(title, text);
      } else if (typeof ctx.ui.confirm === "function") {
        await ctx.ui.confirm(title, text);
      } else {
        ctx.ui.notify(text, "info");
      }
    }
    console.log(text);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (ctx.hasUI) {
      if (typeof ctx.ui.confirm === "function") {
        await ctx.ui.confirm("Antigravity 错误", `获取配额失败: ${msg}`);
      } else {
        ctx.ui.notify(`Antigravity usage failed: ${msg}`, "warning");
      }
    } else {
      console.error(msg);
    }
  }
}

export default function (pi: ExtensionAPI): void {
  pi.registerProvider(PROVIDER_ID, {
    name: PROVIDER_NAME,
    baseUrl: DEFAULT_ENDPOINT,
    api: ANTIGRAVITY_API,
    models: ANTIGRAVITY_MODELS,
    oauth: {
      name: PROVIDER_NAME,
      login: loginAntigravity,
      refreshToken: refreshAntigravityToken,
      getApiKey,
    },
    streamSimple: streamAntigravity,
  });

  // 1. 注册 Slash 命令（支持 Pi Web 持久弹窗查看，绝不闪退）
  pi.registerCommand("antigravity.usage", {
    description: "Show Antigravity shared quota pools (Gemini / Claude+GPT, 5h + weekly)",
    handler: async (_args, ctx) => {
      await withUsage(ctx, "🪐 Antigravity 共享配额池使用量", formatUsageSummary);
    },
  });

  pi.registerCommand("antigravity.models", {
    description: "List Antigravity runtime models + remaining pool fraction",
    handler: async (args, ctx) => {
      const all = /\ball\b/i.test(args || "");
      await withUsage(ctx, "🪐 Antigravity 运行时模型与配额清单", (usage) => formatModelsList(usage, { all }));
    },
  });

  pi.registerCommand("antigravity.doctor", {
    description: "Show sanitized Antigravity provider diagnostics",
    handler: async (_args, ctx) => {
      const d = getLastDiagnostics();
      const lines = [
        `provider=${PROVIDER_ID}`,
        `lastResolvedRuntimeModel=${d.resolvedRuntimeModel || "none"}`,
        `availableModels=${d.availableModels || "none"}`,
        `matchedModel=${d.matchedModelDebug || "none"}`,
        `lastEndpoint=${d.endpoint || "none"}`,
        `lastStatus=${d.status ?? "none"}`,
        `lastProjectId=${d.projectId || "none"}`,
        `lastError=${d.error ? redactSecrets(d.error) : "none"}`,
        "transport=native-streamSimple",
        "runtimeCli=not-used",
        "commands=/antigravity.usage /antigravity.models /antigravity.doctor",
      ];
      const text = lines.join("\n");
      if (ctx.hasUI) {
        if (typeof ctx.ui.editor === "function") {
          await ctx.ui.editor("🪐 Antigravity 系统诊断报告", text);
        } else if (typeof ctx.ui.confirm === "function") {
          await ctx.ui.confirm("🪐 Antigravity 系统诊断报告", text);
        } else {
          ctx.ui.notify(`Antigravity doctor\n${text}`, "info");
        }
      }
      console.log(text);
    },
  });

  // 2. 注册 Tools：在 Pi Web 聊天对话流中直接输出 Markdown 表格
  pi.registerTool({
    name: "antigravity_usage",
    label: "查询 Antigravity 配额",
    description: "获取当前 Google Antigravity 账号的共享配额池剩余使用量、重置倒计时和配额组详情（Gemini / Claude / GPT-OSS）。",
    parameters: {
      type: "object",
      properties: {},
    },
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const apiKey = await getAntigravityApiKey(ctx);
      if (!apiKey) {
        return {
          content: [{ type: "text", text: "未检测到 Antigravity 登录凭据，请先在终端或聊天中执行 `/login antigravity` 进行授权。" }],
          details: {},
        };
      }
      try {
        const usage = await runWithDiagnostics(() => fetchAccountUsage(apiKey));
        const summary = formatUsageSummary(usage);
        return {
          content: [{ type: "text", text: `### 🪐 Antigravity 配额使用情况\n\n\`\`\`text\n${summary}\n\`\`\`` }],
          details: usage,
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `查询配额失败: ${err?.message || String(err)}` }],
          details: { error: String(err) },
        };
      }
    },
  });

  pi.registerTool({
    name: "antigravity_models",
    label: "查询 Antigravity 可用模型",
    description: "获取当前 Google Antigravity 账号可用的全部运行时模型列表、剩余配额百分比与能力标签（如 thinking/images）。",
    parameters: {
      type: "object",
      properties: {
        all: {
          type: "boolean",
          description: "是否包含 tab/chat 等内部隐藏模型（默认 false）",
        },
      },
    },
    async execute(_toolCallId, params: { all?: boolean }, _signal, _onUpdate, ctx) {
      const apiKey = await getAntigravityApiKey(ctx);
      if (!apiKey) {
        return {
          content: [{ type: "text", text: "未检测到 Antigravity 登录凭据，请先执行 `/login antigravity` 进行授权。" }],
          details: {},
        };
      }
      try {
        const usage = await runWithDiagnostics(() => fetchAccountUsage(apiKey));
        const list = formatModelsList(usage, { all: params?.all });
        return {
          content: [{ type: "text", text: `### 🪐 Antigravity 可用模型列表\n\n\`\`\`text\n${list}\n\`\`\`` }],
          details: usage,
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `查询模型失败: ${err?.message || String(err)}` }],
          details: { error: String(err) },
        };
      }
    },
  });

  pi.registerTool({
    name: "antigravity_doctor",
    label: "Antigravity 系统诊断",
    description: "检查 Antigravity Provider 的连接端点、解析运行时、OAuth 授权与状态信息。",
    parameters: {
      type: "object",
      properties: {},
    },
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const d = getLastDiagnostics();
      const lines = [
        `provider=${PROVIDER_ID}`,
        `lastResolvedRuntimeModel=${d.resolvedRuntimeModel || "none"}`,
        `availableModels=${d.availableModels || "none"}`,
        `matchedModel=${d.matchedModelDebug || "none"}`,
        `lastEndpoint=${d.endpoint || "none"}`,
        `lastStatus=${d.status ?? "none"}`,
        `lastProjectId=${d.projectId || "none"}`,
        `lastError=${d.error ? redactSecrets(d.error) : "none"}`,
        "transport=native-streamSimple",
        "runtimeCli=not-used",
      ];
      return {
        content: [{ type: "text", text: `### 🪐 Antigravity 诊断报告\n\n\`\`\`text\n${lines.join("\n")}\n\`\`\`` }],
        details: d,
      };
    },
  });
}
