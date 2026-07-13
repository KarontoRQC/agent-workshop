from config import DEFAULT_EDGE_TTS_VOICE, get_tts_settings


def test_tts_settings_ignore_local_provider_env(monkeypatch):
    monkeypatch.setenv("TTS_PROVIDER", "piper")
    monkeypatch.setenv("PIPER_EXE", "/tmp/piper")
    monkeypatch.setenv("PIPER_VOICE", "/tmp/local-model.onnx")
    monkeypatch.delenv("EDGE_TTS_VOICE", raising=False)

    settings = get_tts_settings()

    assert settings.edge_tts_voice == DEFAULT_EDGE_TTS_VOICE
    assert not hasattr(settings, "provider")
    assert not hasattr(settings, "piper_voice")


def test_tts_settings_allows_known_edge_chinese_female_voice(monkeypatch):
    monkeypatch.setenv("EDGE_TTS_VOICE", "zh-CN-XiaoyiNeural")

    assert get_tts_settings().edge_tts_voice == "zh-CN-XiaoyiNeural"


def test_tts_settings_rejects_edge_male_voice(monkeypatch):
    monkeypatch.setenv("EDGE_TTS_VOICE", "zh-CN-YunxiNeural")

    assert get_tts_settings().edge_tts_voice == DEFAULT_EDGE_TTS_VOICE
