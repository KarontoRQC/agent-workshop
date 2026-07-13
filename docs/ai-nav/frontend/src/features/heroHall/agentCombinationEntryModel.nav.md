# agentCombinationEntryModel.ts

> `frontend/src/features/heroHall/agentCombinationEntryModel.ts` · TypeScript · 约 460 行

## 用途

封装组合入口页的非 UI 派生逻辑：精选场景分组、快照状态文案、动态入口标题回退、组合阵容槽位、稳定智能体 key、初始阵容、候选智能体类目、等级推断和实时评分表模型。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `AGENT_LINEUP_SLOT_COUNT` | const | ~4 | 组合智能体阵容槽位数，当前为 5。 |
| `AgentCombinationSceneCard` | type | ~4 | 精选场景卡的数据结构。 |
| `AgentLineupScore` | type | ~18 | 组合评分表的数据结构。 |
| `AgentLineupScoreOptions` | type | ~28 | 评分表可选上下文，当前用于传入推荐智能体 key。 |
| `ALL_AGENT_LINEUP_CATEGORY_ID` | const | ~32 | 候选智能体类目筛选的“全部”稳定 id。 |
| `AgentLineupCategory` | type | ~34 | 候选智能体筛选类目的数据结构。 |
| `createSceneCards` | function | ~10 | 按智能体功能/阶段分组生成精选场景卡。 |
| `getSnapshotStatusText` | function | ~30 | 根据加载、错误和快照状态生成顶部状态文案。 |
| `getEntryTitle` | function | ~60 | 从快照 `entry_title` 生成入口标题并提供默认值。 |
| `getAgentCombinationKey` | function | ~68 | 从智能体 id、key、链接或名称生成本地阵容稳定 key。 |
| `createInitialLineupKeys` | function | ~72 | 从推荐智能体生成默认五人阵容 key。 |
| `padLineupKeys` | function | ~91 | 将阵容 key 列表补齐到固定槽位数。 |
| `createAgentLineupCategories` | function | ~120 | 从候选智能体、已入阵 key 和推荐 key 派生“全部/推荐优先/已入阵/阶段类目”。 |
| `filterAgentLineupCandidates` | function | ~181 | 按当前类目过滤可选智能体候选列表。 |
| `calculateAgentLineupScore` | function | ~211 | 基于成型度、能力覆盖、落地入口和组合合理性计算实时评分表；同类堆叠会明显降分。 |
| `getAgentRarity` | function | ~263 | 推断 UR/SSR/SR/S/A 等级，用于卡片和评分。 |

## 依赖

内部依赖:
- `frontend/src/lib/agentLaunchCatalog.ts` — 使用富化后的智能体类型。
- `frontend/src/types.ts` — 使用推荐快照类型。

## 修改指南

- **改入口标题回退**: 修改 `getEntryTitle`，保留快照 `entry_title` 优先。
- **改精选场景数量或分组**: 修改 `createSceneCards`，并检查 `AgentCombinationEntrySections.tsx` 的展示密度。
- **改候选智能体类目**: 修改 `createAgentLineupCategories`、`filterAgentLineupCandidates` 和私有 `getAgentLineupCategoryLabel`，保持推荐优先、已入阵和阶段类目都能按稳定 key 工作。
- **改状态文案**: 修改 `getSnapshotStatusText`，不要在 UI 组件里重复分支。
- **改阵容槽位数或评分权重**: 修改 `AGENT_LINEUP_SLOT_COUNT` 与 `calculateAgentLineupScore`，并同步检查 `AgentCombinationEntryPage.tsx` 的本地阵容状态；评分必须随用户组合动态变化，重复阶段/能力类目应降低能力覆盖和组合合理分。
- **改等级推断**: 修改 `getAgentRarity`，同时检查推荐卡片、候选卡和评分表的展示是否仍一致。

## 依赖图

```text
agentCombinationEntryModel.ts
← 引入: agentLaunchCatalog, types
→ 被引用: AgentCombinationEntryPage.tsx, AgentCombinationEntrySections.tsx
```
