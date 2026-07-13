import json
import logging
import os
import threading
import time
import uuid

import requests

from config import get_coze_settings


LOGGER = logging.getLogger(__name__)
LONGCAT_SERVER_CONTROLLED_PARAMETERS = {
    "max_tokens",
    "messages",
    "model",
    "stream",
    "temperature",
    "thinking",
}


class CozeConfigurationError(Exception):
    pass


class CozeConnectionError(Exception):
    pass


class CozeUpstreamError(Exception):
    def __init__(self, status_code, detail):
        super().__init__("Chat provider request failed")
        self.status_code = status_code
        self.detail = detail


class CozeClient:
    def __init__(
        self,
        settings_factory=get_coze_settings,
        post=requests.post,
        sleep=time.sleep,
        monotonic=time.monotonic,
    ):
        self.settings_factory = settings_factory
        self.post = post
        self.sleep = sleep
        self.monotonic = monotonic
        self._longcat_circuit_open_until = 0.0
        self._longcat_circuit_lock = threading.Lock()

    def stream_single_turn_chat(
        self,
        message,
        parameters=None,
        user_id=None,
        bot_id=None,
        conversation_id=None,
        auto_save_history=True,
        system_context=None,
    ):
        settings = self.settings_factory()
        selected_bot_id = bot_id or settings.bot_id
        self.validate_chat_configuration(settings=settings, bot_id=selected_bot_id)

        if settings.chat_provider == "longcat":
            return self._stream_longcat_chat(
                settings=settings,
                message=message,
                parameters=parameters,
                bot_id=bot_id,
                conversation_id=conversation_id,
                auto_save_history=auto_save_history,
                system_context=system_context,
            )

        if settings.chat_provider != "coze":
            raise CozeConfigurationError(f"Unsupported CHAT_PROVIDER: {settings.chat_provider}")

        message_for_provider = _prepend_system_context(message, system_context)
        payload = self._build_single_turn_payload(
            settings=settings,
            bot_id=selected_bot_id,
            message=message_for_provider,
            parameters=parameters,
            user_id=user_id,
            auto_save_history=auto_save_history,
        )
        query_params = _build_chat_query_params(conversation_id)
        request_kwargs = {
            "headers": {
                "Authorization": f"Bearer {settings.api_token}",
                "Content-Type": "application/json",
                "Accept": "text/event-stream",
            },
            "json": payload,
            "stream": True,
            "timeout": (settings.connect_timeout, settings.read_timeout),
        }

        if query_params:
            request_kwargs["params"] = query_params

        try:
            upstream = self.post(settings.chat_url, **request_kwargs)
        except requests.RequestException as exc:
            raise CozeConnectionError(str(exc)) from exc

        if upstream.status_code >= 400:
            detail = _read_error_detail(upstream)
            upstream.close()
            raise CozeUpstreamError(upstream.status_code, detail)

        if not _is_event_stream_response(upstream):
            detail = _read_error_detail(upstream)
            upstream.close()
            raise CozeUpstreamError(502, detail)

        return upstream

    def validate_chat_configuration(self, settings=None, bot_id=None):
        settings = settings or self.settings_factory()

        if settings.chat_provider == "longcat":
            if not settings.longcat_api_key:
                raise CozeConfigurationError("LONGCAT_API_KEY is not configured")
            if not settings.longcat_model:
                raise CozeConfigurationError("LONGCAT_MODEL is not configured")
            return settings

        if settings.chat_provider != "coze":
            raise CozeConfigurationError(f"Unsupported CHAT_PROVIDER: {settings.chat_provider}")
        if not settings.api_token:
            raise CozeConfigurationError("COZE_API_TOKEN is not configured")
        if not bot_id:
            raise CozeConfigurationError("COZE_BOT_ID is not configured")

        return settings

    def _stream_longcat_chat(
        self,
        settings,
        message,
        parameters=None,
        bot_id=None,
        conversation_id=None,
        auto_save_history=True,
        system_context=None,
    ):
        selected_bot_id = bot_id or "longcat"
        selected_conversation_id = _normalize_optional_id(conversation_id) or _new_conversation_id()
        chat_id = _new_chat_id()
        system_prompt = _append_system_context(
            _read_prompt(_select_longcat_prompt_path(settings, selected_bot_id)),
            system_context,
        )
        payload = _build_longcat_payload(
            settings=settings,
            system_prompt=system_prompt,
            conversation_id=selected_conversation_id,
            message=message,
            parameters=parameters,
            include_history=auto_save_history,
        )

        request_started_at = time.perf_counter()

        upstream = self._open_longcat_stream(
            settings=settings,
            payload=payload,
            conversation_id=selected_conversation_id,
        )

        if upstream.status_code >= 400:
            detail = _read_error_detail(upstream)
            upstream.close()
            raise CozeUpstreamError(upstream.status_code, detail)

        upstream_headers_ms = (time.perf_counter() - request_started_at) * 1000
        LOGGER.info(
            "chat_provider_headers provider=longcat conversation_id=%s duration_ms=%.1f",
            selected_conversation_id,
            upstream_headers_ms,
        )

        return LongCatStreamAdapter(
            upstream=upstream,
            conversation_id=selected_conversation_id,
            chat_id=chat_id,
            bot_id=selected_bot_id,
            user_message=message,
            save_history=auto_save_history,
            request_started_at=request_started_at,
            upstream_headers_ms=upstream_headers_ms,
            sse_chunk_size=max(1, int(getattr(settings, "longcat_sse_chunk_size", 64) or 64)),
        )

    def _open_longcat_stream(self, settings, payload, conversation_id):
        self._ensure_longcat_circuit_closed(conversation_id)
        read_timeout = max(
            1.0,
            float(
                getattr(
                    settings,
                    "longcat_stream_read_timeout",
                    min(float(getattr(settings, "read_timeout", 15)), 15.0),
                )
            ),
        )
        retry_count = min(2, max(0, int(getattr(settings, "longcat_request_retries", 1) or 0)))
        retry_backoff = max(0.0, float(getattr(settings, "longcat_retry_backoff", 0.25) or 0))
        request_kwargs = {
            "headers": {
                "Authorization": f"Bearer {settings.longcat_api_key}",
                "Content-Type": "application/json",
                "Accept": "text/event-stream",
            },
            "json": payload,
            "stream": True,
            "timeout": (settings.connect_timeout, read_timeout),
        }

        for attempt in range(retry_count + 1):
            try:
                response = self.post(_longcat_chat_url(settings.longcat_base_url), **request_kwargs)

                if response.status_code == 429 or response.status_code >= 500:
                    self._open_longcat_circuit(settings, conversation_id, f"http_{response.status_code}")
                else:
                    self._reset_longcat_circuit()

                return response
            except (requests.Timeout, requests.ConnectionError) as exc:
                if attempt >= retry_count:
                    self._open_longcat_circuit(settings, conversation_id, type(exc).__name__)
                    error_kind = "timed out" if isinstance(exc, requests.Timeout) else "connection failed"
                    raise CozeConnectionError(
                        f"LongCat stream request {error_kind} after {attempt + 1} attempt(s)"
                    ) from exc

                LOGGER.warning(
                    "chat_provider_retry provider=longcat conversation_id=%s attempt=%d/%d error=%s",
                    conversation_id,
                    attempt + 1,
                    retry_count + 1,
                    type(exc).__name__,
                )
                if retry_backoff > 0:
                    self.sleep(retry_backoff * (attempt + 1))
            except requests.RequestException as exc:
                self._open_longcat_circuit(settings, conversation_id, type(exc).__name__)
                raise CozeConnectionError(str(exc)) from exc

        raise CozeConnectionError("LongCat stream request failed")

    def _ensure_longcat_circuit_closed(self, conversation_id):
        with self._longcat_circuit_lock:
            remaining = self._longcat_circuit_open_until - self.monotonic()

        if remaining <= 0:
            return

        LOGGER.warning(
            "chat_provider_circuit_open provider=longcat conversation_id=%s remaining_ms=%.1f",
            conversation_id,
            remaining * 1000,
        )
        raise CozeConnectionError("LongCat circuit breaker is open")

    def _open_longcat_circuit(self, settings, conversation_id, reason):
        duration = max(0.0, float(getattr(settings, "longcat_circuit_breaker_seconds", 0) or 0))

        if duration <= 0:
            return

        with self._longcat_circuit_lock:
            self._longcat_circuit_open_until = max(
                self._longcat_circuit_open_until,
                self.monotonic() + duration,
            )

        LOGGER.warning(
            "chat_provider_circuit_tripped provider=longcat conversation_id=%s duration_ms=%.1f reason=%s",
            conversation_id,
            duration * 1000,
            reason,
        )

    def _reset_longcat_circuit(self):
        with self._longcat_circuit_lock:
            self._longcat_circuit_open_until = 0.0

    @staticmethod
    def _build_single_turn_payload(settings, bot_id, message, parameters=None, user_id=None, auto_save_history=True):
        return {
            "bot_id": bot_id,
            "user_id": str(user_id or settings.user_id),
            "stream": True,
            "auto_save_history": bool(auto_save_history),
            "additional_messages": [
                {
                    "content": message,
                    "content_type": "text",
                    "role": "user",
                    "type": "question",
                }
            ],
            "parameters": parameters or {},
        }


