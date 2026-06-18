from datetime import datetime, timezone

from flask import Blueprint, jsonify, request


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


@system_bp.post("/echo")
def echo():
    data = request.get_json(silent=True) or {}
    message = data.get("message", "")

    return jsonify(
        {
            "received": message,
            "length": len(message),
        }
    )
