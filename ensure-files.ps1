# ensure-files.ps1 — 构建前确保所有关键文件在磁盘上
$ErrorActionPreference = 'SilentlyContinue'

$files = @(
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
  'desktop/src/splash.tsx',
  'desktop/src/browser-viewer-main.tsx',
  'desktop/src/viewer-window-entry.tsx',
  'desktop/src/icon.png',
  'desktop/native/HanaWindowsSandboxHelper/main.cpp',
  'lib/llm/usage-observer.js',
  'lib/known-models.json',
  'lib/known-model-fallbacks.json',
  'lib/default-models.json',
  'lib/config.example.yaml',
  'lib/identity.example.md',
  'lib/ishiki.example.md',
  'lib/pinned.example.md',
  'scripts/prune-node-modules.mjs',
  'scripts/build-server.mjs'
)

$restored = 0
foreach ($f in $files) {
  if (-not (Test-Path $f)) {
    git checkout HEAD -- $f 2>$null
    if (Test-Path $f) { $restored++ }
  }
}
# 也恢复 assets 和 themes 目录
$dirs = @('desktop/src/assets/', 'desktop/src/themes/', 'lib/', 'skills2set/', 'packages/')
foreach ($d in $dirs) {
  git checkout HEAD -- $d 2>$null
}

if ($restored -gt 0) {
  Write-Host "✅ 恢复了 $restored 个缺失文件"
} else {
  Write-Host "✅ 所有文件都在"
}