class LongCatStreamAdapter:
    def __init__(
        self,
        upstream,
        conversation_id,
        chat_id,
        bot_id,
        user_message,
        save_history=True,
        request_started_at=None,
        upstream_headers_ms=0,
        sse_chunk_size=64,
    ):
        self.upstream = upstream
        self.conversation_id = conversation_id
        self.chat_id = chat_id
        self.bot_id = bot_id
        self.user_message = user_message
        self.save_history = save_history
        self.request_started_at = request_started_at or time.perf_counter()
        self.upstream_headers_ms = upstream_headers_ms
        self.sse_chunk_size = max(1, int(sse_chunk_size or 64))
        self.closed = False

    def iter_lines(self, decode_unicode=False):
        assistant_parts = []
        completed = False
        first_frame_logged = False
        first_content_logged = False

        try:
            yield self._line(
                "event: conversation.chat.created",
                decode_unicode=decode_unicode,
            )
            yield self._line(
                f"data: {json_dumps(self._chat_payload('created'))}",
                decode_unicode=decode_unicode,
            )
            yield self._line("", decode_unicode=decode_unicode)

            for _, data in _iter_sse_frames(self.upstream, chunk_size=self.sse_chunk_size):
                if not first_frame_logged:
                    first_frame_logged = True
                    LOGGER.info(
                        "chat_provider_first_frame provider=longcat conversation_id=%s duration_ms=%.1f",
                        self.conversation_id,
                        (time.perf_counter() - self.request_started_at) * 1000,
                    )

                if data == "[DONE]":
                    completed = True
                    break

                content = _extract_longcat_delta_content(data)

                if not content:
                    continue

                if not first_content_logged:
                    first_content_logged = True
                    LOGGER.info(
                        "chat_provider_first_content provider=longcat conversation_id=%s duration_ms=%.1f",
                        self.conversation_id,
                        (time.perf_counter() - self.request_started_at) * 1000,
                    )

                assistant_parts.append(content)
                yield self._line(
                    "event: conversation.message.delta",
                    decode_unicode=decode_unicode,
                )
                yield self._line(
                    f"data: {json_dumps(self._message_payload(content=content))}",
                    decode_unicode=decode_unicode,
                )
                yield self._line("", decode_unicode=decode_unicode)

            completed = True
            if self.save_history:
                _append_longcat_history(self.conversation_id, self.user_message, "".join(assistant_parts))

            yield self._line(
                "event: conversation.message.completed",
                decode_unicode=decode_unicode,
            )
            yield self._line(
                f"data: {json_dumps(self._message_payload(content=''))}",
                decode_unicode=decode_unicode,
            )
            yield self._line("", decode_unicode=decode_unicode)
            yield self._line(
                "event: conversation.chat.completed",
                decode_unicode=decode_unicode,
            )
            yield self._line(
                f"data: {json_dumps(self._chat_payload('completed'))}",
                decode_unicode=decode_unicode,
            )
            yield self._line("", decode_unicode=decode_unicode)
            yield self._line("data: [DONE]", decode_unicode=decode_unicode)
            yield self._line("", decode_unicode=decode_unicode)
        finally:
            self.close()
            LOGGER.info(
                "chat_provider_stream_closed provider=longcat conversation_id=%s completed=%s duration_ms=%.1f",
                self.conversation_id,
                completed,
                (time.perf_counter() - self.request_started_at) * 1000,
            )

    def close(self):
        if self.closed:
            return

        self.closed = True
        self.upstream.close()

    def _chat_payload(self, status):
        return {
            "id": self.chat_id,
            "conversation_id": self.conversation_id,
            "bot_id": self.bot_id,
            "created_at": int(time.time()),
            "status": status,
        }

    def _message_payload(self, content):
        return {
            "id": f"msg-{self.chat_id}",
            "conversation_id": self.conversation_id,
            "bot_id": self.bot_id,
            "role": "assistant",
            "type": "answer",
            "content_type": "text",
            "chat_id": self.chat_id,
            "content": content,
        }

    @staticmethod
    def _line(line, decode_unicode):
        return line if decode_unicode else line.encode("utf-8")


