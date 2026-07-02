# coze.py

> `backend/routes/coze.py` · Python · 约 240 行

## 用途

定义 Coze/LongCat 流式聊天接口，接收前端消息、会话 ID、用户状态和阵容上下文，并返回 `text/event-stream`。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `coze_bp` | Blueprint | ~15 | 注册 `/api/coze` 下的接口。 |
| `stream_chat` | function | ~21 | 处理 `POST /chat/stream` 并启动工作流流。 |

## 依赖

内部依赖:
- `backend/services/coze_client.py` — 提供上游对话客户端和异常类型。
- `backend/services/coze_workflow.py` — 编排两阶段或统一工作流。
- `backend/services/coze_stream_transformer.py` — 格式化 SSE 事件。

外部依赖(仅列包名,不做解释):
- `flask`

## 修改指南

- **新增前端传参**: 新增 `_get_*` 归一化函数或扩展已有函数，再传给 `start_chat_workflow_stream`。
- **改本地配置回退**: 修改 `_local_configuration_fallback_stream` 时保持 `workflow.started`、`chat.completed`、`workflow.completed` 事件完整。
- **改结束逻辑**: 不要让路由层提前消费或终止 service generator。

## 依赖图

```text
coze.py
← 引入: services.coze_client, services.coze_workflow, services.coze_stream_transformer
→ 被引用: app.py 注册为 /api/coze
```
