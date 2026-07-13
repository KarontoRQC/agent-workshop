# recentDialogue.ts

> `frontend/src/features/workflow/recentDialogue.ts` · TypeScript

## 用途

从页面已完成消息生成 `recent_dialogue`：跳过首次占位 AI 文案和 `Processing...`，只保留最新 10 条，每条最多 600 字、总计最多 3,200 字。首轮返回空数组，仍由客户端声明 `bounded_recent` 模式。

## 导出

| 名称 | 类型 | 作用 |
|------|------|------|
| `buildRecentDialogue` | function | 将 `Message[]` 转成受限 user/assistant 对话窗口。 |
| `RECENT_DIALOGUE_HISTORY_MODE` | const | 请求字段值 `bounded_recent`。 |

## 修改指南

- 只能读取当前消息之前已经完成的页面消息，不能包含本轮尚未发送文本。
- 限额必须与后端 `services/recent_dialogue.py` 和接口文档同步。
