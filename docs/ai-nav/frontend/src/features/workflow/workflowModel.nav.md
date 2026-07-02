# workflowModel.ts

> `frontend/src/features/workflow/workflowModel.ts` · TypeScript · 约 582 行

## 用途

前端工作流纯逻辑核心。它创建会话 ID、空工作流、可见 reveal 状态，合并 SSE 文本和推荐智能体，维护 Hero Hall 阵容用户状态，并提供语音播放文本。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `PATH_MATCH_ANIMATION_MS` | const | ~23 | 路径匹配动画时长。 |
| `RECOMMENDATION_DOCK_REVEAL_MS` | const | ~24 | 推荐 dock 展示延迟。 |
| `SPEECH_SEGMENT_WAIT_MS` | const | ~25 | 语音段等待时长。 |
| `createClientConversationIds` | function | ~54 | 创建 route/recommendation 会话 ID。 |
| `createEmptyAgentWorkflow` | function | ~84 | 返回空工作流结构。 |
| `getVisibleWorkflow` | function | ~114 | 根据 reveal 状态裁剪可见工作流。 |
| `appendWorkflowContent` | function | ~206 | 将 `content.delta` 合并到工作流。 |
| `setWorkflowGraphPath` | function | ~238 | 保存后端解析出的图谱路径。 |
| `upsertRecommendedAgent` | function | ~262 | 合并单个推荐智能体增量。 |
| `replaceRecommendedAgents` | function | ~308 | 替换推荐智能体列表。 |
| `buildHeroHallLineupUserState` | function | ~368 | 从 Hero Hall 阵容构造后端 user state。 |
| `mergeAgentUserState` | function | ~411 | 合并用户状态。 |
| `getLatestDisplayableRecommendedAgents` | function | ~499 | 从 turns 中取可展示推荐列表。 |
| `formatWorkflowError` | function | ~659 | 格式化 workflow error。 |

## 依赖

内部依赖:
- `frontend/src/lib/agentStreamClient.ts` — SSE 事件类型。
- `frontend/src/lib/agentLaunchCatalog.ts` — 富化推荐智能体。
- `frontend/src/features/agents/agentUtils.ts` — 推荐智能体规范化。
- `frontend/src/features/heroHall/heroHallModel.ts` — 阵容 ID 和 key。
- `frontend/src/types.ts` — 工作流和用户状态类型。

## 修改指南

- **新增后端事件 type**: 同步 `knowledgeGraphTextTypes` 或 `agentRecommendationTextTypes`。
- **改推荐智能体合并**: 检查 `AgentHeroHall.tsx` 和 `HeroTeamCarousel.tsx` 是否依赖字段。
- **改用户状态结构**: 同步后端 `coze_workflow.py` 的 `_normalize_user_state`。

## 依赖图

```text
workflowModel.ts
← 引入: agentStreamClient, agentLaunchCatalog, agents/agentUtils, heroHallModel, types
→ 被引用: App.tsx, AgentConsole.tsx, WorkflowDock.tsx
```

