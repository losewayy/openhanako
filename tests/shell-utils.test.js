import { describe, expect, it } from "vitest";
import {
  baseNameForShellPath,
  envValue,
  isWin32PathLike,
  quoteCmdArg,
  splitShellLikeArgs,
} from "../lib/shell/shell-utils.js";

describe("shell utils", () => {
  it("reads environment variables case-insensitively", () => {
    expect(envValue({ ComSpec: "C:\\Windows\\System32\\cmd.exe" }, "COMSPEC")).toBe("C:\\Windows\\System32\\cmd.exe");
  });

  it("detects Windows paths and returns platform-aware basenames", () => {
    expect(isWin32PathLike("C:\\Program Files\\PowerShell\\7\\pwsh.exe")).toBe(true);
    expect(baseNameForShellPath("C:\\Program Files\\PowerShell\\7\\pwsh.exe")).toBe("pwsh.exe");
    expect(baseNameForShellPath("/bin/zsh")).toBe("zsh");
  });

  it("splits shell-like command arguments consistently", () => {
    expect(splitShellLikeArgs('powershell -Command "Write-Output \\"name\\""')).toEqual([
      "powershell",
      "-Command",
      'Write-Output "name"',
    ]);
  });

  it("can reject unterminated quotes for execution parsers", () => {
    expect(() => splitShellLikeArgs('python -c "print(1)', {
      throwOnUnterminated: true,
      errorPrefix: "[win32-exec]",
    })).toThrow('[win32-exec] Unterminated quote in command: python -c "print(1)');
  });

  it("quotes cmd arguments with cmd-safe double quote escaping", () => {
    expect(quoteCmdArg("C:\\work\\run tests.bat", { always: true })).toBe('"C:\\work\\run tests.bat"');
    expect(quoteCmdArg('name"here')).toBe('"name""here"');
  });
});
