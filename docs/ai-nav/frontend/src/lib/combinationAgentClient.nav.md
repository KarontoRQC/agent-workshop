# combinationAgentClient.ts

> `frontend/src/lib/combinationAgentClient.ts` · TypeScript · 约 65 行

## 用途

封装组合智能体服务对象的读取和保存 API。组合入口页刷新时通过带 `optional=1` 的 GET 恢复已保存阵容，200/null 表示尚未保存且不产生浏览器 404/取消噪音；保存按钮通过 `PUT` 更新当前五槽组合。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `CombinationAgentError` | class | ~4 | 包装组合智能体接口的 HTTP 错误状态。 |
| `fetchCombinationAgentByRecommendation` | function | ~14 | 通过推荐快照 ID 可选读取已保存组合智能体；JSON `null` 返回 `null`。 |
| `saveCombinationAgentForRecommendation` | function | ~41 | 保存当前五槽阵容、评分和标题到组合智能体服务。 |

## 依赖

内部依赖:
- `frontend/src/types.ts` — 使用 `CombinationAgent` 和 `RecommendedAgent`。
- `frontend/src/lib/agentStreamClient.ts` — 复用 `API_BASE_URL`。

## 修改指南

- **改组合智能体接口路径**: 同步后端 `routes/combination_agents.py`、接口文档和组合入口页。
- **改保存 payload**: 同步 `CombinationAgent` 类型、`AgentCombinationEntryPage.tsx` 的 `saveCurrentLineup` 和后端 store 归一化。

## 依赖图

```text
combinationAgentClient.ts
← 引入: types.ts, agentStreamClient.ts
→ 被引用: AgentCombinationEntryPage.tsx
```
