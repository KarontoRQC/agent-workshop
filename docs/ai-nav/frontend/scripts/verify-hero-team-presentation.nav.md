# verify-hero-team-presentation.mjs

> `frontend/scripts/verify-hero-team-presentation.mjs` · JavaScript · ~65 行

## 用途

转译并动态导入 `heroTeamPresentation.ts`，验证推荐战队卡片展示优先使用流式推荐字段，且 streaming 状态显示生成中占位。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `sourcePath` | const | ~5 | 指向被验证的推荐展示模型。 |
| `output` | const | ~7 | TypeScript 转译结果。 |
| `getHeroTeamPresentation` | import | ~15 | 被动态导入的展示字段生成函数。 |
| `completedPresentation` | const | ~17 | 完成态推荐卡片展示样例。 |
| `streamingPresentation` | const | ~42 | 流式生成态推荐卡片展示样例。 |

## 依赖

内部依赖:
- `frontend/src/features/heroHall/heroTeamPresentation.ts` — 被验证的推荐展示模型。

外部依赖(仅列包名):
- `node:assert/strict`
- `node:fs`
- `node:path`
- `typescript`

## 修改指南

- **修改推荐卡片字段优先级**: 同步更新 completed 和 streaming 两组断言。
- **修改 lineup 或 rank 文案**: 同步更新 `lineupLabel`、`rankLabel` 或 `metricLabel` 断言。

## 依赖图

```text
verify-hero-team-presentation.mjs
← 引入: heroTeamPresentation.ts
→ 被引用: 手动 Node 验证
```
