# test_recommendations_route.py

> `backend/tests/test_recommendations_route.py` · Python · ~190 行

## 用途

验证推荐快照查询接口和手动追加智能体接口，包括快照过期、store 不可用、缺失智能体、幂等追加和无启动链接智能体。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `UnavailableRecommendationSnapshotStore` | class | ~10 | 模拟快照 store 受控不可用。 |
| `RawUnavailableRecommendationSnapshotStore` | class | ~15 | 模拟快照 store 原始异常。 |
| `_client_with_store` | helper | ~20 | 用指定快照和目录 store 创建测试客户端。 |
| `test_get_recommendation_snapshot_returns_snapshot` | test | ~30 | 验证可按 ID 查询推荐快照。 |
| `test_get_recommendation_snapshot_returns_404_after_three_days` | test | ~49 | 验证三天后快照不可访问。 |
| `test_append_agent_to_recommendation_snapshot_persists_manual_agent` | test | ~78 | 验证手动追加智能体并补齐前端所需字段。 |
| `test_append_agent_to_recommendation_snapshot_is_idempotent` | test | ~130 | 验证重复追加同一智能体是幂等的。 |
| `test_append_agent_to_recommendation_snapshot_keeps_agent_without_launch_url_unopenable` | test | ~165 | 验证无启动链接智能体保持不可打开。 |

## 依赖

内部依赖:
- `backend/app.py` — 创建 Flask 测试 app。
- `backend/services/agent_catalog_store.py` — 提供内存智能体目录。
- `backend/services/recommendation_snapshot_store.py` — 提供内存快照 store 和错误类型。

外部依赖(仅列包名):
- `pytest`

## 修改指南

- **修改推荐快照接口字段**: 同步更新查询和追加接口断言，并检查前端快照模型。
- **修改过期策略**: 更新三天过期测试和接口文档。

## 依赖图

```text
test_recommendations_route.py
← 引入: app, services/agent_catalog_store, services/recommendation_snapshot_store
→ 被引用: pytest
```
