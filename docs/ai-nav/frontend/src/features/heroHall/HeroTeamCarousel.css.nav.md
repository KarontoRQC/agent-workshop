# HeroTeamCarousel.css

> `frontend/src/features/heroHall/HeroTeamCarousel.css` · CSS · 约 786 行

## 用途

定义推荐战队轮播的卡片、玻璃层、舞台、按钮、中心卡推荐内容层级、drop target、替换 pulse 和响应式样式。

## 关键区域

| 区域 | 作用 |
|------|------|
| `.hero-team-carousel` | 轮播舞台和轨道。 |
| `.hero-team-card` | 推荐战队卡牌形态。 |
| `.hero-team-copy` | 中心推荐卡的名称、序位、阶段和理由内容层级。 |
| `.is-drop-target` | 拖拽替换目标高亮。 |
| `.is-replacing` | 替换后的反馈动画。 |

## 依赖

内部依赖:
- `HeroTeamCarousel.tsx` — 导入该样式。

## 修改指南

- **改卡牌尺寸**: 同步检查 `AgentHeroHall.tsx` 的容器空间和移动端布局。
- **改推荐内容展示**: 中心卡保留阶段和两行推荐理由，侧卡保持轻量陈列，避免挤压紧凑 HUD 槽。
- **改动画**: 避免引入大面积无限 blur/shimmer，遵守 Hero Hall 性能预算。
