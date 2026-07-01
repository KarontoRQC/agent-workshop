import re
from collections import defaultdict

from services.coze_client import (
    CozeConfigurationError,
    CozeConnectionError,
    CozeUpstreamError,
)
from services.coze_stream_transformer import (
    RECOMMENDER_TAGS,
    ROUTE_PLANNER_TAGS,
    UNIFIED_WORKFLOW_TAGS,
    content_event,
    format_sse_event,
    iter_tagged_events,
)
from services.graph_path_resolver import GraphPathResolver
from services.recommended_agents_stream import RecommendedAgentsStreamEmitter


KNOWLEDGE_GRAPH_STAGE = "knowledge_graph"
AGENT_RECOMMENDATION_STAGE = "agent_recommendation"
DIRECT_REPLY_TYPE = "DIRECT_REPLY"
ROUTE_PLANNER_CONVERSATION_KEY = "route_planner"
RECOMMENDER_CONVERSATION_KEY = "agent_recommendation"
COMPLETION_EVENTS = {"chat.completed", "message.completed", "done"}
ROUTE_SECTION_TYPES = {"THINKING_PROCESS", "ACK", DIRECT_REPLY_TYPE, "KG_PATH", "EXPLANATION"}
RECOMMENDATION_SECTION_TYPES = {"RECOMMENDED_AGENTS", "SUMMARY"}
DEFAULT_RECOMMENDATION_ACK = "我把本轮智能体组合整理出来，并在最后给你一个简短总结。"
MAX_USER_STATE_AGENTS = 10
MAX_USER_STATE_TEXT_LENGTH = 600
MAX_USER_STATE_SUMMARY_LENGTH = 800
LINEUP_IDS = ("core", "growth", "conversion")
LINEUP_LABELS = {
    "core": "主力阵容",
    "growth": "增长阵容",
    "conversion": "成交阵容",
}
LINEUP_ALIASES = {
    "core": "core",
    "main": "core",
    "primary": "core",
    "default": "core",
    "主力": "core",
    "主力阵容": "core",
    "核心": "core",
    "核心阵容": "core",
    "growth": "growth",
    "grow": "growth",
    "acquisition": "growth",
    "增长": "growth",
    "增长阵容": "growth",
    "拉新": "growth",
    "拉新阵容": "growth",
    "转化": "growth",
    "conversion": "conversion",
    "deal": "conversion",
    "sales": "conversion",
    "transaction": "conversion",
    "成交": "conversion",
    "成交阵容": "conversion",
    "私域": "conversion",
    "私域承接": "conversion",
}
LINEUP_INTENT_KEYWORDS = (
    ("growth", ("增长阵容", "增长", "拉新", "获客", "转化增长", "growth", "acquisition")),
    ("conversion", ("成交阵容", "成交", "私域", "承接", "复购", "deal", "sales", "conversion")),
    ("core", ("主力阵容", "主力", "核心阵容", "核心", "main", "primary", "core")),
)
STAGE_CONVERSATION_KEYS = {
    KNOWLEDGE_GRAPH_STAGE: ROUTE_PLANNER_CONVERSATION_KEY,
    AGENT_RECOMMENDATION_STAGE: RECOMMENDER_CONVERSATION_KEY,
}
graph_path_resolver = GraphPathResolver()


def start_chat_workflow_stream(
    coze_client,
    message,
    parameters=None,
    user_id=None,
    agent_names=None,
    conversation_ids=None,
    auto_save_history=True,
    user_state=None,
    lineup_context=None,
):
    settings = coze_client.settings_factory()
    route_planner_bot_id = settings.route_planner_bot_id
    recommender_bot_id = settings.recommender_bot_id
    workflow_mode = getattr(settings, "workflow_mode", "unified")
    selected_agent_names = _normalize_agent_names(agent_names) or settings.agent_names
    selected_conversation_ids = _normalize_conversation_ids(conversation_ids)
    normalized_user_state = _normalize_user_state(user_state)
    normalized_lineup_context = _normalize_lineup_context(lineup_context, normalized_user_state, message)
    state_edit_mode = _detect_state_edit_mode(message, normalized_user_state)
    user_state_system_context = build_user_state_system_context(normalized_user_state, normalized_lineup_context)

    if not route_planner_bot_id:
        raise CozeConfigurationError("COZE_ROUTE_PLANNER_BOT_ID is not configured")
    if not recommender_bot_id and not _is_unified_workflow_mode(workflow_mode):
        raise CozeConfigurationError("COZE_RECOMMENDER_BOT_ID is not configured")

    if _is_unified_workflow_mode(workflow_mode):
        unified_message = build_unified_orchestration_message(
            original_message=message,
            agent_names=selected_agent_names,
            user_state=normalized_user_state,
            lineup_context=normalized_lineup_context,
            state_edit_mode=state_edit_mode,
        )
        route_upstream = coze_client.stream_single_turn_chat(
            message=unified_message,
            parameters=parameters,
            user_id=user_id,
            bot_id=route_planner_bot_id,
            conversation_id=selected_conversation_ids.get(ROUTE_PLANNER_CONVERSATION_KEY),
            auto_save_history=False,
            system_context=user_state_system_context,
        )

        return _iter_unified_chat_workflow_stream(
            route_upstream=route_upstream,
            original_message=message,
            agent_names=selected_agent_names,
            conversation_ids=selected_conversation_ids,
            state_edit_mode=state_edit_mode,
            lineup_context=normalized_lineup_context,
        )

    route_upstream = coze_client.stream_single_turn_chat(
        message=message,
        parameters=parameters,
        user_id=user_id,
        bot_id=route_planner_bot_id,
        conversation_id=selected_conversation_ids.get(ROUTE_PLANNER_CONVERSATION_KEY),
        auto_save_history=auto_save_history,
        system_context=user_state_system_context,
    )

    return _iter_chat_workflow_stream(
        coze_client=coze_client,
        route_upstream=route_upstream,
        original_message=message,
        parameters=parameters,
        user_id=user_id,
        recommender_bot_id=recommender_bot_id,
        agent_names=selected_agent_names,
        conversation_ids=selected_conversation_ids,
        auto_save_history=auto_save_history,
        user_state=normalized_user_state,
        lineup_context=normalized_lineup_context,
        user_state_system_context=user_state_system_context,
    )


