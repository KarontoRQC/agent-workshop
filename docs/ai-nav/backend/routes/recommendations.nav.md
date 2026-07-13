# recommendations.py

> `backend/routes/recommendations.py` · Python · 约 339 行

## 用途

定义推荐组合快照的读取和手动追加接口。组合入口页通过 `GET /api/recommendations/<id>` 读取 3 天内的推荐来源快照；Hero Hall 英雄池通过 `POST /api/recommendations/<id>/agents` 把目录智能体追加到当前推荐组合。`PUT /api/recommendations/<id>/lineup` 只保留旧数据兼容，新的组合智能体保存主路径是 `routes/combination_agents.py`。返回快照时会把历史快照和旧保存阵容里的头像接口地址重写为静态头像 URL；快照过期后按不存在返回 404。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `recommendations_bp` | Blueprint | ~8 | 注册 `/api/recommendations` 相关接口。 |
| `get_recommendation_snapshot` | function | ~44 | 查询推荐组合快照并标准化静态头像 URL。 |
| `append_agent_to_recommendation_snapshot` | function | ~58 | 追加目录智能体到指定推荐快照，并保持同一 agent 幂等去重。 |
| `save_recommendation_lineup` | function | ~99 | 兼容旧五槽阵容保存到 `saved_lineup` 的接口；不作为组合智能体服务保存主入口。 |
| `_snapshot_with_static_avatar_urls` | function | ~123 | 基于智能体目录把快照 `agents` 与 `saved_lineup` 里的旧头像接口 URL 重写为静态头像 URL。 |
| `_normalize_saved_lineup_payload` | function | ~206 | 校验并归一化保存阵容 payload，最多保留 5 个槽位。 |

## 依赖

内部依赖:
- `backend/services/recommendation_snapshot_store.py` — 读取和更新快照中的 `agents` 与 `saved_lineup`。
- `backend/services/agent_catalog_store.py` — 按 `agent_id` 查询目录智能体。
- `backend/routes/agents.py` — 为手动追加的头像生成 `avatar_url`。

外部依赖(仅列包名, 不做解释):
- `flask`

## 修改指南

- **改追加字段**: 同步 `frontend/src/types.ts`、`frontend/src/lib/agentLaunchCatalog.ts` 和组合入口页卡片展示。
- **改组合智能体保存**: 优先修改 `routes/combination_agents.py`、`services/combination_agent_store.py`、`frontend/src/lib/combinationAgentClient.ts` 和接口文档。
- **改幂等规则**: 同步后端测试，确保同一推荐快照里重复追加不会复制卡片。
- **改过期行为**: 同步 `recommendation_snapshot_store.py` 的 3 天 TTL 和接口文档。

## 依赖图

```text
recommendations.py
→ 依赖: recommendation_snapshot_store, agent_catalog_store
→ 被引用: app.py 注册为 /api/recommendations
```
