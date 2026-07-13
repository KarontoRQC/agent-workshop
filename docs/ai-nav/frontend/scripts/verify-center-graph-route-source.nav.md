# verify-center-graph-route-source.mjs

> `frontend/scripts/verify-center-graph-route-source.mjs` · JavaScript · 约 27 行

## 用途

源码契约检查：中央粒子图谱只能消费知识路径，不得把推荐智能体名单作为图谱节点来源。

## 修改指南

- 改 `App.tsx` 的图谱 props 或路线状态时同步更新断言，但禁止放宽“推荐名单不得进入中央图谱”的约束。
