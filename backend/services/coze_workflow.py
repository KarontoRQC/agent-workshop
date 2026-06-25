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
from services.graph_path_resolver import GraphPathResolver
from services.recommended_agents_stream import RecommendedAgentsStreamEmitter


KNOWLEDGE_GRAPH_STAGE = "knowledge_graph"
AGENT_RECOMMENDATION_STAGE = "agent_recommendation"
DIRECT_REPLY_TYPE = "DIRECT_REPLY"
graph_path_resolver = GraphPathResolver()


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
    direct_reply_parts = []

    yield _workflow_event("workflow.started")
    yield _stage_event("workflow.stage.started", KNOWLEDGE_GRAPH_STAGE)

    for event in iter_tagged_events(
        route_upstream,
        section_tags=ROUTE_PLANNER_TAGS,
        untagged_type=DIRECT_REPLY_TYPE,
    ):
        if event.get("event") == "content.delta":
            if event.get("type") == DIRECT_REPLY_TYPE:
                direct_reply_parts.append(event.get("content", ""))
                yield format_sse_event(_with_stage(event, KNOWLEDGE_GRAPH_STAGE))
                continue

            route_sections[event.get("type")] += event.get("content", "")

        if event.get("event") in {"chat.completed", "message.completed", "done"}:
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
        )
        yield _workflow_event("chat.completed", status="completed", route_matched=False)
        yield _workflow_event("workflow.completed", status="completed", route_matched=False)
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
    recommendation_thinking_process = ""

    for event in iter_tagged_events(
        recommendation_upstream,
        section_tags=RECOMMENDER_TAGS,
        section_stream_emitters={"RECOMMENDED_AGENTS": RecommendedAgentsStreamEmitter},
    ):
        if event.get("event") == "content.delta":
            if event.get("type") == "SUMMARY":
                summary += event.get("content", "")
            elif event.get("type") == "THINKING_PROCESS":
                recommendation_thinking_process += event.get("content", "")

        if event.get("event") in {"chat.completed", "message.completed", "done"}:
            continue

        yield format_sse_event(_with_stage(event, AGENT_RECOMMENDATION_STAGE))

    yield _stage_event(
        "workflow.stage.completed",
        AGENT_RECOMMENDATION_STAGE,
        summary=summary.strip(),
        thinking_process=recommendation_thinking_process.strip(),
    )
    yield _workflow_event("chat.completed", status="completed")
    yield _workflow_event("workflow.completed", status="completed")


def build_recommender_message(selected_route, agent_names, original_message):
    route = selected_route or "未识别到明确路线"

    return "\n".join(
        [
            f"已选择的路线：{route}",
            f"可能包含业务需求、学习目标或任务描述：{original_message}",
        ]
    )


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
