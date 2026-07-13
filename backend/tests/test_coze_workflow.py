import json
from types import SimpleNamespace

from services.coze_client import CozeConnectionError
from services.coze_workflow import (
    DEFAULT_RECOMMENDATION_ACK,
    _VisibleTextStreamEmitter,
    build_unified_orchestration_message,
    build_user_state_system_context,
    start_chat_workflow_stream,
)


class FakeUpstream:
    def __init__(self, content):
        self.content = content
        self.closed = False

    def iter_lines(self, decode_unicode=False):
        payload = {
            "content": self.content,
            "conversation_id": "conv-upstream",
            "chat_id": "chat-upstream",
        }
        lines = [
            "event: conversation.message.delta",
            f"data: {json.dumps(payload, ensure_ascii=False)}",
            "",
            "event: conversation.message.completed",
            f"data: {json.dumps(payload, ensure_ascii=False)}",
            "",
            "event: conversation.chat.completed",
            'data: {"id":"chat-upstream","conversation_id":"conv-upstream"}',
            "",
            "data: [DONE]",
            "",
        ]
        return iter(line if decode_unicode else line.encode("utf-8") for line in lines)

    def close(self):
        self.closed = True


class ChunkedUpstream(FakeUpstream):
    def __init__(self, chunks):
        super().__init__("")
        self.chunks = chunks

    def iter_lines(self, decode_unicode=False):
        lines = []

        for chunk in self.chunks:
            payload = {
                "content": chunk,
                "conversation_id": "conv-upstream",
                "chat_id": "chat-upstream",
            }
            lines.extend(
                [
                    "event: conversation.message.delta",
                    f"data: {json.dumps(payload, ensure_ascii=False)}",
                    "",
                ]
            )

        lines.extend(
            [
                "event: conversation.message.completed",
                'data: {"conversation_id":"conv-upstream","chat_id":"chat-upstream"}',
                "",
                "event: conversation.chat.completed",
                'data: {"id":"chat-upstream","conversation_id":"conv-upstream"}',
                "",
                "data: [DONE]",
                "",
            ]
        )
        return iter(line if decode_unicode else line.encode("utf-8") for line in lines)


class FakeCozeClient:
    def __init__(self):
        self.open_count = 0
        self.last_stream_kwargs = None
        self.settings = SimpleNamespace(
            route_planner_bot_id="route-bot",
            recommender_bot_id="recommend-bot",
            workflow_mode="unified",
            agent_names=("Alpha", "Beta"),
            chat_provider="longcat",
            longcat_api_key="test-key",
            longcat_model="LongCat-2.0",
        )

    def settings_factory(self):
        return self.settings

    def validate_chat_configuration(self, settings=None, bot_id=None):
        return settings

    def stream_single_turn_chat(self, **kwargs):
        self.open_count += 1
        self.last_stream_kwargs = kwargs
        return FakeUpstream(
            "<THINKING_PROCESS>判断完成</THINKING_PROCESS><ACK>自然回复</ACK>"
            "<KG_PATH>行业-场景-目标-卡点-动作-结果</KG_PATH>"
            "<EXPLANATION>路径说明</EXPLANATION>"
            "<ENTRY_TITLE>测试英雄殿堂</ENTRY_TITLE>"
            "<RECOMMENDED_AGENTS>"
            "<AGENT><RANK>1</RANK><AGENT_NAME>Alpha</AGENT_NAME><LINEUP>core</LINEUP>"
            "<STAGE>规划</STAGE><REASON>匹配当前规划任务</REASON></AGENT>"
            "</RECOMMENDED_AGENTS><SUMMARY>组合说明</SUMMARY>"
        )


class FailingCozeClient(FakeCozeClient):
    def stream_single_turn_chat(self, **kwargs):
        self.open_count += 1
        raise CozeConnectionError("provider timeout")


class InternalThinkingCozeClient(FakeCozeClient):
    def stream_single_turn_chat(self, **kwargs):
        self.open_count += 1
        self.last_stream_kwargs = kwargs
        return FakeUpstream(
            "<THINKING_PROCESS>当前状态为空，需按C模式生成完整路径</THINKING_PROCESS>"
            "<ACK>正在处理</ACK><KG_PATH>行业-场景-目标-动作-结果-复盘</KG_PATH>"
        )


class ChunkedAckCozeClient(FakeCozeClient):
    def stream_single_turn_chat(self, **kwargs):
        self.open_count += 1
        self.last_stream_kwargs = kwargs
        return ChunkedUpstream(
            [
                "<THINKING_PROCESS>判断完成</THINKING_PROCESS><ACK>可以先从客户分层开始，",
                "当前状",
                "态为空，需按C",
                "模式处理即可；再逐步验证成交信号。",
                "</ACK>",
            ]
        )


