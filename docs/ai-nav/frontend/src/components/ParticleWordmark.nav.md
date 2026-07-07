# ParticleWordmark.tsx

> `frontend/src/components/ParticleWordmark.tsx` · TypeScript React · 约 101 行

## 用途

渲染粒子字标和 ambient dots，用于视觉品牌感或状态展示。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `ParticleWordmark` | default component | 文件内 | 输出粒子字标 DOM。 |

## 依赖

内部依赖:
- `frontend/src/types.ts` — 使用 `DialogueMode`。

外部依赖(仅列包名,不做解释):
- `react`

## 修改指南

- **改点阵数量**: 检查 `ambientDots` 和 CSS 性能，避免过多 DOM 动画。

## 依赖图

```text
ParticleWordmark.tsx
← 引入: types.ts
```
