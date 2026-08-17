# pi-toolkit 🛠️

个人专属的 [Pi Coding Agent](https://pi.dev) 插件工具箱与配置归档仓库。

用于集中管理日常使用的 Pi 扩展（Extensions）、技能包（Skills）、提示词模板（Prompts）以及环境配置文件。

---

## 📁 目录结构

```text
pi-toolkit/
├── configs/                # Pi 配置文件参考与模板
│   ├── settings.example.json  # 基础设置模板
│   └── env.example            # 环境变量配置参考 (代理、Node flags 等)
├── extensions/             # 自定义 Pi 扩展与插件
│   └── hello-pi/           # 示例扩展插件
├── skills/                 # Pi 自定义技能 (Skills)
│   └── example-skill/      # 示例技能包
├── prompts/                # 常用系统提示词与 Prompt 模板
│   └── system-template.md  # 常用系统提示词
├── package.json            # 依赖管理与脚本
└── README.md               # 项目使用说明
```

---

## 🚀 快速使用与同步

### 1. 扩展开发与加载

在 Pi 中测试或加载自定义扩展：

```bash
# 单会话临时加载指定扩展
pi -e ./extensions/hello-pi/index.ts

# 或者软链接/复制到 Pi 全局扩展目录 (~/.pi/agent/extensions/)
```

### 2. 配置参考

- **全局配置**：参考 `configs/settings.example.json` 放到 `~/.pi/agent/settings.json`
- **代理与网络优化**：参考 `configs/env.example`，解决国内环境访问 Google/海外模型时的网络问题

---

## 🔒 安全规范

本仓库为公开仓库（Public），提交代码与配置时请务必注意：
- ❌ **严禁提交** `~/.pi/agent/auth.json`（包含登录 Token、API Key 等机密凭证）
- ❌ **严禁提交** `.env` 及真实私密环境变量
- `.gitignore` 已预置防泄露规则，提交前请 `git status` 确认

---

## 📜 常用命令

```bash
# 安装依赖
npm install

# 编译/类型检查
npm run typecheck
```
