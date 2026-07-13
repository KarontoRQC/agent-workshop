# App.tsx

> `frontend/src/App.tsx` · TypeScript React · 约 1915 行

## 用途

前端主应用。它协调浏览器页面标题、粒子核心、开场动画、语音唤醒、TTS、SSE 工作流、知识路径、推荐智能体、Agent Console 和 Workflow Dock；每轮发送前从已完成消息构造有界近期对话，保持自然多轮承接但不让上下文无限增长。每轮工作流按知识路径讲解完成后再解锁推荐工具调用和推荐卡；推荐卡、推荐编号和最后一段语音播报全部收口后，才跳转英雄殿堂。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `App` | default component | 文件末尾 | 渲染 JARVIS 主页和各功能层。 |
| `HelmetTypewriterIntel` | component | ~1434 | 顶部 HUD 打字机情报模块。 |
| `JarvisHelmetHud` | component | ~1821 | 机甲头盔外框、准星和 CPU/GPU/AI 遥测模块。 |

## 依赖

内部依赖:
- `components/ParticleField.tsx` — 3D 粒子核心，通过 `React.lazy` 独立加载，避免 Three.js 阻塞首页主入口解析。
- `components/MechaCockpitFrame.tsx` — 首页机甲头盔硬件外壳和状态能量反馈。
- `features/workflow/workflowModel.ts` — 工作流状态、语音段和推荐智能体合并逻辑。
- `features/heroHall/heroHallModel.ts` — Hero Hall 阵容状态。
- `features/speech/speechOutput.ts` — TTS 请求、浏览器语音和 fallback 音。
- `lib/agentStreamClient.ts`、`lib/aiClient.ts` — 流式和 fallback AI 回复。
- `lib/participantIdentity.ts` — 从 URL 解析普通用户/厂长身份并随流式请求发送。

外部依赖(仅列包名,不做解释):
- `react`
- `lucide-react`

## 修改指南

- **改对话提交流程**: 先找 `submitMessage` 相关逻辑，再检查 `workflowModel.ts` 的事件处理函数。
- **改多轮上下文**: `submitMessage` 必须在插入本轮用户消息和 `Processing...` 前调用 `buildRecentDialogue(messages)`，再传给 `streamAgentChat`。
- **改智能体目录加载**: `fetchAgentCatalog` 后必须调用 `setAgentCatalogAgents` 并触发主页重渲染，确保已经显示的 Workflow Dock 推荐卡能重新富化头像，而不是停留在星星兜底。
- **改英雄殿堂入口**: 主页不再渲染旧 `AgentHeroHall` 弹层；业务规划发送手势通过 `heroHallLaunchIntent.ts` 预授权真实同域 pending 页。`schedulePendingHeroHallJump` 必须同时检查推荐卡表面已解锁和 `heroHallSpeechSettled`，最后一段播报通过 `onSettled` 收口后才替换为对应 `agent_combination` 入口。普通问候不能开页，不能覆盖原首页。
- **改浏览器标题**: `App` 根据当前 URL 切换 `document.title`，首页显示“中隐会 - 星系图谱”，`agent_combination` 英雄殿堂入口页显示“中隐会 - 英雄殿堂”。
- **改首页机甲外壳**: 通过 `MechaCockpitFrame.tsx` 和 colocated CSS 调整实体装甲，`JarvisHelmetHud` 继续只负责遥测、准星和状态数据。
- **改粒子入口加载**: `ParticleField` 必须保持 `React.lazy` + `Suspense` 独立分包；fallback 只占据粒子场布局，不重复渲染 WebGL 或可见说明文字。
- **顶部/底部状态条已删除**: 禁止恢复顶部 `JARVIS HELM / READY / CORE / TEXT` 总控条和底部“动力核心 / 战术目镜”状态条；相关 JSX 与 CSS 必须保持不存在，机甲硬件框、准星和 CPU/GPU/AI 遥测继续保留。
- **改语音行为**: 首页默认 `inputMode` 为 `voice`，课堂演示使用单轮收音：点击后立即听、讲完快速提交、提交后自动待命且回答后不复听。调整时同步检查 `AgentConsole.tsx`、`useVoiceControl.ts`、`speechOutput.ts` 和 `useMicLevel.ts`。
- **改语音状态文案**: 使用 `features/agentConsole/voiceInteractionModel.ts` 根据真实 `listening`、连接中和单轮已结束状态生成文案；未监听时必须提示再次点击麦克风，禁止显示可直接讲话的“待命”。
- **改暂停行为**: 打字模式暂停必须同时 abort 当前请求、取消 TTS/浏览器朗读、解开语音编排等待并结束 streaming UI。
- **改连续发送**: 模型流完成后允许新消息抢占上一轮残余 TTS/动画；新轮开始时先隐藏旧路径/推荐并清空旧推荐编号。发送资格使用同步 `agentCanSubmitRef` 门闩，暂停立即解锁；旧轮收尾不得解锁、重置或再次触发新轮英雄殿堂跳转。
- **改展示顺序**: 推荐 snapshot、lineup fallback、stream completion 都只能写入累计数据，不能直接显示推荐工具调用或右侧卡片；唯一解锁入口是知识路径讲解之后的 `showRecommendationSurface`。
- **改跨轮面板**: 新轮发送和语音开关不得清空 `routeDockVisible`、`recommendationDockVisible`、`lastAction` 或 `currentRecommendationId`；路径在 `activatePathAnimation` 提交新 action 时替换，推荐在 `showRecommendationSurface` 同时提交 pinned agents 与 recommendation id 时替换。
- **改厂长入口**: 使用 `?identity=changzhang`，保持页面 UI 不分叉；未知值必须降级为普通用户，且 URL 参数不得参与权限控制。

## 依赖图

```text
App.tsx
← 引入: components, features, hooks, lib, types
→ 被引用: main.tsx
```
