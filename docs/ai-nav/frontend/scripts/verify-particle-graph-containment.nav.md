# verify-particle-graph-containment.mjs

> `frontend/scripts/verify-particle-graph-containment.mjs` · Node 静态契约验证

## 用途

验证中央知识路径图的旋转、缩放、相机和标签边界约束。脚本会拒绝所有图谱偏航与视差路径，并确认图谱激活期间中央菱形、粒子层和路径层的 X/Y/Z 三轴每帧保持正面零旋转。

## 修改指南

- 修改 `ParticleField.tsx` 的图谱旋转常量或状态机时同步更新本脚本。
- 不得以“小幅偏航”或放宽断言代替零旋转硬锁，图谱外轮廓必须在连续帧中保持方向不变。
- 运行方式：`node scripts/verify-particle-graph-containment.mjs`。
