# test_recommendations_route.py

> `backend/tests/test_recommendations_route.py` · Python · ~320 行

## 用途

验证推荐快照查询接口、手动追加智能体接口和旧阵容保存兼容接口，包括快照过期、store 不可用、缺失智能体、幂等追加、无启动链接智能体，以及兼容路径 `PUT /api/recommendations/<id>/lineup` 的成功和错误响应。新的组合智能体保存主路径由 `test_combination_agents_route.py` 覆盖。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `UnavailableRecommendationSnapshotStore` | class | ~10 | 模拟快照 store 受控不可用。 |
| `RawUnavailableRecommendationSnapshotStore` | class | ~15 | 模拟快照 store 原始异常。 |
| `UnavailableLineupSaveStore` | class | ~20 | 模拟保存阵容时快照 store 不可用。 |
| `_client_with_store` | helper | ~20 | 用指定快照和目录 store 创建测试客户端。 |
| `test_get_recommendation_snapshot_returns_snapshot` | test | ~30 | 验证可按 ID 查询推荐快照。 |
| `test_get_recommendation_snapshot_returns_404_after_three_days` | test | ~49 | 验证三天后快照不可访问。 |
| `test_append_agent_to_recommendation_snapshot_persists_manual_agent` | test | ~78 | 验证手动追加智能体并补齐前端所需字段。 |
| `test_append_agent_to_recommendation_snapshot_is_idempotent` | test | ~130 | 验证重复追加同一智能体是幂等的。 |
| `test_append_agent_to_recommendation_snapshot_keeps_agent_without_launch_url_unopenable` | test | ~165 | 验证无启动链接智能体保持不可打开。 |
| `test_save_recommendation_lineup_persists_adjusted_agents` | test | ~225 | 验证旧保存路径的五槽阵容、评分和静态头像重写兼容。 |
| `test_save_recommendation_lineup_requires_lineup_list` | test | ~285 | 验证保存 payload 缺少 `lineup` 时返回 400。 |
| `test_save_recommendation_lineup_returns_404_after_three_days` | test | ~295 | 验证过期快照保存阵容返回 404。 |
| `test_save_recommendation_lineup_returns_503_when_store_unavailable` | test | ~312 | 验证保存阵容 store 不可用时返回 503。 |

## 依赖

内部依赖:
- `backend/app.py` — 创建 Flask 测试 app。
- `backend/services/agent_catalog_store.py` — 提供内存智能体目录。
- `backend/services/recommendation_snapshot_store.py` — 提供内存快照 store 和错误类型。

外部依赖(仅列包名):
- `pytest`

## 修改指南

- **修改推荐快照接口字段**: 同步更新查询、追加和旧保存阵容兼容断言，并检查前端快照模型。
- **修改组合智能体保存接口**: 更新 `test_combination_agents_route.py`，不要只改本文件。
- **修改过期策略**: 更新三天过期测试和接口文档。

## 依赖图

```text
test_recommendations_route.py
← 引入: app, services/agent_catalog_store, services/recommendation_snapshot_store
→ 被引用: pytest
```
