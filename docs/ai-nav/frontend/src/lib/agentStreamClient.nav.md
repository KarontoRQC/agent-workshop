# agentStreamClient.ts

> `frontend/src/lib/agentStreamClient.ts` · TypeScript · 约 259 行

## 用途

前端流式 API 客户端。它集中解析运行时 API base URL，生产默认使用同源 `/api`，并把有界 `recent_dialogue` 与 `history_mode=bounded_recent` 写入聊天请求。随后读取 `ReadableStream`，按 SSE event 派发给回调。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `AgentStreamEvent` | type | ~5 | 后端 SSE 事件的前端宽类型。 |
| `resolveApiBaseUrl` | function | ~66 | 根据 Vite 环境和 dev/prod 返回 API base URL。 |
| `API_BASE_URL` | const | ~78 | 当前前端请求 base URL。 |
| `COZE_CHAT_STREAM_URL` | const | ~79 | 完整流式聊天 URL。 |
| `isAgentStreamEnabled` | function | ~81 | 读取 `VITE_ENABLE_AGENT_STREAM`。 |
| `streamAgentChat` | async function | ~87 | 发送消息并分发 SSE 回调。 |

## 依赖

内部依赖:
- `frontend/src/types.ts` — 使用推荐智能体和用户状态类型。
- `frontend/src/features/workflow/recentDialogue.ts` — 提供 bounded 历史模式常量。
- `frontend/src/lib/participantIdentity.ts` — 使用规范化后的参与者身份类型。

## 修改指南

- **新增 SSE 事件**: 在 `StreamAgentHandlers` 和 `emitSseFrame` 增加回调。
- **改远端域名**: 生产默认应保持同源 `/api`，开发代理域名同步检查 `frontend/.env`、`frontend/vite.config.ts` 和运行说明；HTTPS 页面不能构建出 `http://` API 地址。
- **改结束信号**: 保持 `workflow.completed` 和 `chat.completed` 都能触发 `onCompleted`。
- **改请求 body**: 同步后端 `routes/coze.py` 参数归一化。
- **改多轮上下文**: 只要 `recentDialogue` 参数存在（包括首轮空数组），就必须同时发送 `history_mode=bounded_recent`。
- **改参与者人格**: `participant_identity` 只能发送 `guest` 或 `changzhang`，后端仍必须再次白名单校验。

## 依赖图

```text
agentStreamClient.ts
← 引入: participantIdentity.ts, types.ts
→ 被引用: App.tsx, aiClient.ts, speechOutput.ts, workflowModel.ts, heroHallModel.ts
```
