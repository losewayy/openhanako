#!/usr/bin/env node
/**
 * prune-node-modules.mjs — 按文件类型清理 node_modules
 *
 * 替代 @vercel/nft 的 node_modules 裁剪方案。
 * Windows 上 @vercel/nft 有三个问题：死锁、5GB内存占用、进程不退出。
 * 本脚本按文件类型清理，3秒完成，不吃内存不卡死。
 *
 * 用法：
 *   import { pruneNodeModules } from "./prune-node-modules.mjs";
 *   const stat = pruneNodeModules("/path/to/node_modules");
 */

import fs from "fs";
import path from "path";

// Node.js 运行时只加载这四种类型
const KEEP_EXTENSIONS = new Set([".js", ".cjs", ".mjs", ".json", ".node", ".wasm"]);

// 永远保留的文件（精确匹配，无扩展名）
const KEEP_BASENAMES = new Set([
  "package", "package-lock", "yarn.lock", ".npm",
  "Makefile", "CMakeLists.txt", "setup.py", "tox.ini",
]);

// 永远跳过的目录
const SKIP_DIRS = new Set([
  "node_modules", ".git", ".svn", ".hg",
  "test", "tests", "__tests__", "spec", "benchmark",
  "docs", "doc", "coverage", ".nyc_output",
  ".types", "@types", "@babel",
]);

function isDeletable(filename) {
  if (KEEP_BASENAMES.has(filename)) return false;
  const ext = path.extname(filename);
  if (KEEP_EXTENSIONS.has(ext)) return false;
  // .d.ts .map .md .txt LICENSE 等
  return true;
}

/**
 * @param {string} nmDir
 * @returns {{ deletedFiles: number, savedBytes: number }}
 */
export function pruneNodeModules(nmDir) {
  let deletedFiles = 0;
  let savedBytes = 0;

  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        // 跳过 @scope/ 包顶层目录本身
        if (entry.name.startsWith("@") && entry.name.includes("/")) continue;
        walk(full);
        try { if (!fs.readdirSync(full).length) fs.rmdirSync(full); } catch {}
        continue;
      }

      if (entry.isSymbolicLink()) continue;
      if (!isDeletable(entry.name)) continue;

      try {
        savedBytes += fs.statSync(full).size;
        fs.unlinkSync(full);
        deletedFiles++;
      } catch {}
    }
  }

  walk(nmDir);
  return { deletedFiles, savedBytes };
}

// CLI
const nmDir = process.argv[2] || process.cwd();
const r = pruneNodeModules(nmDir);
const MB = n => (n / 1024 / 1024).toFixed(1);
console.log(`[prune-node-modules] deleted ${r.deletedFiles} files, saved ${MB(r.savedBytes)} MB`);