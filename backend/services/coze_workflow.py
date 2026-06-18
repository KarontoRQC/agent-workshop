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
    content_event,
    format_sse_event,
    iter_tagged_events,
)


KNOWLEDGE_GRAPH_STAGE = "knowledge_graph"
AGENT_RECOMMENDATION_STAGE = "agent_recommendation"


def start_chat_workflow_stream(coze_client, message, parameters=None, user_id=None, agent_names=None):
    settings = coze_client.settings_factory()
    route_planner_bot_id = settings.route_planner_bot_id
    recommender_bot_id = settings.recommender_bot_id
    selected_agent_names = _normalize_agent_names(agent_names) or settings.agent_names

    if not route_planner_bot_id:
        raise CozeConfigurationError("COZE_ROUTE_PLANNER_BOT_ID is not configured")
    if not recommender_bot_id:
        raise CozeConfigurationError("COZE_RECOMMENDER_BOT_ID is not configured")

    route_upstream = coze_client.stream_single_turn_chat(
        message=message,
        parameters=parameters,
        user_id=user_id,
        bot_id=route_planner_bot_id,
    )

    return _iter_chat_workflow_stream(
        coze_client=coze_client,
        route_upstream=route_upstream,
        original_message=message,
        parameters=parameters,
        user_id=user_id,
        recommender_bot_id=recommender_bot_id,
        agent_names=selected_agent_names,
    )


def _iter_chat_workflow_stream(
    coze_client,
    route_upstream,
    original_message,
    parameters,
    user_id,
    recommender_bot_id,
    agent_names,
):
    route_sections = defaultdict(str)

    yield _workflow_event("workflow.started")
    yield _stage_event("workflow.stage.started", KNOWLEDGE_GRAPH_STAGE)

    for event in iter_tagged_events(route_upstream, section_tags=ROUTE_PLANNER_TAGS):
        if event.get("event") == "content.delta":
            route_sections[event.get("type")] += event.get("content", "")

        if event.get("event") in {"chat.completed", "message.completed", "done"}:
            continue

        yield format_sse_event(_with_stage(event, KNOWLEDGE_GRAPH_STAGE))

    selected_route = route_sections.get("KG_PATH", "").strip()
    route_explanation = route_sections.get("EXPLANATION", "").strip()

    yield _stage_event(
        "workflow.stage.completed",
        KNOWLEDGE_GRAPH_STAGE,
        selected_route=selected_route,
        route_explanation=route_explanation,
    )

    recommender_message = build_recommender_message(
        selected_route=selected_route,
        agent_names=agent_names,
        original_message=original_message,
    )

    yield _stage_event(
        "workflow.stage.started",
        AGENT_RECOMMENDATION_STAGE,
        selected_route=selected_route,
        agent_names=list(agent_names),
    )

    try:
        recommendation_upstream = coze_client.stream_single_turn_chat(
            message=recommender_message,
            parameters=parameters,
            user_id=user_id,
            bot_id=recommender_bot_id,
        )
    except (CozeConfigurationError, CozeConnectionError, CozeUpstreamError) as exc:
        yield _error_event(exc, AGENT_RECOMMENDATION_STAGE)
        yield _workflow_event("workflow.failed", stage=AGENT_RECOMMENDATION_STAGE)
        return

    summary = ""

    for event in iter_tagged_events(
        recommendation_upstream,
        section_tags=RECOMMENDER_TAGS,
        section_emitters={"RECOMMENDED_AGENTS": emit_recommended_agents},
    ):
        if event.get("event") == "content.delta" and event.get("type") == "SUMMARY":
            summary += event.get("content", "")

        if event.get("event") in {"chat.completed", "message.completed", "done"}:
            continue

        yield format_sse_event(_with_stage(event, AGENT_RECOMMENDATION_STAGE))

    yield _stage_event(
        "workflow.stage.completed",
        AGENT_RECOMMENDATION_STAGE,
        summary=summary.strip(),
    )
    yield _workflow_event("chat.completed", status="completed")
    yield _workflow_event("workflow.completed", status="completed")


def build_recommender_message(selected_route, agent_names, original_message):
    route = selected_route or "未识别到明确路线"
    agent_collection = "、".join(agent_names)

    return "\n".join(
        [
            f"已选择的路线：{route}",
            f"该路线对应的智能体合集：{agent_collection}",
            f"可能包含业务需求、学习目标或任务描述：{original_message}",
        ]
    )


def emit_recommended_agents(content):
    agents = parse_recommended_agents(content)

    for agent in agents:
        yield content_event(
            "recommended_agents.delta",
            {
                "type": "RECOMMENDED_AGENTS",
                "content_type": "json",
                "agent": agent,
            },
        )

    yield content_event(
        "recommended_agents.completed",
        {
            "type": "RECOMMENDED_AGENTS",
            "content_type": "json",
            "agents": agents,
        },
    )


def parse_recommended_agents(content):
    agents = []

    for match in re.finditer(r"<AGENT>\s*(.*?)\s*</AGENT>", content, flags=re.DOTALL):
        block = match.group(1)
        rank = _extract_tag(block, "RANK")
        agent = {
            "rank": _parse_rank(rank),
            "agent_name": _extract_tag(block, "AGENT_NAME"),
            "stage": _extract_tag(block, "STAGE"),
            "reason": _extract_tag(block, "REASON"),
        }
        agents.append({key: value for key, value in agent.items() if value not in ("", None)})

    return agents


def _extract_tag(content, tag_name):
    match = re.search(
        rf"<{tag_name}>\s*(.*?)\s*</{tag_name}>",
        content,
        flags=re.DOTALL,
    )

    if not match:
        return ""

    return _strip_nested_tags(match.group(1)).strip()


def _strip_nested_tags(value):
    return re.sub(r"<[^>]+>", "", value)


def _parse_rank(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return value


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
        payload["error"] = "Failed to connect to Coze"
        payload["detail"] = str(exc)

    return _stage_event("workflow.error", stage, **payload)


def _normalize_agent_names(agent_names):
    if not isinstance(agent_names, list):
        return ()

    return tuple(str(name).strip() for name in agent_names if str(name).strip())
