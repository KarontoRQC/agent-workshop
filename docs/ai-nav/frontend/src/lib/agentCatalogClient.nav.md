# agentCatalogClient.ts

> `frontend/src/lib/agentCatalogClient.ts` · TypeScript · 约 51 行

## 用途

封装智能体目录和追加推荐组合的前端 API 调用。Hero Hall 读取数据库目录作为英雄池，点击 `+` 时通过这里把指定智能体追加到当前推荐快照。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `AgentCatalogError` | class | ~4 | 包装目录/追加接口的 HTTP 错误状态。 |
| `fetchAgentCatalog` | function | ~14 | 请求 `GET /api/agents` 并返回 `AgentCatalogItem[]`。 |
| `appendAgentToRecommendation` | function | ~28 | 请求 `POST /api/recommendations/<id>/agents` 并返回更新后的快照。 |

## 依赖

内部依赖:
- `frontend/src/types.ts` — 使用 `AgentCatalogItem` 和 `RecommendationSnapshot`。
- `frontend/src/lib/agentStreamClient.ts` — 复用 `API_BASE_URL`。

## 修改指南

- **改接口路径**: 同步 `backend/routes/agents.py`、`backend/routes/recommendations.py` 和 `docs/coze-chat-stream-api.md`。
- **改错误结构**: 保持调用方能通过 `AgentCatalogError.status` 做状态判断。

## 依赖图

```text
agentCatalogClient.ts
→ 依赖: types.ts, agentStreamClient.ts
→ 被引用: App.tsx, AgentCombinationEntryPage.tsx
```
