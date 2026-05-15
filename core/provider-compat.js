/**
 * core/provider-compat.js — LLM HTTP payload 兼容层（唯一对外入口）
 *
 * 架构：dispatcher + 子模块。所有 provider-specific 补丁拆到 ./provider-compat/<name>.js。
 * 完整规范见 ./provider-compat/README.md。
 *
 * 两条调用路径共享本入口（commit f5b5d69 — chat 路径与 utility 路径合一的纪律）：
 *   - core/llm-client.js 的 callText（非流式 / utility 路径）
 *   - core/engine.js 的 Pi SDK before_provider_request 扩展（流式 / chat 路径）
 *
 * 本文件只保留：
 *   1. dispatcher（按 matches 分发到子模块，first-match-wins）
 *   2. 与 provider 无关的通用补丁（stripEmptyTools, stripIncompatibleThinking,
 *      normalizeImplicitOutputBudget, sanitizeOrphanedToolResults）
 *   3. 协议鉴别函数（isDeepSeekModel, isAnthropicModel, getThinkingFormat）— 供其他 hana 模块复用
 *
 * 不允许在本文件加任何 provider-specific 实现细节；新 provider 一律开
 * core/provider-compat/<name>.js 子模块。
 */

import * as deepseek from "./provider-compat/deepseek.js";
import * as mimo from "./provider-compat/mimo.js";
import * as qwen from "./provider-compat/qwen.js";
import * as openaiVideoUrl from "./provider-compat/openai-video-url.js";
import * as minimax from "./provider-compat/minimax.js";
import * as anthropic from "./provider-compat/anthropic.js";
import { normalizeImplicitOutputBudget } from "./provider-compat/output-budget.js";
import {
  getReasoningProfile as getDeclaredReasoningProfile,
  getThinkingFormat as getDeclaredThinkingFormat,
} from "../shared/model-capabilities.js";

/**
 * 子模块注册表。顺序敏感：first-match-wins。
 * 新 provider 默认加在末尾；只有当模块的 matches 是另一模块子集（更具体规则）时才前置。
 */
const PROVIDER_MODULES = [deepseek, mimo, qwen, openaiVideoUrl, minimax, anthropic];

