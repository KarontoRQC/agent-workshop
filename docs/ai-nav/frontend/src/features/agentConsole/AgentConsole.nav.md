# AgentConsole.tsx

> `frontend/src/features/agentConsole/AgentConsole.tsx` · TypeScript React · 约 372 行

## 用途

渲染 JARVIS Agent Console，对话历史、输入框、语音/文本模式、streaming 状态、工具调用分隔和底部字幕。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `InputMode` | type | ~31 | 文本或语音输入模式。 |
| `AgentConsole` | component | ~52 | 主控制台组件。 |

## 依赖

内部依赖:
- `types.ts` — 使用 `AgentStatus` 和 `AgentTurn`。
- `workflowModel.ts` — 使用推荐、路径和字幕辅助函数。
- `heroHallModel.ts` — 展示阵容标签。

外部依赖(仅列包名,不做解释):
- `react`
- `lucide-react`

## 修改指南

- **改消息渲染**: 保持 thinking/agent subtitle 和 tool call divider 的状态来源来自 `AgentTurn`。
- **改 Hero Hall 布局态**: 不要在这里重排主页 HUD，只通过 props 表示当前状态。

## 依赖图

```text
AgentConsole.tsx
← 引入: types, workflowModel, heroHallModel
→ 被引用: App.tsx
```
