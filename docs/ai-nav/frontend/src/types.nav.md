# types.ts

> `frontend/src/types.ts` · TypeScript · 约 110 行

## 用途

集中定义前端共享的对话、粒子、推荐智能体、图谱路径、工作流和会话 turn 类型。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `DialogueMode` | type | ~1 | 粒子和语音状态。 |
| `AgentAction` | type | ~9 | AI 回复可触发的图谱或聊天动作。 |
| `ParticleSettings` | type | ~20 | 粒子视觉参数。 |
| `Message` | type | ~26 | 对话消息结构。 |
| `RecommendedAgent` | type | ~32 | 推荐智能体展示、阵容和启动字段。 |
| `AgentUserState` | type | ~53 | 发送给后端的当前用户状态。 |
| `AgentGraphPath` | type | ~81 | 后端动态图谱路径结构。 |
| `AgentWorkflow` | type | ~88 | 前端两阶段工作流状态。 |
| `AgentTurn` | type | ~106 | 单轮对话记录。 |
| `ChatResponse` | type | ~116 | AI 回复统一结构。 |

## 依赖

内部依赖:
- 被 `App.tsx`、`workflowModel.ts`、`agentStreamClient.ts`、Hero Hall 和组件广泛引用。

## 修改指南

- **新增后端字段**: 先更新这里，再更新 `agentStreamClient.ts` 和展示层。
- **改 `RecommendedAgent`**: 同步检查 `agentLaunchCatalog.ts`、`agentUtils.ts`、`heroHallModel.ts`。

## 依赖图

```text
types.ts
→ 被引用: App.tsx, lib, components, features
```