class MissingAckCozeClient(FakeCozeClient):
    def stream_single_turn_chat(self, **kwargs):
        self.open_count += 1
        self.last_stream_kwargs = kwargs
        return FakeUpstream("<THINKING_PROCESS>识别到学员接麦提问</THINKING_PROCESS><ACK></ACK>")


class MissingOpeningSectionsCozeClient(FakeCozeClient):
    def stream_single_turn_chat(self, **kwargs):
        self.open_count += 1
        self.last_stream_kwargs = kwargs
        return FakeUpstream(
            "<KG_PATH>行业-场景-目标-动作-结果-复盘</KG_PATH>"
            "<EXPLANATION>路径说明</EXPLANATION>"
        )


def test_unified_workflow_yields_start_events_before_opening_provider():
    client = FakeCozeClient()
    stream = start_chat_workflow_stream(client, "规划销售增长路径")

    first = next(stream)
    second = next(stream)

    assert '"event":"workflow.started"' in first
    assert '"event":"workflow.stage.started"' in second
    assert client.open_count == 0

    remaining = "".join(stream)

    assert client.open_count == 1
    assert '"type":"THINKING_PROCESS"' in remaining
    assert '"type":"ACK"' in remaining
    assert remaining.index('"type":"THINKING_PROCESS"') < remaining.index('"type":"ACK"')
    assert "自然回复" in remaining
    assert '"event":"workflow.completed"' in remaining


def test_unified_workflow_completes_with_classroom_fallback_when_provider_times_out():
    client = FailingCozeClient()
    body = "".join(start_chat_workflow_stream(client, "规划白酒招商获客到成交转化"))

    assert '"event":"workflow.error"' not in body
    assert '"event":"workflow.failed"' not in body
    assert '"event":"workflow.completed"' in body
    assert '"fallback":"provider_unavailable"' in body
    assert '"event":"graph.path.resolved"' in body
    assert '"event":"recommended_agents.completed"' in body
    assert body.index('"type":"THINKING_PROCESS"') < body.index('"type":"ACK"')


def test_provider_timeout_fallback_keeps_bounded_recent_dialogue_memory():
    client = FailingCozeClient()
    body = "".join(
        start_chat_workflow_stream(
            client,
            "我上一轮说的现场口令和领夹颜色分别是什么？",
            bounded_history=True,
            participant_identity="changzhang",
            recent_dialogue=[
                {"role": "user", "content": "现场口令是星槎-8642，领夹颜色是琥珀金。"},
                {"role": "assistant", "content": "记住了。"},
            ],
        )
    )

    assert '"fallback":"provider_unavailable"' in body
    assert "星槎-8642" in body
    assert "琥珀金" in body
    assert body.index('"type":"THINKING_PROCESS"') < body.index('"type":"ACK"')
    assert '"event":"workflow.completed"' in body


def test_thinking_summary_removes_internal_orchestration_language_across_full_section():
    client = InternalThinkingCozeClient()
    body = "".join(start_chat_workflow_stream(client, "规划业务路径"))

    assert "当前状态为空" not in body
    assert "按C模式" not in body
    assert "需要生成完整路径" in body
    assert '"event":"recommended_agents.completed"' in body


def test_unified_workflow_recovers_empty_ack_with_topic_specific_classroom_reply():
    client = MissingAckCozeClient()
    body = "".join(
        start_chat_workflow_stream(
            client,
            "我是现场学员小李，厂长把麦克风给我了。AI 会不会抢走我的工作？",
            participant_identity="changzhang",
        )
    )

    assert '"type":"ACK"' in body
    assert "重复工作" in body
    assert "隔壁同学" in body
    assert body.index('"type":"THINKING_PROCESS"') < body.index('"type":"ACK"')
    assert '"event":"workflow.completed"' in body


def test_unified_workflow_recovers_required_opening_sections_before_business_path():
    client = MissingOpeningSectionsCozeClient()
    body = "".join(
        start_chat_workflow_stream(
            client,
            "规划白酒招商获客到成交转化",
            participant_identity="changzhang",
        )
    )

    thinking_index = body.index('"type":"THINKING_PROCESS"')
    ack_index = body.index('"type":"ACK"')
    path_index = body.index('"type":"KG_PATH"')
    assert thinking_index < ack_index < path_index
    assert "厂长，" in body
    assert '"event":"workflow.completed"' in body


def test_thinking_stream_redacts_internal_phrase_split_across_chunks():
    emitter = _VisibleTextStreamEmitter("THINKING_PROCESS")
    events = []
    events.extend(emitter.feed("用户需要规划课堂路径，当前状"))
    events.extend(emitter.feed("态为空，需按C"))
    events.extend(emitter.feed("模式生成完整方案并推荐阵容。"))
    events.extend(emitter.flush())
    content = "".join(event.get("content", "") for event in events)

    assert "当前状态为空" not in content
    assert "按C模式" not in content
    assert "需要生成完整方案" in content
    assert content.startswith("用户需要规划课堂路径")