function lower(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

// ── Provider 鉴别（导出供其他 hana 模块复用，不属于子模块逻辑）──

/**
 * 判断 model 是否走 DeepSeek 兼容路径。
 * 委托给 deepseek 子模块的 matches，避免双源真相。
 */
export function isDeepSeekModel(model) {
  return deepseek.matches(model);
}

/**
 * 判断 model 是否走 Anthropic thinking 兼容路径。
 * Anthropic 没有专门的子模块（pi-ai SDK 已直接兼容），这里消费
 * model.compat.thinkingFormat，不按 provider 名猜测第三方兼容服务。
 */
export function isAnthropicModel(model) {
  if (!model || typeof model !== "object") return false;
  return lower(model.provider) === "anthropic" || getThinkingFormat(model) === "anthropic";
}

export function getThinkingFormat(model) {
  const declared = getDeclaredThinkingFormat(model);
  if (declared) return declared;
  if (isDeepSeekModel(model)) return "deepseek";
  return null;
}

export function getReasoningProfile(model) {
  return getDeclaredReasoningProfile(model);
}

// ── 通用 payload 处理（与 provider 无关）──

function stripEmptyTools(payload) {
  if (Array.isArray(payload.tools) && payload.tools.length === 0) {
    const { tools, ...rest } = payload;
    return rest;
  }
  return payload;
}

function stripIncompatibleThinking(payload, model) {
  if (!payload.thinking) return payload;
  // payload.thinking 只对 Anthropic-style / DeepSeek-style 请求体有效。
  // Qwen/openrouter 等格式即使支持 reasoning，也不接收这个字段。
  // 没有 model 信息时保守保留（旧降级路径），避免误删 anthropic 调用。
  if (!model) return payload;
  const thinkingFormat = getThinkingFormat(model);
  if (thinkingFormat === "anthropic" || thinkingFormat === "deepseek") return payload;
  const { thinking, ...rest } = payload;
  return rest;
}

/**
 * 清洗历史消息中的孤立 tool_result
 *
 * 解决的问题：
 *   - 历史中可能包含引用无效 tool_call_id 的 tool_result
 *   - 这些孤立消息会导致后续 API 请求失败（如 HTTP 400 tool_call_id not found）
 *   - 影响多个 provider：MiniMax、Mistral、Anthropic 等
 *
 * 参考 GitHub Issues：
 *   - openclaw/openclaw#23595 (Mistral)
 *   - openclaw/openclaw#24829 (通用)
 *   - openclaw/openclaw#2769 (Anthropic)
 *
 * @param {Array} messages - session 历史消息
 * @returns {Array} 清洗后的消息数组
 */
function sanitizeOrphanedToolResults(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return messages;
  }

  /**
   * 从消息中收集所有有效的 tool_call_id（兼容多种格式）
   */
  function collectValidToolCallIds(msgs) {
    const ids = new Set();
    for (const msg of msgs) {
      if (msg?.role !== 'assistant') continue;

      // Pi SDK 格式: ToolCall content blocks
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block?.type === 'toolCall' && typeof block.id === 'string' && block.id.trim().length > 0) {
            ids.add(block.id);
          }
        }
      }

      // OpenAI 格式: tool_calls 顶层数组
      if (Array.isArray(msg.tool_calls)) {
        for (const call of msg.tool_calls) {
          if (typeof call?.id === 'string' && call.id.trim().length > 0) {
            ids.add(call.id);
          }
        }
      }

      // Anthropic 格式: tool_use content blocks
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block?.type === 'tool_use' && typeof block.id === 'string' && block.id.trim().length > 0) {
            ids.add(block.id);
          }
        }
      }
    }
    return ids;
  }

  // 0. 清洗 assistant 消息中的畸形 toolCall（空 ID 的调用块）
  //    这些畸形块在 API 响应层面就该被过滤，但 normalizeProviderResponse
  //    未接入（另有 ticket），历史 session 已受污染。不清理的话 Pi SDK
  //    序列化时会认为 tool call 数 != tool result 数，导致序列化中断或 400。
  let assistantChanged = false;
  const cleanedAssistant = messages.map((msg) => {
    if (msg?.role !== 'assistant') return msg;

    let newContent = msg.content;
    let newToolCalls = msg.tool_calls;

    // Pi SDK 格式: content 中的 toolCall block
    if (Array.isArray(newContent)) {
      const filtered = newContent.filter((block) => {
        if (block?.type === 'toolCall') {
          const ok = typeof block.id === 'string' && block.id.trim().length > 0;
          if (!ok) {
            console.warn(`[provider-compat] 清理畸形 toolCall: id=${JSON.stringify(block.id)} name=${JSON.stringify(block.name)}`);
            assistantChanged = true;
            return false;
          }
        }
        return true;
      });
      if (filtered.length !== newContent.length) {
        newContent = filtered;
      }
    }

    // Anthropic 格式: content 中的 tool_use block
    if (Array.isArray(newContent)) {
      const filtered = newContent.filter((block) => {
        if (block?.type === 'tool_use') {
          const ok = typeof block.id === 'string' && block.id.trim().length > 0;
          if (!ok) {
            console.warn(`[provider-compat] 清理畸形 tool_use: id=${JSON.stringify(block.id)}`);
            assistantChanged = true;
            return false;
          }
        }
        return true;
      });
      if (filtered.length !== newContent.length) {
        newContent = filtered;
      }
    }

    // OpenAI 格式: tool_calls 顶层数组
    if (Array.isArray(newToolCalls)) {
      const filtered = newToolCalls.filter((call) => {
        const ok = typeof call?.id === 'string' && call.id.trim().length > 0;
        if (!ok) {
          console.warn(`[provider-compat] 清理畸形 tool_calls 条目: id=${JSON.stringify(call?.id)}`);
          assistantChanged = true;
          return false;
        }
        return true;
      });
      if (filtered.length !== newToolCalls.length) {
        newToolCalls = filtered;
      }
    }

    if (newContent !== msg.content || newToolCalls !== msg.tool_calls) {
      return { ...msg, content: newContent, tool_calls: newToolCalls };
    }
    return msg;
  });

  // 如果有清洗，后续步骤在清洗后的消息上操作
  const cleanMsgs = assistantChanged ? cleanedAssistant : messages;

  // 1. 从清洗后的消息收集所有有效的 tool_call_id
  const validToolCallIds = collectValidToolCallIds(cleanMsgs);

  // 2. 过滤引用无效 ID 的 tool result
  let changed = false;
  const sanitized = cleanMsgs.map((msg) => {
    if (!msg) return msg;

    // Pi SDK 格式: toolResult message with toolCallId
    // 注意：不能用 msg.toolCallId 做真假值检查，空字符串 "" 在 JavaScript 中为 falsy，
    // 但 MiniMax 的畸变回包恰好产生了空字符串 toolCallId，需要明确判空。
    if (msg.role === 'toolResult') {
      const id = msg.toolCallId;
      if (typeof id !== 'string' || !id.trim() || !validToolCallIds.has(id)) {
        console.warn(`[provider-compat] 过滤孤立 toolResult: toolCallId=${id}`);
        changed = true;
        return null;
      }
    }

    // OpenAI 格式: tool message with tool_call_id
    if (msg.role === 'tool') {
      const id = msg.tool_call_id;
      if (typeof id !== 'string' || !id.trim() || !validToolCallIds.has(id)) {
        console.warn(`[provider-compat] 过滤孤立 tool_result: tool_call_id=${id}`);
        changed = true;
        return null;
      }
    }

    // Anthropic 格式: user message with tool_result content
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      const filteredContent = msg.content.filter((block) => {
        if (block?.type !== 'tool_result') return true;
        const id = block.tool_use_id;
        if (typeof id !== 'string' || !id.trim()) return true;
        if (!validToolCallIds.has(id)) {
          console.warn(`[provider-compat] 过滤孤立 tool_result: tool_use_id=${id}`);
          changed = true;
          return false;
        }
        return true;
      });

      if (filteredContent.length !== msg.content.length) {
        changed = true;
        return { ...msg, content: filteredContent };
      }
    }

    return msg;
  }).filter(Boolean);

  if (changed) {
    console.log(`[provider-compat] 历史清洗：${cleanMsgs.length} → ${sanitized.length} 条消息`);
  }

  return changed ? sanitized : cleanMsgs;
}

