# test_classroom_fallback.py

> `backend/tests/test_classroom_fallback.py` · Python · 约 150 行

## 用途

验证课堂降级计划的问候/业务分流、智能体白名单、业务路径、厂长灵活幽默话术、角色扮演直接执行、学员换人与具体提问、近期事实记录/回忆，以及多轮阵容更新不变式。

## 关键覆盖

| 名称 | 作用 |
|------|------|
| `test_greeting_fallback_stays_natural_without_business_artifacts` | 普通问候不生成路径或智能体。 |
| `test_business_fallback_builds_route_and_allowlisted_agents` | 业务请求生成路径，并只推荐白名单内有阶段/理由的智能体。 |
| `test_agents_only_fallback_preserves_route_and_requested_lineup` | 仅刷新阵容时保持路径不变并强制目标阵容。 |
| `test_changzhang_greeting_fallback_is_playful_without_being_rigid` | 厂长问候降级保持自然称呼、接梗和自嘲。 |
| `test_changzhang_memory_capture_fallback_confirms_the_actual_fact` | 供应商不可用时也确认用户要求记住的具体临时事实。 |
| `test_changzhang_memory_recall_fallback_reads_the_latest_user_turn` | 回忆追问从近期窗口复述上一轮用户事实。 |
| `test_changzhang_student_handoff_fallback_switches_the_active_speaker` | 学员接过麦克风后切换称呼，不再机械叫厂长。 |
| `test_changzhang_student_handoff_fallback_answers_ai_job_question_with_a_joke` | 供应商不可用时也直接回答学员的 AI 工作问题，并保留现场笑点。 |
| `test_changzhang_roleplay_fallback_performs_instead_of_acknowledging_the_request` | 反派 AI 角色扮演直接给出台词，不退化成通用接话。 |
| `test_changzhang_casual_fallback_follows_the_new_topic` | 厂长换到闲聊话题时直接接住，不强行追问业务目标。 |
| `test_changzhang_business_fallback_uses_wit_without_flattery` | 厂长业务降级保留轻度调侃和可执行结果。 |
