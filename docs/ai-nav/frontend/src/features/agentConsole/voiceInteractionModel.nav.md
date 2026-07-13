# voiceInteractionModel.ts

> `frontend/src/features/agentConsole/voiceInteractionModel.ts` · TypeScript · 约 110 行

## 用途

集中维护单轮语音模块的可信状态语义。它以真实的 `supported`、`status`、`listening` 和 `awake` 为输入，区分不可用、处理中、正在监听、连接中和需要再次点击五种状态，并生成中英文活动文案、徽标、模块提示与中央字幕。

## 导出

| 名称 | 类型 | 作用 |
|------|------|------|
| `VoiceInteractionPhase` | type | 单轮语音 UI 的五种可信阶段。 |
| `VoiceInteractionLanguage` | type | 语音文案支持的中英文语言。 |
| `resolveVoiceInteractionPhase` | function | 以真实监听状态优先解析 UI 阶段。 |
| `getVoiceInteractionCopy` | function | 返回对应阶段的活动文案、徽标、提示和字幕。 |

## 修改指南

- 只有 `listening=true` 能返回 `listening`；`awake=true` 但尚未监听时必须返回 `connecting`。
- 单轮结束且未监听时返回 `tap-to-talk`，不得用 `standby` 或 `linked` 暗示无需点击即可讲话。

## 依赖图

```text
voiceInteractionModel.ts
← 引入: types.ts
→ 被引用: App.tsx, AgentConsole.tsx
```
