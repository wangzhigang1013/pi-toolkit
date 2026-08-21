# 🧰 Personal Pi Toolkit (个人 Pi 资产与多端同步中心)

用于在**公司电脑**与**家里电脑**之间无缝同步 Pi Coding Agent 的自写扩展、第三方扩展、Skills、以及个性化配置。

---

## 📁 仓库结构

```text
pi-toolkit/
├── extensions/               # 自写 / 定制的扩展包
│   ├── pi-discuss-plan/      # 方案模式 (/plan) + 修改模式 (/edit) 扩展
│   └── pi-antigravity/       # Antigravity Provider
├── skills/                   # Agent Skills 技能库
│   ├── lark-doc/             # 飞书云文档只读/分析
│   ├── lark-shared/          # 飞书认证与通用依赖
│   ├── principle-generator/  # PRD 评测标准生成器
│   └── .disabled/            # 其他 Lark 备选技能
├── config/                   # 跨端通用配置模板
│   ├── settings.template.json# settings 模板与依赖包清单
│   ├── models.template.json  # 模型 Provider 模板
│   └── ept-portal-token.py   # Token 提取脚本
├── sync.js                   # 跨平台一键部署与智能路径转换脚本
├── sync.ps1 / sync.sh        # Windows / Linux 快捷脚本
└── package.json
```

---

## 🚀 家里新电脑：一键初始化 (只需 2 步)

### 步骤 1：克隆本仓库与 pi-web
```bash
# 1. 克隆 toolkit
git clone https://github.com/wangzhigang1013/pi-toolkit.git

# 2. 克隆你的 pi-web (如果家里也要跑 WebUI)
git clone https://github.com/wangzhigang1013/pi-web.git
```

### 步骤 2：执行同步部署
进入 `pi-toolkit` 目录，执行：
```bash
cd pi-toolkit
node sync.js
```
*(或者在 PowerShell 中运行 `.\sync.ps1`)*

> **`sync.js` 会自动完成以下操作：**
> 1. 将所有 Skills 自动同步到 `~/.agents/skills/`；
> 2. 自动把当前电脑的 `extensions/` 绝对路径（跨平台自动解析）与所有 npm 扩展注册到 `~/.pi/agent/settings.json`；
> 3. 部署 `models.json` 和辅助脚本；
> 4. 自动触发 `pi update --all` 拉取并安装所有依赖。

---

## 🔄 日常同步工作流

### 场景 A：在公司改了代码/写了新功能，想同步到家里
1. **在公司提交推送：**
   ```bash
   cd D:/pi-toolkit
   npm run push
   # 或者：git add . && git commit -m "feat: 新增某功能" && git push
   ```
2. **回到家里电脑拉取更新：**
   ```bash
   cd path/to/pi-toolkit
   npm run update
   # 或者：git pull && node sync.js
   ```

### 场景 B：在家里写了新功能，想同步回公司
1. **在家里提交推送：**
   ```bash
   git add . && git commit -m "feat: 家里修改" && git push
   ```
2. **在公司电脑拉取：**
   ```bash
   cd D:/pi-toolkit
   npm run update
   ```

---

## 💡 如何添加新功能？

- **添加新的自写扩展**：直接放入 `extensions/<你的扩展名>/` 目录下，运行 `node sync.js` 即可自动注册到 Pi！
- **添加新的 Skill**：直接放入 `skills/<skill名称>/` 目录下，运行 `node sync.js` 即可自动生效！
- **添加官方 npm 扩展**：可以直接在终端 `pi install npm:xxx`，然后把对应包名记录到 `config/settings.template.json`。
