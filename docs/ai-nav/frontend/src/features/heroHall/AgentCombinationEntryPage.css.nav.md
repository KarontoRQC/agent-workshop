# AgentCombinationEntryPage.css

> `frontend/src/features/heroHall/AgentCombinationEntryPage.css` · CSS · 约 1634 行

## 用途

定义组合入口页的蓝金 cockpit HUD 视觉：整页殿堂背景、顶部殿堂舞台、首席智能体展柜、精选场景、推荐/目录卡片网格、组合智能体阵容、阵容操作区保存按钮、评分表、可选智能体类目筛选、拖拽浮影、等级徽章、状态面板和响应式布局。

## 关键区域

| 区域 | 作用 |
|------|------|
| `.agent-combination-entry-page` | 入口页固定外壳和页面级背景。 |
| `.agent-combination-entry-frame` | 实际滚动窗口，负责把内容裁切在殿堂背景框内。 |
| `.agent-combination-entry-hero` | 顶部英雄殿堂舞台。 |
| `.agent-combination-hero-kicker-row` | 对齐皇冠标签和全局分享入口。 |
| `.agent-combination-crown-card` | 首席推荐智能体展柜卡。 |
| `.agent-combination-scenes` | 精选场景横向列表。 |
| `.agent-combination-lineup-builder` | 推荐模块下方的组合智能体阵容编辑区。 |
| `.agent-combination-lineup-save` | 位于“重置阵容”左侧的保存阵容按钮。 |
| `.agent-combination-lineup-save-feedback` | 组合阵容操作区内的保存成功/失败反馈。 |
| `.agent-combination-lineup-slot` | 五人阵容槽位、空槽、drop target 和槽内卡片状态。 |
| `.agent-combination-score-panel` | 组合评分表和指标条。 |
| `.agent-combination-candidate-categories` | 可选智能体类目横向筛选条。 |
| `.agent-combination-category-chip` | 类目筛选按钮、数量徽标和选中态。 |
| `.agent-combination-candidate-card` | 可选智能体横向候选卡，保留头像、完整名称、阶段和入阵状态。 |
| `.agent-combination-drag-ghost` | 自定义 pointer drag 浮影。 |
| `.agent-combination-agent-card` | 推荐智能体和更多智能体卡片。 |
| `.agent-combination-rarity` | SSR/SR 等级徽章。 |

## 依赖

内部依赖:
- `AgentCombinationEntryPage.tsx` — 导入该样式。
- `frontend/assets/hero-hall-bg.webp` — 顶部与整页殿堂背景图。

## 修改指南

- **改顶部留白/紧实度**: 优先调整 `.agent-combination-entry-hero` 的 `min-height` 与 `padding`。
- **改头部背景**: 头部 `.agent-combination-entry-hero` 只做透明 HUD 光效叠层，不单独再铺 `hero-hall-bg.webp`，避免和整页固定背景错位形成硬边。
- **改外层背景**: 继续使用 `hero-hall-bg.webp` 作为整页殿堂基底，不要重新引入 `space-cruise-bg` 到组合入口页外层，避免侧边斜向星轨线回流。
- **改滚动裁切**: 保持 `.agent-combination-entry-page` 为 `overflow: hidden`，实际滚动放在 `.agent-combination-entry-frame`，确保内容向上滑动时在背景框内消失。
- **改保存按钮视觉**: 调整 `.agent-combination-lineup-save` 和 `.agent-combination-lineup-save-feedback`，保存按钮必须在 `.agent-combination-lineup-actions` 中位于“重置阵容”左侧。
- **改组合阵容视觉**: 同步检查 `.agent-combination-lineup-builder`、`.agent-combination-lineup-slot`、`.agent-combination-lineup-open`、`.agent-combination-lineup-save`、`.agent-combination-lineup-reset`、`.agent-combination-score-panel`、`.agent-combination-candidate-categories` 和 `.agent-combination-candidate-card`；组合智能体头部不保留独立评分角标。
- **改移动端**: 同步检查 `@media (max-width: 720px)`，确保无横向溢出。
