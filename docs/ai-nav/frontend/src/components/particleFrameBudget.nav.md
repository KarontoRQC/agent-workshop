# particleFrameBudget.ts

> `frontend/src/components/particleFrameBudget.ts` · TypeScript · 粒子帧预算纯函数

## 职责

把粒子更新区间、角色等比例渐进索引、帧率无关插值、模拟切片、真实 FPS 质量调节和性能分档从 Three.js 组件中分离。高性能设备保留桌面 28,000、移动端 15,000 粒子；弱设备只降低实际绘制/模拟比例，不删除任何视觉角色。

## 关键导出

| 导出 | 用途 |
|---|---|
| `frameAdjustedLerp` | 按实际帧间隔换算插值强度，避免不同刷新率下动画速度变化。 |
| `isSoftwareWebGLRenderer` | 识别 SwiftShader、llvmpipe、系统基础软件光栅器。 |
| `getBaseSimulationSlices` | 根据视口和 CPU 并发能力选择基础模拟切片数。 |
| `adaptSimulationSlices` | 根据平均模拟耗时在 2-10 个切片间调整更新负载。 |
| `adaptRenderQualityScale` | 同时根据 CPU 工作量和真实帧间隔调节渲染质量。 |
| `adaptParticleDrawRatio` | 根据实际 FPS 调节 GPU 绘制粒子比例。 |
| `getInitialParticlePerformance` | 根据核心数、内存、DPR 和视口给出首屏性能档。 |
| `resolveParticlePerformanceTier` | 输出 `full/balanced/constrained` CSS 合成档。 |
| `buildProgressiveParticleIndices` | 构造保持各粒子角色比例的渐进索引缓冲。 |
| `scaleParticleRanges` | 同步收缩各角色连续 CPU 模拟区间。 |
| `buildParticleUpdateRanges` | 按粒子角色区间构造当前帧需要更新的连续分片。 |

## 修改指南

- 修改阈值后同时运行 `verify-performance-guardrails.mjs`、前端构建和真实浏览器粒子性能审计。
- 不要通过降低高性能档默认粒子数量、移除图谱节点或放宽图谱稳定断言换取测试数字。
- 调整插值或切片算法时检查 60 Hz 与低帧率下的动画时长一致性。

## 依赖关系

```text
particleFrameBudget.ts
→ 被引用: ParticleField.tsx
→ 被验证: verify-performance-guardrails.mjs, measure-particle-performance.mjs
```
