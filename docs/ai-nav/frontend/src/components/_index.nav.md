# components/

> `frontend/src/components/` · 5 个 React 组件文件
> **功能文档**: `frontend/AGENTS.md`

## 职责

组件目录提供跨 feature 使用的视觉组件：Three.js 粒子场、开场星旅、粒子字标、推荐智能体抽卡浮层和旧对话面板。

## 文件列表

| 文件 | 用途 | 关键导出 |
|------|------|----------|
| `ParticleField.tsx` | 3D 粒子核心和星际巡航视觉。 | 默认 `ParticleField` |
| `ZhongyinIntro.tsx` | 中隐会图谱星球开场动画。 | `ZhongyinIntro` |
| `ParticleWordmark.tsx` | 粒子字标视觉。 | 默认 `ParticleWordmark` |
| `AgentDrawOverlay.tsx` | 推荐智能体抽卡/开奖浮层。 | 默认 `AgentDrawOverlay` |
| `AgentDialoguePanel.tsx` | 旧式对话面板组件。 | 默认 `AgentDialoguePanel` |

## 开发模式

- **改 3D 粒子**: 优先读 `ParticleField.nav.md`，并在浏览器验证 canvas 非空和性能。
- **改可复用展示组件**: 保持 props 类型在组件文件附近，不要引入全局状态。

