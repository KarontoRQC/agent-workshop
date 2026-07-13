# test_recommendation_snapshot_store.py

> `backend/tests/test_recommendation_snapshot_store.py` · Python · ~288 行

## 用途

验证推荐快照 store 的 ID 格式、内存快照状态转换、旧 `saved_lineup` 兼容字段、Postgres 方法接口、字段归一化、时间格式化和写失败回滚。新的组合智能体保存逻辑由 `test_combination_agent_store.py` 覆盖。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `test_new_recommendation_id_uses_rec_prefix_and_16_hex_chars` | test | ~12 | 验证推荐快照 ID 格式。 |
| `test_create_snapshot_starts_streaming` | test | ~18 | 验证新快照初始状态为 `streaming`。 |
| `test_merge_agent_delta_keeps_current_agent_snapshot` | test | ~35 | 验证同一智能体增量字段合并。 |
| `test_replace_agents_update_summary_and_complete_snapshot` | test | ~53 | 验证替换智能体、更新摘要和完成快照。 |
| `test_update_saved_lineup_persists_agent_slots_and_score` | test | ~79 | 验证内存 store 旧 `saved_lineup` 兼容字段保存五槽阵容和评分。 |
| `test_postgres_store_exposes_planned_api_methods` | test | ~71 | 验证 Postgres store 暴露约定方法。 |
| `test_postgres_update_saved_lineup_normalizes_before_write` | test | ~176 | 验证 Postgres 保存阵容前会归一化坏 payload。 |
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
- **修改旧 `saved_lineup` 兼容字段**: 同步补充 `update_saved_lineup`、Postgres row 转换和旧 route 保存接口测试；组合智能体保存应改 `test_combination_agent_store.py`。
- **修改 Postgres 写入**: 保留失败回滚测试，避免异常后连接状态不一致。

## 依赖图

```text
test_recommendation_snapshot_store.py
← 引入: services/recommendation_snapshot_store
→ 被引用: pytest
```
