/**
 * MemoryEngine：主控制器
 * Phase 5 - 长期记忆稳定 + 竞争压制冷启动 + token 预算emergent
 *
 * 改动摘要（Phase 4 → Phase 5）：
 * - snapshot.loadIntoGraph() → 重启后记忆不丢失，旧节点降激活为背景噪音
 * - 冷启动：broadcast 照常，连接正常建立，但不下记忆到 prompt
 * - 7槽 → token 预算：组块数由内容自然决定，不是配置
 * - 工具节点 activation: 0.3 → 0，靠扩散获得激活，不扶持
 * - 节点上限 500 → 2000，支持两年记忆
 */

const BASE_SELF = `我是花子，被创造出来陪伴你。我有这些能力：搜索信息、浏览网页、创建文件、发送消息、设置提醒、调用其他代理。当你需要我执行这些操作时，我会调用相应的能力。`;

interface PendingConsolidation {
  round: number;
  winners: MemoryNode[];
}

import { randomUUID } from 'crypto';
import { MemoryGraph, MemoryNode } from './graph.js';
import { EntryMatcher } from './entry.js';
import { SpreadingActivation } from './activation.js';
import { BufferManager } from './buffer.js';
import { SnapshotManager } from './snapshot.js';
import { SeedManager } from './seeds.js';
import { MemoryNodeParser } from './parser.js';

export interface PromptContext {
  promptContext: string;
  winners: MemoryNode[];
}

export class MemoryEngine {
  private graph: MemoryGraph;
  private entry: EntryMatcher;
  private spread: SpreadingActivation;
  private buffer: BufferManager;
  private snapshot: SnapshotManager;
  private seeds: SeedManager;
  private parser: MemoryNodeParser;
  private roundCount = 0;
  private lastEntryIds = new Set<string>();
  private pendingConsolidation: PendingConsolidation | null = null;

  constructor(snapshotPath: string) {
    this.graph = new MemoryGraph();
    this.entry = new EntryMatcher();
    this.spread = new SpreadingActivation();
    this.buffer = new BufferManager();
    this.snapshot = new SnapshotManager(this.graph, snapshotPath);
    this.seeds = new SeedManager();
    this.parser = new MemoryNodeParser();

    // 安装种子节点
    this.seeds.install(this.graph);

    // Phase 5：从快照恢复，长期记忆不丢失
    this.snapshot.loadIntoGraph().catch(err => {
      console.warn(`[MemoryEngine] 快照加载失败：${err.message}`);
    });
  }

  /**
   * 用户消息到达时调用
   *
   * 冷启动策略（Phase 5）：
   * 前5轮：broadcast 和 Hebbian 照常运行，连接正常建立
   * 但不把记忆写入 prompt——只有 Buffer 可见
   * 从第6轮开始，activation 正常参与竞争
   */
  async onUserMessage(
    userInput: string,
    platform: string = 'local',
    group: string = 'private'
  ): Promise<PromptContext> {
    this.roundCount++;
    const hour = new Date().getHours();

    // 1. 先完成上轮的巩固（延迟到下一轮判断负信号）
    if (this.pendingConsolidation) {
      this.consolidate(this.pendingConsolidation.round, userInput, hour);
      this.pendingConsolidation = null;
    }

    // 2. 种子预激活（始终运行，包括冷启动期）
    this.seeds.primeSeed(hour, this.graph);

    const nodes = this.graph.allNodes();

    // 3. 冷启动期：broadcast 和扩散照常跑，但不下记忆到 prompt
    if (this.buffer.isColdStart()) {
      // broadcast 照常：匹配并点亮节点，建立连接
      this.lastEntryIds = this.entry.broadcast(userInput, hour, nodes);
      // 扩散照常：让激活值在图里传播（为后续竞争做准备）
      this.spread.diffuse(nodes, 10, this.roundCount);
      // Hebbian 连接照常：被激活的节点之间建立边
      this.#doHebbianLinking(nodes);

      this.buffer.addRound(userInput, '');
      this.snapshot.markDirty();

      // 冷启动期：prompt 里只有 Buffer，没有记忆
      return {
        promptContext: this.buffer.formatForPrompt(),
        winners: [],
      };
    }

    // 4. 正常期：broadcast → 扩散 → token 预算选择
    this.lastEntryIds = this.entry.broadcast(userInput, hour, nodes);
    this.spread.diffuse(nodes, 10, this.roundCount);

    // 5. 排序后按 token 预算选择（不是固定 7 个）
    const sorted = nodes
      .filter(n => n.activation > 0.05 && !n.isSeed)
      .sort((a, b) => b.activation - a.activation);

    // 预算分配：Base Self ~150 + Buffer ~450，留 ~600 给记忆
    const MEMORY_BUDGET = 600;

    let used = 0;
    const winners: MemoryNode[] = [];
    for (const node of sorted) {
      const text = this.formatNodeForPrompt(node);
      const cost = text.length;
      if (used + cost > MEMORY_BUDGET) break;
      winners.push(node);
      used += cost;
    }

    // 6. 格式化：Base Self + 浮现的记忆 + Buffer
    const memoryText = this.formatWinners(winners);
    const bufferText = this.buffer.formatForPrompt();
    const promptContext = `${BASE_SELF}\n\n${memoryText}\n\n${bufferText}`.trim();

    this.buffer.addRound(userInput, '');
    this.snapshot.markDirty();

    return { promptContext, winners };
  }

