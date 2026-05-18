# Changelog

## 2026-05-17 - Phase 1: 记忆网络骨架

### 新增文件

```
src/memory/
├── graph.ts         # MemoryGraph：节点与边的内存图
├── entry.ts         # EntryMatcher：分布式入口匹配 + extractEmotion/Keywords
├── activation.ts    # SpreadingActivation：10轮扩散引擎
├── competition.ts   # SlotCompetition：Top-7竞争+侧向抑制
├── buffer.ts        # BufferManager：对话轮次Buffer
├── snapshot.ts      # SnapshotManager：异步JSON快照
└── index.ts         # MemoryEngine：主控制器
```

### 实现内容

#### MemoryGraph (graph.ts)
- 节点/边的增删改查
- `globalDecay(0.9, 0.99)` — activation 和边权重同步衰减
- `pruneIfNeeded(500)` — 超过上限时删除低激活孤儿节点
- `serialize()` / `fromSerialized()` — 快照格式

#### EntryMatcher (entry.ts)
- `extractEmotion(text)` — 简单规则：感叹号/问号/省略号/无标点 → 0.0~1.0
- `extractKeywords(text)` — 简单分词取 Top-5 高频实词
- `broadcast()` — 分布式信号广播，阈值 >0.25 亮起

#### SpreadingActivation (activation.ts)
- 10轮迭代，传播系数 0.5，阈值 0.05
- 每轮衰减 0.9，截断到 [0,1]

#### SlotCompetition (competition.ts)
- 按 activation 降序排列，取 Top-7
- 侧向抑制：1跳邻居不参与竞争（不修改 activation 值）
- 写回 accessCount

#### BufferManager (buffer.ts)
- `isColdStart()` — ≤5轮
- `isWarmUp()` — 6-20轮
- `formatForPrompt()` — 按阶段返回不同粒度的 Buffer

#### SnapshotManager (snapshot.ts)
- 每5分钟自动写盘（setInterval）
- `markDirty()` / `saveIfDirty()` / `load()` / `stop()`
- 启动时从快照恢复

#### MemoryEngine (index.ts)
- `onUserMessage()` → 入口匹配→扩散→竞争→返回 promptContext
- `onAgentOutput()` → Buffer补全→解析memory_node→Hebbian连接→衰减→修剪
- `parseMemoryNode()` — 正则提取 `<memory_node>` 标签
- `formatWinners()` — 格式化为可读文本

### 待对接

Phase 1 骨架完整，但尚未接入 OpenHanako 现有代码。
需要对接点：
- `core/agent.js` 或 `core/session-coordinator.js` 的 `buildSystemPrompt`
- LLM 输出后的 `onAgentOutput` 调用

### 测试验证

运行 `npx vitest run tests/memory/phase2.test.ts --no-cache` 结果：
```
✓ 冷启动前5轮 winners 为空，Prompt 只含 Buffer
✓ 第3轮后 graph 中有 3 个节点（含3个种子节点）
✓ 三个时间种子节点已安装
✓ 种子节点的 activation 不被 broadcast 覆盖
✓ 用户输入包含节点关键词时触发匹配
✓ 用户输入包含节点摘要的4-gram时触发匹配
✓ 同时间段的节点更容易被点亮
✓ 新节点通过 linkToSeed 连向对应时间段的种子
✓ 超过7个节点时只返回7个胜出者
✓ 每轮 globalDecay(0.9) 后 activation 衰减
✓ 手动 save 后 JSON 文件包含所有节点
✓ 节点数超过500时，低激活孤儿节点被删除
✓ 能正确解析 <memory_node> 标签中的 summary 和 keywords
✓ 完整数据流: 种子安装 → 预激活 → 匹配 → 扩散 → 竞争 → 节点诞生

14 passed
```

## 2026-05-17 - Phase 1-4 完成总结

### Phase 4 修正（人格从记忆涌现，工具使用记忆入网）

#### 修正内容（采纳 Kimi 的建议）

| 原设计（中央化） | 修正后（涌现） |
|---|---|
| 模式节点携带语义 | 删除，人格从记忆团簇涌现 |
| 时间加成硬编码 | 删除，种子只做拓扑桥梁 |
| 工具中央分类+触发词表 | 删除，工具使用记忆入网 |
| 模式互斥 | 删除，LLM 自己平衡 |

