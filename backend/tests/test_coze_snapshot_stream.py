from app import create_app
from services.coze_client import CozeConfigurationError, CozeConnectionError, CozeUpstreamError
from services.coze_stream_transformer import content_event, format_sse_event
from services.recommendation_snapshot_store import (
    InMemoryRecommendationSnapshotStore,
    RecommendationSnapshotStoreError,
)


class UnavailableStore:
    def create_snapshot(self, message):
        raise RecommendationSnapshotStoreError("database unavailable")


class RawUnavailableStore:
    def create_snapshot(self, message):
        raise RuntimeError("raw database secret")


def test_stream_chat_creates_snapshot_and_injects_recommendation_id(monkeypatch):
    store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    app = create_app(snapshot_store=store)
    app.config["TESTING"] = True

    def fake_workflow_stream(**kwargs):
        yield format_sse_event(content_event("workflow.started", {"conversation_ids": {}}))
        yield format_sse_event(
            content_event(
                "recommended_agents.delta",
                {"agent": {"agent_index": 0, "agent_name": "Planner"}},
            )
        )
        yield format_sse_event(content_event("workflow.completed", {}))

    monkeypatch.setattr("routes.coze.start_chat_workflow_stream", fake_workflow_stream)

    response = app.test_client().post("/api/coze/chat/stream", json={"message": "need agents"})
    body = response.get_data(as_text=True)

    assert response.status_code == 200
    assert response.headers["X-Request-ID"].startswith("chat-")
    assert response.headers["Server-Timing"].startswith("setup;dur=")
    assert '"recommendation_id":"rec_test"' in body
    assert '"recommendation_edit_token":' in body
    snapshot = store.get_snapshot("rec_test")
    assert snapshot["message"] == "need agents"
    assert snapshot["status"] == "completed"
    assert snapshot["agents"] == [{"agent_index": 0, "agent_name": "Planner"}]


def test_stream_chat_rejects_messages_above_configured_limit(monkeypatch):
    store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    app = create_app(snapshot_store=store)
    app.config["TESTING"] = True

    def unexpected_workflow_stream(**kwargs):
        raise AssertionError("workflow must not start for oversized input")

    monkeypatch.setattr("routes.coze.start_chat_workflow_stream", unexpected_workflow_stream)

    response = app.test_client().post("/api/coze/chat/stream", json={"message": "x" * 8001})

    assert response.status_code == 413
    assert response.get_json() == {"error": "message is too long", "max_chars": 8000}


def test_stream_chat_forwards_allowlisted_participant_identity(monkeypatch):
    store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_identity")
    app = create_app(snapshot_store=store)
    app.config["TESTING"] = True
    captured = {}

    def fake_workflow_stream(**kwargs):
        captured.update(kwargs)
        yield format_sse_event(content_event("workflow.completed", {}))

    monkeypatch.setattr("routes.coze.start_chat_workflow_stream", fake_workflow_stream)

    response = app.test_client().post(
        "/api/coze/chat/stream",
        json={"message": "你好", "participant_identity": "changzhang"},
    )

    assert response.status_code == 200
    assert captured["participant_identity"] == "changzhang"


def test_stream_chat_downgrades_unknown_participant_identity_to_guest(monkeypatch):
    store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_guest")
    app = create_app(snapshot_store=store)
    app.config["TESTING"] = True
    captured = {}

    def fake_workflow_stream(**kwargs):
        captured.update(kwargs)
        yield format_sse_event(content_event("workflow.completed", {}))

    monkeypatch.setattr("routes.coze.start_chat_workflow_stream", fake_workflow_stream)

    response = app.test_client().post(
        "/api/coze/chat/stream",
        json={"message": "你好", "participant_identity": "boss"},
    )

    assert response.status_code == 200
    assert captured["participant_identity"] == "guest"


def test_stream_chat_local_config_fallback_creates_snapshot_and_injects_recommendation_id(monkeypatch):
    store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_fallback")
    app = create_app(snapshot_store=store)
    app.config["TESTING"] = True

    def broken_workflow_stream(**kwargs):
        raise CozeConfigurationError("missing local key")

    monkeypatch.setattr("routes.coze.start_chat_workflow_stream", broken_workflow_stream)
    monkeypatch.setenv("CHAT_CONFIG_FALLBACK", "local")

    response = app.test_client().post("/api/coze/chat/stream", json={"message": "need local fallback agents"})
    body = response.get_data(as_text=True)

    assert response.status_code == 200
    assert '"recommendation_id":"rec_fallback"' in body
    assert body.index('"type":"THINKING_PROCESS"') < body.index('"type":"ACK"')
    assert "missing local key" not in body
    assert "LONGCAT_API_KEY" not in body
    snapshot = store.get_snapshot("rec_fallback")
    assert snapshot["message"] == "need local fallback agents"
    assert snapshot["status"] == "completed"


