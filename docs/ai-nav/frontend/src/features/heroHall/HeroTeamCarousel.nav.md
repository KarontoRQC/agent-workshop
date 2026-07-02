# HeroTeamCarousel.tsx

> `frontend/src/features/heroHall/HeroTeamCarousel.tsx` · TypeScript React · 约 218 行

## 用途

渲染推荐战队卡牌轮播，提供左右切换、当前聚焦卡、drop target 高亮、替换 pulse 和打开/替换按钮。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `HeroTeamCarouselAgent` | type | ~7 | 轮播所需 agent、富化信息、key 和 name。 |
| `HeroTeamCarousel` | component | ~95 | 推荐战队轮播组件。 |

## 依赖

内部依赖:
- `lib/agentLaunchCatalog.ts` — 富化 agent 类型。
- `types.ts` — 推荐智能体类型。
- `HeroTeamCarousel.css` — 轮播样式。

外部依赖(仅列包名,不做解释):
- `react`
- `lucide-react`

## 修改指南

- **改轮播卡样式/结构**: 保持该组件模块化，不要内联到 `AgentHeroHall.tsx`。
- **改拖拽事件**: 所有 drag/drop 回调由父组件传入，组件只负责目标索引和视觉状态。

## 依赖图

```text
HeroTeamCarousel.tsx
← 引入: agentLaunchCatalog, types, HeroTeamCarousel.css
→ 被引用: AgentHeroHall.tsx
```

