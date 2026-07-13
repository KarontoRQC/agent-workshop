# test_combination_agent_store.py

> `backend/tests/test_combination_agent_store.py` · Python · 约 139 行

## 用途

验证组合智能体 store 的核心行为：`combo_*` ID、五槽阵容归一化、按 `recommendation_id` 幂等 upsert、Postgres 写入前归一化和 row 转换。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `test_new_combination_agent_id_uses_combo_prefix_and_16_hex_chars` | test | ~14 | 验证组合智能体 ID 形态。 |
| `test_normalize_combination_lineup_pads_to_five_slots_and_normalizes_fields` | test | ~20 | 验证保存阵容补齐五槽和字段归一化。 |
| `test_in_memory_upsert_for_recommendation_updates_same_combination_agent` | test | ~42 | 验证同一个推荐 ID 重复保存会更新同一个组合智能体。 |
| `test_postgres_upsert_normalizes_payload_before_write` | test | ~86 | 验证 Postgres 写入前会归一化坏 payload。 |

## 依赖

内部依赖:
- `backend/services/combination_agent_store.py` — 被测 store 和归一化函数。

外部依赖(仅列包名,不做解释):
- `pytest`

## 修改指南

- **改组合智能体 schema**: 同步更新 row 转换和 Postgres upsert 参数断言。
- **改阵容校验规则**: 更新 `test_normalize_combination_lineup_pads_to_five_slots_and_normalizes_fields`。

## 依赖图

```text
test_combination_agent_store.py
← 引入: services.combination_agent_store
```
