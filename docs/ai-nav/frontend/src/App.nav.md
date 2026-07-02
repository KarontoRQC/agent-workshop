# App.tsx

> `frontend/src/App.tsx` · TypeScript React · 约 1628 行

## 用途

前端主应用。它协调粒子核心、开场动画、语音唤醒、TTS、SSE 工作流、知识路径、推荐智能体、Agent Console、Workflow Dock 和 Agent Hero Hall。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `App` | default component | 文件末尾 | 渲染 JARVIS 主页和各功能层。 |
| `HelmetTypewriterIntel` | component | ~1434 | 顶部 HUD 打字机情报模块。 |
| `JarvisHelmetHud` | component | ~1509 | 机甲头盔 HUD 外框和状态模块。 |

## 依赖

内部依赖:
- `components/ParticleField.tsx` — 3D 粒子核心。
- `features/workflow/workflowModel.ts` — 工作流状态、语音段和推荐智能体合并逻辑。
- `features/heroHall/heroHallModel.ts` — Hero Hall 阵容状态。
- `features/speech/speechOutput.ts` — TTS 请求、浏览器语音和 fallback 音。
- `lib/agentStreamClient.ts`、`lib/aiClient.ts` — 流式和 fallback AI 回复。

外部依赖(仅列包名,不做解释):
- `react`
- `lucide-react`

## 修改指南

- **改对话提交流程**: 先找 `submitMessage` 相关逻辑，再检查 `workflowModel.ts` 的事件处理函数。
- **改 Hero Hall 打开/关闭**: 同步检查 `AgentHeroHall.tsx` 和 `heroHallModel.ts`，不要改变主页背景布局。
- **改语音行为**: 同步检查 `useVoiceControl.ts`、`speechOutput.ts` 和 `useMicLevel.ts`。

## 依赖图

```text
App.tsx
← 引入: components, features, hooks, lib, types
→ 被引用: main.tsx
```
