# measure-particle-performance.mjs

> `frontend/scripts/measure-particle-performance.mjs` · JavaScript · 约 132 行

## 用途

使用 Playwright 和 CDP CPU 限速，分别测量桌面/移动、待机/图谱四种粒子场状态的 FPS、长任务、帧工作耗时、像素比、粒子 draw ratio、实际渲染数、WebGL 渲染器类别、性能档和根节点 CSS 合成档，并可输出 JSON 证据。

## 修改指南

- 修改粒子 telemetry 属性时同步更新本脚本和 `ParticleField.tsx`。
- 软件 WebGL/SwiftShader 结果只能作为保守压力信号，最终准入还要读取真实浏览器与讲师电脑结果。

## 依赖

- `playwright`
- `frontend/src/components/ParticleField.tsx`
