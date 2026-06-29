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
        )
    except CozeConfigurationError as exc:
        return jsonify({"error": str(exc)}), 500
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

    return Response(
        stream_with_context(_guard_stream_errors(stream)),
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


def _get_auto_save_history(data):
    value = data.get("auto_save_history")

    if value is None:
        return True

    if isinstance(value, bool):
        return value

    if isinstance(value, str):
        return value.strip().lower() not in {"0", "false", "no", "off"}

    return bool(value)


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
