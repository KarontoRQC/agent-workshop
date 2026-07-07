# agentUtils.ts

> `frontend/src/features/agents/agentUtils.ts` · TypeScript · 约 31 行

## 用途

规范化推荐智能体字段，生成稳定 key，清洗状态文本，并给 UI 提供展示名和阶段。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `normalizeRecommendedAgent` | function | ~3 | 补齐 `agent_index` 和 `rank`。 |
| `getRecommendedAgentKey` | function | ~18 | 生成推荐智能体稳定 key。 |
| `cleanStateText` | function | ~26 | 清理未知文本字段。 |
| `hasDisplayableRecommendedAgent` | function | ~30 | 判断是否有可展示信息。 |
| `getAgentDisplayName` | function | ~34 | 取展示名。 |
| `getAgentStage` | function | ~38 | 取阶段或 fallback 阶段。 |

## 依赖

内部依赖:
- `frontend/src/types.ts` — 推荐智能体类型。

## 修改指南

- **改 key 规则**: 同步检查 Hero Hall 阵容状态、拖拽替换和推荐列表去重。

## 依赖图

```text
agentUtils.ts
← 引入: types
→ 被引用: App.tsx, workflowModel.ts, WorkflowDock.tsx, Hero Hall
```
