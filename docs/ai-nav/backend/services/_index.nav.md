# services/

> `backend/services/` · 7 个 Python 文件
> **功能文档**: `docs/coze-chat-stream-api.md`

## 职责

服务层实现对话供应商适配、两阶段/统一工作流编排、XML 标签流式解析、推荐智能体字段流、动态图谱路径解析和 TTS 合成。这里是后端行为变化的主要位置。

## 文件列表

| 文件 | 用途 | 关键导出 |
|------|------|----------|
| `coze_client.py` | 适配 Coze 和 LongCat 流式请求。 | `CozeClient`, `LongCatStreamAdapter` |
| `coze_workflow.py` | 编排知识路径和智能体推荐 SSE 工作流。 | `start_chat_workflow_stream` |
| `coze_stream_transformer.py` | 把模型 XML 标签流转成结构化事件。 | `TaggedContentParser`, `iter_tagged_events`, `format_sse_event` |
| `recommended_agents_stream.py` | 将 `<AGENT>` 字段流转成推荐智能体增量 JSON。 | `RecommendedAgentsStreamEmitter` |
| `graph_path_resolver.py` | 将路线文本拆成动态图谱 nodes/edges。 | `GraphPathResolver`, `split_route_text` |
| `tts_service.py` | Edge TTS / Piper TTS 合成和 mood 参数映射。 | `synthesize_speech` |
| `__init__.py` | 包标记文件。 | 无 |

## 开发模式

- **改标签协议**: 先改 prompt，再改 `coze_stream_transformer.py` 和 `recommended_agents_stream.py`，最后改前端消费。
- **改会话状态**: 同时检查 `coze_client.py` 的上游会话 ID 和 `coze_workflow.py` 的 `conversation.updated` 输出。
- **改 TTS**: 保持 `tts_service.py` 抛出明确的配置错误和合成错误，路由层负责映射状态码。

