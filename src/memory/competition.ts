/**
 * SlotCompetition：Top-7 竞争 + 侧向抑制
 * Phase 3 - 使用即强化，闲置即遗忘
 */

import { MemoryNode } from './graph.js';

export interface SlotWinner {
  node: MemoryNode;
  rank: number;
}

export class SlotCompetition {
  /**
   * 竞争：按 activation 排序，取 Top-7，1 跳邻居侧向抑制
   * 胜出节点标记 wasWinner = true
   */
  select(nodes: MemoryNode[], maxSlots: number = 7): SlotWinner[] {
    // 按 activation 降序排列
    const candidates = nodes
      .filter(n => n.activation > 0.1 && !n.isSeed) // 种子节点不参与竞争
      .sort((a, b) => b.activation - a.activation);

    const winners: SlotWinner[] = [];
    const suppressed = new Set<string>();

    for (const node of candidates) {
      if (winners.length >= maxSlots) break;
      if (suppressed.has(node.id)) continue;

      winners.push({ node, rank: winners.length + 1 });

      // 标记为胜出
      node.wasWinner = true;

      // 侧向抑制：胜出节点的 1 跳邻居压制
      for (const [neighborId] of node.edges) {
        suppressed.add(neighborId);
      }
    }

    // 写回 accessCount
    for (const w of winners) {
      w.node.accessCount++;
    }

    return winners;
  }
}