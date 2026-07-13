# test_combination_agents_route.py

> `backend/tests/test_combination_agents_route.py` · Python · 约 164 行

## 用途

验证组合智能体服务接口：保存当前五槽阵容、按推荐 ID 或组合 ID 读取、重复保存更新同一对象、缺失快照和 store 不可用时返回安全错误。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `UnavailableCombinationAgentStore` | class | ~11 | 模拟组合智能体 store 不可用。 |
| `test_save_combination_agent_for_recommendation_persists_adjusted_lineup` | test | ~36 | 验证保存阵容会生成组合智能体对象并重写静态头像 URL。 |
| `test_save_combination_agent_updates_existing_service_object` | test | ~114 | 验证同一推荐 ID 重复保存仍更新同一个组合智能体 ID。 |
| `test_save_combination_agent_returns_404_for_missing_recommendation_snapshot` | test | ~166 | 验证不存在推荐来源时不能保存组合智能体。 |

## 依赖

内部依赖:
- `backend/app.py` — 创建 Flask 测试 app。
- `backend/services/combination_agent_store.py` — 提供内存组合智能体 store。
- `backend/services/recommendation_snapshot_store.py` — 提供推荐快照来源。
- `backend/services/agent_catalog_store.py` — 提供头像静态 URL 测试数据。

## 修改指南

- **改组合智能体保存接口**: 同步更新 URL、payload 和成功响应断言。
- **改错误响应**: 确保测试仍断言不泄漏原始异常文本。

## 依赖图

```text
test_combination_agents_route.py
← 引入: app, services.agent_catalog_store, services.combination_agent_store, services.recommendation_snapshot_store
```
