# heroHallModel.ts

> `frontend/src/features/heroHall/heroHallModel.ts` · TypeScript · 约 245 行

## 用途

维护 Hero Hall 阵容模型：阵容 ID、默认阵容结构、从事件/文本推断请求阵容、从目录补全推荐、根据 agent 构造 key 并合并阵容。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `HeroHallLineupId` | type | ~6 | `core/growth/conversion` 阵容 ID。 |
| `HeroHallLineupsState` | type | ~7 | 阵容到 agent key 列表的映射。 |
| `heroHallLineups` | const | ~12 | 三个阵容的标签和 accent。 |
| `heroHallReferenceHeroLabels` | const | ~18 | Hero Hall 参考标签。 |
| `heroHallReferenceRecommendationCards` | const | ~35 | 推荐卡参考文案。 |
| `createHeroHallLineups` | function | ~43 | 创建空阵容状态。 |
| `normalizeHeroHallLineupId` | function | ~76 | 归一化阵容 ID。 |
| `detectRequestedLineupFromText` | function | ~95 | 从自然语言推断阵容。 |
| `getLineupIntentFromEvent` | function | ~126 | 从后端事件推断阵容意图。 |
| `getCatalogAgentsForLineup` | function | ~158 | 从目录按阵容补全推荐 agent。 |
| `getRecommendedAgentLineup` | function | ~242 | 判断单个推荐 agent 属于哪个阵容。 |
| `getHeroHallAgentKey` | function | ~256 | 生成 Hero Hall 稳定 key。 |
| `createHeroHallLineupsFromAgents` | function | ~268 | 从推荐 agent 列表生成阵容状态。 |
| `mergeHeroHallLineups` | function | ~284 | 合并当前和新阵容状态。 |

## 依赖

内部依赖:
- `lib/agentStreamClient.ts` — 事件类型。
- `lib/agentLaunchCatalog.ts` — 目录 agent 和富化 key。
- `features/agents/agentUtils.ts` — 推荐智能体 key。
- `types.ts` — 用户状态和推荐智能体类型。

## 修改指南

- **改阵容别名**: 同步后端 `coze_workflow.py` 和 `recommended_agents_stream.py`。
- **改 fallback 推荐**: 检查 `getCatalogAgentsForLineup` 是否仍符合 Hero Hall 展示预期。

## 依赖图

```text
heroHallModel.ts
← 引入: agentStreamClient, agentLaunchCatalog, agentUtils, types
→ 被引用: App.tsx, workflowModel.ts, AgentHeroHall.tsx
```

