# agentConsole/

> `frontend/src/features/agentConsole/` · 1 个 React 组件

## 职责

Agent Console 是 JARVIS 对话控制台，负责用户输入、语音/文本模式、响应展示、工具调用分隔、字幕和输入状态。

## 文件列表

| 文件 | 用途 | 关键导出 |
|------|------|----------|
| `AgentConsole.tsx` | 对话控制台 UI。 | `AgentConsole`, `InputMode` |

## 开发模式

- **改输入体验**: 保持 compact dock/左侧面板行为和 `frontend/AGENTS.md` 的 Hero Hall 约束一致。
- **改响应展示**: 检查 `workflowModel.ts` 输出的推荐和路径状态。