def _iter_unified_chat_workflow_stream(
    route_upstream,
    original_message,
    agent_names,
    conversation_ids,
    state_edit_mode="general",
    lineup_context=None,
):
    conversation_ids = dict(conversation_ids or {})
    chat_ids = {}
    route_sections = defaultdict(str)
    direct_reply_parts = []
    summary = ""
    route_stage_closed = False
    recommendation_stage_started = False
    suppress_recommendation_stage = state_edit_mode == "path_only"

    def selected_route():
        return route_sections.get("KG_PATH", "").strip()

    def route_explanation():
        return route_sections.get("EXPLANATION", "").strip()

    def thinking_process():
        return route_sections.get("THINKING_PROCESS", "").strip()

    def close_route_stage():
        route = selected_route()

        if not route:
            direct_reply = "".join(direct_reply_parts).strip()

            if direct_reply:
                yield format_sse_event(
                    _with_stage(content_event("content.completed", {"type": DIRECT_REPLY_TYPE}), KNOWLEDGE_GRAPH_STAGE)
                )

            yield _stage_event(
                "workflow.stage.completed",
                KNOWLEDGE_GRAPH_STAGE,
                selected_route=route,
                route_explanation=route_explanation(),
                thinking_process=thinking_process(),
                direct_reply=direct_reply,
                route_matched=False,
                **_stage_conversation_payload(KNOWLEDGE_GRAPH_STAGE, conversation_ids, chat_ids),
            )
            return False

        graph_path = graph_path_resolver.resolve(route)

        for node in graph_path["nodes"]:
            yield _stage_event(
                "graph.node.delta",
                KNOWLEDGE_GRAPH_STAGE,
                route=route,
                node=node,
            )

        yield _stage_event(
            "graph.path.resolved",
            KNOWLEDGE_GRAPH_STAGE,
            **graph_path,
        )

        yield _stage_event(
            "workflow.stage.completed",
            KNOWLEDGE_GRAPH_STAGE,
            selected_route=route,
            route_explanation=route_explanation(),
            thinking_process=thinking_process(),
            graph_path=graph_path,
            **_stage_conversation_payload(KNOWLEDGE_GRAPH_STAGE, conversation_ids, chat_ids),
        )
        return True

    def start_recommendation_stage():
        nonlocal recommendation_stage_started

        if recommendation_stage_started:
            return

        recommendation_stage_started = True
        _mirror_unified_recommendation_conversation(conversation_ids, chat_ids)

        yield _stage_event(
            "workflow.stage.started",
            AGENT_RECOMMENDATION_STAGE,
            selected_route=selected_route(),
            agent_names=list(agent_names),
            lineup_context=lineup_context,
            **_stage_conversation_payload(AGENT_RECOMMENDATION_STAGE, conversation_ids, chat_ids),
        )
        yield from _fixed_text_section_events("ACK", DEFAULT_RECOMMENDATION_ACK, AGENT_RECOMMENDATION_STAGE)

    yield _workflow_event("workflow.started", **_conversation_payload(conversation_ids, chat_ids))
    yield _stage_event(
        "workflow.stage.started",
        KNOWLEDGE_GRAPH_STAGE,
        workflow_mode="unified",
        **_stage_conversation_payload(KNOWLEDGE_GRAPH_STAGE, conversation_ids, chat_ids),
    )

    for event in iter_tagged_events(
        route_upstream,
        section_tags=UNIFIED_WORKFLOW_TAGS,
        section_stream_emitters={"RECOMMENDED_AGENTS": RecommendedAgentsStreamEmitter},
        untagged_type=DIRECT_REPLY_TYPE,
    ):
        conversation_update = _conversation_update_event(event, KNOWLEDGE_GRAPH_STAGE, conversation_ids, chat_ids)

        if conversation_update:
            yield conversation_update

        if event.get("event") == "content.delta":
            event_type = event.get("type")

            if event_type == DIRECT_REPLY_TYPE:
                direct_reply_parts.append(event.get("content", ""))
            elif event_type in ROUTE_SECTION_TYPES:
                route_sections[event_type] += event.get("content", "")
            elif event_type == "SUMMARY":
                summary += event.get("content", "")

        if event.get("event") in COMPLETION_EVENTS:
            continue

        if _is_recommendation_event(event):
            if suppress_recommendation_stage:
                continue

            if not route_stage_closed:
                route_stage_closed = True
                route_matched = yield from close_route_stage()

                if not route_matched:
                    continue

            yield from start_recommendation_stage()
            yield format_sse_event(_with_stage(event, AGENT_RECOMMENDATION_STAGE))
            continue

        yield format_sse_event(_with_stage(event, KNOWLEDGE_GRAPH_STAGE))

        if event.get("event") == "content.completed" and event.get("type") == "EXPLANATION" and not route_stage_closed:
            route_stage_closed = True
            route_matched = yield from close_route_stage()

            if route_matched and not suppress_recommendation_stage:
                yield from start_recommendation_stage()

    if not route_stage_closed:
        route_stage_closed = True
        route_matched = yield from close_route_stage()

        if not route_matched:
            yield _workflow_event(
                "chat.completed",
                status="completed",
                route_matched=False,
                **_conversation_payload(conversation_ids, chat_ids),
            )
            yield _workflow_event(
                "workflow.completed",
                status="completed",
                route_matched=False,
                **_conversation_payload(conversation_ids, chat_ids),
            )
            return

    if selected_route() and not recommendation_stage_started and not suppress_recommendation_stage:
        yield from start_recommendation_stage()

    if recommendation_stage_started:
        yield _stage_event(
            "workflow.stage.completed",
            AGENT_RECOMMENDATION_STAGE,
            summary=summary.strip(),
            thinking_process="",
            **_stage_conversation_payload(AGENT_RECOMMENDATION_STAGE, conversation_ids, chat_ids),
        )

    yield _workflow_event("chat.completed", status="completed", **_conversation_payload(conversation_ids, chat_ids))
    yield _workflow_event("workflow.completed", status="completed", **_conversation_payload(conversation_ids, chat_ids))


