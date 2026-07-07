# App.tsx

> `frontend/src/App.tsx` · TypeScript React · 约 1628 行

## 用途

前端主应用。它协调浏览器页面标题、粒子核心、开场动画、语音唤醒、TTS、SSE 工作流、知识路径、推荐智能体、Agent Console 和 Workflow Dock；首页 Agent Console 当前默认语音输入模式，并保留打字切换。推荐英雄殿堂通过独立组合入口页打开，并在推荐回复与语音/卡片揭示收尾后自动打开新页面。

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
- **改智能体目录加载**: `fetchAgentCatalog` 后必须调用 `setAgentCatalogAgents` 并触发主页重渲染，确保已经显示的 Workflow Dock 推荐卡能重新富化头像，而不是停留在星星兜底。
- **改英雄殿堂入口**: 主页不再渲染旧 `AgentHeroHall` 弹层；右下角 Workflow Dock 使用组合入口 URL 打开独立英雄殿堂页，`submitMessage` 完成推荐回复、拿到 `recommendation_id` 且确认有推荐智能体后，会在新页面打开对应 `agent_combination` 入口，不能覆盖原首页。
- **改浏览器标题**: `App` 根据当前 URL 切换 `document.title`，首页显示“中隐会 - 星系图谱”，`agent_combination` 英雄殿堂入口页显示“中隐会 - 英雄殿堂”。
- **改语音行为**: 当前首页默认 `inputMode` 为 `voice`，Agent Console 同时保留语音模块和打字入口；调整时同步检查 `AgentConsole.tsx`、`useVoiceControl.ts`、`speechOutput.ts` 和 `useMicLevel.ts`。

## 依赖图

```text
App.tsx
← 引入: components, features, hooks, lib, types
→ 被引用: main.tsx
```