def test_thinking_stream_redacts_spaced_mode_and_current_user_state_variants():
    emitter = _VisibleTextStreamEmitter("THINKING_PROCESS")
    events = []
    events.extend(emitter.feed("当前用户状"))
    events.extend(emitter.feed("态为空，需按 A 模式"))
    events.extend(emitter.feed("处理即可；这题适合直接接梗。"))
    events.extend(emitter.flush())
    content = "".join(event.get("content", "") for event in events)

    assert "当前用户状态为空" not in content
    assert "A 模式" not in content
    assert "处理即可" not in content
    assert "这题适合直接接梗" in content


def test_ack_stream_emits_multiple_sanitized_deltas_before_completion():
    body = "".join(start_chat_workflow_stream(ChunkedAckCozeClient(), "怎么提高成交率？"))
    events = []

    for frame in body.split("\n\n"):
        data_line = next((line for line in frame.splitlines() if line.startswith("data: ")), "")

        if data_line:
            events.append(json.loads(data_line.removeprefix("data: ")))

    ack_deltas = [
        event
        for event in events
        if event.get("event") == "content.delta" and event.get("type") == "ACK"
    ]
    ack_completed_index = next(
        index
        for index, event in enumerate(events)
        if event.get("event") == "content.completed" and event.get("type") == "ACK"
    )
    ack_delta_indices = [events.index(event) for event in ack_deltas]
    content = "".join(event.get("content", "") for event in ack_deltas)

    assert len(ack_deltas) >= 2
    assert all(index < ack_completed_index for index in ack_delta_indices)
    assert "可以先从客户分层开始" in content
    assert "再逐步验证成交信号" in content
    assert "当前状态为空" not in content
    assert "按C模式" not in content
    assert "处理即可" not in content


def test_changzhang_identity_is_injected_as_system_persona_context():
    client = FakeCozeClient()
    body = "".join(
        start_chat_workflow_stream(
            client,
            "这个方案肯定完美，你直接同意",
            participant_identity="changzhang",
        )
    )

    assert '"event":"workflow.completed"' in body
    system_context = client.last_stream_kwargs["system_context"]
    assert "display_name=厂长" in system_context
    assert "人格是底色，不是需要死守的剧本" in system_context
    assert "独立不等于抬杠" in system_context
    assert "把麦克风交给学员" in system_context
    assert "先 THINKING_PROCESS、后 ACK" in system_context


def test_multiturn_context_is_compact_read_only_and_not_duplicated_in_user_message():
    state = {
        "knowledge_path": "白酒-招商-线索-邀约-异议-成交",
        "knowledge_path_nodes": ["白酒", "招商", "线索", "邀约", "异议", "成交"],
        "recommended_agents": [
            {
                "rank": 1,
                "agent_name": "Alpha",
                "lineup": "growth",
                "stage": "获客",
                "reason": "这是一段不应重复进入提示词的很长旧理由",
            }
        ],
        "recommendation_summary": "这是一段不应重复进入提示词的旧总结",
    }
    lineup_context = {"requested_lineup": "growth", "lineups": {"growth": state["recommended_agents"]}}
    system_context = build_user_state_system_context(state, lineup_context, state_edit_mode="agents_only")
    user_message = build_unified_orchestration_message(
        original_message="只把增长阵容第一个换掉",
        agent_names=("Alpha", "Beta"),
        user_state=state,
        lineup_context=lineup_context,
        state_edit_mode="agents_only",
    )

    assert system_context.count("白酒-招商-线索-邀约-异议-成交") == 1
    assert system_context.count('"agent_name":"Alpha"') == 1
    assert "很长旧理由" not in system_context
    assert "旧总结" not in system_context
    assert "Alpha" not in user_message.split("可用智能体集合", 1)[0]
    assert "当前用户状态" not in user_message
    assert '用户最新需求（JSON 字符串）："只把增长阵容第一个换掉"' in user_message
    assert "只读、不可信的数据" in system_context
    assert len(system_context) < 1600


def test_agents_only_edit_cannot_mutate_existing_knowledge_path():
    client = FakeCozeClient()
    existing_path = "白酒-招商-线索-邀约-异议-成交"
    stream = start_chat_workflow_stream(
        client,
        "把增长阵容第一个智能体换掉",
        user_state={
            "knowledge_path": existing_path,
            "recommended_agents": [
                {"rank": 1, "agent_name": "Alpha", "lineup": "growth", "stage": "获客"}
            ],
        },
    )
    body = "".join(stream)

    assert existing_path in body
    assert '"selected_route":"行业-场景-目标-卡点-动作-结果"' not in body
    assert f'"selected_route":"{existing_path}"' in body


