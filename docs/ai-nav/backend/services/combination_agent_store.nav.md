# combination_agent_store.py

> `backend/services/combination_agent_store.py` · Python · 约 325 行

## 用途

维护组合智能体服务对象的内存和 Postgres 存储。它负责生成 `combo_*` ID、归一化五槽阵容、保存实时评分和来源快照，并按 `recommendation_id` 幂等更新同一个组合智能体记录。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `CombinationAgentStoreError` | class | ~51 | 标记组合智能体 store 不可用。 |
| `new_combination_agent_id` | function | ~55 | 生成 `combo_` 前缀的组合智能体 ID。 |
| `normalize_combination_lineup` | function | ~59 | 校验并补齐最多五槽的组合智能体阵容。 |
| `normalize_combination_score` | function | ~95 | 归一化评分表对象。 |
| `InMemoryCombinationAgentStore` | class | ~166 | 测试和本地内存组合智能体 store。 |
| `PostgresCombinationAgentStore` | class | ~230 | Postgres 组合智能体 store，负责建表和 upsert。 |

## 依赖

内部依赖:
- 无。

外部依赖(仅列包名,不做解释):
- `psycopg`

## 修改指南

- **改组合智能体字段**: 修改 `COMBINATION_AGENT_COLUMNS`、`ensure_schema`、`_row_to_combination_agent`，并同步前端 `CombinationAgent` 类型。
- **改阵容槽位或字段白名单**: 修改 `MAX_COMBINATION_LINEUP_SIZE` 和 `COMBINATION_AGENT_LINEUP_FIELDS`，同步组合入口页和接口文档。
- **改保存幂等键**: 修改 `upsert_for_recommendation` 的冲突键，并同步 `routes/combination_agents.py` 的 URL 语义。

## 依赖图

```text
combination_agent_store.py
→ 被引用: app.py, routes/combination_agents.py, backend/tests/test_combination_agent_store.py
```
