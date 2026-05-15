/**
 * ensure-build-files.cjs — 构建前确保关键文件存在
 * 被 build:renderer 等脚本自动调用，防止文件意外丢失导致构建失败
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const files = [
  'vite.config.ts',
  'desktop/src/index.html',
  'desktop/src/settings.html',
  'desktop/src/onboarding.html',
  'desktop/src/splash.html',
  'desktop/src/browser-viewer.html',
  'desktop/src/viewer-window.html',
  'desktop/src/main.tsx',
  'desktop/src/settings-main.tsx',
  'desktop/src/onboarding-main.tsx',
  'desktop/src/splash-main.tsx',
  'desktop/src/browser-viewer-main.tsx',
  'desktop/src/viewer-window-entry.tsx',
  'desktop/src/icon.png',
  'desktop/native/HanaWindowsSandboxHelper/main.cpp',
  'lib/llm/usage-observer.js',
  'scripts/build-server.mjs',
  'scripts/prune-node-modules.mjs',
];

let restored = 0;
for (const f of files) {
  const fullPath = path.resolve(ROOT, f);
  if (!fs.existsSync(fullPath)) {
    try {
      execSync(`git checkout HEAD -- "${f}"`, { cwd: ROOT, stdio: 'pipe' });
      if (fs.existsSync(fullPath)) {
        restored++;
      }
    } catch {}
  }
}

// Restore directories if missing
const dirs = [
  'desktop/src/assets',
  'desktop/src/themes',
  'lib/identity-templates',
  'lib/ishiki-templates',
  'skills2set',
  'packages/plugin-protocol/src',
];
for (const d of dirs) {
  const fullPath = path.resolve(ROOT, d);
  if (!fs.existsSync(fullPath)) {
    try {
      execSync(`git checkout HEAD -- "${d}"`, { cwd: ROOT, stdio: 'pipe' });
    } catch {}
  }
}

if (restored > 0) {
  console.log(`[ensure] restored ${restored} missing files`);
}
