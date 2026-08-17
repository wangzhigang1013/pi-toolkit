/**
 * 示例 Pi 扩展插件：Hello Pi
 * 演示如何注册自定义 Slash 命令与工具
 */

export default function helloPiExtension(pi: any) {
  // 注册一个简单的 slash 命令 /hello
  pi.registerCommand("hello", {
    description: "打印 Hello Pi 问候与环境信息",
    handler: async (args: string, ctx: any) => {
      ctx.ui.notify("Hello from pi-toolkit! 🚀", "info");
      return "Hello Pi 插件运行正常！";
    },
  });
}
