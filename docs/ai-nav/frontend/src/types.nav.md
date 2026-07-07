# types.ts

> `frontend/src/types.ts` · TypeScript · 约 176 行

## 用途

集中定义前端共享的对话、粒子、推荐智能体、数据库智能体目录、推荐快照、图谱路径、工作流和会话 turn 类型。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `DialogueMode` | type | ~1 | 粒子和语音状态。 |
| `AgentAction` | type | ~9 | AI 回复可触发的图谱或聊天动作。 |
| `ParticleSettings` | type | ~20 | 粒子视觉参数。 |
| `Message` | type | ~26 | 对话消息结构。 |
| `RecommendedAgent` | type | ~32 | 推荐智能体展示、阵容和启动字段。 |
| `AgentCatalogItem` | type | ~64 | `GET /api/agents` 返回的数据库智能体目录项，包含 `avatar_url`、`launch_url` 和 `knowledge`。 |
| `AgentUserState` | type | ~86 | 发送给后端的当前用户状态。 |
| `AgentGraphPath` | type | ~114 | 后端动态图谱路径结构。 |
| `RecommendationSnapshotStatus` | type | ~122 | 推荐快照状态枚举。 |
| `RecommendationSnapshot` | type | ~124 | `GET /api/recommendations/<id>` 返回的组合快照结构，包含推荐列表和可选的 `saved_lineup` 保存阵容字段。 |
| `AgentWorkflow` | type | ~137 | 前端两阶段工作流状态。 |
| `AgentTurn` | type | ~154 | 单轮对话记录。 |
| `ChatResponse` | type | ~165 | AI 回复统一结构。 |

## 依赖

内部依赖:
- 被 `App.tsx`、`workflowModel.ts`、`agentStreamClient.ts`、Hero Hall 和组件广泛引用。

## 修改指南

- **新增后端字段**: 先更新这里，再更新 `agentStreamClient.ts`、对应 API client 和展示层。
- **改推荐快照保存阵容字段**: 同步检查 `recommendationSnapshotClient.ts`、`AgentCombinationEntryPage.tsx` 和后端 `recommendation_snapshot_store.py`。
- **改 `RecommendedAgent`**: 同步检查 `agentLaunchCatalog.ts`、`heroTeamPresentation.ts`、`heroHallModel.ts` 和组合入口页。
- **改 `AgentCatalogItem`**: 同步检查 `backend/routes/agents.py`、`agentCatalogClient.ts` 和 `agentLaunchCatalog.ts`。

## 依赖图

```text
types.ts
→ 被引用: App.tsx, lib, components, features
```