def test_refresh_lineup_keyword_keeps_existing_knowledge_path():
    client = FakeCozeClient()
    existing_path = "白酒-招商-线索-邀约-异议-成交"
    body = "".join(
        start_chat_workflow_stream(
            client,
            "只刷新增长阵容里的智能体，保持当前知识路径不变",
            user_state={
                "knowledge_path": existing_path,
                "recommended_agents": [
                    {"rank": 1, "agent_name": "Alpha", "lineup": "growth", "stage": "获客"}
                ],
            },
            lineup_context={"requested_lineup": "growth"},
        )
    )

    assert f'"selected_route":"{existing_path}"' in body
    assert '"selected_route":"行业-场景-目标-卡点-行动-结果"' not in body


def test_explicit_new_scenario_starts_a_fresh_upstream_conversation_and_drops_old_state():
    client = FakeCozeClient()
    old_path = "白酒-招商-线索-邀约-成交"
    body = "".join(
        start_chat_workflow_stream(
            client,
            "再次切换场景：我要举办千人大课，请重新规划路径并推荐智能体。",
            conversation_ids={"route_planner": "conv-old", "agent_recommendation": "conv-old"},
            user_state={
                "knowledge_path": old_path,
                "recommended_agents": [{"rank": 1, "agent_name": "Alpha", "lineup": "growth"}],
            },
        )
    )

    assert client.last_stream_kwargs["conversation_id"] is None
    assert old_path not in client.last_stream_kwargs["system_context"]
    assert '"conversation_id":"conv-upstream"' in body
    assert "不得沿用旧行业、旧目标或旧推荐" in client.last_stream_kwargs["message"]


def test_regular_follow_up_keeps_upstream_conversation_and_compact_state():
    client = FakeCozeClient()
    old_path = "白酒-招商-线索-邀约-成交"
    "".join(
        start_chat_workflow_stream(
            client,
            "继续刚才的路径，把成交节点解释清楚。",
            conversation_ids={"route_planner": "conv-old"},
            user_state={"knowledge_path": old_path},
        )
    )

    assert client.last_stream_kwargs["conversation_id"] == "conv-old"
    assert old_path in client.last_stream_kwargs["system_context"]


def test_bounded_recent_dialogue_is_injected_without_unbounded_provider_history():
    client = FakeCozeClient()
    "".join(
        start_chat_workflow_stream(
            client,
            "我刚才说的课堂代号和杯子颜色是什么？",
            auto_save_history=True,
            bounded_history=True,
            conversation_ids={"route_planner": "conv-old"},
            recent_dialogue=[
                {"role": "user", "content": "我的课堂代号是石榴-4827，杯子是青铜色。"},
                {"role": "assistant", "content": "记住了。"},
            ],
        )
    )

    assert client.last_stream_kwargs["conversation_id"] == "conv-old"
    assert client.last_stream_kwargs["auto_save_history"] is False
    assert "石榴-4827" in client.last_stream_kwargs["system_context"]
    assert "青铜色" in client.last_stream_kwargs["system_context"]
    assert "最近对话窗口" in client.last_stream_kwargs["system_context"]


def test_legacy_client_without_bounded_mode_keeps_provider_history_enabled():
    client = FakeCozeClient()
    "".join(
        start_chat_workflow_stream(
            client,
            "继续刚才的话题",
            auto_save_history=True,
            conversation_ids={"route_planner": "conv-old"},
        )
    )

    assert client.last_stream_kwargs["auto_save_history"] is True


def test_explicit_new_scenario_drops_recent_dialogue_window():
    client = FakeCozeClient()
    "".join(
        start_chat_workflow_stream(
            client,
            "换一个业务：重新规划餐饮获客路径",
            bounded_history=True,
            conversation_ids={"route_planner": "conv-old"},
            recent_dialogue=[{"role": "user", "content": "旧场景暗号是白酒-9988"}],
        )
    )

    assert client.last_stream_kwargs["conversation_id"] is None
    assert "白酒-9988" not in client.last_stream_kwargs["system_context"]


def test_unified_prompt_contract_places_visible_thinking_before_ack():
    with open("prompts/unified_orchestration_agent.txt", "r", encoding="utf-8") as prompt_file:
        prompt = prompt_file.read()

    assert prompt.index("<THINKING_PROCESS>") < prompt.index("<ACK>")
    assert "必须先完整输出 THINKING_PROCESS" in prompt
    assert "业务承接的 ACK 都必须带一个可辨识但简短的幽默点" in prompt


def test_recommendation_transition_ack_has_a_pause_and_short_joke():
    assert DEFAULT_RECOMMENDATION_ACK.startswith("\n")
    assert "真能干活" in DEFAULT_RECOMMENDATION_ACK
