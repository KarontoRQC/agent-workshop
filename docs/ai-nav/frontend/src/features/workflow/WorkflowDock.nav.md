# WorkflowDock.tsx

> `frontend/src/features/workflow/WorkflowDock.tsx` · TypeScript React · 约 164 行

## 用途

渲染右侧知识路径和推荐智能体 dock，包括路径节点、推荐卡片和打开对应英雄殿堂入口页的推荐包操作区。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `WorkflowDock` | component | ~9 | 展示工作流可视化结果。 |

## 依赖

内部依赖:
- `agentLaunchCatalog.ts` — 推荐智能体启动目标。
- `agents/agentUtils.ts` — 展示名和 key。
- `workflowModel.ts` — 高亮类型。
- `WorkflowDock.css` — 模块样式。

外部依赖(仅列包名,不做解释):
- `react`
- `lucide-react`

## 修改指南

- **改推荐入口**: 右下角“打开你的殿堂”必须使用 `getAgentCombinationEntryUrl(recommendationId)` 跳转组合入口页，不再打开旧 Hero Hall 弹层。
- **改路径显示数量**: 同步 `frontend/AGENTS.md` 中「五个 route nodes contained scroll」约束。

## 依赖图

```text
WorkflowDock.tsx
← 引入: agentLaunchCatalog, agentUtils, workflowModel, WorkflowDock.css
→ 被引用: App.tsx
```
