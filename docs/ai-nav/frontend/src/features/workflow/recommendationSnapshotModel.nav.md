# recommendationSnapshotModel.ts

> `frontend/src/features/workflow/recommendationSnapshotModel.ts` · TypeScript · 约 32 行

## 用途

提供推荐组合入口页需要的轻量模型函数：从 URL 解析快照 ID、判断是否继续轮询，以及把快照中的 agents 转成前端推荐智能体列表。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `getAgentCombinationEntryIdFromUrl` | function | ~3 | 识别 `?agent_combination=1&id=...` 入口 URL。 |
| `shouldPollRecommendationSnapshot` | function | ~17 | 仅在快照状态为 `streaming` 时继续轮询。 |
| `snapshotToRecommendedAgents` | function | ~21 | 为快照 agents 补齐 `streamStatus`。 |

## 依赖

内部依赖:
- `frontend/src/types.ts` — 使用 `RecommendationSnapshot` 和 `RecommendedAgent`。

## 修改指南

- **改入口 URL 参数**: 同步 `agentLaunchCatalog.ts` 的 `getAgentCombinationEntryUrl`。
- **改快照状态**: 同步 `RecommendationSnapshotStatus` 和后端快照 store。

## 依赖图

```text
recommendationSnapshotModel.ts
→ 依赖: types.ts
→ 被引用: App.tsx, AgentCombinationEntryPage.tsx
```
