import logging
import os

from flask import Flask
from flask_cors import CORS

from config import (
    get_agent_avatar_dir,
    get_api_security_settings,
    get_agent_static_avatar_base_url,
    get_agent_static_avatar_dir,
    get_database_url,
    get_frontend_origins,
    get_source_agents_path,
)
from routes.agents import agents_bp
from routes.combination_agents import combination_agents_bp
from routes.coze import coze_bp
from routes.recommendations import recommendations_bp
from routes.system import system_bp
from routes.tts import tts_bp
from services.agent_catalog_store import PostgresAgentCatalogStore
from services.combination_agent_store import PostgresCombinationAgentStore
from services.recommendation_snapshot_store import PostgresRecommendationSnapshotStore


def create_app(snapshot_store=None, agent_catalog_store=None, combination_agent_store=None):
    app = Flask(__name__)
    _configure_logging(app)

    CORS(
        app,
        resources={r"/api/*": {"origins": get_frontend_origins()}},
        supports_credentials=True,
    )
    app.config["API_SECURITY_SETTINGS"] = get_api_security_settings()
    app.config["AGENT_CATALOG_STORE"] = (
        agent_catalog_store if agent_catalog_store is not None else LazyStore(create_agent_catalog_store)
    )
    app.config["RECOMMENDATION_SNAPSHOT_STORE"] = (
        snapshot_store if snapshot_store is not None else LazyStore(create_recommendation_snapshot_store)
    )
    app.config["COMBINATION_AGENT_STORE"] = (
        combination_agent_store if combination_agent_store is not None else LazyStore(create_combination_agent_store)
    )
    app.register_blueprint(system_bp, url_prefix="/api")
    app.register_blueprint(agents_bp, url_prefix="/api")
    app.register_blueprint(combination_agents_bp, url_prefix="/api")
    app.register_blueprint(coze_bp, url_prefix="/api/coze")
    app.register_blueprint(recommendations_bp, url_prefix="/api")
    app.register_blueprint(tts_bp, url_prefix="/api/tts")

    return app


def _configure_logging(app):
    level = os.getenv("LOG_LEVEL", "INFO").strip().upper() or "INFO"
    app.logger.setLevel(level)
    provider_logger = logging.getLogger("services.coze_client")
    provider_logger.setLevel(level)

    for handler in app.logger.handlers:
        if handler not in provider_logger.handlers:
            provider_logger.addHandler(handler)

    provider_logger.propagate = False


def create_recommendation_snapshot_store():
    return PostgresRecommendationSnapshotStore(get_database_url())


def create_combination_agent_store():
    return PostgresCombinationAgentStore(get_database_url())


def create_agent_catalog_store():
    return PostgresAgentCatalogStore(
        get_database_url(),
        source_agents_path=get_source_agents_path(),
        avatar_dir=get_agent_avatar_dir(),
        static_avatar_dir=get_agent_static_avatar_dir(),
        static_avatar_base_url=get_agent_static_avatar_base_url(),
    )


class LazyStore:
    def __init__(self, store_factory):
        self._store_factory = store_factory
        self._store = None

    def __getattr__(self, name):
        if self._store is None:
            store = self._store_factory()
            ensure_schema = getattr(store, "ensure_schema", None)
            if callable(ensure_schema):
                ensure_schema()
            self._store = store

        return getattr(self._store, name)


app = create_app()


if __name__ == "__main__":
    host = os.getenv("FLASK_HOST", "127.0.0.1")
    port = int(os.getenv("FLASK_PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "1") == "1"

    app.run(host=host, port=port, debug=debug)
