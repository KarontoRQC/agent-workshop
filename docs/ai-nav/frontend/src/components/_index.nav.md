# components/

> `frontend/src/components/` · 6 个 React 组件文件 + 1 个粒子预算模块 + 1 个组件样式文件
> **功能文档**: `frontend/AGENTS.md`

## 职责

组件目录提供跨 feature 使用的视觉组件：Three.js 粒子场、开场星旅、粒子字标、推荐智能体抽卡浮层和旧对话面板。

## 文件列表

| 文件 | 用途 | 关键导出 |
|------|------|----------|
| `MechaCockpitFrame.tsx` | 首页机甲头盔硬件外壳，包含顶部脊梁、左右承力柱、铰链、下颌和状态能量接缝。 | `MechaCockpitFrame` |
| `MechaCockpitFrame.css` | 机甲外壳材质、状态颜色、桌面/移动端响应式和低动态规则。 | CSS class |
| `ParticleField.tsx` | 3D 粒子核心、星际巡航、知识路径星图，以及真实 FPS 驱动的 draw range/像素比/CSS 性能分档。 | 默认 `ParticleField` |
| `particleFrameBudget.ts` | 粒子角色分片、渐进索引、CPU 范围缩放、帧率无关插值和真实 FPS 自适应预算。 | `buildProgressiveParticleIndices`、`scaleParticleRanges`、`adaptParticleDrawRatio` |
| `ZhongyinIntro.tsx` | 中隐会图谱星球开场动画，品牌字样在首次绘制即显示。 | `ZhongyinIntro` |
| `ParticleWordmark.tsx` | 粒子字标视觉。 | 默认 `ParticleWordmark` |
| `AgentDrawOverlay.tsx` | 推荐智能体抽卡/开奖浮层。 | 默认 `AgentDrawOverlay` |
| `AgentDialoguePanel.tsx` | 旧式对话面板组件。 | 默认 `AgentDialoguePanel` |

## 开发模式

- **改 3D 粒子**: 优先读 `ParticleField.nav.md`，并在浏览器验证 canvas 非空、图谱不被旋转压扁和性能。
- **改首页机甲外壳**: 优先读 `MechaCockpitFrame.nav.md`，保持装甲贴边且不覆盖中央图谱、HUD 数据和输入控件。
- **改分帧/质量策略**: 维护 `particleFrameBudget.ts` 的纯函数边界，并同步 `verify-performance-guardrails.mjs`。
- **改可复用展示组件**: 保持 props 类型在组件文件附近，不要引入全局状态。
