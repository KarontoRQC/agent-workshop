# agentConsole/

> `frontend/src/features/agentConsole/` · 1 个 React 组件

## 职责

Agent Console 是 JARVIS 对话控制台，负责用户输入、语音/打字模式、响应展示、工具调用分隔、字幕和输入状态。当前首页默认进入语音模式，用户也可以切换到打字输入。

## 文件列表

| 文件 | 用途 | 关键导出 |
|------|------|----------|
| `AgentConsole.tsx` | 对话控制台 UI；渲染语音模块、打字切换和文本 composer。 | `AgentConsole`, `InputMode` |

## 开发模式

- **改输入体验**: 保持 compact dock/左侧面板行为和 `frontend/AGENTS.md` 的 Hero Hall 约束一致。
- **改语音体验**: 同步检查 `App.tsx` 默认输入模式、`useVoiceControl.ts` 和 `speechOutput.ts`。
- **改响应展示**: 检查 `workflowModel.ts` 输出的推荐和路径状态。
