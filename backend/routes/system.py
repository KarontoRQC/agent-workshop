from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify, request

from routes.access_control import get_active_security_settings
from services.api_access import SESSION_COOKIE_NAME, issue_api_session


system_bp = Blueprint("system", __name__)


@system_bp.get("/health")
def health():
    return jsonify(
        {
            "status": "ok",
            "service": "flask-backend",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    )


@system_bp.post("/session")
def create_api_session():
    settings = get_active_security_settings()

    try:
        issued = issue_api_session(settings.signing_secret, settings.session_ttl_seconds)
    except ValueError:
        current_app.logger.error("API signing secret is not configured")
        return jsonify({"error": "API access is not configured"}), 503

    response = jsonify(
        {
            "csrf_token": issued.csrf_token,
            "expires_at": issued.expires_at,
        }
    )
    response.headers["Cache-Control"] = "no-store"
    response.set_cookie(
        SESSION_COOKIE_NAME,
        issued.cookie_value,
        httponly=True,
        max_age=settings.session_ttl_seconds,
        path="/api",
        samesite="Lax",
        secure=request.is_secure or request.headers.get("X-Forwarded-Proto", "").lower() == "https",
    )
    return response


@system_bp.post("/echo")
def echo():
    if not get_active_security_settings().echo_enabled:
        return jsonify({"error": "not found"}), 404

    data = request.get_json(silent=True) or {}
    message = data.get("message", "")

    return jsonify(
        {
            "received": message,
            "length": len(message),
        }
    )
