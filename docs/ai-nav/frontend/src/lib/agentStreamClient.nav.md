# agentStreamClient.ts

> `frontend/src/lib/agentStreamClient.ts` · TypeScript · 约 195 行

## 用途

前端流式 API 客户端。它解析运行时 API base URL，POST 到 `/coze/chat/stream`，读取 `ReadableStream`，按 SSE event 派发给回调。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `AgentStreamEvent` | type | ~5 | 后端 SSE 事件的前端宽类型。 |
| `resolveApiBaseUrl` | function | ~50 | 根据 Vite 环境和 dev/prod 返回 API base URL。 |
| `API_BASE_URL` | const | ~62 | 当前前端请求 base URL。 |
| `COZE_CHAT_STREAM_URL` | const | ~63 | 完整流式聊天 URL。 |
| `isAgentStreamEnabled` | function | ~65 | 读取 `VITE_ENABLE_AGENT_STREAM`。 |
| `streamAgentChat` | async function | ~71 | 发送消息并分发 SSE 回调。 |

## 依赖

内部依赖:
- `frontend/src/types.ts` — 使用推荐智能体和用户状态类型。

## 修改指南

- **新增 SSE 事件**: 在 `StreamAgentHandlers` 和 `emitSseFrame` 增加回调。
- **改结束信号**: 保持 `workflow.completed` 和 `chat.completed` 都能触发 `onCompleted`。
- **改请求 body**: 同步后端 `routes/coze.py` 参数归一化。

## 依赖图

```text
agentStreamClient.ts
← 引入: types.ts
→ 被引用: App.tsx, aiClient.ts, speechOutput.ts, workflowModel.ts, heroHallModel.ts
```
