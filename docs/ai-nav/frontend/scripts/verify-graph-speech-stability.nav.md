# verify-graph-speech-stability.mjs

> `frontend/scripts/verify-graph-speech-stability.mjs` · JavaScript · 约 37 行

## 用途

验证语音播报能量只影响轻微发光，不会驱动知识路径节点缩放、粒子外扩、形状压扁或空间位移。

## 修改指南

- 修改语音能量与 Three.js 参数映射时同步运行本脚本和生产图谱漂移审计。
