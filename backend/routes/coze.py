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
        )
    except CozeConfigurationError as exc:
        return jsonify({"error": str(exc)}), 500
    except CozeConnectionError as exc:
        return jsonify({"error": "Failed to connect to Coze", "detail": str(exc)}), 502
    except CozeUpstreamError as exc:
        return (
            jsonify(
                {
                    "error": "Coze request failed",
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
