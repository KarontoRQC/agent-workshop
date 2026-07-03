# AgentCombinationEntryPage.tsx

> `frontend/src/features/heroHall/AgentCombinationEntryPage.tsx` · TSX · 约 840 行

## 用途

渲染 `?agent_combination=1&id=<recommendation_id>` 对应的推荐组合入口页。页面读取推荐快照和数据库智能体目录，用深色蓝金 cockpit HUD 风格的场景卡/智能体卡展示推荐智能体与更多可浏览智能体，并在页面自身容器内滚动；没有真实 GPT 链接的智能体只展示，不显示“打开”。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `AgentCombinationEntryPage` | component | ~18 | 组合入口页主组件，负责拉取快照、目录和轮询。 |
| `AgentCardSection` | function | ~170 | 渲染推荐智能体或更多智能体卡片网格。 |
| `createSceneCards` | function | ~224 | 按功能分类生成顶部精选场景卡。 |
| `getSnapshotStatusText` | function | ~257 | 根据快照和目录加载状态生成顶部状态文案。 |

## 依赖

内部依赖:
- `frontend/src/lib/agentCatalogClient.ts` — 读取数据库目录。
- `frontend/src/lib/recommendationSnapshotClient.ts` — 读取推荐快照。
- `frontend/src/lib/agentLaunchCatalog.ts` — 富化头像、启动链接和展示字段。
- `frontend/src/features/workflow/recommendationSnapshotModel.ts` — 判断轮询和映射快照 agents。
- `frontend/assets/space-cruise-bg.png` — 组合入口页深空背景。

外部依赖(仅列包名, 不做解释):
- `react`
- `lucide-react`

## 修改指南

- **改推荐页视觉**: 保持深色 Jarvis cockpit HUD 风格、桌面和移动端无横向溢出，并用真实 `avatar_url` 图片展示卡片。
- **改页面滚动**: 滚动必须保留在 `.agent-combination-entry-page` 自身，不依赖全局 `body`，因为主应用全局锁定 `overflow: hidden`。
- **改轮询逻辑**: 先检查 `recommendationSnapshotModel.ts`，避免已完成快照仍持续请求。
- **改打开按钮**: 同步 `agentLaunchCatalog.ts` 的启动目标提取逻辑；无 `launch_url` 时不显示“打开”。

## 依赖图

```text
AgentCombinationEntryPage.tsx
→ 依赖: agentCatalogClient, recommendationSnapshotClient, agentLaunchCatalog, recommendationSnapshotModel
→ 被引用: App.tsx 根据 URL 参数切换入口页
```

## 本次交互补充

- 顶部“精选场景”里的智能体条目复用 `launchTarget`：有真实 GPT 链接时整行可点击跳转；没有链接时只展示头像和名称，不提供无效跳转。
