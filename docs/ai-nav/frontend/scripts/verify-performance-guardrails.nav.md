# verify-performance-guardrails.mjs

> `frontend/scripts/verify-performance-guardrails.mjs` · JavaScript · 约 113 行

## 用途

验证粒子帧预算纯函数和 `ParticleField` 性能守卫，包括角色分片、渐进索引比例、GPU draw range、CPU 范围同步、真实 FPS 自适应、CSS constrained 档、局部 buffer 更新、像素比和隐藏页面节流。

## 修改指南

- 改 `particleFrameBudget.ts` 或 `ParticleField.tsx` 后必须运行本脚本。
- 禁止通过减少默认粒子数量或删除图谱效果让守卫通过。
