# recommendations.py

> `backend/routes/recommendations.py` · Python · 约 117 行

## 用途

定义推荐组合快照的读取和手动追加接口。组合入口页通过 `GET /api/recommendations/<id>` 读取 3 天内的快照，Hero Hall 英雄池通过 `POST /api/recommendations/<id>/agents` 把目录智能体追加到当前推荐组合；快照过期后按不存在返回 404。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `recommendations_bp` | Blueprint | ~3 | 注册 `/api/recommendations` 相关接口。 |
| `get_recommendation_snapshot` | function | ~7 | 查询推荐组合快照。 |
| `append_agent_to_recommendation_snapshot` | function | ~21 | 追加目录智能体到指定推荐快照，并保持同一 agent 幂等去重。 |

## 依赖

内部依赖:
- `backend/services/recommendation_snapshot_store.py` — 读取和更新快照中的 `agents`。
- `backend/services/agent_catalog_store.py` — 按 `agent_id` 查询目录智能体。
- `backend/routes/agents.py` — 为手动追加的头像生成 `avatar_url`。

外部依赖(仅列包名, 不做解释):
- `flask`

## 修改指南

- **改追加字段**: 同步 `frontend/src/types.ts`、`frontend/src/lib/agentLaunchCatalog.ts` 和组合入口页卡片展示。
- **改幂等规则**: 同步后端测试，确保同一推荐快照里重复追加不会复制卡片。
- **改过期行为**: 同步 `recommendation_snapshot_store.py` 的 3 天 TTL 和接口文档。

## 依赖图

```text
recommendations.py
→ 依赖: recommendation_snapshot_store, agent_catalog_store
→ 被引用: app.py 注册为 /api/recommendations
```
