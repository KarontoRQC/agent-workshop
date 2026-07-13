# verify-motion-tempo.mjs

> `frontend/scripts/verify-motion-tempo.mjs` · JavaScript · 动画节奏回归脚本

## 用途

锁定工作流虹光、思考点、语音波形、机甲能量缝和 Hero Hall 等待环的低频动画时长，防止样式覆盖重新引入每秒级高反差闪烁。

## 修改指南

- 调整视觉节奏时同步修改实际 CSS 与本脚本，至少保证虹光扫描不短于 30 秒、等待环不短于 5 秒，并锁定低动态模式的单次迭代。
- 本脚本只验证节奏契约，仍需用真实浏览器检查主观观感和低动态模式。

## 运行

```bash
cd frontend && node scripts/verify-motion-tempo.mjs
```