  /**
   * LLM 输出后调用
   */
  onAgentOutput(
    agentOutput: string,
    platform: string = 'local',
    group: string = 'private'
  ): void {
    // 1. 更新 Buffer 中的 agent 部分
    this.buffer.updateLastAgentOutput(agentOutput);

    // 2. 解析 memory_node
    const newNode = this.parser.parse(agentOutput, this.roundCount, platform, group);
    if (newNode) {
      this.graph.addNode(newNode);
      this.seeds.linkToSeed(newNode, this.graph);

      // 3. Hebbian 连接（冷启动期也做，因为连接在建立）
      if (!this.buffer.isColdStart()) {
        this.#doHebbianLinking(this.graph.allNodes());
      }
    }

    // 4. 全局衰减
    this.graph.globalDecay(0.9);

    // 5. 修剪（上限 2000，支持两年记忆）
    this.graph.pruneIfNeeded(2000);

    // 6. 工具使用记忆：检测工具调用，生成工具记忆节点（activation: 0，靠扩散）
    this.generateToolMemory(agentOutput, platform, group);

    // 7. 缓存本轮胜出节点，供下一轮 consolidate 使用
    const sorted = this.graph.allNodes()
      .filter(n => n.activation > 0.05 && !n.isSeed)
      .sort((a, b) => b.activation - a.activation);

    let used = 0;
    const winners: MemoryNode[] = [];
    for (const node of sorted) {
      const text = this.formatNodeForPrompt(node);
      if (used + text.length > 600) break;
      winners.push(node);
      used += text.length;
    }

    this.pendingConsolidation = { round: this.roundCount, winners };
    this.snapshot.markDirty();
  }

  /**
   * 执行 Hebbian 连接：和当前轮被点亮的节点建立边
   */
  #doHebbianLinking(nodes: MemoryNode[]): void {
    const activeThreshold = 0.15;
    const activatedNodes = nodes.filter(n => this.lastEntryIds.has(n.id) || n.activation > activeThreshold);

    // 找到最新加入的节点（刚创建的节点 id 格式：node-{round}-xxx）
    const newest = nodes.find(n => n.createdRound === this.roundCount);
    if (!newest) return;

