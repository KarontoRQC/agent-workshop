import os
from datetime import datetime, timezone

from flask import Flask, jsonify, request
from flask_cors import CORS


def create_app():
    app = Flask(__name__)

    allowed_origins = os.getenv(
        "FRONTEND_ORIGINS",
        "http://127.0.0.1:5173,http://localhost:5173",
    ).split(",")

    CORS(app, resources={r"/api/*": {"origins": allowed_origins}})

    @app.get("/api/health")
    def health():
        return jsonify(
            {
                "status": "ok",
                "service": "flask-backend",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )

    @app.post("/api/echo")
    def echo():
        data = request.get_json(silent=True) or {}
        message = data.get("message", "")

        return jsonify(
            {
                "received": message,
                "length": len(message),
            }
        )

    return app


app = create_app()


if __name__ == "__main__":
    host = os.getenv("FLASK_HOST", "127.0.0.1")
    port = int(os.getenv("FLASK_PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "1") == "1"

    app.run(host=host, port=port, debug=debug)
