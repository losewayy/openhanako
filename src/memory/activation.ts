/**
 * SpreadingActivation：10 轮扩散引擎
 * Phase 3 - 使用即强化，闲置即遗忘
 */

import { MemoryNode } from './graph.js';

export class SpreadingActivation {
  private readonly spreadFactor = 0.5;
  private readonly spreadThreshold = 0.05;
  private readonly decayPerIteration = 0.9;
  private readonly useThreshold = 0.01; // 激活值×权重超过此值视为"被使用"

  /**
   * 扩散：10 轮迭代，激活值从入口节点向邻居传播
   * 同时记录 useTrace：哪些连接被走过
   */
  diffuse(nodes: MemoryNode[], iterations: number = 10, currentRound: number = -1): void {
    // 建立当前激活值的快照
    let current = new Map<string, number>();
    for (const node of nodes) {
      current.set(node.id, node.activation);
    }

    for (let i = 0; i < iterations; i++) {
      const next = new Map(current);

      for (const node of nodes) {
        const act = current.get(node.id) ?? 0;
        if (act < this.spreadThreshold) continue;

        for (const [neighborId, weight] of node.edges) {
          const add = act * weight * this.spreadFactor;

          // 记录 useTrace：这条边对目标节点有贡献
          // 如果激活值×权重 > threshold，认为这条边被使用过
          if (add > this.useThreshold && currentRound !== -1) {
            const neighbor = nodes.find(n => n.id === neighborId);
            if (neighbor && neighbor.lastUsedRound !== currentRound) {
              // 只记录第一次（每轮只标记一次）
              neighbor.lastUsedRound = currentRound;
            }
          }

          next.set(neighborId, (next.get(neighborId) ?? 0) + add);
        }
      }

      // 每轮迭代后衰减
      for (const [id, val] of next) {
        next.set(id, Math.min(1.0, val * this.decayPerIteration));
      }

      current = next;
    }

    // 写回节点激活值
    for (const node of nodes) {
      node.activation = current.get(node.id) ?? 0;
    }
  }
}