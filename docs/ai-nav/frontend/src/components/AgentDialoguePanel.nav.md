# AgentDialoguePanel.tsx

> `frontend/src/components/AgentDialoguePanel.tsx` · TypeScript React · 约 110 行

## 用途

旧式 agent 对话面板，负责展示消息、推荐智能体摘要、输入框和提交按钮。当前主线更多使用 `features/agentConsole/AgentConsole.tsx`。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `AgentDialoguePanel` | default component | 文件内 | 渲染对话面板。 |

## 依赖

内部依赖:
- `frontend/src/types.ts` — 使用 `Message`、`RecommendedAgent`、`ReplySource`。

外部依赖(仅列包名,不做解释):
- `react`
- `lucide-react`

## 修改指南

- **恢复旧面板**: 先确认 `App.tsx` 当前是否仍引用；避免和 `AgentConsole` 双重显示。

## 依赖图

```text
AgentDialoguePanel.tsx
← 引入: types.ts
```