def _iter_chat_workflow_stream(
    coze_client,
    route_upstream,
    original_message,
    parameters,
    user_id,
    recommender_bot_id,
    agent_names,
    conversation_ids,
    auto_save_history,
    user_state,
    lineup_context,
    user_state_system_context,
):
    conversation_ids = dict(conversation_ids or {})
    chat_ids = {}
    route_sections = defaultdict(str)
    direct_reply_parts = []

    yield _workflow_event("workflow.started", **_conversation_payload(conversation_ids, chat_ids))
    yield _stage_event(
        "workflow.stage.started",
        KNOWLEDGE_GRAPH_STAGE,
        **_stage_conversation_payload(KNOWLEDGE_GRAPH_STAGE, conversation_ids, chat_ids),
    )

    for event in iter_tagged_events(
        route_upstream,
        section_tags=ROUTE_PLANNER_TAGS,
        untagged_type=DIRECT_REPLY_TYPE,
    ):
        conversation_update = _conversation_update_event(event, KNOWLEDGE_GRAPH_STAGE, conversation_ids, chat_ids)

        if conversation_update:
            yield conversation_update

        if event.get("event") == "content.delta":
            if event.get("type") == DIRECT_REPLY_TYPE:
                direct_reply_parts.append(event.get("content", ""))
                yield format_sse_event(_with_stage(event, KNOWLEDGE_GRAPH_STAGE))
                continue

            route_sections[event.get("type")] += event.get("content", "")

        if event.get("event") in COMPLETION_EVENTS:
            continue

        yield format_sse_event(_with_stage(event, KNOWLEDGE_GRAPH_STAGE))

    selected_route = route_sections.get("KG_PATH", "").strip()
    route_explanation = route_sections.get("EXPLANATION", "").strip()
    thinking_process = route_sections.get("THINKING_PROCESS", "").strip()

    if not selected_route:
        direct_reply = "".join(direct_reply_parts).strip()

        if direct_reply:
            yield format_sse_event(
                _with_stage(content_event("content.completed", {"type": DIRECT_REPLY_TYPE}), KNOWLEDGE_GRAPH_STAGE)
            )

        yield _stage_event(
            "workflow.stage.completed",
            KNOWLEDGE_GRAPH_STAGE,
            selected_route=selected_route,
            route_explanation=route_explanation,
            thinking_process=thinking_process,
            direct_reply=direct_reply,
            route_matched=False,
            **_stage_conversation_payload(KNOWLEDGE_GRAPH_STAGE, conversation_ids, chat_ids),
        )
        yield _workflow_event(
            "chat.completed",
            status="completed",
            route_matched=False,
            **_conversation_payload(conversation_ids, chat_ids),
        )
        yield _workflow_event(
            "workflow.completed",
            status="completed",
            route_matched=False,
            **_conversation_payload(conversation_ids, chat_ids),
        )
        return

    graph_path = graph_path_resolver.resolve(selected_route)

    for node in graph_path["nodes"]:
        yield _stage_event(
            "graph.node.delta",
            KNOWLEDGE_GRAPH_STAGE,
            route=selected_route,
            node=node,
        )

    yield _stage_event(
        "graph.path.resolved",
        KNOWLEDGE_GRAPH_STAGE,
        **graph_path,
    )

    yield _stage_event(
        "workflow.stage.completed",
        KNOWLEDGE_GRAPH_STAGE,
        selected_route=selected_route,
        route_explanation=route_explanation,
        thinking_process=thinking_process,
        graph_path=graph_path,
        **_stage_conversation_payload(KNOWLEDGE_GRAPH_STAGE, conversation_ids, chat_ids),
    )

    recommender_message = build_recommender_message(
        selected_route=selected_route,
        agent_names=agent_names,
        original_message=original_message,
        user_state=user_state,
        lineup_context=lineup_context,
    )

    yield _stage_event(
        "workflow.stage.started",
        AGENT_RECOMMENDATION_STAGE,
        selected_route=selected_route,
        agent_names=list(agent_names),
        lineup_context=lineup_context,
        **_stage_conversation_payload(AGENT_RECOMMENDATION_STAGE, conversation_ids, chat_ids),
    )

    try:
        recommendation_upstream = coze_client.stream_single_turn_chat(
            message=recommender_message,
            parameters=parameters,
            user_id=user_id,
            bot_id=recommender_bot_id,
            conversation_id=conversation_ids.get(RECOMMENDER_CONVERSATION_KEY),
            auto_save_history=auto_save_history,
            system_context=user_state_system_context,
        )
    except (CozeConfigurationError, CozeConnectionError, CozeUpstreamError) as exc:
        yield _error_event(exc, AGENT_RECOMMENDATION_STAGE)
        yield _workflow_event(
            "workflow.failed",
            stage=AGENT_RECOMMENDATION_STAGE,
            **_conversation_payload(conversation_ids, chat_ids),
        )
        return

    summary = ""
    recommendation_thinking_process = ""

    for event in iter_tagged_events(
        recommendation_upstream,
        section_tags=RECOMMENDER_TAGS,
        section_stream_emitters={"RECOMMENDED_AGENTS": RecommendedAgentsStreamEmitter},
    ):
        conversation_update = _conversation_update_event(event, AGENT_RECOMMENDATION_STAGE, conversation_ids, chat_ids)

        if conversation_update:
            yield conversation_update

        if event.get("event") == "content.delta":
            if event.get("type") == "SUMMARY":
                summary += event.get("content", "")
            elif event.get("type") == "THINKING_PROCESS":
                recommendation_thinking_process += event.get("content", "")

        if event.get("event") in COMPLETION_EVENTS:
            continue

        yield format_sse_event(_with_stage(event, AGENT_RECOMMENDATION_STAGE))

    yield _stage_event(
        "workflow.stage.completed",
        AGENT_RECOMMENDATION_STAGE,
        summary=summary.strip(),
        thinking_process=recommendation_thinking_process.strip(),
        **_stage_conversation_payload(AGENT_RECOMMENDATION_STAGE, conversation_ids, chat_ids),
    )
    yield _workflow_event("chat.completed", status="completed", **_conversation_payload(conversation_ids, chat_ids))
    yield _workflow_event("workflow.completed", status="completed", **_conversation_payload(conversation_ids, chat_ids))


