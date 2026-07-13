import os
import time
import uuid

from flask import Blueprint, Response, current_app, jsonify, request, stream_with_context

from services.coze_client import (
    CozeClient,
    CozeConfigurationError,
    CozeConnectionError,
    CozeUpstreamError,
)
from services.coze_stream_transformer import content_event, format_sse_event
from services.coze_workflow import start_chat_workflow_stream
from services.participant_identity import normalize_participant_identity
from services.recommendation_snapshot_stream import persist_recommendation_snapshot_stream
from routes.access_control import get_active_security_settings, require_api_session
from services.api_access import create_recommendation_edit_token


coze_bp = Blueprint("coze", __name__)
coze_client = CozeClient()
DISABLED_FALLBACK_VALUES = {"0", "false", "no", "off", "none", "disabled"}


@coze_bp.post("/chat/stream")
def stream_chat():
    access_error = require_api_session()

    if access_error is not None:
        return access_error

    request_started_at = time.perf_counter()
    request_id = request.headers.get("X-Request-ID", "").strip() or f"chat-{uuid.uuid4().hex[:16]}"
    data = request.get_json(silent=True) or {}
    message = data.get("message") or data.get("content")
    participant_identity = _get_participant_identity(data)

    if not isinstance(message, str) or not message.strip():
        return jsonify({"error": "message is required"}), 400

    security_settings = get_active_security_settings()
    message = message.strip()

    if len(message) > security_settings.chat_message_max_chars:
        return (
            jsonify(
                {
                    "error": "message is too long",
                    "max_chars": security_settings.chat_message_max_chars,
                }
            ),
            413,
        )

    try:
        stream = start_chat_workflow_stream(
            coze_client=coze_client,
            message=message,
            parameters=_get_parameters(data),
            user_id=data.get("user_id"),
            agent_names=data.get("agent_names"),
            conversation_ids=_get_conversation_ids(data),
            auto_save_history=_get_auto_save_history(data),
            bounded_history=_uses_bounded_recent_history(data),
            recent_dialogue=_get_recent_dialogue(data),
            user_state=_get_user_state(data),
            lineup_context=_get_lineup_context(data),
            participant_identity=participant_identity,
        )
    except CozeConfigurationError as exc:
        current_app.logger.warning("Chat provider configuration is unavailable: %s", exc)
        if _chat_config_fallback_enabled():
            stream = _local_configuration_fallback_stream(message=message)
        else:
            return jsonify({"error": "Chat provider is not configured"}), 503

    except CozeConnectionError as exc:
        current_app.logger.warning("Chat provider connection failed: %s", exc)
        return jsonify({"error": "Failed to connect to chat provider"}), 502
    except CozeUpstreamError as exc:
        current_app.logger.warning("Chat provider returned HTTP %s", exc.status_code)
        return (
            jsonify(
                {
                    "error": "Chat provider request failed",
                    "status_code": exc.status_code,
                }
            ),
            exc.status_code,
        )

    try:
        stream = _attach_recommendation_snapshot(stream, message)
    except Exception:
        current_app.logger.exception("Recommendation snapshot store unavailable")
        return jsonify({"error": "recommendation snapshot store unavailable"}), 503

    setup_ms = (time.perf_counter() - request_started_at) * 1000
    current_app.logger.info(
        "chat_stream_ready request_id=%s participant_identity=%s setup_ms=%.1f",
        request_id,
        participant_identity,
        setup_ms,
    )
    observed_stream = _observe_stream(
        _guard_stream_errors(stream),
        request_id=request_id,
        request_started_at=request_started_at,
    )
    return _sse_response(observed_stream, request_id=request_id, setup_ms=setup_ms)


def _sse_response(stream, request_id="", setup_ms=0):
    return Response(
        stream_with_context(stream),
        content_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Request-ID": request_id,
            "Server-Timing": f"setup;dur={setup_ms:.1f}",
        },
    )


def _observe_stream(stream, request_id, request_started_at):
    first_event_logged = False
    first_content_logged = False
    completed = False

    try:
        for chunk in stream:
            elapsed_ms = (time.perf_counter() - request_started_at) * 1000

            if not first_event_logged:
                first_event_logged = True
                current_app.logger.info(
                    "chat_stream_first_event request_id=%s duration_ms=%.1f",
                    request_id,
                    elapsed_ms,
                )

            if not first_content_logged and _is_content_delta_chunk(chunk):
                first_content_logged = True
                current_app.logger.info(
                    "chat_stream_first_content request_id=%s duration_ms=%.1f",
                    request_id,
                    elapsed_ms,
                )

            if _is_workflow_terminal_chunk(chunk):
                completed = True

            yield chunk
    finally:
        current_app.logger.info(
            "chat_stream_closed request_id=%s completed=%s duration_ms=%.1f",
            request_id,
            completed,
            (time.perf_counter() - request_started_at) * 1000,
        )


def _is_content_delta_chunk(chunk):
    text = chunk.decode("utf-8", errors="replace") if isinstance(chunk, bytes) else str(chunk)
    return '"event":"content.delta"' in text and '"content":' in text


def _is_workflow_terminal_chunk(chunk):
    text = chunk.decode("utf-8", errors="replace") if isinstance(chunk, bytes) else str(chunk)
    return '"event":"workflow.completed"' in text or '"event":"workflow.failed"' in text


def _attach_recommendation_snapshot(stream, message):
    store = current_app.config["RECOMMENDATION_SNAPSHOT_STORE"]
    snapshot = store.create_snapshot(message)
    edit_token = create_recommendation_edit_token(
        get_active_security_settings().signing_secret,
        snapshot["id"],
    )
    return persist_recommendation_snapshot_stream(
        stream,
        store,
        snapshot["id"],
        recommendation_edit_token=edit_token,
    )


def _get_parameters(data):
    parameters = data.get("parameters")
    return parameters if isinstance(parameters, dict) else {}


def _get_recent_dialogue(data):
    recent_dialogue = data.get("recent_dialogue")
    return recent_dialogue if isinstance(recent_dialogue, list) else []


def _uses_bounded_recent_history(data):
    return str(data.get("history_mode") or "").strip().lower() == "bounded_recent"


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


def _local_configuration_fallback_stream(message):
    thinking_process = "当前对话服务暂时不可用，已保留页面状态并停止本轮任务。"
    ack = "这次没有成功接通智能体服务，请稍后再试；当前页面和已有内容不会受影响。"

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
    yield from _fallback_text_section("THINKING_PROCESS", thinking_process, "knowledge_graph")
    yield from _fallback_text_section("ACK", ack, "knowledge_graph")
    yield _fallback_stage_event(
        "workflow.stage.completed",
        "knowledge_graph",
        selected_route="",
        route_explanation="",
        thinking_process=thinking_process,
        direct_reply=ack,
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


def _get_participant_identity(data):
    raw_identity = _first_string(
        data.get("participant_identity"),
        data.get("participantIdentity"),
    )
    return normalize_participant_identity(raw_identity)


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
                },
            )
        )
        yield format_sse_event(content_event("workflow.failed", {"status": "failed"}))
