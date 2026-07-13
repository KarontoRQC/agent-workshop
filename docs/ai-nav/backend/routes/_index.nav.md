# routes/

> `backend/routes/` · 8 个 Python 文件
> **功能文档**: `docs/coze-chat-stream-api.md`

## 职责

路由层只处理 HTTP 请求、参数归一化、错误响应和 SSE Response 包装。实际工作流、标签解析、供应商请求和 TTS 合成在 `services/` 中完成。

## 文件列表

| 文件 | 用途 | 关键导出 |
|------|------|----------|
| `access_control.py` | 集中校验签名 API 会话、CSRF header 和推荐编号编辑权限。 | `require_api_session`, `require_recommendation_edit_access`, `get_active_security_settings` |
| `agents.py` | `GET /api/agents` 智能体目录、静态头像 URL 生成、`GET /api/agents/<id>/avatar` 数据库头像兜底接口。 | `agents_bp`, `list_agents`, `get_agent_avatar`, `get_agent_avatar_url` |
| `combination_agents.py` | 组合智能体服务对象接口：按推荐快照 ID 保存/读取用户调整后的五槽阵容，并读取单个组合智能体。 | `combination_agents_bp`, `save_combination_agent_for_recommendation`, `get_combination_agent_by_recommendation` |
| `coze.py` | `POST /api/coze/chat/stream` 流式对话、请求追踪和首字耗时观测。 | `coze_bp`, `stream_chat` |
| `recommendations.py` | `GET /api/recommendations/<id>` 推荐快照查询接口，`POST /api/recommendations/<id>/agents` 追加目录智能体；旧 `/lineup` 接口仅作兼容，不作为组合智能体保存主路径。 | `recommendations_bp`, `get_recommendation_snapshot`, `append_agent_to_recommendation_snapshot` |
| `system.py` | 健康检查、签名 API 会话签发和默认关闭的 echo 调试接口。 | `system_bp`, `health`, `create_session`, `echo` |
| `tts.py` | 受签名会话与 CSRF 保护的 `POST /api/tts/speech` TTS 音频接口。 | `tts_bp`, `speech` |
| `__init__.py` | 包标记文件。 | 无 |

## 开发模式

- **添加请求字段**: 在对应路由中归一化字段，再传入 service；不要让前端字段名散落到 service 多处。
- **新增 SSE 错误**: 通过 `content_event` 和 `format_sse_event` 输出结构化事件。
- **修改写接口权限**: 统一复用 `access_control.py`，不得让推荐编辑 token 出现在 URL、日志或公开快照中。
