from flask import Blueprint, Response, jsonify, request

from services.tts_service import TtsConfigurationError, TtsSynthesisError, synthesize_speech


tts_bp = Blueprint("tts", __name__)


@tts_bp.post("/speech")
def speech():
    data = request.get_json(silent=True) or {}
    text = data.get("text", "")
    mood = data.get("mood", "neutral")

    if not isinstance(text, str) or not text.strip():
        return jsonify({"error": "text is required"}), 400

    text = text.strip()

    if len(text) > 800:
        return jsonify({"error": "text is too long", "detail": "Send shorter speech segments."}), 400

    try:
        audio, mimetype = synthesize_speech(text, mood=mood if isinstance(mood, str) else "neutral")
    except TtsConfigurationError as exc:
        return jsonify({"error": "TTS is not configured", "detail": str(exc)}), 503
    except TtsSynthesisError as exc:
        return jsonify({"error": "TTS synthesis failed", "detail": str(exc)}), 502

    return Response(
        audio,
        mimetype=mimetype,
        headers={
            "Cache-Control": "no-store",
        },
    )
