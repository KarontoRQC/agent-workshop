import json
import os
import threading
import time
import uuid

import requests

from config import get_coze_settings


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
    def __init__(self, settings_factory=get_coze_settings, post=requests.post):
        self.settings_factory = settings_factory
        self.post = post

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

        if settings.chat_provider == "longcat":
            return self._stream_longcat_chat(
                settings=settings,
                message=message,
                parameters=parameters,
                bot_id=bot_id,
                conversation_id=conversation_id,
                system_context=system_context,
            )

        if settings.chat_provider != "coze":
            raise CozeConfigurationError(f"Unsupported CHAT_PROVIDER: {settings.chat_provider}")

        selected_bot_id = bot_id or settings.bot_id

        if not settings.api_token:
            raise CozeConfigurationError("COZE_API_TOKEN is not configured")
        if not selected_bot_id:
            raise CozeConfigurationError("COZE_BOT_ID is not configured")

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

    def _stream_longcat_chat(
        self,
        settings,
        message,
        parameters=None,
        bot_id=None,
        conversation_id=None,
        system_context=None,
    ):
        if not settings.longcat_api_key:
            raise CozeConfigurationError("LONGCAT_API_KEY is not configured")
        if not settings.longcat_model:
            raise CozeConfigurationError("LONGCAT_MODEL is not configured")

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
        )

        try:
            upstream = self.post(
                _longcat_chat_url(settings.longcat_base_url),
                headers={
                    "Authorization": f"Bearer {settings.longcat_api_key}",
                    "Content-Type": "application/json",
                    "Accept": "text/event-stream",
                },
                json=payload,
                stream=True,
                timeout=(settings.connect_timeout, settings.read_timeout),
            )
        except requests.RequestException as exc:
            raise CozeConnectionError(str(exc)) from exc

        if upstream.status_code >= 400:
            detail = _read_error_detail(upstream)
            upstream.close()
            raise CozeUpstreamError(upstream.status_code, detail)

        return LongCatStreamAdapter(
            upstream=upstream,
            conversation_id=selected_conversation_id,
            chat_id=chat_id,
            bot_id=selected_bot_id,
            user_message=message,
        )

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
    def __init__(self, upstream, conversation_id, chat_id, bot_id, user_message):
        self.upstream = upstream
        self.conversation_id = conversation_id
        self.chat_id = chat_id
        self.bot_id = bot_id
        self.user_message = user_message
        self.closed = False

    def iter_lines(self, decode_unicode=False):
        assistant_parts = []
        completed = False

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

            for _, data in _iter_sse_frames(self.upstream):
                if data == "[DONE]":
                    completed = True
                    break

                content = _extract_longcat_delta_content(data)

                if not content:
                    continue

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
            if not completed:
                self.close()
            else:
                self.close()

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
_LONGCAT_HISTORY_LIMIT = 12


def _build_longcat_payload(settings, system_prompt, conversation_id, message, parameters=None):
    payload = {
        "model": settings.longcat_model,
        "stream": True,
        "messages": _build_longcat_messages(system_prompt, conversation_id, message),
    }

    if settings.longcat_max_tokens > 0:
        payload["max_tokens"] = settings.longcat_max_tokens

    if isinstance(parameters, dict):
        for key, value in parameters.items():
            if key in {"messages", "model", "stream"}:
                continue
            payload[key] = value

    return payload


def _build_longcat_messages(system_prompt, conversation_id, message):
    messages = [{"role": "system", "content": system_prompt}]
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
                {"role": "user", "content": user_message},
                {"role": "assistant", "content": assistant_message},
            ]
        )
        _LONGCAT_HISTORY[conversation_id] = history[-_LONGCAT_HISTORY_LIMIT:]


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


def _iter_sse_frames(upstream):
    event_name = None
    data_lines = []

    try:
        for raw_line in upstream.iter_lines(decode_unicode=False):
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
