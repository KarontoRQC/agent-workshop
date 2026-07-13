# recommendation_snapshot_store.py

> `backend/services/recommendation_snapshot_store.py` · Python · 约 517 行

## 用途

维护推荐组合快照的内存和 Postgres 存储。快照保存推荐生成状态、用户问题、入口标题、推荐智能体列表、总结、知识图谱路径和上游会话 ID；`saved_lineup` 仅保留旧保存接口兼容，新的用户调整阵容应保存到 `combination_agent_store.py`。快照从 `created_at` 起保留 3 天，过期后读取和追加都按不存在处理。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `RecommendationSnapshotStoreError` | class | ~23 | 快照存储不可用时抛出的错误。 |
| `new_recommendation_id` | function | ~41 | 生成 `rec_` 前缀的推荐快照 ID。 |
| `SNAPSHOT_TTL` | const | ~36 | 推荐快照 3 天保留时长。 |
| `InMemoryRecommendationSnapshotStore` | class | ~118 | 测试用内存快照存储，包含 `update_saved_lineup`。 |
| `PostgresRecommendationSnapshotStore` | class | ~236 | Postgres 快照建表、读取、旧表补列和更新实现。 |

## 依赖

外部依赖(仅列包名, 不做解释):
- `psycopg`

## 修改指南

- **改快照结构**: 同步 `frontend/src/types.ts`、`recommendationSnapshotClient.ts` 和 `recommendationSnapshotModel.ts`；`entry_title` 用于组合入口页标题，用户保存阵容应走 `combination_agent_store.py`。
- **改 agents 更新方式**: 检查 `recommendation_snapshot_stream.py` 和 `routes/recommendations.py`，保证流式推荐和手动追加都写同一个字段。
- **改旧保存阵容兼容字段**: 同步 `routes/recommendations.py` 的 `PUT /lineup` payload 归一化和相关 route/store 测试；不要把它作为组合智能体保存主路径。
- **改保留时长**: 修改 `SNAPSHOT_TTL` 后同步接口文档和过期快照测试。

## 依赖图

```text
recommendation_snapshot_store.py
→ 被引用: app.py, routes/recommendations.py, recommendation_snapshot_stream.py
```
