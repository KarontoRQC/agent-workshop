# heroTeamPresentation.ts

> `frontend/src/features/heroHall/heroTeamPresentation.ts` · TypeScript · 约 58 行

## 用途

把流式推荐智能体字段整理成上方推荐卡片使用的展示文案。它避免用静态占位内容覆盖后端真实返回的名称、阶段、理由和 rank。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `getHeroTeamPresentation` | function | ~26 | 生成推荐卡片展示用的 `title`、`subtitle`、`body` 和 rank label。 |

## 依赖

内部依赖:
- `frontend/src/types.ts` — 使用推荐智能体字段约定。

## 修改指南

- **改卡片文字优先级**: 保持 `agent_name/name`、`stage`、`reason` 来自接口优先，不要退回硬编码模板。
- **改阵容文案**: 同步 `heroHallModel.ts` 和后端 `LINEUP_ALIASES`。

## 依赖图

```text
heroTeamPresentation.ts
→ 被引用: HeroTeamCarousel.tsx
```
