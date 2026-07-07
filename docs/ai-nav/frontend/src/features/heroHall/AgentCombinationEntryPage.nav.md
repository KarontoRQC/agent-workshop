# AgentCombinationEntryPage.tsx

> `frontend/src/features/heroHall/AgentCombinationEntryPage.tsx` · TypeScript React · 约 609 行

## 用途

渲染 `?agent_combination=1&id=<recommendation_id>` 对应的推荐组合入口页。该文件负责推荐快照、目录拉取、轮询、推荐智能体展示编排、组合智能体阵容的本地选择/拖拽/换位/实时评分，以及右上角保存按钮；保存成功后会把后端返回的 `saved_lineup` 写回页面状态，刷新时优先恢复已保存阵容。页面内容包在 `.agent-combination-entry-frame` 内滚动，避免滑动时越过殿堂背景框。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `AgentCombinationEntryPage` | component | ~96 | 组合入口页主组件，负责拉取快照/目录、恢复 `saved_lineup`、本地阵容编辑、保存阵容和轮询状态。 |

## 依赖

内部依赖:
- `frontend/src/lib/agentCatalogClient.ts` — 读取数据库智能体目录。
- `frontend/src/lib/recommendationSnapshotClient.ts` — 读取推荐快照，并保存当前组合阵容。
- `frontend/src/lib/agentLaunchCatalog.ts` — 富化头像、启动链接和展示字段。
- `frontend/src/features/workflow/recommendationSnapshotModel.ts` — 判断轮询和映射快照 agents。
- `AgentCombinationEntrySections.tsx` — 渲染 hero、场景、智能体卡片、组合阵容、评分表和状态面板。
- `agentCombinationEntryModel.ts` — 生成场景卡、入口标题、快照状态文案、阵容 key、初始阵容、候选类目和实时评分模型。
- `AgentCombinationEntryPage.css` — 组合入口页蓝金 HUD 样式与右上保存按钮。

外部依赖(仅列包名,不做解释):
- `react`

## 修改指南

- **改数据流/轮询**: 修改本文件，并同步检查 `recommendationSnapshotModel.ts`。
- **改组合智能体交互**: 修改本文件的 `lineupKeys`、pointer drag 和 drop 提交逻辑，保持点击加入、拖拽入槽和槽内换位都可用。
- **改保存阵容**: 修改 `saveCurrentLineup`、`createSavedLineupAgent` 和 `savedLineupAgents` 初始化逻辑，并同步 `recommendationSnapshotClient.ts`、后端 `routes/recommendations.py` 与接口文档。
- **改滚动容器**: 保持内容在 `.agent-combination-entry-frame` 内滚动；不要让 `main` 本身恢复页面级滚动。
- **改页面视觉或间距**: 优先修改 `AgentCombinationEntryPage.css`，不要重新把样式塞回 TSX。
- **改卡片 DOM 结构**: 修改 `AgentCombinationEntrySections.tsx`，保持真实推荐字段优先。
- **改入口标题、状态文案或评分权重**: 修改 `agentCombinationEntryModel.ts`；传入 `recommendedAgentKeys` 让评分表能判断用户组合是否保留推荐核心。

## 依赖图

```text
AgentCombinationEntryPage.tsx
← 引入: agentCatalogClient, recommendationSnapshotClient, agentLaunchCatalog, recommendationSnapshotModel
→ 被引用: App.tsx 根据 URL 参数切换入口页
```
