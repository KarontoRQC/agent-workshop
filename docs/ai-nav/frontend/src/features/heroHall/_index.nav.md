# heroHall/

> `frontend/src/features/heroHall/` · 5 个文件
> **功能文档**: `frontend/AGENTS.md`

## 职责

Hero Hall 模块负责推荐战队弹层、英雄池、拖拽替换、阵容状态和推荐卡牌轮播。该模块必须保持为主页 cockpit HUD 弹出模块，不要变回全屏右侧页面。

## 文件列表

| 文件 | 用途 | 关键导出 |
|------|------|----------|
| `AgentHeroHall.tsx` | Hero Hall 弹层、英雄池过滤、拖拽替换和打开目标。 | `AgentHeroHall` |
| `HeroTeamCarousel.tsx` | 推荐战队卡牌轮播和 drop target 展示。 | `HeroTeamCarousel`, `HeroTeamCarouselAgent` |
| `heroHallModel.ts` | 阵容 ID、默认阵容、推荐归类和合并逻辑。 | `createHeroHallLineups`, `mergeHeroHallLineups` |
| `HeroTeamCarousel.css` | 推荐战队轮播样式。 | CSS class |
| `AgentHeroHall` 样式 | 当前主要仍在 `App.css` 中。 | `.hero-hall-*` |

## 开发模式

- **改推荐战队卡牌**: 优先修改 `HeroTeamCarousel.tsx` 和 `HeroTeamCarousel.css`。
- **改英雄池/拖拽替换**: 修改 `AgentHeroHall.tsx`，保持自定义 pointer drag 和 drop target glow。
- **改阵容推断**: 修改 `heroHallModel.ts`，同步后端 `LINEUP_ALIASES`。

