from flask import Blueprint, Response, jsonify, request, stream_with_context

from services.coze_client import (
    CozeClient,
    CozeConfigurationError,
    CozeConnectionError,
    CozeUpstreamError,
    iter_stream_chunks,
)


coze_bp = Blueprint("coze", __name__)
coze_client = CozeClient()


@coze_bp.post("/chat/stream")
def stream_chat():
    data = request.get_json(silent=True) or {}
    message = data.get("message") or data.get("content")

    if not isinstance(message, str) or not message.strip():
        return jsonify({"error": "message is required"}), 400

    try:
        upstream = coze_client.stream_single_turn_chat(
            message=message,
            parameters=_get_parameters(data),
            user_id=data.get("user_id"),
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
        stream_with_context(iter_stream_chunks(upstream)),
        content_type=upstream.headers.get("Content-Type", "text/event-stream"),
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


def _get_parameters(data):
    parameters = data.get("parameters")
    return parameters if isinstance(parameters, dict) else {}
