/**
 * ensure-build-files.cjs — 构建前确保关键文件存在
 * 被 build:renderer 等脚本自动调用，防止文件意外丢失导致构建失败
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
/**
 * ensure-build-files.cjs — 构建前确保关键文件存在
 * 先尝试从 HEAD 恢复，若 HEAD 没有则从 upstream/main 拉取。
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

/** 从指定 ref 恢复文件 */
function restoreFrom(ref, f) {
  try {
    execSync(`git checkout "${ref}" -- "${f}"`, { cwd: ROOT, stdio: 'pipe' });
    return fs.existsSync(path.resolve(ROOT, f));
  } catch { return false; }
}

const files = [
  // Root Vite config
  'vite.config.ts',
  // HTML entry points (from upstream/main)
  'desktop/src/index.html',
  'desktop/src/settings.html',
  'desktop/src/onboarding.html',
  'desktop/src/splash.html',
  'desktop/src/browser-viewer.html',
  'desktop/src/viewer-window.html',
  // TSX entry points (from upstream/main)
  'desktop/src/main.tsx',
  'desktop/src/settings-main.tsx',
  'desktop/src/onboarding-main.tsx',
  'desktop/src/splash-main.tsx',
  'desktop/src/browser-viewer-main.tsx',
  'desktop/src/viewer-window-entry.tsx',
  // Entry components (from upstream/main, NOT in HEAD)
  'desktop/src/react/App.tsx',
  'desktop/src/react/bootstrap.ts',
  'desktop/src/react/MainContent.tsx',
  'desktop/src/react/settings/SettingsApp.tsx',
  'desktop/src/react/splash/SplashApp.tsx',
  'desktop/src/react/onboarding/OnboardingApp.tsx',
  'desktop/src/react/browser-viewer/BrowserViewerApp.tsx',
  'desktop/src/react/components/PreviewEditor.tsx',
  'desktop/src/react/components/ErrorBoundary.tsx',
  'desktop/src/react/components/WindowControls.tsx',
  'desktop/src/react/components/app/AppPages.tsx',
  'desktop/src/shared/appearance-preferences.ts',
  'desktop/src/shared/theme.ts',
  // Assets & native
  'desktop/src/icon.png',
  'desktop/native/HanaWindowsSandboxHelper/main.cpp',
  // Core scripts
  'lib/llm/usage-observer.js',
  'scripts/build-server.mjs',
  'scripts/prune-node-modules.mjs',
  // Packages
  'packages/plugin-protocol/src/index.ts',
];

let restored = 0;
for (const f of files) {
  const fullPath = path.resolve(ROOT, f);
  if (!fs.existsSync(fullPath)) {
    // 先试 HEAD，再试 upstream/main
    if (restoreFrom('HEAD', f) || restoreFrom('upstream/main', f)) {
      restored++;
    }
  }
}

// Restore directories
const dirs = [
  'desktop/src/assets',
  'desktop/src/themes',
  'lib/identity-templates',
  'lib/ishiki-templates',
  'skills2set',
];
for (const d of dirs) {
  const fullPath = path.resolve(ROOT, d);
  if (!fs.existsSync(fullPath)) {
    restoreFrom('upstream/main', d);
  }
}

// 额外恢复 react/ 目录下可能缺失的入口组件
const reactDirs = [
  'desktop/src/react/settings',
  'desktop/src/react/splash',
  'desktop/src/react/onboarding',
  'desktop/src/react/browser-viewer',
  'desktop/src/react/components/app',
];
for (const d of reactDirs) {
  const fullPath = path.resolve(ROOT, d);
  if (!fs.existsSync(fullPath)) {
    restoreFrom('upstream/main', d);
  }
}

if (restored > 0) {
  console.log(`[ensure] restored ${restored} missing files`);
}