_LONGCAT_HISTORY_LOCK = threading.Lock()
_LONGCAT_HISTORY = {}
_LONGCAT_HISTORY_LIMIT = 6
_LONGCAT_HISTORY_MAX_CHARS = 6000
_LONGCAT_HISTORY_MESSAGE_MAX_CHARS = _LONGCAT_HISTORY_MAX_CHARS // _LONGCAT_HISTORY_LIMIT


def _build_longcat_payload(settings, system_prompt, conversation_id, message, parameters=None, include_history=True):
    payload = {
        "model": settings.longcat_model,
        "stream": True,
        "messages": _build_longcat_messages(system_prompt, conversation_id, message, include_history=include_history),
        "thinking": {"type": _normalize_longcat_thinking(getattr(settings, "longcat_thinking", "disabled"))},
        "temperature": _normalize_longcat_temperature(getattr(settings, "longcat_temperature", 0.2)),
    }

    if settings.longcat_max_tokens > 0:
        payload["max_tokens"] = settings.longcat_max_tokens

    if isinstance(parameters, dict):
        for key, value in parameters.items():
            if key in LONGCAT_SERVER_CONTROLLED_PARAMETERS:
                continue
            payload[key] = value

    return payload


def _normalize_longcat_thinking(value):
    return "enabled" if str(value or "").strip().lower() == "enabled" else "disabled"


