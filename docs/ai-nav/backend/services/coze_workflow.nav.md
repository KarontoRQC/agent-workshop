# coze_workflow.py

> `backend/services/coze_workflow.py` · Python · 约 1290 行

## 用途

后端对话工作流核心。它根据配置选择统一编排或两阶段编排，生成知识路径、推荐智能体、阵容上下文、用户状态更新和最终 SSE 事件。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `start_chat_workflow_stream` | function | ~77 | 工作流总入口，返回 SSE generator。 |
| `build_recommender_message` | function | ~525 | 构造两阶段推荐智能体输入。 |
| `build_unified_orchestration_message` | function | ~551 | 构造统一编排输入。 |
| `build_user_state_system_context` | function | ~591 | 将用户状态和阵容上下文写入系统上下文。 |

## 依赖

内部依赖:
- `backend/services/coze_client.py` — 提供上游流和异常。
- `backend/services/coze_stream_transformer.py` — 解析 XML 标签并格式化 SSE。
- `backend/services/recommended_agents_stream.py` — 解析 `<AGENT>` 字段流。
- `backend/services/graph_path_resolver.py` — 生成动态图谱路径。

## 修改指南

- **改推荐阵容语义**: 检查 `LINEUP_IDS`、`LINEUP_ALIASES`、前端 `heroHallModel.ts` 和接口文档。
- **改工作流模式**: 保持 `workflow.started`、`workflow.stage.started`、`graph.path.resolved`、`recommended_agents.completed`、`workflow.completed` 等事件顺序可被前端消费。
- **改用户状态字段**: 同步检查前端 `AgentUserState` 类型和 `buildHeroHallLineupUserState`。

## 依赖图

```text
coze_workflow.py
← 引入: coze_client, coze_stream_transformer, graph_path_resolver, recommended_agents_stream
→ 被引用: routes/coze.py
```

