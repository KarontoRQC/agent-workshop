# aiClient.ts

> `frontend/src/lib/aiClient.ts` · TypeScript · 约 273 行

## 用途

统一 AI 回复入口。优先使用后端流式 agent，失败时回退到本地 mock；也支持 `VITE_AI_CHAT_ENDPOINT` 的普通 JSON endpoint。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `AIReplyStreamHandlers` | type | ~8 | 流式文本、图谱动作和推荐智能体回调。 |
| `requestAIReply` | async function | ~86 | 根据环境选择流式后端、外部 endpoint 或本地 mock。 |

## 依赖

内部依赖:
- `agentStreamClient.ts` — 实际流式请求。
- `localMockAgent.ts` — demo fallback。
- `language.ts` — 判断 spoken fallback 语言。
- `types.ts` — 回复、动作和推荐智能体类型。

## 修改指南

- **改 fallback 策略**: 保持后端失败时可落到本地 mock，但不要吞掉可展示的 workflow error。
- **改图谱动作**: 检查 `extractGraphRoute` 和后端 `graph.path.resolved`。

## 依赖图

```text
aiClient.ts
← 引入: localMockAgent, agentStreamClient, language, types
→ 被引用: App.tsx
```

