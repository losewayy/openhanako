/**
 * MiniMax provider 兼容层
 *
 * 处理 provider:
 *   - provider === "minimax"
 *   - baseUrl 包含 "api.minimaxi.com"
 *   - model.id 以 "MiniMax-" 或 "M2-" 开头
 *
 * 功能：
 *   1. cache_control 支持（Anthropic 主动缓存）
 *   2. highspeed 模型检测（为后续优化提供信号）
 *   3. 响应校验（过滤畸形 tool_call_id）
 *
 * thinking signature 说明：
 *   - MiniMax API 返回 signature 字段
 *   - Pi SDK 正确处理：输入时存储为 thinkingSignature，输出时转为 signature
 *   - 如果 signature 缺失，Pi SDK 会把 thinking block 降级为 text block
 *   - 无需额外处理，Pi SDK 已正确实现
 *
 * 接口契约：见 ./README.md
 */

const CACHE_CONTROL = { type: "ephemeral" };

function lower(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

/**
 * 判断 model 是否走 MiniMax 兼容路径
 */
export function matches(model) {
  if (!model || typeof model !== "object") return false;
  const provider = lower(model.provider);
  const baseUrl = lower(model.baseUrl || model.base_url);
  const modelId = lower(model.id || "");

  return provider === "minimax"
    || baseUrl.includes("api.minimaxi.com")
    || modelId.startsWith("minimax-")
    || modelId.startsWith("m2-");
}

/**
 * 判断是否为 highspeed 模型
 * highspeed 变体输出速度约 100 TPS，标准版约 60 TPS
 */
export function isHighspeedModel(model) {
  if (!model || typeof model !== "object") return false;
  const modelId = lower(model.id || "");
  return modelId.includes("highspeed");
}

/**
 * 处理请求 payload
 * - 为 system 和 tools 添加 cache_control（Anthropic 主动缓存）
 */
export function apply(payload, model, options = {}) {
  let result = payload;

  // 处理 system（字符串 → 数组，添加 cache_control）
  if (Object.prototype.hasOwnProperty.call(payload, "system")) {
    const system = normalizeSystem(payload.system);
    if (system.changed) result = { ...result, system: system.value };
  }

  // 处理 tools（最后一个工具添加 cache_control）
  if (Array.isArray(result.tools) && result.tools.length > 0) {
    const tools = normalizeTools(result.tools);
    if (tools.changed) result = { ...result, tools: tools.value };
  }

  // 处理 messages（最后一个 user message 添加 cache_control）
  if (Array.isArray(result.messages) && result.messages.length > 0) {
    const messages = normalizeMessages(result.messages);
    if (messages.changed) result = { ...result, messages: messages.value };
  }

  return result;
}

/**
 * 校验和清洗 MiniMax API 响应
 *
 * 解决的问题：
 *   - MiniMax API 偶发返回畸形 tool_call_id（空字符串或缺失）
 *   - 畸形响应若写入历史，会导致后续请求永久失败
 *
 * @param {object} response - API 响应对象
 * @returns {object} 清洗后的响应对象
 */
export function normalizeProviderResponse(response) {
  if (!response || typeof response !== "object") return response;

  let result = response;

  // 处理 OpenAI 格式的 tool_calls
  if (Array.isArray(result.choices)) {
    for (let i = 0; i < result.choices.length; i++) {
      const choice = result.choices[i];
      if (!choice?.message?.tool_calls) continue;

      const cleaned = cleanToolCalls(choice.message.tool_calls);
      if (cleaned.changed) {
        if (result === response) result = { ...result };
        if (result.choices === response.choices) result.choices = response.choices.slice();
        result.choices[i] = {
          ...result.choices[i],
          message: { ...result.choices[i].message, tool_calls: cleaned.value },
        };
      }
    }
  }

  // 处理 Anthropic 格式的 content（tool_use blocks）
  if (Array.isArray(result.content)) {
    const cleaned = cleanContentBlocks(result.content);
    if (cleaned.changed) {
      result = { ...result, content: cleaned.value };
    }
  }

  return result;
}

// ── 内部辅助函数 ──

function hasCacheControl(block) {
  return Boolean(block && typeof block === "object" && block.cache_control);
}

function normalizeSystem(system) {
  // 字符串 → 数组格式
  if (typeof system === "string") {
    return {
      value: [{ type: "text", text: system, cache_control: { ...CACHE_CONTROL } }],
      changed: true,
    };
  }

  // 已是数组，在最后一个 text block 添加 cache_control
  if (!Array.isArray(system)) {
    return { value: system, changed: false };
  }

  let lastIndex = -1;
  for (let i = system.length - 1; i >= 0; i--) {
    if (system[i]?.type === "text") {
      lastIndex = i;
      break;
    }
  }

  if (lastIndex < 0 || hasCacheControl(system[lastIndex])) {
    return { value: system, changed: false };
  }

  const next = system.slice();
  next[lastIndex] = { ...system[lastIndex], cache_control: { ...CACHE_CONTROL } };
  return { value: next, changed: true };
}

function normalizeTools(tools) {
  if (tools.length === 0) return { value: tools, changed: false };

  const lastTool = tools[tools.length - 1];
  if (hasCacheControl(lastTool)) {
    return { value: tools, changed: false };
  }

  const next = tools.slice();
  next[tools.length - 1] = { ...lastTool, cache_control: { ...CACHE_CONTROL } };
  return { value: next, changed: true };
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { value: messages, changed: false };
  }

  // 找到最后一个 user message
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      lastUserIdx = i;
      break;
    }
  }

  if (lastUserIdx < 0) {
    return { value: messages, changed: false };
  }

  const lastUser = messages[lastUserIdx];

  // content 是字符串 → 转为数组并添加 cache_control
  if (typeof lastUser.content === "string") {
    if (lastUser.content.trim().length === 0) {
      return { value: messages, changed: false };
    }
    const next = messages.slice();
    next[lastUserIdx] = {
      ...lastUser,
      content: [{
        type: "text",
        text: lastUser.content,
        cache_control: { ...CACHE_CONTROL },
      }],
    };
    return { value: next, changed: true };
  }

  // content 是数组 → 在最后一个 block 添加 cache_control
  if (!Array.isArray(lastUser.content) || lastUser.content.length === 0) {
    return { value: messages, changed: false };
  }

  const lastBlock = lastUser.content[lastUser.content.length - 1];
  if (!shouldCacheContentBlock(lastBlock) || hasCacheControl(lastBlock)) {
    return { value: messages, changed: false };
  }

  const nextContent = lastUser.content.slice();
  nextContent[lastUser.content.length - 1] = { ...lastBlock, cache_control: { ...CACHE_CONTROL } };
  const next = messages.slice();
  next[lastUserIdx] = { ...lastUser, content: nextContent };
  return { value: next, changed: true };
}

