# Hello Pi 示例插件 🚀

这是一个最简的 Pi Coding Agent 扩展示例，用于演示如何编写、注册自定义命令与工具。

---

## 📦 插件内容

- `index.ts`: 注册了一个 `/hello` 自定义命令，展示 UI 通知功能。

---

## 🛠️ 安装与使用

### 临时加载
```bash
pi -e ./extensions/hello-pi/index.ts
```

### 使用命令
在 Pi 聊天中输入：
```text
/hello
```

---

## ⚠️ 注意事项

- 仅用于开发与测试扩展插件的基本骨架。
- 正式插件推荐导出符合 `@earendil-works/pi-ai` 扩展规范的入口函数。
