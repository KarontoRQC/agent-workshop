# AgentHeroHall.tsx

> `frontend/src/features/heroHall/AgentHeroHall.tsx` · TypeScript React · 约 625 行

## 用途

渲染 Agent Hero Hall cockpit 弹层，包含英雄池筛选、收藏/最近/自建 tab、推荐战队轮播、拖拽替换、打开智能体入口和阵容状态回写。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `AgentHeroHall` | component | ~121 | Hero Hall 主组件。 |

## 依赖

内部依赖:
- `lib/agentLaunchCatalog.ts` — 英雄池、头像和启动目标。
- `features/agents/agentUtils.ts` — 展示名和阶段。
- `HeroTeamCarousel.tsx` — 推荐战队轮播。
- `heroHallModel.ts` — 阵容状态和 key。
- `types.ts` — 推荐智能体类型。

外部依赖(仅列包名,不做解释):
- `react`
- `lucide-react`

## 修改指南

- **改拖拽替换**: 同时检查原生 drag 和 pointer drag，两套路径都要能触发替换。
- **改推荐数据来源**: 不要用静态占位覆盖 `agents` 传入的后端推荐字段。
- **改弹层定位**: 遵守 `frontend/AGENTS.md` 中主页背景不变、中心 cockpit 模块弹出的约束。

## 依赖图

```text
AgentHeroHall.tsx
← 引入: agentLaunchCatalog, agentUtils, HeroTeamCarousel, heroHallModel, types
→ 被引用: App.tsx
```

