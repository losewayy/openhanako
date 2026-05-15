import { describe, expect, it } from "vitest";
import * as minimax from "../../core/provider-compat/minimax.js";

describe("provider-compat/minimax — matches", () => {
  it("导出 matches 函数", () => {
    expect(typeof minimax.matches).toBe("function");
  });

  it("导出 apply 函数", () => {
    expect(typeof minimax.apply).toBe("function");
  });

  it("matches 对 null/undefined 返回 false（不抛错）", () => {
    expect(minimax.matches(null)).toBe(false);
    expect(minimax.matches(undefined)).toBe(false);
    expect(minimax.matches({})).toBe(false);
  });

  it("matches 识别 minimax provider", () => {
    expect(minimax.matches({ provider: "minimax" })).toBe(true);
    expect(minimax.matches({ provider: "MiniMax" })).toBe(true);
    expect(minimax.matches({ provider: "MINIMAX" })).toBe(true);
  });

  it("matches 识别官方 baseUrl", () => {
    expect(minimax.matches({ baseUrl: "https://api.minimaxi.com/v1" })).toBe(true);
    expect(minimax.matches({ baseUrl: "https://api.minimaxi.com/anthropic" })).toBe(true);
  });

  it("matches 识别 model.id 前缀", () => {
    expect(minimax.matches({ id: "MiniMax-M2.7" })).toBe(true);
    expect(minimax.matches({ id: "MiniMax-M2.5-highspeed" })).toBe(true);
    expect(minimax.matches({ id: "M2-her" })).toBe(true);
    expect(minimax.matches({ id: "m2-her" })).toBe(true);
  });

  it("matches 不把其他 provider 视为 minimax", () => {
    expect(minimax.matches({ provider: "openai", id: "gpt-4" })).toBe(false);
    expect(minimax.matches({ provider: "anthropic", id: "claude-3" })).toBe(false);
  });
});

describe("provider-compat/minimax — isHighspeedModel", () => {
  it("导出 isHighspeedModel 函数", () => {
    expect(typeof minimax.isHighspeedModel).toBe("function");
  });

  it("isHighspeedModel 识别 highspeed 变体", () => {
    expect(minimax.isHighspeedModel({ id: "MiniMax-M2.7-highspeed" })).toBe(true);
    expect(minimax.isHighspeedModel({ id: "MiniMax-M2.5-HIGHSPEED" })).toBe(true);
    expect(minimax.isHighspeedModel({ id: "minimax-m2.7-highspeed" })).toBe(true);
  });

  it("isHighspeedModel 对非 highspeed 模型返回 false", () => {
    expect(minimax.isHighspeedModel({ id: "MiniMax-M2.7" })).toBe(false);
    expect(minimax.isHighspeedModel({ id: "MiniMax-M2.5" })).toBe(false);
    expect(minimax.isHighspeedModel(null)).toBe(false);
    expect(minimax.isHighspeedModel({})).toBe(false);
  });
});

describe("provider-compat/minimax — apply (cache_control)", () => {
  it("将 system 字符串转为数组并添加 cache_control", () => {
    const payload = {
      model: "MiniMax-M2.7",
      system: "You are a helpful assistant.",
      messages: [{ role: "user", content: "Hi" }],
    };
    const result = minimax.apply(payload, { id: "MiniMax-M2.7" });

    expect(Array.isArray(result.system)).toBe(true);
    expect(result.system[0].type).toBe("text");
    expect(result.system[0].text).toBe("You are a helpful assistant.");
    expect(result.system[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("对已有 cache_control 的 system 不重复添加", () => {
    const payload = {
      model: "MiniMax-M2.7",
      system: [{ type: "text", text: "System", cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: "Hi" }],
    };
    const result = minimax.apply(payload, { id: "MiniMax-M2.7" });

    expect(result.system).toBe(payload.system); // 不变
  });

  it("为 tools 数组的最后一个工具添加 cache_control", () => {
    const payload = {
      model: "MiniMax-M2.7",
      tools: [
        { name: "read", description: "Read a file" },
        { name: "write", description: "Write a file" },
      ],
      messages: [{ role: "user", content: "Hi" }],
    };
    const result = minimax.apply(payload, { id: "MiniMax-M2.7" });

    expect(result.tools[0].cache_control).toBeUndefined();
    expect(result.tools[1].cache_control).toEqual({ type: "ephemeral" });
  });

  it("为最后一个 user message 的 content 添加 cache_control", () => {
    const payload = {
      model: "MiniMax-M2.7",
      messages: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there" },
        { role: "user", content: "How are you?" },
      ],
    };
    const result = minimax.apply(payload, { id: "MiniMax-M2.7" });

    // 最后一个 user message 应该有 cache_control
    const lastUserMsg = result.messages[result.messages.length - 1];
    expect(lastUserMsg.role).toBe("user");
    expect(Array.isArray(lastUserMsg.content)).toBe(true);
    expect(lastUserMsg.content[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("不修改原始 payload", () => {
    const payload = {
      model: "MiniMax-M2.7",
      system: "System prompt",
      messages: [{ role: "user", content: "Hi" }],
    };
    const result = minimax.apply(payload, { id: "MiniMax-M2.7" });

    expect(payload.system).toBe("System prompt"); // 原始不变
    expect(Array.isArray(result.system)).toBe(true); // 结果是数组
  });
});

describe("provider-compat/minimax — normalizeProviderResponse", () => {
  it("导出 normalizeProviderResponse 函数", () => {
    expect(typeof minimax.normalizeProviderResponse).toBe("function");
  });

  it("过滤 OpenAI 格式中的空 id tool_call", () => {
    const response = {
      choices: [{
        message: {
          tool_calls: [
            { id: "call_123", type: "function", function: { name: "read" } },
            { id: "", type: "function", function: { name: "write" } }, // 空 id
            { id: null, type: "function", function: { name: "bash" } }, // null id
          ],
        },
      }],
    };
    const result = minimax.normalizeProviderResponse(response);

    expect(result.choices[0].message.tool_calls.length).toBe(1);
    expect(result.choices[0].message.tool_calls[0].id).toBe("call_123");
  });

  it("过滤 Anthropic 格式中的空 id tool_use block", () => {
    const response = {
      content: [
        { type: "text", text: "Let me help you." },
        { type: "tool_use", id: "toolu_123", name: "read" },
        { type: "tool_use", id: "", name: "write" }, // 空 id
        { type: "tool_use", name: "bash" }, // 缺失 id
      ],
    };
    const result = minimax.normalizeProviderResponse(response);

    const toolUseBlocks = result.content.filter(b => b.type === "tool_use");
    expect(toolUseBlocks.length).toBe(1);
    expect(toolUseBlocks[0].id).toBe("toolu_123");
  });

  it("不过滤有效的 tool_call/tool_use", () => {
    const response = {
      content: [
        { type: "text", text: "Hello" },
        { type: "tool_use", id: "toolu_123", name: "read" },
        { type: "tool_use", id: "toolu_456", name: "write" },
      ],
    };
    const result = minimax.normalizeProviderResponse(response);

    const toolUseBlocks = result.content.filter(b => b.type === "tool_use");
    expect(toolUseBlocks.length).toBe(2);
  });

  it("对无效输入返回原值", () => {
    expect(minimax.normalizeProviderResponse(null)).toBe(null);
    expect(minimax.normalizeProviderResponse(undefined)).toBe(undefined);
    expect(minimax.normalizeProviderResponse("string")).toBe("string");
  });
});
