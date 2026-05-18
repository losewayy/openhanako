/**
 * SnapshotManager：异步 JSON 快照
 * Phase 1 - 骨架实现
 */

import { promises as fs } from 'fs';
import { MemoryGraph, SerializedGraph } from './graph.js';

export class SnapshotManager {
  private graph: MemoryGraph;
  private filePath: string;
  private dirty = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly intervalMs: number;

  constructor(graph: MemoryGraph, filePath: string, intervalMs: number = 5 * 60 * 1000) {
    this.graph = graph;
    this.filePath = filePath;
    this.intervalMs = intervalMs;
    this.startAutoSave();
  }

  markDirty(): void {
    this.dirty = true;
  }

  private startAutoSave(): void {
    this.timer = setInterval(() => {
      this.saveIfDirty().catch(console.error);
    }, this.intervalMs);
  }

  async saveIfDirty(): Promise<void> {
    if (!this.dirty) return;

    const payload = this.graph.serialize();
    await fs.writeFile(this.filePath, JSON.stringify(payload, null, 2), 'utf-8');
    this.dirty = false;
    console.log(`[Snapshot] 已保存 ${this.graph.nodeCount()} 个节点到 ${this.filePath}`);
  }

  async save(): Promise<void> {
    const payload = this.graph.serialize();
    await fs.writeFile(this.filePath, JSON.stringify(payload, null, 2), 'utf-8');
    this.dirty = false;
    console.log(`[Snapshot] 已保存 ${this.graph.nodeCount()} 个节点到 ${this.filePath}`);
  }

  /**
   * 加载快照到已有 graph，并对旧节点做时间补偿
   * 超过 30 天的节点 activation 压到 0.05 以下（不是删掉，是降为背景噪音）
   * 恢复节点的 edges 和 wasWinner 等状态
   */
  async loadIntoGraph(): Promise<void> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      const parsed: SerializedGraph = JSON.parse(data);
      if (!parsed?.nodes?.length) {
        console.log(`[Snapshot] 无快照文件或节点为空，从空图开始`);
        return;
      }

      const now = Date.now();
      const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

      for (const n of parsed.nodes) {
        const node = {
          ...n,
          edges: new Map(n.edges),
        };

        // 时间补偿：30天以上的节点 activation 降为背景噪音
        const age = now - node.timestamp;
        if (age > THIRTY_DAYS) {
          node.activation = 0.05;  // 还在，但不参与竞争
          node.baseline = Math.min(0.5, node.baseline * 0.3);  // 基线也降
        }

        this.graph.addNode(node);
      }

      // 重新安装 seed（确保 graph 里有 seed，即使快照里没有）
      this.#installSeedsIfMissing();

      console.log(`[Snapshot] 已加载 ${parsed.nodes.length} 个节点（${parsed.nodes.filter(n => now - n.timestamp > THIRTY_DAYS).length} 个旧节点已降激活）`);
    } catch {
      console.log(`[Snapshot] 无快照文件或加载失败，从空图开始`);
    }
  }

  /**
   * 如果 graph 里没有 seed，补装（兼容旧快照可能没有 seed 的情况）
   */
  #installSeedsIfMissing(): void {
    const ids = ['seed:t0', 'seed:t1', 'seed:t2'];
    for (let i = 0; i < ids.length; i++) {
      if (!this.graph.getNode(ids[i])) {
        this.graph.addNode({
          id: ids[i],
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
          hourPref: i === 0 ? [0, 1, 2, 3, 4, 5, 6, 7] : i === 1 ? [8, 9, 10, 11, 12, 13, 14, 15] : [16, 17, 18, 19, 20, 21, 22, 23],
          wasWinner: false,
          lastUsedRound: -1,
        });
      }
    }
    // 重建种子之间的互联
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        this.graph.addEdge(ids[i], ids[j], 0.3);
      }
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}