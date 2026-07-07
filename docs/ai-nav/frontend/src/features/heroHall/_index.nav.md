# heroHall/

> `AgentCombinationEntryPage.tsx` 已拆分为页面编排、展示组件、派生模型和 colocated CSS，负责可分享的推荐智能体组合入口。

> `frontend/src/features/heroHall/` · 9 个文件
> **功能文档**: `frontend/AGENTS.md`

## 职责

Hero Hall 模块负责推荐战队弹层、数据库英雄池、追加/拖拽推荐组合、阵容状态、推荐卡片轮播，以及 `agent_combination` 入口页上的组合智能体阵容编辑、右上保存和评分表。主页弹层必须保持为 cockpit HUD 弹出模块，不要变回全屏右侧页面；分享入口页可以作为独立殿堂页展示。

## 文件列表

| 文件 | 用途 | 关键导出 |
|------|------|----------|
| `AgentCombinationEntryPage.tsx` | 通过 `?agent_combination=1&id=<recommendation_id>` 请求推荐快照和数据库目录，编排组合入口页、本地阵容编辑、拖拽换位、右上保存按钮，并优先恢复 `saved_lineup`。 | `AgentCombinationEntryPage` |
| `AgentCombinationEntrySections.tsx` | 组合入口页的 hero、首席卡、场景区、组合智能体、评分表、可选智能体类目、智能体卡片网格、批量打开按钮和状态面板展示组件。 | `AgentCombinationHero`, `AgentLineupBuilder`, `AgentCardSection`, `SceneSection` |
| `agentCombinationEntryModel.ts` | 组合入口页精选场景、入口标题、快照状态文案、阵容 key、初始阵容、候选类目、等级和实时评分表派生逻辑。 | `createSceneCards`, `getEntryTitle`, `createAgentLineupCategories`, `calculateAgentLineupScore` |
| `AgentCombinationEntryPage.css` | 组合入口页整页殿堂背景、蓝金 cockpit HUD、右上保存按钮、组合阵容、评分表、可选智能体类目、卡片网格、等级徽章和响应式布局。 | CSS class |
| `AgentHeroHall.tsx` | Hero Hall 弹层、数据库英雄池过滤、点击追加、拖拽替换和打开目标。 | `AgentHeroHall` |
| `HeroTeamCarousel.tsx` | 推荐战队卡片轮播、真实推荐字段展示和 drop target 展示。 | `HeroTeamCarousel`, `HeroTeamCarouselAgent` |
| `heroTeamPresentation.ts` | 将流式推荐智能体字段映射为上方推荐卡片展示文案，避免静态模板覆盖接口返回。 | `getHeroTeamPresentation` |
| `heroHallModel.ts` | 阵容 ID、默认阵容、推荐归类和合并逻辑。 | `createHeroHallLineups`, `mergeHeroHallLineups` |
| `HeroTeamCarousel.css` | 推荐战队轮播和中心推荐卡内容样式。 | CSS class |
| `AgentHeroHall` 样式 | 当前主要仍在 `App.css` 中。 | `.hero-hall-*` |

## 开发模式

- **改推荐战队卡片**: 优先修改 `HeroTeamCarousel.tsx`、`heroTeamPresentation.ts` 和 `HeroTeamCarousel.css`，不要用静态模板覆盖真实推荐阶段和理由。
- **改英雄池/追加/拖拽替换**: 修改 `AgentHeroHall.tsx`，保持自定义 pointer drag 和 drop target glow；点击 `+` 通过 `POST /api/recommendations/<id>/agents` 追加，不替换原推荐。
- **改英雄池滚动/搜索**: 同步检查 `App.css` 中 `.hero-pool-topbar` 与 `.hero-pool-grid` 的层级和裁剪，避免滚动卡片遮挡搜索框点击。
- **改阵容推断**: 修改 `heroHallModel.ts`，同步后端 `LINEUP_ALIASES`。
- **改组合入口页**: 数据流、本地阵容交互和保存逻辑改 `AgentCombinationEntryPage.tsx`；DOM 结构改 `AgentCombinationEntrySections.tsx`；状态/标题/场景/评分派生改 `agentCombinationEntryModel.ts`；视觉改 `AgentCombinationEntryPage.css`。
- **改组合智能体阵容**: 保持推荐智能体真实字段不被静态模板覆盖；候选类目筛选、候选加入、拖拽入槽、槽内换位、保存阵容和实时评分表需一起验证；不合理组合应降低分数。