def _normalize_longcat_temperature(value):
    try:
        temperature = float(value)
    except (TypeError, ValueError):
        return 0.2

    return min(2.0, max(0.0, temperature))


def _build_longcat_messages(system_prompt, conversation_id, message, include_history=True):
    messages = [{"role": "system", "content": system_prompt}]

    if include_history:
        messages.extend(_get_longcat_history(conversation_id))

    messages.append({"role": "user", "content": message})
    return messages


def _get_longcat_history(conversation_id):
    with _LONGCAT_HISTORY_LOCK:
        return list(_LONGCAT_HISTORY.get(conversation_id, []))


def _append_longcat_history(conversation_id, user_message, assistant_message):
    if not assistant_message.strip():
        return

    with _LONGCAT_HISTORY_LOCK:
        history = list(_LONGCAT_HISTORY.get(conversation_id, []))
        history.extend(
            [
                {"role": "user", "content": _limit_history_content(user_message)},
                {"role": "assistant", "content": _limit_history_content(assistant_message)},
            ]
        )
        _LONGCAT_HISTORY[conversation_id] = _compact_longcat_history(history)


def _compact_longcat_history(history):
    compacted = []

    for message in history[-_LONGCAT_HISTORY_LIMIT:]:
        if not isinstance(message, dict):
            continue

        content = _limit_history_content(message.get("content"))

        if not content:
            continue

        compacted.append({"role": message.get("role"), "content": content})

    return compacted