def build_recommender_message(selected_route, agent_names, original_message, user_state=None, lineup_context=None):
    route = selected_route or "未识别到明确路线"
    available_agents = _format_agent_names(agent_names)
    user_state_text = _format_user_state_for_message(user_state)
    lineup_context_text = _format_lineup_context_for_message(lineup_context)

    parts = [f"已选择的路线：{route}"]

    if available_agents:
        parts.append(f"可用智能体合集：{available_agents}")

    if user_state_text:
        parts.append(f"当前用户状态：\n{user_state_text}")

    if lineup_context_text:
        parts.append(lineup_context_text)

    parts.append(
        "阵容输出要求：每个 <AGENT> 必须按 RANK、AGENT_NAME、LINEUP、STAGE、REASON 输出；"
        "LINEUP 只能是 core、growth、conversion。"
    )
    parts.append(f"可能包含业务需求、学习目标或任务描述：{original_message}")

    return "\n".join(parts)


def build_unified_orchestration_message(
    original_message,
    agent_names,
    user_state=None,
    lineup_context=None,
    state_edit_mode="general",
):
    available_agents = _format_agent_names(agent_names)
    user_state_text = _format_user_state_for_message(user_state)
    lineup_context_text = _format_lineup_context_for_message(lineup_context)
    parts = [
        "请根据系统提示词判断本轮属于 A、B、C 哪一种，并严格按对应 XML 结构输出。",
        "KG_PATH 必须输出 6-10 个节点，节点之间只用半角连字符连接。",
        "RECOMMENDED_AGENTS 中只能推荐可用智能体集合里的原始名称，不能改名、不能新增；默认推荐 3-5 个，复杂需求最多 6 个。",
        "RECOMMENDED_AGENTS 中每个 AGENT 字段顺序必须是 RANK、AGENT_NAME、LINEUP、STAGE、REASON；LINEUP 只能输出 core、growth、conversion。",
        "只要输出 RECOMMENDED_AGENTS，就必须继续输出 SUMMARY。",
        f"用户原始需求：{original_message}",
    ]

    if state_edit_mode == "path_only":
        parts.append("本轮模式提示：B1，只修改知识路径。不要输出 RECOMMENDED_AGENTS 或 SUMMARY。")
    elif state_edit_mode == "agents_only":
        parts.append("本轮模式提示：B2，只修改智能体组合。KG_PATH 沿用当前知识路径，推荐后输出 SUMMARY。")
    elif state_edit_mode == "both":
        parts.append("本轮模式提示：用户同时要求修改知识路径和智能体组合，按完整结构输出。")
    else:
        parts.append("本轮模式提示：如果这是业务、学习或经营需求，按 C 完整输出 THINKING_PROCESS、ACK、KG_PATH、EXPLANATION、RECOMMENDED_AGENTS、SUMMARY；EXPLANATION 控制在 40-80 字。")

    if available_agents:
        parts.append(f"可用智能体集合：{available_agents}")

    if user_state_text:
        parts.append(f"当前用户状态：\n{user_state_text}")

    if lineup_context_text:
        parts.append(lineup_context_text)

    return "\n".join(parts)


