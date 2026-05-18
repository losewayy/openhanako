/**
 * Tools：工具 schema 注册表
 * Phase 4 - 按需加载，由 LLM 推断触发
 */

// 工具 schema 注册表
export const TOOL_SCHEMAS: Record<string, object> = {
  webSearch: {
    name: 'webSearch',
    description: '搜索互联网信息',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' }
      },
      required: ['query']
    }
  },
  browseWeb: {
    name: 'browseWeb',
    description: '浏览网页内容',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '网页 URL' }
      },
      required: ['url']
    }
  },
  createFile: {
    name: 'createFile',
    description: '创建文件',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径' },
        content: { type: 'string', description: '文件内容' }
      },
      required: ['path', 'content']
    }
  },
  sendMessage: {
    name: 'sendMessage',
    description: '发送消息',
    parameters: {
      type: 'object',
      properties: {
        platform: { type: 'string', description: '平台' },
        target: { type: 'string', description: '目标' },
        content: { type: 'string', description: '消息内容' }
      },
      required: ['platform', 'target', 'content']
    }
  },
  setReminder: {
    name: 'setReminder',
    description: '设置提醒',
    parameters: {
      type: 'object',
      properties: {
        time: { type: 'string', description: '提醒时间' },
        content: { type: 'string', description: '提醒内容' }
      },
      required: ['time', 'content']
    }
  },
  delegateAgent: {
    name: 'delegateAgent',
    description: '委派给其他代理',
    parameters: {
      type: 'object',
      properties: {
        task: { type: 'string', description: '任务描述' }
      },
      required: ['task']
    }
  }
};

/**
 * 获取工具 schema
 */
export function getToolSchema(toolName: string): object | null {
  return TOOL_SCHEMAS[toolName] || null;
}

/**
 * 获取所有工具名称
 */
export function getAllToolNames(): string[] {
  return Object.keys(TOOL_SCHEMAS);
}