# localMockAgent.ts

> `frontend/src/lib/localMockAgent.ts` · TypeScript · 约 245 行

## 用途

提供本地 demo fallback：根据输入识别问候、能力说明、推荐需求和路径意图，返回文本、spokenText、图谱动作和模拟推荐智能体。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `requestLocalMockAgentReply` | async function | ~164 | 返回本地模拟 `ChatResponse` 片段。 |

## 依赖

内部依赖:
- `language.ts` — 判断中英文。
- `types.ts` — 使用 `Message`、`AgentAction`、`RecommendedAgent`。

## 修改指南

- **新增本地意图**: 扩展 matcher 时保持输出动作结构与真实后端一致。
- **改模拟推荐**: 保持字段覆盖 `agent_name`、`stage`、`reason` 和 `rank`。

## 依赖图

```text
localMockAgent.ts
← 引入: language, types
→ 被引用: aiClient.ts
```

