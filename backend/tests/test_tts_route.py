from app import create_app
from services.tts_service import TtsConfigurationError, TtsSynthesisError


def test_tts_route_does_not_expose_internal_error_details(monkeypatch):
    app = create_app()
    app.config["TESTING"] = True

    errors = (
        (TtsConfigurationError("voice token=private"), 503, "TTS is not configured"),
        (TtsSynthesisError("upstream body=private"), 502, "TTS synthesis failed"),
    )

    for error, status_code, public_error in errors:
        monkeypatch.setattr(
            "routes.tts.synthesize_speech",
            lambda text, mood: (_ for _ in ()).throw(error),
        )
        response = app.test_client().post("/api/tts/speech", json={"text": "你好"})

        assert response.status_code == status_code
        assert response.get_json() == {"error": public_error}
        assert "private" not in response.get_data(as_text=True)
