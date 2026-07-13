# backend/tests/

> `backend/tests/` · 19 个 pytest 测试文件

## 职责

后端测试目录覆盖智能体目录接口、推荐快照存储、组合智能体服务存储、推荐快照流式持久化、Coze 流接入快照以及相关路由。测试主要使用 Flask `test_client` 和内存 store，避免依赖真实数据库或外部模型服务。

## 文件列表

| 文件 | 用途 | 关键导出 |
|------|------|----------|
| `test_agents_route.py` | 验证 `/api/agents`、头像读取和未暴露详情接口。 | `test_get_agents_returns_launch_url_and_avatar_url`, `test_get_agent_avatar_returns_database_image_bytes` |
| `test_api_access.py` | 验证 API 会话、CSRF 与推荐编辑 token 的签名、过期和防串用行为。 | `test_api_session_round_trip_and_csrf_validation`, `test_recommendation_edit_token_is_bound_to_recommendation` |
| `test_combination_agent_store.py` | 验证组合智能体 store 的 ID、阵容归一化、按推荐 ID 幂等保存和 Postgres row 转换。 | `test_in_memory_upsert_for_recommendation_updates_same_combination_agent`, `test_postgres_upsert_normalizes_payload_before_write` |
| `test_combination_agents_route.py` | 验证组合智能体保存/读取接口、错误响应和头像静态 URL 重写。 | `test_save_combination_agent_for_recommendation_persists_adjusted_lineup`, `test_save_combination_agent_updates_existing_service_object` |
| `test_classroom_fallback.py` | 验证供应商不可用时的问候/业务分流、近期事实记录/回忆、白名单推荐和多轮阵容不变式。 | `test_greeting_fallback_stays_natural_without_business_artifacts`, `test_changzhang_memory_recall_fallback_reads_the_latest_user_turn` |
| `test_config.py` | 验证 LongCat 课堂可靠性配置边界，以及默认推荐候选名称读取会跳过没有启动链接的智能体记录。 | `test_longcat_reliability_defaults_are_classroom_bounded`, `test_read_agent_names_skips_records_without_launch_link` |
| `test_tts_config.py` | 验证 TTS 配置忽略本地模型环境变量，并只允许 Edge 中文女声。 | `test_tts_settings_ignore_local_provider_env`, `test_tts_settings_rejects_edge_male_voice` |
| `test_tts_route.py` | 验证 TTS 路由状态映射以及供应商内部错误不会泄露给客户端。 | `test_tts_route_does_not_expose_internal_error_details` |
| `test_tts_service.py` | 验证 TTS 合成入口固定调用 Edge TTS，不暴露 Piper 或本地模型分支。 | `test_synthesize_speech_uses_edge_tts_only` |
| `test_coze_snapshot_stream.py` | 验证聊天流创建推荐快照、注入推荐 ID 和错误收敛。 | `test_stream_chat_creates_snapshot_and_injects_recommendation_id` |
| `test_coze_client.py` | 验证 LongCat 低延迟参数保护、有界兼容历史、响应头前有限重试和 HTTP 错误不重放。 | `test_longcat_payload_forces_low_latency_server_controls`, `test_longcat_stream_retries_header_timeout_once_then_connects` |
| `test_coze_stream_transformer.py` | 验证模型一级 XML 错误闭合、孤立闭合和跨 chunk 恢复，不泄漏原始标签。 | `test_parser_recovers_from_mismatched_close_tag_before_recommendations`, `test_parser_discards_standalone_known_close_tag_and_resumes_at_next_section` |
| `test_coze_workflow.py` | 验证懒连接首包、显式多轮状态、路径不变式、ACK 优先契约，以及上游超时后仍保留近期事实的完整课堂降级。 | `test_unified_workflow_yields_start_events_before_opening_provider`, `test_provider_timeout_fallback_keeps_bounded_recent_dialogue_memory` |
| `test_participant_identity.py` | 验证参与者身份白名单、普通用户无行为变化和厂长人格边界。 | `test_participant_identity_only_accepts_allowlisted_changzhang_value`, `test_changzhang_persona_is_independent_humorous_and_bounded` |
| `test_recent_dialogue.py` | 验证近期对话角色、条数、单条/总长度限制和标记转义。 | `test_recent_dialogue_keeps_only_the_newest_bounded_messages`, `test_recent_dialogue_context_is_read_only_and_escapes_marker_like_text` |
| `test_recommended_agents_stream.py` | 验证推荐候选白名单、去重、数量和目标阵容约束。 | `test_emitter_filters_unknown_duplicate_and_excess_agents` |
| `test_recommendation_snapshot_store.py` | 验证内存/Postgres 推荐快照 store 的字段归一化、旧 `saved_lineup` 兼容字段和错误回滚。 | `test_new_recommendation_id_uses_rec_prefix_and_16_hex_chars`, `test_update_saved_lineup_persists_agent_slots_and_score` |
| `test_recommendation_snapshot_stream.py` | 验证 SSE 帧解析、快照持久化和流异常处理。 | `test_workflow_started_injects_recommendation_id` |
| `test_recommendations_route.py` | 验证推荐快照查询、手动追加智能体和保存五槽组合阵容接口。 | `test_get_recommendation_snapshot_returns_snapshot`, `test_append_agent_to_recommendation_snapshot_persists_manual_agent`, `test_save_recommendation_lineup_persists_adjusted_agents` |

## 开发模式

- **新增后端接口**: 优先增加同类 route 测试，并用内存 store 隔离数据库。
- **修改快照字段**: 同步更新 store、stream 和 route 三类测试断言。
- **修改组合智能体保存**: 同步更新 `test_combination_agent_store.py` 和 `test_combination_agents_route.py`。
- **修改错误响应**: 检查测试是否覆盖“不泄漏原始异常详情”。
- **修改首字或多轮上下文**: 同时运行 `test_coze_client.py`、`test_coze_workflow.py` 和 `test_coze_snapshot_stream.py`。
- **修改模型标签解析**: 同时运行 `test_coze_stream_transformer.py`、`test_recommended_agents_stream.py` 和 `test_coze_workflow.py`。
- **修改参与者人格**: 同时运行 `test_participant_identity.py`、`test_coze_workflow.py`、`test_coze_snapshot_stream.py` 和 `test_classroom_fallback.py`。
- **修改签名会话/CSRF/编辑 token**: 同时运行 `test_api_access.py`、聊天、TTS、推荐和组合路由测试。
