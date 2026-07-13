from services import tts_service


def test_synthesize_speech_uses_edge_tts_only(monkeypatch):
    monkeypatch.setenv("TTS_PROVIDER", "piper")
    monkeypatch.setenv("PIPER_EXE", "/tmp/piper")
    monkeypatch.setenv("PIPER_VOICE", "/tmp/local-model.onnx")
    monkeypatch.delenv("EDGE_TTS_VOICE", raising=False)

    captured = {}

    def fake_edge_tts(text, mood, settings):
        captured["text"] = text
        captured["mood"] = mood
        captured["voice"] = settings.edge_tts_voice
        captured["has_provider"] = hasattr(settings, "provider")
        captured["has_piper_voice"] = hasattr(settings, "piper_voice")
        return b"edge-mp3"

    monkeypatch.setattr(tts_service, "synthesize_with_edge_tts", fake_edge_tts)

    audio, mimetype = tts_service.synthesize_speech("你好，贾维斯", mood="warm")

    assert audio == b"edge-mp3"
    assert mimetype == "audio/mpeg"
    assert captured == {
        "text": "你好，贾维斯",
        "mood": "warm",
        "voice": "zh-CN-XiaoxiaoNeural",
        "has_provider": False,
        "has_piper_voice": False,
    }
    assert not hasattr(tts_service, "synthesize_with_piper")
