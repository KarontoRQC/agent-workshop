# heroHall/

> 新增 `AgentCombinationEntryPage.tsx`：负责可分享的推荐智能体组合入口。

> `frontend/src/features/heroHall/` · 6 个文件
> **功能文档**: `frontend/AGENTS.md`

## 职责

Hero Hall 模块负责推荐战队弹层、数据库英雄池、追加/拖拽推荐组合、阵容状态和推荐卡片轮播。该模块必须保持为主页 cockpit HUD 弹出模块，不要变回全屏右侧页面。

## 文件列表

| 文件 | 用途 | 关键导出 |
|------|------|----------|
| `AgentCombinationEntryPage.tsx` | 通过 `?agent_combination=1&id=<recommendation_id>` 请求推荐快照和数据库目录，并以深色 cockpit HUD 场景卡/智能体卡渲染可分享组合入口。 | `AgentCombinationEntryPage` |
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