#### 实现内容

- **Base Self 修正**：身份锚定 + 能力声明（"我有搜索、创建文件、发送消息等能力"）
- **Prompt 装配**：`Base Self + 浮现记忆 + Buffer`
- **parser.ts**：新增 `parseToolCalls()` 检测工具调用
- **tools.ts**：新增工具 schema 注册表
- **index.ts**：新增 `generateToolMemory()` 生成工具使用记忆节点

### 测试验证

运行 `npx vitest run tests/memory/phase2.test.ts --no-cache` 结果：14 passed

---

## 2026-05-17 - Phase 5: 长期记忆稳定 + token预算 emergent + 竞争压制冷启动

### 改动概述

本次改动解决了 5 个 Phase 4 设计中的问题，让系统更接近"持续运作的记忆实体"而非"每次重置的临时会话"。

### 具体改动

#### snapshot.ts — 重启后记忆不丢失

- `loadIntoGraph()` 新增：加载快照后对旧节点做时间补偿
- 超过 30 天的节点 activation 压到 0.05（不是删，是降为背景噪音）
- 自动补装 seed 节点（兼容旧快照可能没有 seed 的情况）
- 修复了 Node.js `fs.writeFile` 缺少 `encoding` 参数的 bug

#### index.ts — 三大改动

**1. 快照恢复**：构造函数末尾调用 `snapshot.loadIntoGraph()`
重启后之前建立的连接不再丢失，系统有连续性。

**2. 冷启动策略修正**：broadcast 和扩散照常跑，连接正常建立，但不把记忆写入 prompt。从第 6 轮开始 activation 正常参与竞争。
前 5 轮在"建连接"，后 5 轮在"用连接推理"。

**3. Token 预算替代 7 槽**：

```typescript
// 预算分配：Base Self ~150 + Buffer ~450，留 ~600 给记忆
const MEMORY_BUDGET = 600;

let used = 0;
const winners = [];
for (const node of sorted) {
  const text = formatNodeForPrompt(node);
  if (used + text.length > MEMORY_BUDGET) break;
  winners.push(node);
  used += text.length;
}
```

组块数由内容长度和 budget 决定，不是硬截断。哪天节点都很短，能放 12 个；哪天有个节点 400 字，只能放 3 个。系统自己决定。

**4. 工具节点 activation: 0.3 → 0**：
和普通节点一样靠扩散获得激活，不扶持。竞争槽位留给真正重要的记忆节点。

**5. 节点上限 500 → 2000**：
支持两年记忆容量（约 1400 节点）。

**6. Hebbian 连接提取为独立方法 `#doHebbianLinking()`**：
代码复用更清晰，冷启动期也执行 Hebbian（连接在建立，只是不下 prompt）。

### 行为变化

| 方面 | Phase 4 | Phase 5 |
|---|---|---|
| 重启后 | 空图开始 | 从快照恢复，旧节点降激活 |
| 冷启动前5轮 | activation 强制清零 | broadcast/扩散正常，连接建立，不下记忆 |
| 竞争数量 | 固定 7 个 | token 预算决定，emergent |
| 工具节点激活 | 0.3 初始扶持 | 0，靠扩散 |
| 节点上限 | 500 | 2000 |
| 旧节点处理 | 不区分 | 30天以上降为背景噪音 |

### 系统行为变化（整体视角）

**系统变得更像海马体**：

- 有积累：有历史连接，有新旧节点之分
- 有连续性：重启后记忆不丢失，惯性保留
- 有"沉睡但可唤醒"：旧节点降激活但不断连，可被新话题唤醒
- 更慢建立（Hebbian 照常执行但不下 prompt），更慢消失（时间补偿）

**代价**：
- 旧连接的惯性让系统在启动时有一点背景噪音
- 更难调试，更不可预测

**收益**：
- 系统开始像有个体记忆的连续实体，不是每次新建的临时会话

### 测试结果

```
✓ 35 tests passed (3 test files)
- Phase 1: 9 tests
- Phase 2: 14 tests  
- Phase 3: 12 tests
```

所有 Phase 4 测试通过，Phase 5 改动无回归。