function shouldCacheContentBlock(block) {
  return block && typeof block === "object"
    && (block.type === "text" || block.type === "image" || block.type === "tool_result");
}

/**
 * 清洗 OpenAI 格式的 tool_calls 数组
 * 过滤掉 id 为空或缺失的 tool call
 */
function cleanToolCalls(toolCalls) {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    return { value: toolCalls, changed: false };
  }

  const validCalls = [];
  let changed = false;

  for (const call of toolCalls) {
    if (!call || typeof call !== "object") {
      changed = true;
      continue;
    }

    // 检查 id 是否有效
    const hasValidId = typeof call.id === "string" && call.id.trim().length > 0;

    if (!hasValidId) {
      console.warn(`[minimax] 过滤畸形 tool_call: id=${JSON.stringify(call.id)}`);
      changed = true;
      continue;
    }

    validCalls.push(call);
  }

  return { value: validCalls, changed };
}

/**
 * 清洗 Anthropic 格式的 content 数组
 * 过滤掉 id 为空的 tool_use blocks
 */
function cleanContentBlocks(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return { value: blocks, changed: false };
  }

  const validBlocks = [];
  let changed = false;

  for (const block of blocks) {
    if (!block || typeof block !== "object") {
      validBlocks.push(block);
      continue;
    }

    // 只检查 tool_use 类型的 block
    if (block.type !== "tool_use") {
      validBlocks.push(block);
      continue;
    }

    // 检查 id 是否有效
    const hasValidId = typeof block.id === "string" && block.id.trim().length > 0;

    if (!hasValidId) {
      console.warn(`[minimax] 过滤畸形 tool_use: id=${JSON.stringify(block.id)}`);
      changed = true;
      continue;
    }

    validBlocks.push(block);
  }

  return { value: validBlocks, changed };
}