def build_user_state_system_context(user_state, lineup_context=None):
    state = _normalize_user_state(user_state)

    if not state and not lineup_context:
        return ""

    lines = [
        "# 当前用户状态（前端实时传入）",
        "这部分是用户上一轮已经形成的知识路径和智能体组合，是本轮对话必须参考的状态，不是新的用户需求。",
    ]

    if state.get("knowledge_path"):
        lines.append(f"- 当前知识路径：{state['knowledge_path']}")

    if state.get("knowledge_path_nodes"):
        lines.append(f"- 当前路径节点：{' -> '.join(state['knowledge_path_nodes'])}")

    if state.get("recommended_agents"):
        lines.append("- 当前已推荐智能体组合：")
        for agent in state["recommended_agents"]:
            label = agent.get("agent_name") or agent.get("name") or "未命名智能体"
            stage = agent.get("stage") or "未标注阶段"
            reason = agent.get("reason") or "未提供理由"
            rank = agent.get("rank") or ""
            lineup = _lineup_label(agent.get("lineup"))
            prefix = f"  {rank}. " if rank else "  - "
            lineup_text = f"｜{lineup}" if lineup else ""
            lines.append(f"{prefix}{label}{lineup_text}｜{stage}｜{reason}")

    if state.get("lineups"):
        lines.extend(_format_lineup_state_lines(state["lineups"], prefix="- 当前"))

    if state.get("recommendation_summary"):
        lines.append(f"- 当前组合总结：{state['recommendation_summary']}")

    lineup_context_text = _format_lineup_context_for_message(lineup_context)

    if lineup_context_text:
        lines.extend(["", lineup_context_text])

    lines.extend(
        [
            "",
            "# 状态修改规则",
            "1. 当用户要求修改、调整、替换、增加或删除知识路径时，在 <KG_PATH> 输出修改后的完整路径，不输出补丁或局部片段。",
            "2. 当用户要求修改、调整、替换、增加或删除智能体组合时，在 <RECOMMENDED_AGENTS> 输出修改后的完整组合，并保持 AGENT_NAME 来自可用智能体集合。",
            "3. 当前状态已存在时，单项修改必须只改用户明确点名的对象，不能自动联动修改另一项。",
            "4. 用户只改知识路径时，只输出 THINKING_PROCESS、ACK、KG_PATH，禁止输出 RECOMMENDED_AGENTS 和 SUMMARY；除非用户明确要求说明，否则不要输出 EXPLANATION。",
            "5. 用户只改智能体组合时，KG_PATH 必须原样沿用当前知识路径，即使新组合看起来会影响路径，也不能自行重规划；除非用户明确要求说明，否则不要输出 EXPLANATION。",
            "6. 只有用户明确同时要求修改路径和智能体组合时，才可以同时更新 KG_PATH 与 RECOMMENDED_AGENTS。",
            "7. 如果当前状态为空、没有可沿用的知识路径，或用户提出新的完整需求，就按完整流程正常规划路径和推荐组合。",
            "8. 凡输出 RECOMMENDED_AGENTS，都必须继续输出 SUMMARY。",
            "9. 凡输出 RECOMMENDED_AGENTS，每个 AGENT 都必须包含 LINEUP，字段顺序为 RANK、AGENT_NAME、LINEUP、STAGE、REASON。",
        ]
    )

    return "\n".join(lines)


def _format_user_state_for_message(user_state):
    state = _normalize_user_state(user_state)
    parts = []

    if state.get("knowledge_path"):
        parts.append(f"知识路径：{state['knowledge_path']}")

    if state.get("knowledge_path_nodes"):
        parts.append(f"路径节点：{' -> '.join(state['knowledge_path_nodes'])}")

    if state.get("recommended_agents"):
        agent_lines = []
        for agent in state["recommended_agents"]:
            label = agent.get("agent_name") or agent.get("name") or "未命名智能体"
            stage = agent.get("stage") or "未标注阶段"
            reason = agent.get("reason") or "未提供理由"
            rank = agent.get("rank") or ""
            lineup = _lineup_label(agent.get("lineup"))
            prefix = f"{rank}. " if rank else "- "
            lineup_text = f"｜{lineup}" if lineup else ""
            agent_lines.append(f"{prefix}{label}{lineup_text}｜{stage}｜{reason}")
        parts.append("已推荐智能体组合：\n" + "\n".join(agent_lines))

    if state.get("lineups"):
        parts.append("当前阵容分组：\n" + "\n".join(_format_lineup_state_lines(state["lineups"])))

    if state.get("recommendation_summary"):
        parts.append(f"组合总结：{state['recommendation_summary']}")

    return "\n".join(parts)


