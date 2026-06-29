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
ROUTE_PLANNER_CONVERSATION_KEY = "route_planner"
RECOMMENDER_CONVERSATION_KEY = "agent_recommendation"
COMPLETION_EVENTS = {"chat.completed", "message.completed", "done"}
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
):
    settings = coze_client.settings_factory()
    route_planner_bot_id = settings.route_planner_bot_id
    recommender_bot_id = settings.recommender_bot_id
    selected_agent_names = _normalize_agent_names(agent_names) or settings.agent_names
    selected_conversation_ids = _normalize_conversation_ids(conversation_ids)

    if not route_planner_bot_id:
        raise CozeConfigurationError("COZE_ROUTE_PLANNER_BOT_ID is not configured")
    if not recommender_bot_id:
        raise CozeConfigurationError("COZE_RECOMMENDER_BOT_ID is not configured")

    route_upstream = coze_client.stream_single_turn_chat(
        message=message,
        parameters=parameters,
        user_id=user_id,
        bot_id=route_planner_bot_id,
        conversation_id=selected_conversation_ids.get(ROUTE_PLANNER_CONVERSATION_KEY),
        auto_save_history=auto_save_history,
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
    )


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
    )

    yield _stage_event(
        "workflow.stage.started",
        AGENT_RECOMMENDATION_STAGE,
        selected_route=selected_route,
        agent_names=list(agent_names),
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


def build_recommender_message(selected_route, agent_names, original_message):
    route = selected_route or "未识别到明确路线"
    available_agents = _format_agent_names(agent_names)

    parts = [f"已选择的路线：{route}"]

    if available_agents:
        parts.append(f"可用智能体合集：{available_agents}")

    parts.append(f"可能包含业务需求、学习目标或任务描述：{original_message}")

    return "\n".join(parts)


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
