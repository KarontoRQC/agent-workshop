# recommendation_snapshot_stream.py

> `backend/services/recommendation_snapshot_stream.py` · Python · 约 135 行

## 用途

在转发后端 SSE 帧的同时，把推荐组合生成过程写入快照存储。它会补充 `recommendation_id`，并根据推荐、入口标题、总结、图谱和完成事件更新快照。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `parse_sse_event` | function | ~11 | 从格式化 SSE frame 中解析 JSON payload。 |
| `persist_recommendation_snapshot_stream` | function | ~29 | 转发 SSE 并持久化推荐快照增量。 |

## 依赖

内部依赖:
- `backend/services/coze_stream_transformer.py` — 使用 `format_sse_event` 重新输出结构化帧。
- `backend/services/recommendation_snapshot_store.py` — 调用快照写入方法。

## 修改指南

- **改 SSE 事件名**: 同步这里的 `_persist_event` 分支、`docs/coze-chat-stream-api.md` 和前端 `agentStreamClient.ts`。
- **改入口标题**: `ENTRY_TITLE` 的 `content.delta` 会累积写入快照 `entry_title`，前端组合入口页优先展示该字段。
- **改完成时机**: 不要把 `workflow.stage.completed` 当作整条流结束；最终完成仍以 `workflow.completed` 为准。

## 依赖图

```text
recommendation_snapshot_stream.py
→ 依赖: coze_stream_transformer, recommendation_snapshot_store
→ 被引用: routes/coze.py
```