def _normalize_user_state(user_state):
    if not isinstance(user_state, dict):
        return {}

    knowledge_path = _limit_text(
        _first_present_string(
            user_state,
            "knowledge_path",
            "knowledgePath",
            "current_knowledge_path",
            "currentKnowledgePath",
            "current_path",
            "currentPath",
        ),
        MAX_USER_STATE_TEXT_LENGTH,
    )
    raw_nodes = _first_present_value(user_state, "knowledge_path_nodes", "knowledgePathNodes", "path_nodes", "pathNodes")
    knowledge_path_nodes = _normalize_string_list(raw_nodes)

    if not knowledge_path_nodes and knowledge_path:
        knowledge_path_nodes = _split_route_nodes(knowledge_path)

    raw_agents = _first_present_value(
        user_state,
        "recommended_agents",
        "recommendedAgents",
        "agent_combination",
        "agentCombination",
        "agents",
    )
    recommended_agents = _normalize_state_agents(raw_agents)
    raw_lineups = _first_present_value(
        user_state,
        "lineups",
        "lineup_state",
        "lineupState",
        "agent_lineups",
        "agentLineups",
    )
    lineups = _normalize_lineups(raw_lineups)

    if not lineups and recommended_agents:
        lineups = _build_lineups_from_agents(recommended_agents)

    if lineups and not recommended_agents:
        recommended_agents = _flatten_lineups_to_agents(lineups)

    recommendation_summary = _limit_text(
        _first_present_string(
            user_state,
            "recommendation_summary",
            "recommendationSummary",
            "summary",
            "agent_summary",
            "agentSummary",
        ),
        MAX_USER_STATE_SUMMARY_LENGTH,
    )
    normalized = {}

    if knowledge_path:
        normalized["knowledge_path"] = knowledge_path

    if knowledge_path_nodes:
        normalized["knowledge_path_nodes"] = knowledge_path_nodes

    if recommended_agents:
        normalized["recommended_agents"] = recommended_agents

    if lineups:
        normalized["lineups"] = lineups

    if recommendation_summary:
        normalized["recommendation_summary"] = recommendation_summary

    return normalized


def _detect_state_edit_mode(message, user_state):
    if not user_state:
        return "general"

    text = _normalize_optional_string(message).lower()

    if not text:
        return "general"

    edit_signal = any(
        keyword in text
        for keyword in (
            "改",
            "修改",
            "调整",
            "更新",
            "替换",
            "换成",
            "换掉",
            "增加",
            "新增",
            "删除",
            "删掉",
            "去掉",
            "不要",
            "保留",
            "重配",
            "重新搭配",
            "重规划",
        )
    )

    if not edit_signal:
        return "general"

    has_path_state = bool(user_state.get("knowledge_path") or user_state.get("knowledge_path_nodes"))
    has_agent_state = bool(user_state.get("recommended_agents") or user_state.get("lineups"))
    path_signal = has_path_state and any(
        keyword in text for keyword in ("知识路径", "图谱路径", "路径", "图谱", "节点", "路线", "kg_path")
    )
    agent_signal = has_agent_state and any(
        keyword in text for keyword in ("智能体", "组合", "推荐", "agent", "助手", "工具", "阵容", "lineup", "主力", "增长", "成交")
    )

    if path_signal and agent_signal:
        return "both"

    if path_signal:
        return "path_only"

    if agent_signal:
        return "agents_only"

    if has_path_state and not agent_signal:
        return "path_only"

    return "general"


def _normalize_state_agents(raw_agents):
    if not isinstance(raw_agents, list):
        return []

    normalized_agents = []

    for index, raw_agent in enumerate(raw_agents[:MAX_USER_STATE_AGENTS], start=1):
        if not isinstance(raw_agent, dict):
            continue

        agent_name = _limit_text(
            _first_present_string(raw_agent, "agent_name", "agentName", "name", "AGENT_NAME"),
            120,
        )
        name = _limit_text(_first_present_string(raw_agent, "name"), 120)
        stage = _limit_text(_first_present_string(raw_agent, "stage", "STAGE"), 160)
        reason = _limit_text(_first_present_string(raw_agent, "reason", "REASON"), MAX_USER_STATE_TEXT_LENGTH)
        rank = _first_present_string(raw_agent, "rank", "RANK") or str(index)
        lineup = _normalize_lineup_id(
            _first_present_string(raw_agent, "lineup", "lineup_id", "lineupId", "LINEUP", "阵容")
        )

        if not agent_name and not name:
            continue

        normalized_agent = {"rank": _limit_text(rank, 40)}

        if agent_name:
            normalized_agent["agent_name"] = agent_name

        if name and name != agent_name:
            normalized_agent["name"] = name

        if stage:
            normalized_agent["stage"] = stage

        if reason:
            normalized_agent["reason"] = reason

        if lineup:
            normalized_agent["lineup"] = lineup

        normalized_agents.append(normalized_agent)

    return normalized_agents


def _normalize_lineups(raw_lineups):
    if not isinstance(raw_lineups, dict):
        return {}

    normalized = {lineup_id: [] for lineup_id in LINEUP_IDS}

    for raw_key, raw_agents in raw_lineups.items():
        lineup_id = _normalize_lineup_id(raw_key)

        if not lineup_id:
            continue

        normalized[lineup_id] = _normalize_lineup_agents(raw_agents, lineup_id)

    return {lineup_id: agents for lineup_id, agents in normalized.items() if agents}


def _normalize_lineup_agents(raw_agents, lineup_id):
    if not isinstance(raw_agents, list):
        return []

    normalized_agents = []

    for index, raw_agent in enumerate(raw_agents[:MAX_USER_STATE_AGENTS], start=1):
        if isinstance(raw_agent, dict):
            agent_name = _limit_text(
                _first_present_string(raw_agent, "agent_name", "agentName", "name", "AGENT_NAME", "key"),
                120,
            )
            name = _limit_text(_first_present_string(raw_agent, "name"), 120)
            stage = _limit_text(_first_present_string(raw_agent, "stage", "STAGE"), 160)
            reason = _limit_text(_first_present_string(raw_agent, "reason", "REASON"), MAX_USER_STATE_TEXT_LENGTH)
            rank = _first_present_string(raw_agent, "rank", "RANK") or str(index)
        else:
            agent_name = _limit_text(raw_agent, 120)
            name = ""
            stage = ""
            reason = ""
            rank = str(index)

        if not agent_name and not name:
            continue

        normalized_agent = {
            "lineup": lineup_id,
            "rank": _limit_text(rank, 40),
        }

        if agent_name:
            normalized_agent["agent_name"] = agent_name

        if name and name != agent_name:
            normalized_agent["name"] = name

        if stage:
            normalized_agent["stage"] = stage

        if reason:
            normalized_agent["reason"] = reason

        normalized_agents.append(normalized_agent)

    return normalized_agents


