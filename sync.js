#!/usr/bin/env node
/**
 * pi-toolkit 同步脚本
 * 跨平台 (Windows / macOS / Linux) 自动部署扩展、Skills、配置到本机 Pi 环境
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const TOOLKIT_ROOT = __dirname;
const HOME_DIR = os.homedir();
const PI_AGENT_DIR = path.join(HOME_DIR, '.pi', 'agent');
const AGENTS_SKILLS_DIR = path.join(HOME_DIR, '.agents', 'skills');

console.log('==================================================');
console.log('🚀 开始同步 Pi Toolkit 到本机环境');
console.log(`📂 Toolkit 根目录: ${TOOLKIT_ROOT}`);
console.log(`🏠 用户主目录:     ${HOME_DIR}`);
console.log(`⚙️  Pi Agent 目录:  ${PI_AGENT_DIR}`);
console.log(`🧠 Skills 目录:    ${AGENTS_SKILLS_DIR}`);
console.log('==================================================\n');

// 1. 确保目标目录存在
fs.mkdirSync(PI_AGENT_DIR, { recursive: true });
fs.mkdirSync(AGENTS_SKILLS_DIR, { recursive: true });

// 辅助函数：递归拷贝目录
function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 2. 同步 Skills
console.log('📦 [1/4] 同步 Skills...');
const skillsSrcDir = path.join(TOOLKIT_ROOT, 'skills');
if (fs.existsSync(skillsSrcDir)) {
  const skillEntries = fs.readdirSync(skillsSrcDir, { withFileTypes: true });
  for (const entry of skillEntries) {
    const srcPath = path.join(skillsSrcDir, entry.name);
    const destPath = path.join(AGENTS_SKILLS_DIR, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
      console.log(`  ✓ 同步 Skill: ${entry.name}`);
    }
  }
}

// 3. 同步脚本文件 (ept-portal-token.py)
console.log('\n📜 [2/4] 同步辅助脚本...');
const tokenScriptSrc = path.join(TOOLKIT_ROOT, 'config', 'ept-portal-token.py');
if (fs.existsSync(tokenScriptSrc)) {
  const destTokenScript = path.join(PI_AGENT_DIR, 'ept-portal-token.py');
  fs.copyFileSync(tokenScriptSrc, destTokenScript);
  console.log(`  ✓ 同步: ept-portal-token.py -> ${destTokenScript}`);
}

// 4. 同步并合并 models.json
console.log('\n🤖 [3/4] 配置 models.json...');
const modelsTemplatePath = path.join(TOOLKIT_ROOT, 'config', 'models.template.json');
const modelsDestPath = path.join(PI_AGENT_DIR, 'models.json');

if (fs.existsSync(modelsTemplatePath)) {
  const agentDirPosix = PI_AGENT_DIR.split(path.sep).join('/');
  let modelsTemplateRaw = fs.readFileSync(modelsTemplatePath, 'utf8');
  modelsTemplateRaw = modelsTemplateRaw.replace(/\{\{PI_AGENT_DIR\}\}/g, agentDirPosix);
  const templateModels = JSON.parse(modelsTemplateRaw);

  let finalModels = templateModels;
  if (fs.existsSync(modelsDestPath)) {
    try {
      const existingModels = JSON.parse(fs.readFileSync(modelsDestPath, 'utf8'));
      finalModels = {
        ...existingModels,
        providers: {
          ...(existingModels.providers || {}),
          ...(templateModels.providers || {})
        }
      };
    } catch (e) {
      console.warn('  ⚠️ 原 models.json 解析失败，使用模板覆盖');
    }
  }
  fs.writeFileSync(modelsDestPath, JSON.stringify(finalModels, null, 2), 'utf8');
  console.log(`  ✓ 已更新 ${modelsDestPath}`);
}

// 5. 同步并配置 settings.json (自动识别并注册本地扩展路径)
console.log('\n⚙️  [4/4] 配置 settings.json & 本地扩展...');
const settingsTemplatePath = path.join(TOOLKIT_ROOT, 'config', 'settings.template.json');
const settingsDestPath = path.join(PI_AGENT_DIR, 'settings.json');

let currentSettings = {};
if (fs.existsSync(settingsDestPath)) {
  try {
    currentSettings = JSON.parse(fs.readFileSync(settingsDestPath, 'utf8'));
  } catch (e) {
    currentSettings = {};
  }
}

let templateSettings = {};
if (fs.existsSync(settingsTemplatePath)) {
  templateSettings = JSON.parse(fs.readFileSync(settingsTemplatePath, 'utf8'));
}

// 获取 toolkit 下 extensions 目录中的本地扩展
const localExts = [];
const extensionsDir = path.join(TOOLKIT_ROOT, 'extensions');
if (fs.existsSync(extensionsDir)) {
  const extEntries = fs.readdirSync(extensionsDir, { withFileTypes: true });
  for (const entry of extEntries) {
    if (entry.isDirectory()) {
      const extPathPosix = path.join(extensionsDir, entry.name).split(path.sep).join('/');
      localExts.push(extPathPosix);
      console.log(`  ✓ 发现本地扩展: ${entry.name} (${extPathPosix})`);
    }
  }
}

// 合并 packages 列表：过滤掉其他电脑上的旧绝对路径，保留 npm 包和当前电脑的正确路径
const basePackages = templateSettings.packages || [];
const existingPackages = currentSettings.packages || [];

// 筛选现有包列表中的 npm 包和非失效包
const validExisting = existingPackages.filter(pkg => {
  if (pkg.startsWith('npm:') || pkg.startsWith('git:') || pkg.startsWith('https://')) return true;
  // 如果是旧的本地路径但不是以当前 extensionsDir 开头，并且当前本地路径中已有对应同名扩展，则过滤掉旧路径
  const isOldLocalExt = localExts.some(newExt => {
    const extName = path.basename(newExt);
    return pkg.includes(extName) && pkg !== newExt;
  });
  return !isOldLocalExt;
});

const mergedPackagesSet = new Set([...basePackages, ...validExisting, ...localExts]);
const finalPackages = Array.from(mergedPackagesSet);

const finalSettings = {
  ...templateSettings,
  ...currentSettings,
  packages: finalPackages
};

fs.writeFileSync(settingsDestPath, JSON.stringify(finalSettings, null, 2), 'utf8');
console.log(`  ✓ 已更新 ${settingsDestPath}`);
console.log(`  📦 当前已注册包列表 (${finalPackages.length}):`);
finalPackages.forEach(p => console.log(`     - ${p}`));

// 6. 执行 pi update
console.log('\n--------------------------------------------------');
console.log('🔄 正在调用 pi 更新扩展依赖...');
try {
  execSync('pi update --all', { stdio: 'inherit', shell: true });
  console.log('\n✨ [成功] 所有扩展与配置已就绪！');
} catch (err) {
  console.log('\n⚠️  调用 pi update 失败或当前终端未找到 pi 命令。');
  console.log('👉 请稍后手动执行: pi update --all');
}
console.log('==================================================');
