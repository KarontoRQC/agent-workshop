# agentLaunchCatalog.ts

> `agentLaunchCatalog.ts` 现在接收 `GET /api/agents` 返回的数据库目录，运行时富化头像、启动链接和推荐展示字段。

> `frontend/src/lib/agentLaunchCatalog.ts` · TypeScript · 约 420 行

## 用途

维护前端运行时智能体目录索引，生成可展示、可启动、可匹配数据库头像的智能体数据。它为抽卡浮层、Workflow Dock、Hero Hall 和推荐组合页提供富化后的 agent；只有真实 HTTP/GPT 链接会被视为可打开目标。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `setAgentCatalogAgents` | function | ~45 | 注入数据库目录并重建名称/ID/GPT ID 索引。 |
| `getAgentCombinationEntryUrl` | function | ~170 | 根据推荐快照 id 生成 `?agent_combination=1&id=<recommendation_id>` 组合入口 URL。 |
| `AgentLaunchTarget` | type | ~18 | 可打开目标的标题和 URL。 |
| `EnrichedDrawAgent` | type | ~28 | 推荐智能体加头像、meta 和启动信息后的结构。 |
| `enrichDrawAgent` | function | ~50 | 用运行时目录数据富化一个推荐智能体。 |
| `getAgentLaunchTargets` | function | ~97 | 从富化 agent 列表提取可打开目标。 |
| `getCatalogHeroAgents` | function | ~113 | 返回完整 Hero Hall 候选池。 |
| `openAgentLaunchTargets` | function | ~133 | 打开单个或多个启动目标。 |

## 依赖

内部依赖:
- `frontend/src/lib/agentCatalogClient.ts` — 目录数据来源。
- `types.ts` — 推荐智能体类型。

## 修改指南

- **改智能体字段名**: 同步 `backend/services/agent_catalog_store.py`、`backend/routes/agents.py`、`frontend/src/types.ts` 和 `frontend/src/lib/agentCatalogClient.ts`。
- **改启动方式**: 检查 `openAgentLaunchTargets` 和推荐组合页打开逻辑，避免浏览器弹窗被阻止后无 fallback。

## 依赖图

```text
agentLaunchCatalog.ts
← 引入: types.ts
→ 被引用: AgentDrawOverlay, WorkflowDock, AgentHeroHall, AgentCombinationEntryPage, heroHallModel
```
