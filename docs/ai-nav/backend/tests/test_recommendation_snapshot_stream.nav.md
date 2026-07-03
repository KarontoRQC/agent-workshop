# test_recommendation_snapshot_stream.py

> `backend/tests/test_recommendation_snapshot_stream.py` · Python · ~145 行

## 用途

验证推荐快照流式持久化逻辑：解析 SSE、注入推荐 ID、合并推荐智能体、保存图谱路径/摘要，并在异常时标记快照失败。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `_read_events` | helper | ~10 | 从 SSE 帧列表中提取 JSON 事件。 |
| `test_parse_sse_event_returns_none_for_non_object_data` | test | ~18 | 验证非对象 SSE 数据会被忽略。 |
| `test_workflow_started_injects_recommendation_id` | test | ~22 | 验证 `workflow.started` 注入推荐 ID 并保存会话 ID。 |
| `test_recommendation_id_is_emitted_before_upstream_events_when_workflow_started_is_missing` | test | ~43 | 验证缺少开始事件时先补发推荐 ID。 |
| `test_recommended_agents_delta_merges_agents_and_completion_marks_snapshot_completed` | test | ~70 | 验证推荐智能体增量合并和完成状态。 |
| `test_recommended_agents_completed_replaces_snapshot_agents` | test | ~101 | 验证完成事件替换快照智能体列表。 |
| `test_graph_path_resolved_saves_graph_path_fields` | test | ~126 | 验证图谱路径字段持久化。 |
| `test_stream_exception_fails_snapshot_and_reraises_original_exception` | test | ~190 | 验证流异常会失败快照并重新抛出原异常。 |

## 依赖

内部依赖:
- `backend/services/coze_stream_transformer.py` — 构造 SSE 测试帧。
- `backend/services/recommendation_snapshot_store.py` — 提供内存快照 store。
- `backend/services/recommendation_snapshot_stream.py` — 被测的 SSE 解析和持久化逻辑。

外部依赖(仅列包名):
- `pytest`

## 修改指南

- **修改 SSE 事件名或字段**: 同步更新事件解析、快照字段和接口文档断言。
- **修改快照状态机**: 覆盖 streaming、completed、failed 三类状态路径。

## 依赖图

```text
test_recommendation_snapshot_stream.py
← 引入: services/coze_stream_transformer, services/recommendation_snapshot_store, services/recommendation_snapshot_stream
→ 被引用: pytest
```
