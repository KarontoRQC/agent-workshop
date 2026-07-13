# AgentConsole.tsx

> `frontend/src/features/agentConsole/AgentConsole.tsx` · TypeScript React · 约 403 行

## 用途

渲染 JARVIS Agent Console，对话历史、语音/打字模式切换、机甲语音模块、文本输入框、发送/暂停按钮、streaming 状态、工具调用分隔和底部字幕。语音模块通过 `voiceInteractionModel.ts` 区分真实监听、连接、处理中和需要再次点击的状态；打字模式在回答或播报活跃时用暂停图标取代发送图标。

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
- **改分段顺序测试**: 知识 ACK、知识讲解、推荐 ACK 和推荐总结字幕保留稳定 `data-segment`，当前播报状态由 `data-speaking` 标记，课堂 E2E 依此验证知识讲解期间推荐尚未出现。
- **改输入入口**: 语音/打字切换、机甲语音模块和文本 composer 同在此组件内维护；暂停按钮通过 `canPauseResponse` 和 `onPause` 与 `App.tsx` 的取消逻辑对接。
- **改语音提示**: 不要直接根据 `voiceAwake` 推断正在监听；统一使用 `resolveVoiceInteractionPhase` 和 `getVoiceInteractionCopy`，只有 `voiceListening=true` 才显示 LISTENING。
- **改发送优先级**: 上一轮仍在播报但用户已经输入新内容时，发送按钮必须优先于暂停按钮，让新消息中止残余播报并立即提交。
- **改 Hero Hall 布局态**: 不要在这里重排主页 HUD，只通过 props 表示当前状态。

## 依赖图

```text
AgentConsole.tsx
← 引入: types, workflowModel, heroHallModel
→ 被引用: App.tsx
```
