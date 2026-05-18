/**
 * SeedManager：时间拓扑种子
 * Phase 2 - 三个空节点，作为拓扑插座
 */

import { MemoryGraph, MemoryNode } from './graph.js';

// 种子规格：三个时段
const SEED_SPECS = [
  { id: 'seed:t0', hourPref: [0, 1, 2, 3, 4, 5, 6, 7] },       // 凌晨到早晨
  { id: 'seed:t1', hourPref: [8, 9, 10, 11, 12, 13, 14, 15] }, // 白天
  { id: 'seed:t2', hourPref: [16, 17, 18, 19, 20, 21, 22, 23] }, // 傍晚到深夜
];

export class SeedManager {
  /**
   * 安装三个种子节点，两两互联（三角拓扑）
   * 种子没有 summary 和 keywords，是空节点
   */
  install(graph: MemoryGraph): void {
    for (const spec of SEED_SPECS) {
      if (graph.getNode(spec.id)) continue;

      const node: MemoryNode = {
        id: spec.id,
        summary: '',
        keywords: [],
        timestamp: 0,
        platform: 'seed',
        group: 'seed',
        activation: 0,
        baseline: 0,
        edges: new Map(),
        createdRound: 0,
        accessCount: 0,
        isSeed: true,
        hourPref: spec.hourPref,
      };
      graph.addNode(node);
    }

    // 种子之间两两互联
    const ids = SEED_SPECS.map(s => s.id);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        graph.addEdge(ids[i], ids[j], 0.3);
      }
    }
  }

  /**
   * 预激活：当前时间对应的种子亮起 0.2
   * 种子不参与竞争，但参与扩散
   */
  primeSeed(hour: number, graph: MemoryGraph): void {
    for (const spec of SEED_SPECS) {
      if (spec.hourPref.includes(hour)) {
        const seed = graph.getNode(spec.id);
        if (seed) {
          seed.activation = 0.2;
        }
      }
    }
  }

  /**
   * 新节点连向对应种子（时间拓扑锚定）
   */
  linkToSeed(newNode: MemoryNode, graph: MemoryGraph): void {
    const hour = new Date(newNode.timestamp).getHours();
    for (const spec of SEED_SPECS) {
      if (spec.hourPref.includes(hour)) {
        graph.addEdge(newNode.id, spec.id, 0.2);
        break;
      }
    }
  }

  /**
   * 获取当前时间对应的种子 ID
   */
  getCurrentSeedId(hour: number): string | null {
    for (const spec of SEED_SPECS) {
      if (spec.hourPref.includes(hour)) {
        return spec.id;
      }
    }
    return null;
  }
}