def test_stream_chat_setup_errors_do_not_expose_provider_details(monkeypatch):
    store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_never_created")
    app = create_app(snapshot_store=store)
    app.config["TESTING"] = True
    monkeypatch.setenv("CHAT_CONFIG_FALLBACK", "0")

    errors = (
        (CozeConfigurationError("LONGCAT_API_KEY=private"), 503, "Chat provider is not configured"),
        (CozeConnectionError("proxy password=private"), 502, "Failed to connect to chat provider"),
        (CozeUpstreamError(429, {"secret": "private"}), 429, "Chat provider request failed"),
    )

    for error, status_code, public_error in errors:
        monkeypatch.setattr(
            "routes.coze.start_chat_workflow_stream",
            lambda **kwargs: (_ for _ in ()).throw(error),
        )
        response = app.test_client().post("/api/coze/chat/stream", json={"message": "test"})
        body = response.get_json()

        assert response.status_code == status_code
        assert body["error"] == public_error
        assert "private" not in response.get_data(as_text=True)


def test_stream_chat_returns_503_when_snapshot_store_unavailable(monkeypatch):
    app = create_app(snapshot_store=UnavailableStore())
    app.config["TESTING"] = True

    def fake_workflow_stream(**kwargs):
        yield format_sse_event(content_event("workflow.started", {"conversation_ids": {}}))

    monkeypatch.setattr("routes.coze.start_chat_workflow_stream", fake_workflow_stream)

    response = app.test_client().post("/api/coze/chat/stream", json={"message": "need agents"})

    assert response.status_code == 503
    assert response.get_json() == {"error": "recommendation snapshot store unavailable"}


def test_stream_chat_returns_503_when_snapshot_store_raises_raw_error(monkeypatch):
    app = create_app(snapshot_store=RawUnavailableStore())
    app.config["TESTING"] = True

    def fake_workflow_stream(**kwargs):
        yield format_sse_event(content_event("workflow.started", {"conversation_ids": {}}))

    monkeypatch.setattr("routes.coze.start_chat_workflow_stream", fake_workflow_stream)

    response = app.test_client().post("/api/coze/chat/stream", json={"message": "need agents"})
    body = response.get_data(as_text=True)

    assert response.status_code == 503
    assert response.get_json() == {"error": "recommendation snapshot store unavailable"}
    assert "raw database secret" not in body


def test_stream_chat_stream_error_fails_snapshot_without_leaking_detail(monkeypatch):
    store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    app = create_app(snapshot_store=store)
    app.config["TESTING"] = True

    def fake_workflow_stream(**kwargs):
        yield format_sse_event(content_event("workflow.started", {"conversation_ids": {}}))
        raise RuntimeError("boom secret")

    monkeypatch.setattr("routes.coze.start_chat_workflow_stream", fake_workflow_stream)

    response = app.test_client().post("/api/coze/chat/stream", json={"message": "need agents"})
    body = response.get_data(as_text=True)

    assert response.status_code == 200
    assert '"event":"workflow.error"' in body
    assert '"error":"Backend stream failed"' in body
    assert "boom secret" not in body

    snapshot = store.get_snapshot("rec_test")
    assert snapshot["status"] == "failed"
    assert snapshot["error"] == "Backend stream failed"


def test_create_app_uses_lazy_default_snapshot_store(monkeypatch):
    created = []

    class ProbeStore(InMemoryRecommendationSnapshotStore):
        def ensure_schema(self):
            created.append("schema")

    store = ProbeStore(id_factory=lambda: "rec_test")

    def create_store():
        created.append("store")
        return store

    monkeypatch.setattr("app.create_recommendation_snapshot_store", create_store)

    app = create_app()

    assert created == []
    assert app.config["RECOMMENDATION_SNAPSHOT_STORE"].get_snapshot("missing") is None
    assert created == ["store", "schema"]
