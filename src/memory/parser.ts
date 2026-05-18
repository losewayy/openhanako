/**
 * MemoryNodeParser：极简解析，只取 summary + keywords
 * Phase 2+4 - 零词典零分类，工具使用记忆
 */

import { MemoryNode } from './graph.js';
import { randomUUID } from 'crypto';

export class MemoryNodeParser {
  /**
   * 解析 <memory_node>...</memory_node> 标签
   *
   * 格式：
   * {
   *   "summary": "用户提到加班到凌晨，说项目做不完",
   *   "keywords": ["加班", "凌晨", "项目", "做不完"]
   * }
   */
  parse(rawOutput: string, round: number, platform: string, group: string): MemoryNode | null {
    const match = rawOutput.match(/<memory_node>\s*([\s\S]*?)\s*<\/memory_node>/i);
    if (!match) return null;

    let data: any;
    try {
      data = JSON.parse(match[1].trim());
    } catch {
      return null;
    }

    if (!data.summary || typeof data.summary !== 'string') {
      return null;
    }

    const summary = data.summary.slice(0, 300);

    let keywords: string[] = [];
    if (Array.isArray(data.keywords)) {
      keywords = data.keywords
        .slice(0, 5)
        .map(String)
        .filter(k => k.length >= 2);
    }

    return {
      id: `node-${round}-${randomUUID().slice(0, 8)}`,
      summary,
      keywords,
      timestamp: Date.now(),
      platform: platform || 'local',
      group: group || 'private',
      activation: 0,
      baseline: 0,
      edges: new Map(),
      createdRound: round,
      accessCount: 0,
      isSeed: false,
    };
  }

  /**
   * 解析工具调用：检测 LLM 输出中的 <invoke> 标签
   * 返回工具名列表
   */
  parseToolCalls(rawOutput: string): string[] {
    const toolCalls: string[] = [];
    const invokeMatches = rawOutput.matchAll(/<invoke name="([^"]+)">/gi);
    for (const match of invokeMatches) {
      toolCalls.push(match[1]);
    }
    return toolCalls;
  }
}