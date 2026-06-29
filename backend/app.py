import os

from flask import Flask
from flask_cors import CORS

from config import get_frontend_origins
from routes.coze import coze_bp
from routes.system import system_bp
from routes.tts import tts_bp


def create_app():
    app = Flask(__name__)

    CORS(app, resources={r"/api/*": {"origins": get_frontend_origins()}})
    app.register_blueprint(system_bp, url_prefix="/api")
    app.register_blueprint(coze_bp, url_prefix="/api/coze")
    app.register_blueprint(tts_bp, url_prefix="/api/tts")

    return app


app = create_app()


if __name__ == "__main__":
    host = os.getenv("FLASK_HOST", "127.0.0.1")
    port = int(os.getenv("FLASK_PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "1") == "1"

    app.run(host=host, port=port, debug=debug)
