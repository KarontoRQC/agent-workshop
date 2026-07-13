# coze.py

> `backend/routes/coze.py` · Python · 约 325 行

## 用途

定义 Coze/LongCat 流式聊天接口，规范会话 ID、`history_mode` 与 `recent_dialogue`，创建推荐快照并返回 `text/event-stream`；为每次请求生成追踪 ID，记录首事件、首内容和总耗时。

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
- `backend/services/participant_identity.py` — 将客户端身份白名单规范为 `guest` 或 `changzhang`。

外部依赖(仅列包名,不做解释):
- `flask`

## 修改指南

- **新增前端传参**: 新增 `_get_*` 归一化函数或扩展已有函数，再传给 `start_chat_workflow_stream`。
- **改多轮字段**: `history_mode=bounded_recent` 与 `recent_dialogue` 必须成对传给工作流，内容限额由 `services/recent_dialogue.py` 统一执行。
- **改身份参数**: `participant_identity` 和兼容别名必须在路由层再次规范化；未知值降级为普通用户，不得控制权限。
- **改本地配置回退**: 修改 `_local_configuration_fallback_stream` 时保持 `workflow.started`、`chat.completed`、`workflow.completed` 事件完整。
- **改结束逻辑**: 不要让路由层提前消费或终止 service generator。
- **改性能观测**: 保持 `X-Request-ID`、`Server-Timing` 和无消息正文的耗时日志，避免把用户内容或上游错误详情写入日志。

## 依赖图

```text
coze.py
← 引入: services.coze_client, services.coze_workflow, services.coze_stream_transformer, services.participant_identity
→ 被引用: app.py 注册为 /api/coze
```