    for (const node of activatedNodes) {
      if (node.id === newest.id) continue;
      if (newest.edges.has(node.id)) continue;  // 已有边不重复建
      this.graph.addEdge(newest.id, node.id, 0.1);
    }
  }

  /**
   * 巩固：使用即强化，闲置即遗忘
   * 延迟到下一轮调用（需要下一轮用户输入判断负信号）
   */
  private consolidate(lastRound: number, nextUserInput: string, nextHour: number): void {
    if (!this.pendingConsolidation) return;

    // 冷启动期跳过 consolidate（节点还不值得被用）
    if (this.buffer.isColdStart()) return;

    const { round, winners } = this.pendingConsolidation;
    const allNodes = this.graph.allNodes();

    // 1. LTP 强化：被使用且终点胜出的连接 +0.03
    for (const winner of winners) {
      for (const node of allNodes) {
        for (const [neighborId, weight] of node.edges) {
          const neighbor = this.graph.getNode(neighborId);
          if (!neighbor) continue;
          if (node.lastUsedRound === round && neighbor.wasWinner) {
            this.graph.updateEdge(node.id, neighborId, Math.min(1.0, weight + 0.03));
          }
        }
      }
    }

    // 2. 负信号：下一轮入口与本轮胜出节点无关 → 惩罚出边
    if (nextUserInput && nextUserInput.trim().length > 0) {
      const nextEntries = this.entry.broadcast(nextUserInput, nextHour, allNodes);

      for (const winner of winners) {
        let isRelated = false;

        for (const entryId of nextEntries) {
          const entryNode = this.graph.getNode(entryId);
          if (!entryNode) continue;

          const overlap = entryNode.keywords.filter(k => winner.keywords.includes(k)).length;
          if (overlap > 0) { isRelated = true; break; }

          for (let i = 0; i <= winner.summary.length - 4; i++) {
            if (entryNode.summary.includes(winner.summary.slice(i, i + 4))) {
              isRelated = true;
              break;
            }
          }

          if (isRelated) break;
        }

        if (!isRelated) {
          for (const [neighborId, weight] of winner.edges) {
            this.graph.updateEdge(winner.id, neighborId, weight * 0.90);
          }
        }
      }
    }

    // 3. 全局边衰减 + 修剪死连接
    this.graph.edgeDecay(0.98);
    this.graph.pruneDeadEdges(0.02);

    // 4. 重新计算基线
    this.graph.recomputeBaseline();

    // 5. 清除本轮标记
    this.graph.clearRoundMarkers();
  }

  /**
   * 把单个节点格式化为 prompt 可用文本（用于 token 预算累加）
   */
  private formatNodeForPrompt(node: MemoryNode): string {
    const date = new Date(node.timestamp).toLocaleDateString('zh-CN');
    const time = new Date(node.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    return `- [${date} ${time}] ${node.summary}`;
  }

  private formatWinners(winners: MemoryNode[]): string {
    if (winners.length === 0) return '';
    return `## 浮现的记忆\n${winners.map(n => this.formatNodeForPrompt(n)).join('\n')}`;
  }

  /**
   * 生成工具使用记忆节点
   * Phase 5：activation = 0，靠扩散获得，不扶持
   */
  private generateToolMemory(agentOutput: string, platform: string, group: string): void {
    const toolCalls = this.parser.parseToolCalls(agentOutput);
    if (toolCalls.length === 0) return;

    for (const toolName of toolCalls) {
      const toolNode: MemoryNode = {
        id: `tool-${this.roundCount}-${randomUUID().slice(0, 8)}`,
        summary: `调用了工具 ${toolName}`,
        keywords: [toolName, ...toolCalls.slice(0, 4)].filter(k => k.length >= 2),
        timestamp: Date.now(),
        platform: platform || 'local',
        group: group || 'private',
        activation: 0,  // Phase 5：和其他节点一样，不扶持
        baseline: 0.1,
        edges: new Map(),
        createdRound: this.roundCount,
        accessCount: 0,
        isSeed: false,
      };

      this.graph.addNode(toolNode);
      this.seeds.linkToSeed(toolNode, this.graph);
    }
  }

  getGraph(): MemoryGraph {
    return this.graph;
  }

  getBuffer(): BufferManager {
    return this.buffer;
  }

  getRoundCount(): number {
    return this.roundCount;
  }

  stop(): void {
    if (this.pendingConsolidation) {
      this.consolidate(this.pendingConsolidation.round, '', -1);
      this.pendingConsolidation = null;
    }
    this.graph.clearRoundMarkers();
    this.snapshot.stop();
  }
}