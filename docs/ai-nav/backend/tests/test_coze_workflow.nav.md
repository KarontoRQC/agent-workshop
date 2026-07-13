# test_coze_workflow.py

> `backend/tests/test_coze_workflow.py` · Python · 约 440 行

## 用途

验证统一工作流启动事件早于上游连接、可见内容保持模型自然生成的 `THINKING_PROCESS → ACK`、ACK 在完成事件前产生多个真实流式 delta、空 ACK 自动恢复、跨 chunk 脱敏、有界近期对话注入、旧客户端供应商历史兼容、显式新场景隔离、普通追问延续、厂长人格，以及只改智能体时保留知识路径。

## 关键覆盖

| 名称 | 类型 | 作用 |
|------|------|------|
| `test_unified_workflow_yields_start_events_before_opening_provider` | test | 锁定懒连接和立即首包行为。 |
| `test_unified_workflow_recovers_empty_ack_with_topic_specific_classroom_reply` | test | 上游返回空 ACK 时补出与当前学员问题匹配的课堂回复。 |
| `test_unified_workflow_recovers_required_opening_sections_before_business_path` | test | 上游直接进入路径时先补齐 THINKING_PROCESS 和 ACK，再发送 KG_PATH。 |
| `test_ack_stream_emits_multiple_sanitized_deltas_before_completion` | test | ACK 在完成事件前输出多个增量，同时清除跨 chunk 内部编排词和残句。 |
| `test_recommendation_transition_ack_has_a_pause_and_short_joke` | test | 固定推荐转场包含换行停顿和短笑点，不与模型 ACK 粘连。 |
| `test_multiturn_context_is_compact_read_only_and_not_duplicated_in_user_message` | test | 锁定单份只读状态上下文。 |
| `test_agents_only_edit_cannot_mutate_existing_knowledge_path` | test | 锁定单项组合修改的路径不变式。 |
| `test_changzhang_identity_is_injected_as_system_persona_context` | test | 锁定厂长独立人格与标签顺序约束进入上游系统上下文。 |
| `test_explicit_new_scenario_starts_a_fresh_upstream_conversation_and_drops_old_state` | test | 锁定新场景重置旧会话和只读状态。 |
| `test_regular_follow_up_keeps_upstream_conversation_and_compact_state` | test | 锁定普通追问继续沿用会话与压缩状态。 |
| `test_bounded_recent_dialogue_is_injected_without_unbounded_provider_history` | test | bounded 模式注入近期窗口，并关闭 LongCat 无限历史。 |
| `test_provider_timeout_fallback_keeps_bounded_recent_dialogue_memory` | test | LongCat 超时时课堂兜底仍能从近期窗口复述上一轮事实。 |
| `test_legacy_client_without_bounded_mode_keeps_provider_history_enabled` | test | 旧客户端继续尊重 `auto_save_history`。 |
| `test_explicit_new_scenario_drops_recent_dialogue_window` | test | 明确切换新业务时清空旧近期对话。 |

## 修改指南

- 修改工作流启动顺序、状态格式、模式识别或统一 prompt 时运行本文件和完整后端测试。
