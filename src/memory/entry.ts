/**
 * EntryMatcher：纯字符串重叠 + 时间邻近
 * Phase 2 - 零词典、零分类、零中央提取器
 */

import { MemoryNode } from './graph.js';

export class EntryMatcher {
  /**
   * 广播匹配：每个节点独立计算自己是否被点亮
   *
   * 规则：
   * 1. 关键词重叠：用户输入包含节点关键词（length >= 2），命中1个+0.3
   * 2. 4-gram回显：用户输入包含节点摘要中的任意4字符片段，+0.15（只给一次）
   * 3. 时间邻近：节点诞生时间的小时段与当前±2小时内，+0.1
   *
   * 种子节点（isSeed=true）不参与匹配，但保持自己的 activation
   */
  broadcast(userInput: string, hour: number, nodes: MemoryNode[]): Set<string> {
    const lit = new Set<string>();

    for (const node of nodes) {
      // 种子节点不参与匹配计算，保持自己的 activation
      if (node.isSeed) continue;

      let signal = 0;

      // 1. 关键词重叠：length >= 2 的关键词才有效
      for (const kw of node.keywords) {
        if (kw.length < 2) continue;
        if (userInput.includes(kw)) {
          signal += 0.3;
        }
      }
      // 封顶：最多5个关键词，最大+1.5，自然封顶

      // 2. 4-gram 回显：找到第一个匹配的4-gram就停止
      let gramMatched = false;
      const summary = node.summary;
      for (let i = 0; i <= summary.length - 4 && !gramMatched; i++) {
        const gram = summary.slice(i, i + 4);
        if (userInput.includes(gram)) {
          signal += 0.15;
          gramMatched = true; // 只给一次加成
        }
      }

      // 3. 时间邻近：±2小时，或跨午夜
      const nodeHour = new Date(node.timestamp).getHours();
      const hourDiff = Math.abs(hour - nodeHour);
      if (hourDiff <= 2 || hourDiff >= 22) {
        signal += 0.1;
      }

      // 点亮阈值
      if (signal > 0.25) {
        node.activation = Math.min(1.0, signal);
        lit.add(node.id);
      }
    }

    return lit;
  }
}