def _limit_history_content(value):
    text = str(value or "").strip()

    if len(text) <= _LONGCAT_HISTORY_MESSAGE_MAX_CHARS:
        return text

    return text[:_LONGCAT_HISTORY_MESSAGE_MAX_CHARS].rstrip()


def _select_longcat_prompt_path(settings, bot_id):
    if _is_unified_workflow(settings) and bot_id != settings.recommender_bot_id:
        return settings.unified_orchestrator_prompt_path

    if bot_id == settings.recommender_bot_id:
        return settings.recommender_prompt_path

    return settings.route_planner_prompt_path


def _is_unified_workflow(settings):
    return str(getattr(settings, "workflow_mode", "")).strip().lower() in {"unified", "single", "single_turn"}


def _read_prompt(path):
    resolved_path = path if os.path.isabs(path) else os.path.abspath(path)

    try:
        with open(resolved_path, "r", encoding="utf-8") as file:
            return file.read()
    except OSError as exc:
        raise CozeConfigurationError(f"Prompt file was not found: {resolved_path}") from exc


def _append_system_context(system_prompt, system_context):
    context = _normalize_optional_id(system_context)

    if not context:
        return system_prompt

    return f"{system_prompt.rstrip()}\n\n{context}\n"


def _prepend_system_context(message, system_context):
    context = _normalize_optional_id(system_context)

    if not context:
        return message

    return f"{context}\n\n# 用户本轮消息\n{message}"


def _longcat_chat_url(base_url):
    normalized_base_url = str(base_url or "").rstrip("/")

    if normalized_base_url.endswith("/chat/completions"):
        return normalized_base_url

    return f"{normalized_base_url}/chat/completions"


def _new_conversation_id():
    return f"longcat-{uuid.uuid4().hex}"


def _new_chat_id():
    return f"chat-{uuid.uuid4().hex}"


def _extract_longcat_delta_content(data):
    payload = parse_json_object(data)
    choices = payload.get("choices")

    if not isinstance(choices, list) or not choices:
        return ""

    choice = choices[0] if isinstance(choices[0], dict) else {}
    delta = choice.get("delta")

    if isinstance(delta, dict):
        content = delta.get("content")

        if isinstance(content, str):
            return content

    message = choice.get("message")

    if isinstance(message, dict):
        content = message.get("content")

        if isinstance(content, str):
            return content

    text = choice.get("text")
    return text if isinstance(text, str) else ""


def _iter_sse_frames(upstream, chunk_size=64):
    event_name = None
    data_lines = []

    try:
        try:
            lines = upstream.iter_lines(decode_unicode=False, chunk_size=max(1, int(chunk_size or 64)))
        except TypeError:
            lines = upstream.iter_lines(decode_unicode=False)

        for raw_line in lines:
            line = raw_line.decode("utf-8", errors="replace") if isinstance(raw_line, bytes) else str(raw_line)

            if not line:
                if event_name or data_lines:
                    yield event_name, "\n".join(data_lines)
                event_name = None
                data_lines = []
                continue

            if line.startswith("event:"):
                event_name = line.removeprefix("event:").strip()
            elif line.startswith("data:"):
                data_lines.append(line.removeprefix("data:").lstrip())

        if event_name or data_lines:
            yield event_name, "\n".join(data_lines)
    finally:
        upstream.close()


def _build_chat_query_params(conversation_id):
    normalized_conversation_id = _normalize_optional_id(conversation_id)

    if not normalized_conversation_id:
        return {}

    return {"conversation_id": normalized_conversation_id}


def _normalize_optional_id(value):
    if value is None:
        return ""

    normalized = str(value).strip()
    return normalized


def parse_json_object(data):
    try:
        payload = json.loads(data)
    except json.JSONDecodeError:
        return {}

    return payload if isinstance(payload, dict) else {}


def _read_error_detail(upstream):
    try:
        return upstream.json()
    except ValueError:
        return upstream.text


def _is_event_stream_response(upstream):
    content_type = upstream.headers.get("Content-Type", "")
    return "text/event-stream" in content_type.lower()


def json_dumps(data):
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))
