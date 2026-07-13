import json

from config import _read_agent_names, get_coze_settings


def test_longcat_reliability_defaults_are_classroom_bounded(monkeypatch):
    monkeypatch.delenv("LONGCAT_STREAM_READ_TIMEOUT", raising=False)
    monkeypatch.delenv("LONGCAT_REQUEST_RETRIES", raising=False)
    monkeypatch.delenv("LONGCAT_RETRY_BACKOFF", raising=False)
    monkeypatch.delenv("LONGCAT_CIRCUIT_BREAKER_SECONDS", raising=False)

    settings = get_coze_settings()

    assert settings.longcat_stream_read_timeout == 4
    assert settings.longcat_request_retries == 0
    assert settings.longcat_retry_backoff == 0.25
    assert settings.longcat_circuit_breaker_seconds == 20


def test_longcat_reliability_settings_are_safely_bounded(monkeypatch):
    monkeypatch.setenv("LONGCAT_STREAM_READ_TIMEOUT", "0")
    monkeypatch.setenv("LONGCAT_REQUEST_RETRIES", "99")
    monkeypatch.setenv("LONGCAT_RETRY_BACKOFF", "-5")
    monkeypatch.setenv("LONGCAT_CIRCUIT_BREAKER_SECONDS", "999")

    settings = get_coze_settings()

    assert settings.longcat_stream_read_timeout == 1
    assert settings.longcat_request_retries == 2
    assert settings.longcat_retry_backoff == 0
    assert settings.longcat_circuit_breaker_seconds == 120


def test_read_agent_names_skips_records_without_launch_link(tmp_path):
    source_path = tmp_path / "agents.json"
    source_path.write_text(
        json.dumps(
            [
                {"智能体名称": "行业尽调", "智能体链接": None},
                {"智能体名称": "销售智能体", "智能体链接": ""},
                {"智能体名称": "销售之神", "智能体链接": "https://chatgpt.com/g/g-sales"},
                {"智能体名称": "爆款文案生成器", "智能体链接": "https://chatgpt.com/g/g-copy"},
                {"智能体名称": "销售之神", "智能体链接": "https://chatgpt.com/g/g-sales-duplicate"},
                {"智能体名称": "销售之神别名", "智能体链接": "https://chatgpt.com/g/g-sales"},
            ]
        ),
        encoding="utf-8",
    )

    assert _read_agent_names(str(source_path), "智能体名称", required_link_key="智能体链接") == (
        "销售之神",
        "爆款文案生成器",
    )