def _build_lineups_from_agents(agents):
    lineups = {lineup_id: [] for lineup_id in LINEUP_IDS}

    for index, agent in enumerate(agents):
        lineup_id = _normalize_lineup_id(agent.get("lineup")) or ("core" if index < 3 else "growth")
        lineups[lineup_id].append({**agent, "lineup": lineup_id})

    return {lineup_id: agents for lineup_id, agents in lineups.items() if agents}


def _flatten_lineups_to_agents(lineups):
    agents = []

    for lineup_id in LINEUP_IDS:
        for agent in lineups.get(lineup_id, []):
            agents.append({**agent, "lineup": lineup_id})

    return agents[:MAX_USER_STATE_AGENTS]


def _normalize_lineup_context(lineup_context, user_state, message=None):
    raw_context = lineup_context if isinstance(lineup_context, dict) else {}
    state = _normalize_user_state(user_state)
    raw_lineups = _first_present_value(
        raw_context,
        "lineups",
        "lineup_state",
        "lineupState",
        "agent_lineups",
        "agentLineups",
    )
    context_lineups = _normalize_lineups(raw_lineups)

    if not context_lineups:
        context_lineups = _normalize_lineups(raw_context)

    requested_lineup = _normalize_lineup_id(
        _first_present_string(
            raw_context,
            "requested_lineup",
            "requestedLineup",
            "target_lineup",
            "targetLineup",
            "lineup",
        )
    )
    requested_lineup = requested_lineup or _detect_requested_lineup(message)

    normalized = {
        "available_lineups": [{"id": lineup_id, "label": LINEUP_LABELS[lineup_id]} for lineup_id in LINEUP_IDS],
        "lineups": context_lineups or state.get("lineups", {}),
    }

    if requested_lineup:
        normalized["requested_lineup"] = requested_lineup

    return normalized


def _format_lineup_context_for_message(lineup_context):
    if not isinstance(lineup_context, dict):
        return ""

    lines = [
        "阵容参数：",
        "- 可用阵容：core=主力阵容；growth=增长阵容；conversion=成交阵容。",
    ]
    requested_lineup = _normalize_lineup_id(lineup_context.get("requested_lineup"))

    if requested_lineup:
        lines.append(f"- 本轮目标阵容：{LINEUP_LABELS[requested_lineup]}（{requested_lineup}）。")

    lineups = _normalize_lineups(lineup_context.get("lineups"))

    if lineups:
        lines.extend(_format_lineup_state_lines(lineups, prefix="- 当前"))

    lines.append("- 推荐智能体时，每个 <AGENT> 必须包含 <LINEUP>core|growth|conversion</LINEUP>，并放在 <AGENT_NAME> 之后。")
    lines.append("- 如果用户指定某个阵容，只推荐并标记到该阵容；不要把结果混入其他阵容。")

    return "\n".join(lines)


def _format_lineup_state_lines(lineups, prefix=""):
    if not isinstance(lineups, dict):
        return []

    lines = []

    for lineup_id in LINEUP_IDS:
        agents = lineups.get(lineup_id) or []
        names = [
            agent.get("agent_name") or agent.get("name")
            for agent in agents
            if isinstance(agent, dict) and (agent.get("agent_name") or agent.get("name"))
        ]
        names_text = "、".join(names[:MAX_USER_STATE_AGENTS]) if names else "空"
        lines.append(f"{prefix}{LINEUP_LABELS[lineup_id]}：{names_text}")

    return lines


def _lineup_label(lineup_id):
    normalized = _normalize_lineup_id(lineup_id)
    return LINEUP_LABELS.get(normalized, "")


def _normalize_lineup_id(value):
    text = _normalize_optional_string(value)

    if not text:
        return ""

    compact = "".join(text.lower().split()).strip("：:")

    if compact in LINEUP_ALIASES:
        return LINEUP_ALIASES[compact]

    for keyword, lineup_id in LINEUP_ALIASES.items():
        if keyword and keyword in compact:
            return lineup_id

    return ""


def _detect_requested_lineup(message):
    text = _normalize_optional_string(message).lower()

    if not text:
        return ""

    for lineup_id, keywords in LINEUP_INTENT_KEYWORDS:
        if any(keyword.lower() in text for keyword in keywords):
            return lineup_id

    return ""


def _first_present_value(payload, *keys):
    for key in keys:
        if key in payload and payload[key] is not None:
            return payload[key]

    return None


def _first_present_string(payload, *keys):
    value = _first_present_value(payload, *keys)
    return _normalize_optional_string(value)


def _normalize_string_list(value):
    if not isinstance(value, list):
        return []

    return [_limit_text(item, 160) for item in value if _normalize_optional_string(item)][:10]


def _split_route_nodes(route):
    return [
        _limit_text(part, 160)
        for part in re.split(r"\s*(?:->|>|›|→|—|–|-|/|、|，|,)\s*", str(route or ""))
        if _normalize_optional_string(part)
    ][:10]


def _limit_text(value, max_length):
    text = _normalize_optional_string(value)

    if len(text) <= max_length:
        return text

    return f"{text[:max_length].rstrip()}..."


