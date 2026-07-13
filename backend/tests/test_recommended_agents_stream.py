from services.recommended_agents_stream import RecommendedAgentsStreamEmitter


def _agent_xml(name, lineup="core", rank=1):
    return (
        "<AGENT>"
        f"<RANK>{rank}</RANK>"
        f"<AGENT_NAME>{name}</AGENT_NAME>"
        f"<LINEUP>{lineup}</LINEUP>"
        "<STAGE>成交</STAGE>"
        "<REASON>用于验证服务端推荐约束</REASON>"
        "</AGENT>"
    )


def test_emitter_filters_unknown_duplicate_and_excess_agents():
    emitter = RecommendedAgentsStreamEmitter(
        allowed_agent_names=("Alpha", "Beta", "Gamma"),
        max_agents=2,
        default_lineup="growth",
    )
    content = "".join(
        [
            _agent_xml("Unknown", rank=1),
            _agent_xml("alpha", lineup="conversion", rank=2),
            _agent_xml("Alpha", rank=3),
            _agent_xml("Beta", rank=4),
            _agent_xml("Gamma", rank=5),
        ]
    )

    events = [*emitter.feed(content), *emitter.flush()]
    completed = next(event for event in reversed(events) if event["event"] == "recommended_agents.completed")

    assert completed["agents"] == [
        {
            "agent_index": 0,
            "rank": 1,
            "agent_name": "Alpha",
            "lineup": "growth",
            "stage": "成交",
            "reason": "用于验证服务端推荐约束",
        },
        {
            "agent_index": 1,
            "rank": 2,
            "agent_name": "Beta",
            "lineup": "growth",
            "stage": "成交",
            "reason": "用于验证服务端推荐约束",
        },
    ]


def test_emitter_without_allowlist_keeps_backward_compatible_agent():
    emitter = RecommendedAgentsStreamEmitter()
    events = [*emitter.feed(_agent_xml("自由智能体", lineup="conversion")), *emitter.flush()]
    completed = next(event for event in reversed(events) if event["event"] == "recommended_agents.completed")

    assert completed["agents"][0]["agent_name"] == "自由智能体"
    assert completed["agents"][0]["lineup"] == "conversion"


def test_emitter_fills_only_missing_stage_and_reason_fields():
    emitter = RecommendedAgentsStreamEmitter(allowed_agent_names=("Alpha", "Beta"))
    content = "".join(
        [
            "<AGENT><AGENT_NAME>Alpha</AGENT_NAME><LINEUP>growth</LINEUP></AGENT>",
            "<AGENT><AGENT_NAME>Beta</AGENT_NAME><LINEUP>conversion</LINEUP>"
            "<STAGE>异议处理</STAGE><REASON>模型给出的理由</REASON></AGENT>",
        ]
    )

    events = [*emitter.feed(content), *emitter.flush()]
    completed = next(event for event in reversed(events) if event["event"] == "recommended_agents.completed")

    assert completed["agents"][0]["stage"] == "增长执行"
    assert completed["agents"][0]["reason"] == "匹配当前知识路径，负责增长执行阶段的执行与交付。"
    assert completed["agents"][1]["stage"] == "异议处理"
    assert completed["agents"][1]["reason"] == "模型给出的理由"


def test_emitter_fills_model_underflow_to_five_allowlisted_agents():
    emitter = RecommendedAgentsStreamEmitter(
        allowed_agent_names=("Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta"),
        max_agents=6,
        minimum_agents=5,
    )
    content = "".join(
        [
            _agent_xml("Alpha", rank=1),
            _agent_xml("Beta", rank=2),
            _agent_xml("Gamma", rank=3),
            _agent_xml("Delta", rank=4),
        ]
    )

    events = [*emitter.feed(content), *emitter.flush()]
    completed = next(event for event in reversed(events) if event["event"] == "recommended_agents.completed")

    assert [agent["agent_name"] for agent in completed["agents"]] == [
        "Alpha",
        "Beta",
        "Gamma",
        "Delta",
        "Epsilon",
    ]
    assert completed["agents"][-1]["stage"]
    assert completed["agents"][-1]["reason"]
