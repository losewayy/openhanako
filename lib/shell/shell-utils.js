import path from "node:path";

export function envValue(env, name) {
  const source = env || {};
  if (Object.prototype.hasOwnProperty.call(source, name)) return source[name];
  const key = Object.keys(source).find((item) => item.toLowerCase() === name.toLowerCase());
  return key ? source[key] : undefined;
}

export function isWin32PathLike(filePath) {
  return /^[a-z]:[\\/]|^\\\\/i.test(String(filePath || ""));
}

export function baseNameForShellPath(filePath, { stripExe = false } = {}) {
  const raw = String(filePath || "").trim();
  if (!raw) return "";
  const base = isWin32PathLike(raw) || raw.includes("\\")
    ? path.win32.basename(raw)
    : path.basename(raw);
  return stripExe ? base.replace(/\.exe$/i, "") : base;
}

export function splitShellLikeArgs(command, {
  throwOnUnterminated = false,
  errorPrefix = "",
} = {}) {
  const args = [];
  let current = "";
  let quote = null;

  const input = String(command || "");
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (ch === "\\" && quote !== "'") {
      const next = input[i + 1];
      if (next && (/\s/.test(next) || next === "'" || next === "\"" || next === "\\")) {
        current += next;
        i += 1;
      } else {
        current += ch;
      }
      continue;
    }

    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }

    if (ch === "'" || ch === "\"") {
      quote = ch;
      continue;
    }

    if (/\s/.test(ch)) {
      if (current.length > 0) {
        args.push(current);
        current = "";
      }
      continue;
    }

    current += ch;
  }

  if (quote && throwOnUnterminated) {
    const prefix = errorPrefix ? `${errorPrefix} ` : "";
    throw new Error(`${prefix}Unterminated quote in command: ${command}`);
  }
  if (current.length > 0) args.push(current);
  return args;
}

export function quoteCmdArg(arg, { always = false } = {}) {
  const text = String(arg ?? "");
  if (!always && /^[^\s"&|<>^()]+$/.test(text)) return text;
  return `"${text.replace(/"/g, "\"\"")}"`;
}