def _is_unified_workflow_mode(workflow_mode):
    return str(workflow_mode or "").strip().lower() in {"unified", "single", "single_turn"}


def _is_recommendation_event(event):
    event_name = str(event.get("event", ""))
    event_type = event.get("type")

    return event_type in RECOMMENDATION_SECTION_TYPES or event_name.startswith("recommended_")


def _fixed_text_section_events(section_type, text, stage):
    yield format_sse_event(_with_stage(content_event("content.started", {"type": section_type}), stage))
    yield format_sse_event(
        _with_stage(
            content_event(
                "content.delta",
                {
                    "type": section_type,
                    "content_type": "text",
                    "content": text,
                },
            ),
            stage,
        )
    )
    yield format_sse_event(_with_stage(content_event("content.completed", {"type": section_type}), stage))


def _mirror_unified_recommendation_conversation(conversation_ids, chat_ids):
    route_conversation_id = (conversation_ids or {}).get(ROUTE_PLANNER_CONVERSATION_KEY)
    route_chat_id = (chat_ids or {}).get(ROUTE_PLANNER_CONVERSATION_KEY)

    if route_conversation_id and not conversation_ids.get(RECOMMENDER_CONVERSATION_KEY):
        conversation_ids[RECOMMENDER_CONVERSATION_KEY] = route_conversation_id

    if route_chat_id and not chat_ids.get(RECOMMENDER_CONVERSATION_KEY):
        chat_ids[RECOMMENDER_CONVERSATION_KEY] = route_chat_id


def _with_stage(event, stage):
    return {
        **event,
        "stage": stage,
    }


def _stage_event(event_name, stage, **payload):
    return format_sse_event(
        content_event(
            event_name,
            {
                "stage": stage,
                **payload,
            },
        )
    )


def _workflow_event(event_name, **payload):
    return format_sse_event(content_event(event_name, payload))


def _error_event(exc, stage):
    payload = {
        "error": str(exc),
    }

    if isinstance(exc, CozeUpstreamError):
        payload["status_code"] = exc.status_code
        payload["detail"] = exc.detail
    elif isinstance(exc, CozeConnectionError):
        payload["error"] = "Failed to connect to chat provider"
        payload["detail"] = str(exc)

    return _stage_event("workflow.error", stage, **payload)


def _conversation_update_event(event, stage, conversation_ids, chat_ids):
    conversation_key = STAGE_CONVERSATION_KEYS.get(stage)

    if not conversation_key:
        return None

    changed = False
    conversation_id = _normalize_optional_string(event.get("conversation_id"))
    chat_id = _extract_chat_id(event)

    if conversation_id and conversation_ids.get(conversation_key) != conversation_id:
        conversation_ids[conversation_key] = conversation_id
        changed = True

    if chat_id and chat_ids.get(conversation_key) != chat_id:
        chat_ids[conversation_key] = chat_id
        changed = True

    if not changed:
        return None

    return _stage_event(
        "conversation.updated",
        stage,
        **_stage_conversation_payload(stage, conversation_ids, chat_ids),
    )


def _conversation_payload(conversation_ids, chat_ids=None):
    payload = {
        "conversation_ids": dict(conversation_ids or {}),
        "master_conversation_id": (conversation_ids or {}).get(ROUTE_PLANNER_CONVERSATION_KEY),
    }

    if chat_ids is not None:
        payload["chat_ids"] = dict(chat_ids or {})

    return payload


def _stage_conversation_payload(stage, conversation_ids, chat_ids=None):
    conversation_key = STAGE_CONVERSATION_KEYS.get(stage)
    payload = _conversation_payload(conversation_ids, chat_ids)
    payload["conversation_key"] = conversation_key
    payload["conversation_id"] = (conversation_ids or {}).get(conversation_key)

    if chat_ids is not None:
        payload["chat_id"] = (chat_ids or {}).get(conversation_key)

    return payload


def _extract_chat_id(event):
    chat_id = _normalize_optional_string(event.get("chat_id"))

    if chat_id:
        return chat_id

    if str(event.get("event", "")).startswith("chat."):
        return _normalize_optional_string(event.get("id"))

    return ""


def _normalize_conversation_ids(conversation_ids):
    if not isinstance(conversation_ids, dict):
        return {}

    key_aliases = {
        "route_planner": ROUTE_PLANNER_CONVERSATION_KEY,
        "control": ROUTE_PLANNER_CONVERSATION_KEY,
        "master": ROUTE_PLANNER_CONVERSATION_KEY,
        "knowledge_graph": ROUTE_PLANNER_CONVERSATION_KEY,
        "agent_recommendation": RECOMMENDER_CONVERSATION_KEY,
        "recommendation": RECOMMENDER_CONVERSATION_KEY,
        "recommender": RECOMMENDER_CONVERSATION_KEY,
    }
    normalized = {}

    for key, value in conversation_ids.items():
        conversation_key = key_aliases.get(str(key).strip())
        conversation_id = _normalize_optional_string(value)

        if conversation_key and conversation_id:
            normalized[conversation_key] = conversation_id

    return normalized


def _normalize_optional_string(value):
    if value is None:
        return ""

    return str(value).strip()


def _normalize_agent_names(agent_names):
    if not isinstance(agent_names, list):
        return ()

    return tuple(str(name).strip() for name in agent_names if str(name).strip())


def _format_agent_names(agent_names):
    names = [str(name).strip() for name in agent_names or [] if str(name).strip()]

    if not names:
        return ""

    return f"[{','.join(names)}]"
