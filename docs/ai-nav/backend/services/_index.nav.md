# services/

> `backend/services/` · 15 个 Python 文件
> **功能文档**: `docs/coze-chat-stream-api.md`

## 职责

服务层实现对话供应商适配、两阶段/统一工作流编排、XML 标签流式解析、推荐智能体字段流、智能体目录/头像入库、组合智能体持久化、头像静态导出、动态图谱路径解析和 TTS 合成。这里是后端行为变化的主要位置。

## 文件列表

| 文件 | 用途 | 关键导出 |
|------|------|----------|
| `agent_catalog_store.py` | 智能体目录与头像资产的内存/Postgres 存储、建表、JSON/头像种子导入、静态头像导出；缺源头像时生成确定性 SVG 兜底头像。 | `PostgresAgentCatalogStore`, `InMemoryAgentCatalogStore`, `build_fallback_avatar` |
| `api_access.py` | 签发并验证无状态 HMAC API 会话、CSRF token 与推荐编号编辑 token。 | `issue_api_session`, `verify_api_session`, `issue_recommendation_edit_token`, `verify_recommendation_edit_token` |
| `combination_agent_store.py` | 组合智能体服务对象的内存/Postgres 存储、建表、五槽阵容归一化和按推荐 ID 幂等保存。 | `PostgresCombinationAgentStore`, `InMemoryCombinationAgentStore`, `normalize_combination_lineup` |
| `classroom_fallback.py` | 上游有限超时后生成可完成、可持久化的课堂降级回复/路径/白名单智能体，并从有界近期窗口承接临时事实。 | `build_classroom_fallback_plan` |
| `coze_client.py` | 适配 Coze/LongCat 流，控制低延迟参数、限制兼容历史并提供失败熔断。 | `CozeClient`, `LongCatStreamAdapter` |
| `coze_workflow.py` | 懒连接上游，编排显式多轮状态、知识路径和智能体推荐 SSE。 | `start_chat_workflow_stream` |
| `coze_stream_transformer.py` | 把模型 XML 标签流转成结构化事件，并从错误/孤立闭合标签恢复后续合法段。 | `TaggedContentParser`, `iter_tagged_events`, `format_sse_event` |
| `recommended_agents_stream.py` | 将 `<AGENT>` 字段流转成增量 JSON，并校验最终候选、数量和阵容。 | `RecommendedAgentsStreamEmitter` |
| `recommendation_snapshot_store.py` | 推荐组合快照的内存/Postgres 存储、建表、字段更新和 3 天过期处理；`saved_lineup` 仅保留旧数据兼容。 | `PostgresRecommendationSnapshotStore`, `InMemoryRecommendationSnapshotStore` |
| `recommendation_snapshot_stream.py` | 包装格式化 SSE 流，注入 `recommendation_id` 并把推荐事件写入快照。 | `persist_recommendation_snapshot_stream` |
| `graph_path_resolver.py` | 将路线文本拆成动态图谱 nodes/edges。 | `GraphPathResolver`, `split_route_text` |
| `participant_identity.py` | 白名单规范参与者身份，并生成普通用户/厂长人格系统上下文。 | `normalize_participant_identity`, `build_participant_persona_system_context` |
| `recent_dialogue.py` | 规范、限长并格式化最近 5 轮对话为只读不可信系统上下文。 | `normalize_recent_dialogue`, `build_recent_dialogue_system_context` |
| `tts_service.py` | Edge TTS 中文女声合成和 mood 参数映射。 | `synthesize_speech` |
| `__init__.py` | 包标记文件。 | 无 |

## 开发模式

- **改标签协议**: 先改 prompt，再改 `coze_stream_transformer.py` 和 `recommended_agents_stream.py`，最后改前端消费。
- **改智能体目录字段**: 同步检查 `agent_catalog_store.py`、`routes/agents.py`、`frontend/src/lib/agentCatalogClient.ts` 和 `frontend/src/lib/agentLaunchCatalog.ts`。
- **改组合智能体保存**: 同步检查 `combination_agent_store.py`、`routes/combination_agents.py`、`frontend/src/lib/combinationAgentClient.ts` 和组合入口页。
- **改会话状态**: 同时检查 `coze_client.py` 的上游会话 ID 和 `coze_workflow.py` 的 `conversation.updated` 输出。
- **改课堂降级**: 同步检查 `classroom_fallback.py`、`coze_workflow.py`、推荐快照持久化和 `run-agent-api-regression.mjs`。
- **改参与者人格**: 同步检查 `participant_identity.py`、`coze_workflow.py`、`routes/coze.py`、前端 URL 解析和接口文档；身份参数不得映射权限。
- **改多轮上下文**: 同步检查 `recent_dialogue.py`、`coze_workflow.py`、`routes/coze.py`、前端 `recentDialogue.ts` / `agentStreamClient.ts` 和真实记忆回归。
- **改 API 会话/编辑权限**: 同步检查 `api_access.py`、`routes/access_control.py`、前端 `apiSession.ts`、Node 审计 helper 和接口文档。
- **改 TTS**: 保持 `tts_service.py` 抛出明确的配置错误和合成错误，路由层负责映射状态码。
