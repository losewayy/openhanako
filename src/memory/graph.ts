/**
 * MemoryGraph：节点与边的内存图
 * Phase 3 - 使用即强化，闲置即遗忘
 */

export interface MemoryNode {
  id: string;
  summary: string;
  keywords: string[];
  timestamp: number;
  platform: string;
  group: string;
  activation: number;
  baseline: number;
  edges: Map<string, number>;
  createdRound: number;
  accessCount: number;
  // Phase 2
  isSeed: boolean;
  hourPref?: number[];
  // Phase 3 新增
  wasWinner: boolean;     // 本轮是否进入竞争槽位
  lastUsedRound: number;  // 最近一次被使用（扩散）的轮次，-1 表示从未使用
}

export interface Edge {
  sourceId: string;
  targetId: string;
  weight: number;
  lastUsedRound: number;  // 最近被使用（扩散）的轮次
}

export interface SerializedNode {
  id: string;
  summary: string;
  keywords: string[];
  timestamp: number;
  platform: string;
  group: string;
  activation: number;
  baseline: number;
  edges: [string, number][];
  createdRound: number;
  accessCount: number;
  isSeed: boolean;
  hourPref?: number[];
  wasWinner: boolean;
  lastUsedRound: number;
}

export interface SerializedGraph {
  version: number;
  savedAt: number;
  nodes: SerializedNode[];
}

export class MemoryGraph {
  private nodes: Map<string, MemoryNode> = new Map();

  addNode(node: MemoryNode): void {
    this.nodes.set(node.id, node);
  }

  addEdge(a: string, b: string, initialWeight: number): void {
    const nodeA = this.nodes.get(a);
    const nodeB = this.nodes.get(b);
    if (!nodeA || !nodeB) return;
    nodeA.edges.set(b, initialWeight);
    nodeB.edges.set(a, initialWeight);
  }

  /**
   * 更新边的权重
   */
  updateEdge(sourceId: string, targetId: string, newWeight: number): void {
    const source = this.nodes.get(sourceId);
    const target = this.nodes.get(targetId);
    if (!source || !target) return;
    source.edges.set(targetId, newWeight);
    target.edges.set(sourceId, newWeight);
  }

  getNode(id: string): MemoryNode | undefined {
    return this.nodes.get(id);
  }

  allNodes(): MemoryNode[] {
    return Array.from(this.nodes.values());
  }

  nodeCount(): number {
    return this.nodes.size;
  }

  /**
   * 获取所有边（含元数据）
   */
  allEdges(): Edge[] {
    const edges: Edge[] = [];
    const seen = new Set<string>();

    for (const node of this.nodes.values()) {
      for (const [neighborId, weight] of node.edges) {
        const key = [node.id, neighborId].sort().join('-');
        if (seen.has(key)) continue;
        seen.add(key);

        edges.push({
          sourceId: node.id,
          targetId: neighborId,
          weight,
          lastUsedRound: node.lastUsedRound, // 近似：源节点的 lastUsedRound
        });
      }
    }

    return edges;
  }

  /**
   * 全局衰减：每轮调用，activation 和边的权重同步衰减
   * 种子节点不参与 activation 衰减，但参与边衰减
   */
  globalDecay(rate: number, edgeRate: number = 0.98): void {
    for (const node of this.nodes.values()) {
      if (!node.isSeed) {
        node.activation *= rate;
        node.baseline = Math.max(0, node.baseline - 0.01);
      }

      for (const [neighborId, weight] of node.edges) {
        node.edges.set(neighborId, weight * edgeRate);
      }
    }
  }

  /**
   * 边衰减（Phase 3）：所有连接权重 × 0.98
   */
  edgeDecay(rate: number = 0.98): void {
    for (const node of this.nodes.values()) {
      for (const [neighborId, weight] of node.edges) {
        node.edges.set(neighborId, weight * rate);
      }
    }
  }

  /**
   * 修剪死连接：权重 < threshold 的边删除
   */
  pruneDeadEdges(threshold: number = 0.02): void {
    for (const node of this.nodes.values()) {
      const toDelete: string[] = [];
      for (const [neighborId, weight] of node.edges) {
        if (weight < threshold) {
          toDelete.push(neighborId);
        }
      }
      for (const neighborId of toDelete) {
        node.edges.delete(neighborId);
        // 双向删除
        const neighbor = this.nodes.get(neighborId);
        if (neighbor) {
          neighbor.edges.delete(node.id);
        }
      }
    }
  }

  /**
   * 修剪：当节点数超过上限时，删除 activation 最低且无连接的孤儿节点
   * 种子节点不参与修剪
   */
  pruneIfNeeded(maxNodes: number = 500): void {
    if (this.nodeCount() <= maxNodes) return;

    const sorted = this.allNodes()
      .filter(n => !n.isSeed)
      .map(n => ({ node: n, score: n.activation, edges: n.edges.size }))
      .sort((a, b) => {
        if (a.edges === 0 && b.edges > 0) return -1;
        if (b.edges === 0 && a.edges > 0) return 1;
        return a.score - b.score;
      });

    const toRemove = this.nodeCount() - maxNodes;
    let removed = 0;
    for (const { node } of sorted) {
      if (removed >= toRemove) break;
      if (node.edges.size === 0) {
        this.nodes.delete(node.id);
        removed++;
      }
    }
  }

  /**
   * 重新计算所有节点的基线
   * 基线 = accessCount × 0.01 + max(出边权重) × 0.1，封顶 0.5
   * 这是分布式妥协：只考虑出边，不考虑入边
   */
  recomputeBaseline(): void {
    for (const node of this.nodes.values()) {
      const maxEdgeWeight = Math.max(0, ...Array.from(node.edges.values()));
      node.baseline = Math.min(0.5, node.accessCount * 0.01 + maxEdgeWeight * 0.1);
    }
  }

  /**
   * 标记节点为胜出（wasWinner = true）
   */
  markWinner(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (node) node.wasWinner = true;
  }

  /**
   * 清除所有节点的胜出标记和 lastUsedRound
   */
  clearRoundMarkers(): void {
    for (const node of this.nodes.values()) {
      node.wasWinner = false;
      node.lastUsedRound = -1;
    }
  }

  static fromSerialized(data: SerializedGraph): MemoryGraph {
    const graph = new MemoryGraph();
    for (const n of data.nodes) {
      const node: MemoryNode = {
        ...n,
        edges: new Map(n.edges),
      };
      graph.nodes.set(node.id, node);
    }
    return graph;
  }

  serialize(): SerializedGraph {
    return {
      version: 1,
      savedAt: Date.now(),
      nodes: this.allNodes().map(n => ({
        ...n,
        edges: Array.from(n.edges.entries()),
      })),
    };
  }
}