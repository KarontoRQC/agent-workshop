# recommendationSnapshotClient.ts

> `frontend/src/lib/recommendationSnapshotClient.ts` · TypeScript · 约 67 行

## 用途

封装组合入口页读取推荐快照的 API 调用。旧 `saveRecommendationLineup` 仅保留兼容；新的组合智能体保存必须走 `combinationAgentClient.ts`，不要把推荐快照当成组合智能体服务对象。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `RecommendationSnapshotError` | class | ~4 | 包装推荐快照接口的 HTTP 错误状态。 |
| `fetchRecommendationSnapshot` | function | ~14 | 请求 `GET /api/recommendations/<id>` 并返回 `RecommendationSnapshot`。 |
| `saveRecommendationLineup` | function | ~38 | 兼容旧 `PUT /api/recommendations/<id>/lineup` 路径，不作为组合智能体保存主入口。 |

## 依赖

内部依赖:
- `frontend/src/types.ts` — 使用 `RecommendationSnapshot` 和 `RecommendedAgent`。
- `frontend/src/lib/agentStreamClient.ts` — 复用 `API_BASE_URL`。

## 修改指南

- **改快照路径**: 同步后端 `routes/recommendations.py` 和组合入口页。
- **改组合智能体保存路径**: 修改 `combinationAgentClient.ts`，同步后端 `routes/combination_agents.py`。
- **改快照结构**: 先改 `types.ts`，再改 `recommendationSnapshotModel.ts`。

## 依赖图

```text
recommendationSnapshotClient.ts
→ 依赖: types.ts, agentStreamClient.ts
→ 被引用: AgentCombinationEntryPage.tsx
```
