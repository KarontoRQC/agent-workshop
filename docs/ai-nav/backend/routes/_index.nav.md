# routes/

> `backend/routes/` · 4 个 Python 文件
> **功能文档**: `docs/coze-chat-stream-api.md`

## 职责

路由层只处理 HTTP 请求、参数归一化、错误响应和 SSE Response 包装。实际工作流、标签解析、供应商请求和 TTS 合成在 `services/` 中完成。

## 文件列表

| 文件 | 用途 | 关键导出 |
|------|------|----------|
| `coze.py` | `POST /api/coze/chat/stream` 流式对话接口。 | `coze_bp`, `stream_chat` |
| `system.py` | 健康检查和 echo 调试接口。 | `system_bp`, `health`, `echo` |
| `tts.py` | `POST /api/tts/speech` TTS 音频接口。 | `tts_bp`, `speech` |
| `__init__.py` | 包标记文件。 | 无 |

## 开发模式

- **添加请求字段**: 在对应路由中归一化字段，再传入 service；不要让前端字段名散落到 service 多处。
- **新增 SSE 错误**: 通过 `content_event` 和 `format_sse_event` 输出结构化事件。
