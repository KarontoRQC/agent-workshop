import requests

from config import get_coze_settings


class CozeConfigurationError(Exception):
    pass


class CozeConnectionError(Exception):
    pass


class CozeUpstreamError(Exception):
    def __init__(self, status_code, detail):
        super().__init__("Coze request failed")
        self.status_code = status_code
        self.detail = detail


class CozeClient:
    def __init__(self, settings_factory=get_coze_settings, post=requests.post):
        self.settings_factory = settings_factory
        self.post = post

    def stream_single_turn_chat(self, message, parameters=None, user_id=None, bot_id=None):
        settings = self.settings_factory()
        selected_bot_id = bot_id or settings.bot_id

        if not settings.api_token:
            raise CozeConfigurationError("COZE_API_TOKEN is not configured")
        if not selected_bot_id:
            raise CozeConfigurationError("COZE_BOT_ID is not configured")

        payload = self._build_single_turn_payload(
            settings=settings,
            bot_id=selected_bot_id,
            message=message,
            parameters=parameters,
            user_id=user_id,
        )

        try:
            upstream = self.post(
                settings.chat_url,
                headers={
                    "Authorization": f"Bearer {settings.api_token}",
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

        if not _is_event_stream_response(upstream):
            detail = _read_error_detail(upstream)
            upstream.close()
            raise CozeUpstreamError(502, detail)

        return upstream

    @staticmethod
    def _build_single_turn_payload(settings, bot_id, message, parameters=None, user_id=None):
        return {
            "bot_id": bot_id,
            "user_id": str(user_id or settings.user_id),
            "stream": True,
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


def _read_error_detail(upstream):
    try:
        return upstream.json()
    except ValueError:
        return upstream.text


def _is_event_stream_response(upstream):
    content_type = upstream.headers.get("Content-Type", "")
    return "text/event-stream" in content_type.lower()
