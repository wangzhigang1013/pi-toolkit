# pi-toolkit 🛠️

个人专属的 [Pi Coding Agent](https://pi.dev) 插件工具箱、配置归档与实践指南仓库。

用于集中管理日常使用的 Pi 扩展插件（Extensions）、技能包（Skills）、提示词模板（Prompts）以及网络与环境配置文件。

---

## 📁 目录结构

```text
pi-toolkit/
├── configs/                    # Pi 配置文件参考与模板
│   ├── settings.example.json      # 基础设置模板 (主题、模型、Token 压缩等)
│   └── env.example                # 环境变量配置参考 (代理、Node flags 等)
├── extensions/                 # 自定义与已归档的 Pi 扩展插件
│   ├── pi-antigravity/            # 🪐 pi-antigravity 原版完整插件源码与代理接入指南
│   └── hello-pi/                  # 🚀 示例扩展插件
├── skills/                     # Pi 自定义技能 (Skills)
│   └── example-skill/             # 示例技能包
├── prompts/                    # 常用系统提示词与 Prompt 模板
│   └── system-template.md         # 常用系统提示词
├── package.json                # 依赖管理与脚本
└── README.md                   # 仓库主说明与插件开发规范
```

---

## 📌 插件开发与归档规范 (必读)

为了保持仓库整洁与易用，后续所有新增的插件、扩展或独立工具，**必须在各自子目录内提供独立的 `README.md`**，包含以下要素：

1. **📖 功能与内容介绍**：清晰描述该插件解决什么问题、包含哪些源码、支持哪些模型/能力。
2. **🚀 安装与使用方法**：具体的安装命令（npm / 本地源码加载）与使用步骤（Slash 命令/快捷键）。
3. **⚠️ 注意事项与常见踩坑**：网络依赖、前置权限、敏感配置防泄露提醒等。

---

## 🚀 常用快速索引

- **[pi-antigravity 插件源码与配置指南](./extensions/pi-antigravity/README.md)**：Google Antigravity / Cloud Code Assist 原版完整插件源码、模型清单与国内代理解决教程。
- **[Hello Pi 扩展示例](./extensions/hello-pi/README.md)**：最简插件开发模板。

---

## 🔒 安全规范

本仓库为公开仓库（Public），提交代码与配置时请务必注意：
- ❌ **严禁提交** `~/.pi/agent/auth.json`（包含登录 Token、API Key 等机密凭据）
- ❌ **严禁提交** `.env` 及私密密钥
- `.gitignore` 已预置防泄露规则，提交前请 `git status` 确认

---

## 📜 常用命令

```bash
# 安装依赖
npm install

# 编译/类型检查
npm run typecheck
```