/**
 * Provider payload 兼容化的唯一入口。chat 路径与 utility 路径共享。
 *
 * 处理顺序：
 *   1. 通用补丁（stripEmptyTools / stripIncompatibleThinking）
 *   2. 子模块分发（first-match-wins，最多匹配一个）
 *
 * @param {object} payload — 即将发送的 HTTP body（OpenAI / Anthropic 风格）
 * @param {object|null|undefined} model — 完整 model 对象 {id, provider, baseUrl, reasoning, maxTokens, quirks, ...}
 * @param {{ mode?: "chat" | "utility", reasoningLevel?: string, outputBudgetSource?: "user" | "system" | "sdk-default", maxTokensSource?: string, userMaxTokens?: number }} [options]
 * @returns {object} 处理后的 payload
 */
export function normalizeProviderPayload(payload, model, options = {}) {
  if (!payload || typeof payload !== "object") return payload;

  let result = payload;

  // 1. 通用补丁（与 provider 无关）
  result = stripEmptyTools(result);
  result = stripIncompatibleThinking(result, model);
  result = normalizeImplicitOutputBudget(result, model, options);

  // 2. Provider-specific 补丁（按 matches 分发，first-match-wins）
  for (const mod of PROVIDER_MODULES) {
    if (mod.matches(model)) {
      result = mod.apply(result, model, options);
      break;
    }
  }

  return result;
}

/**
 * Provider context 兼容化入口。运行于 Pi SDK context hook，早于 provider
 * serializer，专门承载 replay/history 这类 payload hook 已经来不及处理的协议校验。
 *
 * 处理顺序：
 *   1. 通用清洗（孤立 tool_result 过滤）— 所有 provider 都执行
 *   2. Provider 特定处理 — 只对匹配的 provider 执行
 *
 * @param {Array|any} messages — Pi SDK AgentMessage[]
 * @param {object|null|undefined} model
 * @param {{ mode?: "chat" | "utility", reasoningLevel?: string }} [options]
 * @returns {Array|any}
 */
export function normalizeProviderContextMessages(messages, model, options = {}) {
  if (!Array.isArray(messages)) return messages;

  // 1. 通用清洗：过滤孤立的 tool_result（对所有 provider 生效）
  let result = sanitizeOrphanedToolResults(messages);

  // 2. Provider 特定处理（如 DeepSeek 的 reasoning_content 校验）
  for (const mod of PROVIDER_MODULES) {
    if (mod.matches(model)) {
      if (typeof mod.normalizeContextMessages === "function") {
        result = mod.normalizeContextMessages(result, model, options);
      }
      break;
    }
  }

  return result;
}

export { isHighspeedModel } from "./provider-compat/minimax.js";
