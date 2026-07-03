# test_recommendation_snapshot_store.py

> `backend/tests/test_recommendation_snapshot_store.py` · Python · ~150 行

## 用途

验证推荐快照 store 的 ID 格式、内存快照状态转换、Postgres 方法接口、字段归一化、时间格式化和写失败回滚。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `test_new_recommendation_id_uses_rec_prefix_and_16_hex_chars` | test | ~12 | 验证推荐快照 ID 格式。 |
| `test_create_snapshot_starts_streaming` | test | ~18 | 验证新快照初始状态为 `streaming`。 |
| `test_merge_agent_delta_keeps_current_agent_snapshot` | test | ~35 | 验证同一智能体增量字段合并。 |
| `test_replace_agents_update_summary_and_complete_snapshot` | test | ~53 | 验证替换智能体、更新摘要和完成快照。 |
| `test_postgres_store_exposes_planned_api_methods` | test | ~71 | 验证 Postgres store 暴露约定方法。 |
| `test_postgres_write_rolls_back_existing_connection_on_error` | test | ~131 | 验证写失败时回滚现有连接。 |
| `FailingCursor` | class | ~145 | 模拟执行失败的 cursor。 |
| `FailingConnection` | class | ~155 | 模拟可检测 rollback 的连接。 |

## 依赖

内部依赖:
- `backend/services/recommendation_snapshot_store.py` — 被测的内存和 Postgres 快照 store。

外部依赖(仅列包名):
- `pytest`

## 修改指南

- **新增快照字段**: 同步补充 create、row 转换、归一化和持久化断言。
- **修改 Postgres 写入**: 保留失败回滚测试，避免异常后连接状态不一致。

## 依赖图

```text
test_recommendation_snapshot_store.py
← 引入: services/recommendation_snapshot_store
→ 被引用: pytest
```
