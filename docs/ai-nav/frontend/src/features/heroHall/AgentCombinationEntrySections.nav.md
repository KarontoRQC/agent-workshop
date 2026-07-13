# AgentCombinationEntrySections.tsx

> `frontend/src/features/heroHall/AgentCombinationEntrySections.tsx` · TypeScript React · 约 380 行

## 用途

承接组合入口页的展示组件：顶部英雄殿堂及分享控件插槽、首席智能体卡、精选场景、推荐/目录智能体卡片、组合智能体阵容、评分表、一键打开按钮、保存阵容按钮、候选智能体类目筛选和状态面板。组合阵容、分享实现和保存状态仍由父组件管理，本文件只接收 ReactNode/事件回调并渲染展示结构、可拖拽槽位和候选卡。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `AgentCombinationHero` | component | ~6 | 渲染入口页顶部标题、分享控件插槽、统计和首席智能体卡。 |
| `HeroCrownCard` | component | ~48 | 渲染首席推荐智能体展柜卡。 |
| `SceneSection` | component | ~70 | 渲染精选场景横向列表。 |
| `AgentLineupBuilder` | component | ~135 | 渲染五人组合智能体槽位、可读候选智能体类目筛选、横向列表、一键打开阵容按钮、保存阵容按钮、重置阵容按钮和组合评分表。 |
| `AgentCardSection` | component | ~409 | 渲染推荐智能体或更多智能体网格。 |
| `RecommendedAgentsAction` | component | ~475 | 渲染一键打开推荐智能体按钮。 |
| `StatusPanel` | component | ~493 | 渲染加载、失败和空状态面板。 |

## 依赖

内部依赖:
- `frontend/src/lib/agentLaunchCatalog.ts` — 使用富化后的智能体展示字段。
- `agentCombinationEntryModel.ts` — 使用精选场景卡、阵容槽位、智能体 key、候选类目、等级和评分类型。

外部依赖(仅列包名,不做解释):
- `react`
- `lucide-react`

## 修改指南

- **改卡片结构**: 保持名称、阶段、理由、标签和打开按钮在卡片内部截断，不要让长中文溢出。
- **改顶部分享位置**: 保持 `shareControl` 在皇冠标签同一标题行，由父组件传入独立分享模块，不要把二维码状态写进本展示文件。
- **改组合阵容展示**: 修改 `AgentLineupBuilder`、`LineupSlot` 和 `LineupScorePanel`，候选卡名称/阶段必须可读；候选类目筛选用 `agentCombinationEntryModel.ts` 的派生函数，不在组件里硬编码业务分组；组合智能体头部不显示独立 SSS/分数角标，评分只保留在评分表内，一键打开阵容、保存阵容和重置阵容的真实逻辑仍由父组件传入；保存按钮必须位于“重置阵容”左侧。
- **改等级徽章规则**: 修改 `agentCombinationEntryModel.ts` 的 `getAgentRarity`，推荐卡默认前三个 SSR、其余 SR。
- **改批量打开按钮文案**: 修改 `RecommendedAgentsAction`，真实打开逻辑仍由父组件传入。

## 依赖图

```text
AgentCombinationEntrySections.tsx
← 引入: agentLaunchCatalog, agentCombinationEntryModel
→ 被引用: AgentCombinationEntryPage.tsx
```
