from services.coze_stream_transformer import TaggedContentParser, UNIFIED_WORKFLOW_TAGS
from services.recommended_agents_stream import RecommendedAgentsStreamEmitter


def _parse_chunks(chunks):
    parser = TaggedContentParser(
        section_tags=UNIFIED_WORKFLOW_TAGS,
        section_stream_emitters={
            "RECOMMENDED_AGENTS": lambda: RecommendedAgentsStreamEmitter(allowed_agent_names=("Alpha",))
        },
        untagged_type="DIRECT_REPLY",
    )
    events = []

    for chunk in chunks:
        events.extend(parser.feed(chunk))

    events.extend(parser.flush())
    return events


def _section_text(events, section_type):
    return "".join(
        event.get("content", "")
        for event in events
        if event.get("event") == "content.delta" and event.get("type") == section_type
    )


def test_parser_recovers_from_mismatched_close_tag_before_recommendations():
    events = _parse_chunks(
        [
            "<THINKING_PROCESS>判断摘要</THINKING_PROCESS><ACK>自然承接</ACK>",
            "<KG_PATH>千人大课-预热-报名-到课-互动-成交</KG_PATH>",
            "<EXPLANATION>课堂路径说明</ENTRY_",
            "TITLE>\n<ENTRY_TITLE>千人大课英雄殿堂</ENTRY_TITLE>",
            "<RECOMMENDED_AGENTS><AGENT><RANK>1</RANK><AGENT_NAME>Alpha</AGENT_NAME>",
            "<LINEUP>conversion</LINEUP><STAGE>成交</STAGE><REASON>负责课堂成交跟进</REASON>",
            "</AGENT></RECOMMENDED_AGENTS><SUMMARY>组合说明</SUMMARY>",
        ]
    )

    completed_agents = next(event for event in events if event.get("event") == "recommended_agents.completed")
    visible_text = "\n".join(
        str(event.get("content") or event.get("delta", {}).get("content") or "") for event in events
    )

    assert _section_text(events, "EXPLANATION") == "课堂路径说明"
    assert _section_text(events, "ENTRY_TITLE") == "千人大课英雄殿堂"
    assert _section_text(events, "SUMMARY") == "组合说明"
    assert [agent["agent_name"] for agent in completed_agents["agents"]] == ["Alpha"]
    assert "</ENTRY_TITLE>" not in visible_text
    assert "<RECOMMENDED_AGENTS>" not in visible_text
    assert not any(event.get("type") == "DIRECT_REPLY" for event in events)


def test_parser_discards_standalone_known_close_tag_and_resumes_at_next_section():
    events = _parse_chunks(
        [
            "</ENTRY_",
            "TITLE><ACK>继续处理</ACK><KG_PATH>场景-目标-动作-结果</KG_PATH>",
        ]
    )

    assert _section_text(events, "ACK") == "继续处理"
    assert _section_text(events, "KG_PATH") == "场景-目标-动作-结果"
    assert not any(event.get("type") == "DIRECT_REPLY" for event in events)
