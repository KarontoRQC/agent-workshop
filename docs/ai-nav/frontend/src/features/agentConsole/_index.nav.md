# agentConsole/

> `frontend/src/features/agentConsole/` · 1 个 React 组件 + 1 个语音状态模型

## 职责

Agent Console 是 JARVIS 对话控制台，负责用户输入、单轮语音/打字模式、响应展示、工具调用分隔、字幕和输入状态。当前首页默认进入语音模式；打字模式在回答或播报进行时使用暂停按钮取代发送按钮。

## 文件列表

| 文件 | 用途 | 关键导出 |
|------|------|----------|
| `AgentConsole.tsx` | 对话控制台 UI；渲染单轮语音模块、打字切换以及发送/暂停 composer。 | `AgentConsole`, `InputMode` |
| `voiceInteractionModel.ts` | 将真实麦克风监听、连接和单轮结束状态映射为可信的中英文 UI 文案。 | `resolveVoiceInteractionPhase`, `getVoiceInteractionCopy` |

## 开发模式

- **改输入体验**: 保持 compact dock/左侧面板行为和 `frontend/AGENTS.md` 的 Hero Hall 约束一致；暂停必须是可交互按钮，不是单纯状态图标。
- **改语音体验**: 同步检查 `App.tsx` 默认输入模式、`useVoiceControl.ts` 和 `speechOutput.ts`。
- **改语音状态语义**: 修改 `voiceInteractionModel.ts` 的纯状态映射，并运行 `verify-classroom-interaction.mjs` 与浏览器普通/异常识别生命周期验证。
- **改响应展示**: 检查 `workflowModel.ts` 输出的推荐和路径状态。
