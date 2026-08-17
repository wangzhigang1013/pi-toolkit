# pi-toolkit 🛠️

个人专属的 [Pi Coding Agent](https://pi.dev) 插件工具箱、配置归档与企业级落地实践指南。

用于集中管理日常使用的 Pi 扩展插件（Extensions）、技能包（Skills）、提示词模板（Prompts）、网络环境配置以及核心技术踩坑复盘。

---

## 📁 目录结构

```text
pi-toolkit/
├── configs/                    # Pi 配置文件参考与模板
│   ├── settings.example.json      # 基础设置模板 (主题、模型、Token 压缩等)
│   └── env.example                # 环境变量配置参考 (代理、Node flags 等)
├── extensions/                 # 自定义与已归档的 Pi 扩展插件
│   ├── pi-antigravity/            # 🪐 pi-antigravity 修复版完整源码、指南与排错复盘
│   │   ├── src/                   # 包含全部思考流修复、代理修复与 Web 适配的源码
│   │   ├── README.md              # 插件使用指引与支持模型清单
│   │   ├── TROUBLESHOOTING.md     # 🚨 核心技术陷阱、底层原理剖析与企业复用部署指南
│   │   ├── setup-env.ps1          # Windows 一键环境配置脚本
│   │   └── setup-env.sh           # Linux/macOS 环境配置脚本
│   └── hello-pi/                  # 🚀 示例扩展插件
├── skills/                     # Pi 自定义技能 (Skills)
│   └── example-skill/             # 示例技能包
├── prompts/                    # 常用系统提示词与 Prompt 模板
│   └── system-template.md         # 常用系统提示词
├── package.json                # 依赖管理与脚本
└── README.md                   # 仓库主说明与插件开发规范
```

---

## 📌 重点实践与技术复盘

- **[pi-antigravity 技术踩坑与复用指南](./extensions/pi-antigravity/TROUBLESHOOTING.md)** 🌟：
  - **Node 24 代理陷阱**：破解国内环境换 Token 报 `fetch failed`（`--use-env-proxy` 方案）
  - **Pi Web 思考流消失陷阱**：解决工具调用前思考静默（`includeThoughts` + `thinkingLevelMap` 修复）
  - **思考标签误吞正文 Bug 复盘**：流式状态机防御设计
  - **Web 端用量查询优化**：持久模态窗 + 专属 Tools 方案
  - **企业 4 步快速复用 Checklist**：供明天在公司新机器上一键部署
- **[pi-antigravity 使用指南](./extensions/pi-antigravity/README.md)**：模型 ID 清单、Slash 命令与操作指引。
- **[Hello Pi 最简扩展开发模板](./extensions/hello-pi/README.md)**：单文件扩展开发规范。

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
