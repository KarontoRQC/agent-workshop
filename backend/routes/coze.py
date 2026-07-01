import os

from flask import Blueprint, Response, current_app, jsonify, request, stream_with_context

from services.coze_client import (
    CozeClient,
    CozeConfigurationError,
    CozeConnectionError,
    CozeUpstreamError,
)
from services.coze_stream_transformer import content_event, format_sse_event
from services.coze_workflow import start_chat_workflow_stream


coze_bp = Blueprint("coze", __name__)
coze_client = CozeClient()
DISABLED_FALLBACK_VALUES = {"0", "false", "no", "off", "none", "disabled"}


@coze_bp.post("/chat/stream")
def stream_chat():
    data = request.get_json(silent=True) or {}
    message = data.get("message") or data.get("content")

    if not isinstance(message, str) or not message.strip():
        return jsonify({"error": "message is required"}), 400

    try:
        stream = start_chat_workflow_stream(
            coze_client=coze_client,
            message=message,
            parameters=_get_parameters(data),
            user_id=data.get("user_id"),
            agent_names=data.get("agent_names"),
            conversation_ids=_get_conversation_ids(data),
            auto_save_history=_get_auto_save_history(data),
            user_state=_get_user_state(data),
            lineup_context=_get_lineup_context(data),
        )
    except CozeConfigurationError as exc:
        if _chat_config_fallback_enabled():
            return _sse_response(_local_configuration_fallback_stream(message=message, error=exc))

        return jsonify({"error": str(exc)}), 503
    except CozeConnectionError as exc:
        return jsonify({"error": "Failed to connect to chat provider", "detail": str(exc)}), 502
    except CozeUpstreamError as exc:
        return (
            jsonify(
                {
                    "error": "Chat provider request failed",
                    "status_code": exc.status_code,
                    "detail": exc.detail,
                }
            ),
            exc.status_code,
        )

    return _sse_response(_guard_stream_errors(stream))


def _sse_response(stream):
    return Response(
        stream_with_context(stream),
        content_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


def _get_parameters(data):
    parameters = data.get("parameters")
    return parameters if isinstance(parameters, dict) else {}


def _get_conversation_ids(data):
    raw_conversation_ids = data.get("conversation_ids")
    conversation_ids = raw_conversation_ids if isinstance(raw_conversation_ids, dict) else {}
    route_conversation_id = _first_string(
        data.get("route_conversation_id"),
        data.get("control_conversation_id"),
        conversation_ids.get("route_planner"),
        conversation_ids.get("control"),
        conversation_ids.get("master"),
        conversation_ids.get("knowledge_graph"),
        data.get("conversation_id"),
    )
    recommender_conversation_id = _first_string(
        data.get("recommender_conversation_id"),
        data.get("recommendation_conversation_id"),
        conversation_ids.get("agent_recommendation"),
        conversation_ids.get("recommender"),
    )
    normalized = {}

    if route_conversation_id:
        normalized["route_planner"] = route_conversation_id

    if recommender_conversation_id:
        normalized["agent_recommendation"] = recommender_conversation_id

    return normalized


def _chat_config_fallback_enabled():
    value = os.getenv("CHAT_CONFIG_FALLBACK", "local").strip().lower()
    return value not in DISABLED_FALLBACK_VALUES


def _local_configuration_fallback_stream(message, error):
    ack = "Local demo fallback is active because the chat provider is not configured."
    explanation = (
        "The interface is still usable, but real agent streaming needs LONGCAT_API_KEY "
        "or COZE_API_TOKEN in backend/.env.local. "
        f"Configuration detail: {error}"
    )

    yield format_sse_event(
        content_event(
            "workflow.started",
            {
                "conversation_ids": {},
                "master_conversation_id": None,
                "chat_ids": {},
                "fallback": "local_config",
            },
        )
    )
    yield _fallback_stage_event(
        "workflow.stage.started",
        "knowledge_graph",
        workflow_mode="local_fallback",
        original_message=str(message or ""),
    )
    yield from _fallback_text_section("ACK", ack, "knowledge_graph")
    yield from _fallback_text_section("EXPLANATION", explanation, "knowledge_graph")
    yield _fallback_stage_event(
        "workflow.stage.completed",
        "knowledge_graph",
        selected_route="",
        route_explanation=explanation,
        thinking_process="Provider configuration fallback.",
        direct_reply="",
        route_matched=False,
    )
    yield format_sse_event(content_event("chat.completed", {"status": "completed", "fallback": "local_config"}))
    yield format_sse_event(content_event("workflow.completed", {"status": "completed", "fallback": "local_config"}))


def _fallback_text_section(section_type, text, stage):
    yield format_sse_event(content_event("content.started", {"type": section_type, "stage": stage}))
    yield format_sse_event(
        content_event(
            "content.delta",
            {
                "type": section_type,
                "content_type": "text",
                "content": text,
                "stage": stage,
            },
        )
    )
    yield format_sse_event(content_event("content.completed", {"type": section_type, "stage": stage}))


def _fallback_stage_event(event_name, stage, **payload):
    return format_sse_event(content_event(event_name, {"stage": stage, **payload}))


def _get_auto_save_history(data):
    value = data.get("auto_save_history")

    if value is None:
        return True

    if isinstance(value, bool):
        return value

    if isinstance(value, str):
        return value.strip().lower() not in {"0", "false", "no", "off"}

    return bool(value)


def _get_user_state(data):
    user_state = data.get("user_state") or data.get("current_user_state") or data.get("current_state")
    return user_state if isinstance(user_state, dict) else {}


def _get_lineup_context(data):
    raw_context = (
        data.get("lineup_context")
        or data.get("lineupContext")
        or data.get("lineup_state")
        or data.get("lineupState")
        or data.get("lineups")
    )
    context = dict(raw_context) if isinstance(raw_context, dict) else {}
    requested_lineup = _first_string(
        data.get("requested_lineup"),
        data.get("requestedLineup"),
        data.get("target_lineup"),
        data.get("targetLineup"),
        data.get("lineup"),
    )

    if isinstance(data.get("lineups"), dict) and "lineups" not in context:
        context["lineups"] = data.get("lineups")

    if requested_lineup:
        context["requested_lineup"] = requested_lineup

    return context


def _first_string(*values):
    for value in values:
        if value is None:
            continue

        text = str(value).strip()

        if text:
            return text

    return ""


def _guard_stream_errors(stream):
    try:
        yield from stream
    except GeneratorExit:
        raise
    except Exception as exc:
        current_app.logger.exception("Unhandled Coze stream error")
        yield format_sse_event(
            content_event(
                "workflow.error",
                {
                    "error": "Backend stream failed",
                    "detail": str(exc),
                },
            )
        )
        yield format_sse_event(content_event("workflow.failed", {"status": "failed"}))
