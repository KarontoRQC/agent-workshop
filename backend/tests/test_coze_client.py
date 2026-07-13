from types import SimpleNamespace

import pytest
import requests

from services.coze_client import (
    CozeClient,
    CozeConnectionError,
    CozeUpstreamError,
    _LONGCAT_HISTORY,
    _append_longcat_history,
    _build_longcat_payload,
)


def _settings(**overrides):
    values = {
        "longcat_model": "LongCat-2.0",
        "longcat_max_tokens": 3000,
        "longcat_thinking": "disabled",
        "longcat_temperature": 0.2,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


class FakeResponse:
    def __init__(self, status_code=200, detail=None):
        self.status_code = status_code
        self.detail = detail or {}
        self.closed = False

    def json(self):
        return self.detail

    def close(self):
        self.closed = True


def _stream_settings(**overrides):
    values = {
        "longcat_api_key": "test-key",
        "longcat_base_url": "https://example.test/openai/v1",
        "connect_timeout": 3,
        "read_timeout": 300,
        "longcat_stream_read_timeout": 15,
        "longcat_request_retries": 1,
        "longcat_retry_backoff": 0.25,
        "longcat_circuit_breaker_seconds": 0,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def _full_stream_settings(prompt_path, **overrides):
    values = {
        **vars(_settings()),
        **vars(_stream_settings()),
        "workflow_mode": "unified",
        "recommender_bot_id": "recommend-bot",
        "unified_orchestrator_prompt_path": str(prompt_path),
        "recommender_prompt_path": str(prompt_path),
        "route_planner_prompt_path": str(prompt_path),
        "longcat_sse_chunk_size": 64,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_longcat_payload_forces_low_latency_server_controls():
    payload = _build_longcat_payload(
        settings=_settings(),
        system_prompt="system",
        conversation_id="conv-test",
        message="hello",
        parameters={
            "thinking": {"type": "enabled"},
            "temperature": 1.9,
            "max_tokens": 20,
            "model": "other-model",
            "stream": False,
            "messages": [],
            "top_p": 0.8,
        },
        include_history=False,
    )

    assert payload["model"] == "LongCat-2.0"
    assert payload["stream"] is True
    assert payload["thinking"] == {"type": "disabled"}
    assert payload["temperature"] == 0.2
    assert payload["max_tokens"] == 3000
    assert payload["top_p"] == 0.8
    assert payload["messages"] == [
        {"role": "system", "content": "system"},
        {"role": "user", "content": "hello"},
    ]


def test_longcat_payload_normalizes_invalid_server_controls():
    payload = _build_longcat_payload(
        settings=_settings(longcat_thinking="unexpected", longcat_temperature=99),
        system_prompt="system",
        conversation_id="conv-test",
        message="hello",
        include_history=False,
    )

    assert payload["thinking"] == {"type": "disabled"}
    assert payload["temperature"] == 2.0


def test_longcat_history_keeps_only_three_bounded_turns():
    conversation_id = "conv-history-test"
    _LONGCAT_HISTORY.pop(conversation_id, None)

    try:
        for index in range(5):
            _append_longcat_history(
                conversation_id,
                f"user-{index}-" + ("u" * 1400),
                f"assistant-{index}-" + ("a" * 1400),
            )

        history = _LONGCAT_HISTORY[conversation_id]

        assert len(history) == 6
        assert history[0]["content"].startswith("user-2-")
        assert history[-1]["content"].startswith("assistant-4-")
        assert all(len(message["content"]) <= 1000 for message in history)
        assert sum(len(message["content"]) for message in history) <= 6000
    finally:
        _LONGCAT_HISTORY.pop(conversation_id, None)


def test_longcat_stream_retries_header_timeout_once_then_connects():
    calls = []
    sleeps = []
    response = FakeResponse()

    def post(url, **kwargs):
        calls.append((url, kwargs))
        if len(calls) == 1:
            raise requests.ReadTimeout("upstream stalled")
        return response

    client = CozeClient(post=post, sleep=sleeps.append)
    upstream = client._open_longcat_stream(
        settings=_stream_settings(),
        payload={"messages": []},
        conversation_id="conv-retry",
    )

    assert upstream is response
    assert len(calls) == 2
    assert calls[0][1]["timeout"] == (3, 15)
    assert sleeps == [0.25]


def test_longcat_stream_stops_after_bounded_transient_retries():
    calls = []

    def post(url, **kwargs):
        calls.append((url, kwargs))
        raise requests.ConnectTimeout("upstream unavailable")

    client = CozeClient(post=post, sleep=lambda _seconds: None)

    with pytest.raises(CozeConnectionError, match=r"timed out after 2 attempt\(s\)"):
        client._open_longcat_stream(
            settings=_stream_settings(),
            payload={"messages": []},
            conversation_id="conv-timeout",
        )

    assert len(calls) == 2


def test_longcat_circuit_breaker_skips_provider_during_cooldown():
    calls = []
    clock = [100.0]

    def post(url, **kwargs):
        calls.append((url, kwargs))
        raise requests.ReadTimeout("upstream unavailable")

    client = CozeClient(post=post, sleep=lambda _seconds: None, monotonic=lambda: clock[0])
    settings = _stream_settings(longcat_request_retries=0, longcat_circuit_breaker_seconds=20)

    with pytest.raises(CozeConnectionError, match="timed out after 1 attempt"):
        client._open_longcat_stream(settings=settings, payload={"messages": []}, conversation_id="conv-first")

    with pytest.raises(CozeConnectionError, match="circuit breaker is open"):
        client._open_longcat_stream(settings=settings, payload={"messages": []}, conversation_id="conv-second")

    assert len(calls) == 1

    clock[0] = 121.0
    with pytest.raises(CozeConnectionError, match="timed out after 1 attempt"):
        client._open_longcat_stream(settings=settings, payload={"messages": []}, conversation_id="conv-third")

    assert len(calls) == 2


def test_longcat_stream_does_not_retry_http_errors(tmp_path):
    calls = []
    response = FakeResponse(status_code=429, detail={"error": "rate limited"})
    prompt_path = tmp_path / "prompt.txt"
    prompt_path.write_text("system", encoding="utf-8")

    def post(url, **kwargs):
        calls.append((url, kwargs))
        return response

    client = CozeClient(post=post, sleep=lambda _seconds: None)

    with pytest.raises(CozeUpstreamError) as exc_info:
        client._stream_longcat_chat(
            settings=_full_stream_settings(prompt_path),
            message="hello",
            conversation_id="conv-http-error",
        )

    assert exc_info.value.status_code == 429
    assert len(calls) == 1
    assert response.closed is True
