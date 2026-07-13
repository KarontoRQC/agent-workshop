import hashlib

from app import create_app
from services.agent_catalog_store import InMemoryAgentCatalogStore
from services.combination_agent_store import InMemoryCombinationAgentStore
from services.recommendation_snapshot_store import (
    InMemoryRecommendationSnapshotStore,
    RecommendationSnapshotStoreError,
)
from routes.access_control import TEST_SIGNING_SECRET
from services.api_access import create_recommendation_edit_token


class UnavailableCombinationAgentStore(InMemoryCombinationAgentStore):
    def upsert_for_recommendation(self, recommendation_id, *, title, lineup, score=None, source_snapshot=None):
        raise RuntimeError("database secret")

    def get_by_recommendation(self, recommendation_id):
        raise RuntimeError("database secret")

    def get_combination(self, combination_id):
        raise RuntimeError("database secret")


class UnavailableRecommendationSnapshotStore(InMemoryRecommendationSnapshotStore):
    def get_snapshot(self, recommendation_id):
        raise RecommendationSnapshotStoreError("database unavailable")


def _client_with_stores(snapshot_store, combination_store=None, catalog_store=None):
    app = create_app(
        agent_catalog_store=catalog_store or InMemoryAgentCatalogStore(),
        combination_agent_store=combination_store or InMemoryCombinationAgentStore(id_factory=lambda: "combo_test"),
        snapshot_store=snapshot_store,
    )
    app.config["TESTING"] = True
    return app.test_client()


def test_save_combination_agent_for_recommendation_persists_adjusted_lineup():
    snapshot_store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    snapshot_store.create_snapshot("need a conversion lineup")
    snapshot_store.update_entry_title("rec_test", "白酒成交英雄殿堂")
    combination_store = InMemoryCombinationAgentStore(id_factory=lambda: "combo_test")
    catalog_store = InMemoryAgentCatalogStore(
        agents=[
            {
                "id": "agent-030",
                "name": "用户画像大师",
                "function": "客户洞察",
                "launch_url": "https://chatgpt.com/g/g-profile",
                "has_avatar": True,
            }
        ],
        avatars={"agent-030": {"content": b"png-data", "mime_type": "image/png"}},
    )
    client = _client_with_stores(snapshot_store, combination_store, catalog_store)
    avatar_digest = hashlib.sha256(b"png-data").hexdigest()[:12]

    response = client.put(
        "/api/combination-agents/by-recommendation/rec_test",
        json={
            "lineup": [
                {
                    "agent_id": "agent-030",
                    "agent_name": "用户画像大师",
                    "avatar_url": "/api/agents/agent-030/avatar",
                    "launch_url": "https://chatgpt.com/g/g-profile",
                    "reason": "识别客户画像。",
                    "stage": "客户洞察",
                    "tags": ["画像识别"],
                },
                None,
                {"agent_name": "成交教练", "stage": "成交转化"},
            ],
            "score": {"total": 86, "grade": "S"},
        },
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body["id"] == "combo_test"
    assert body["recommendation_id"] == "rec_test"
    assert body["title"] == "白酒成交英雄殿堂"
    assert body["lineup"][0] == {
        "agent_id": "agent-030",
        "agent_name": "用户画像大师",
        "avatar_url": f"/agent-avatars/agent-030-{avatar_digest}.png",
        "endpoint": "https://chatgpt.com/g/g-profile",
        "id": "agent-030",
        "launch_url": "https://chatgpt.com/g/g-profile",
        "link": "https://chatgpt.com/g/g-profile",
        "name": "用户画像大师",
        "rank": 1,
        "reason": "识别客户画像。",
        "slot_index": 0,
        "stage": "客户洞察",
        "streamStatus": "completed",
        "tags": ["画像识别"],
        "url": "https://chatgpt.com/g/g-profile",
    }
    assert body["lineup"][1] is None
    assert body["lineup"][2]["agent_name"] == "成交教练"
    assert len(body["lineup"]) == 5
    assert body["score"] == {"total": 86, "grade": "S"}
    assert body["source_snapshot"]["id"] == "rec_test"

    by_recommendation = client.get("/api/combination-agents/by-recommendation/rec_test")
    by_id = client.get("/api/combination-agents/combo_test")

    assert by_recommendation.status_code == 200
    assert by_recommendation.get_json()["id"] == "combo_test"
    assert by_id.status_code == 200
    assert by_id.get_json()["recommendation_id"] == "rec_test"


def test_save_combination_agent_updates_existing_service_object():
    snapshot_store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    snapshot_store.create_snapshot("need agents")
    combination_store = InMemoryCombinationAgentStore(id_factory=lambda: "combo_test")
    client = _client_with_stores(snapshot_store, combination_store)

    first_response = client.put(
        "/api/combination-agents/by-recommendation/rec_test",
        json={"lineup": [{"agent_name": "策略专家"}], "score": {"total": 70}},
    )
    second_response = client.put(
        "/api/combination-agents/by-recommendation/rec_test",
        json={"lineup": [{"agent_name": "成交教练"}], "score": {"total": 91}},
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert second_response.get_json()["id"] == "combo_test"
    assert second_response.get_json()["lineup"][0]["agent_name"] == "成交教练"
    assert second_response.get_json()["score"] == {"total": 91}


def test_get_combination_agent_normalizes_duplicate_stored_slots():
    snapshot_store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    snapshot_store.create_snapshot("need agents")
    combination_store = InMemoryCombinationAgentStore(id_factory=lambda: "combo_test")
    combination_store.upsert_for_recommendation(
        "rec_test",
        title="Saved Lineup",
        lineup=[
            {"agent_id": "agent-001", "agent_name": "Strategy Agent"},
            {"agent_id": "", "agent_name": "Strategy Agent"},
        ],
    )
    client = _client_with_stores(snapshot_store, combination_store)

    response = client.get("/api/combination-agents/by-recommendation/rec_test")

    assert response.status_code == 200
    body = response.get_json()
    assert body["lineup"][0]["agent_id"] == "agent-001"
    assert body["lineup"][1] is None
    assert len(body["lineup"]) == 5


def test_get_combination_agent_by_recommendation_returns_404_when_not_saved():
    snapshot_store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    client = _client_with_stores(snapshot_store)

    response = client.get("/api/combination-agents/by-recommendation/rec_test")

    assert response.status_code == 404
    assert response.get_json() == {"error": "combination agent not found"}


def test_get_optional_combination_agent_returns_null_when_not_saved():
    snapshot_store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    client = _client_with_stores(snapshot_store)

    response = client.get("/api/combination-agents/by-recommendation/rec_test?optional=1")

    assert response.status_code == 200
    assert response.get_json() is None


def test_get_combination_agent_returns_404_when_missing():
    snapshot_store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    client = _client_with_stores(snapshot_store)

    response = client.get("/api/combination-agents/missing")

    assert response.status_code == 404
    assert response.get_json() == {"error": "combination agent not found"}


def test_save_combination_agent_requires_lineup_list():
    snapshot_store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    snapshot_store.create_snapshot("need agents")
    client = _client_with_stores(snapshot_store)

    response = client.put("/api/combination-agents/by-recommendation/rec_test", json={})

    assert response.status_code == 400
    assert response.get_json() == {"error": "lineup is required"}


def test_save_combination_agent_returns_404_for_missing_recommendation_snapshot():
    snapshot_store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    client = _client_with_stores(snapshot_store)

    response = client.put(
        "/api/combination-agents/by-recommendation/missing",
        json={"lineup": [{"agent_name": "成交教练"}]},
    )

    assert response.status_code == 404
    assert response.get_json() == {"error": "recommendation snapshot not found"}


def test_save_combination_agent_returns_503_when_snapshot_store_unavailable():
    client = _client_with_stores(UnavailableRecommendationSnapshotStore())

    response = client.put(
        "/api/combination-agents/by-recommendation/rec_test",
        json={"lineup": [{"agent_name": "成交教练"}]},
    )

    assert response.status_code == 503
    assert response.get_json() == {"error": "recommendation snapshot store unavailable"}


def test_combination_agent_routes_return_503_when_combination_store_unavailable():
    snapshot_store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    snapshot_store.create_snapshot("need agents")
    client = _client_with_stores(snapshot_store, UnavailableCombinationAgentStore())

    save_response = client.put(
        "/api/combination-agents/by-recommendation/rec_test",
        json={"lineup": [{"agent_name": "成交教练"}]},
    )
    get_response = client.get("/api/combination-agents/by-recommendation/rec_test")

    assert save_response.status_code == 503
    assert save_response.get_json() == {"error": "combination agent store unavailable"}
    assert get_response.status_code == 503
    assert get_response.get_json() == {"error": "combination agent store unavailable"}


def test_combination_agent_write_requires_session_and_owner_edit_token():
    snapshot_store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    snapshot_store.create_snapshot("need agents")
    app = create_app(
        agent_catalog_store=InMemoryAgentCatalogStore(),
        combination_agent_store=InMemoryCombinationAgentStore(id_factory=lambda: "combo_test"),
        snapshot_store=snapshot_store,
    )
    app.config.update(TESTING=True, ENFORCE_TEST_API_SECURITY=True)
    client = app.test_client()
    endpoint = "/api/combination-agents/by-recommendation/rec_test"

    missing_session = client.put(endpoint, json={"lineup": [{"agent_name": "策略专家"}]})
    assert missing_session.status_code == 401

    session_response = client.post("/api/session")
    csrf_token = session_response.get_json()["csrf_token"]
    session_headers = {"X-Agent-CSRF-Token": csrf_token}
    missing_edit_token = client.put(endpoint, headers=session_headers, json={"lineup": [{"agent_name": "策略专家"}]})
    assert missing_edit_token.status_code == 403
    assert missing_edit_token.get_json() == {"error": "recommendation is read-only"}

    valid_headers = {
        **session_headers,
        "X-Recommendation-Edit-Token": create_recommendation_edit_token(TEST_SIGNING_SECRET, "rec_test"),
    }
    saved = client.put(endpoint, headers=valid_headers, json={"lineup": [{"agent_name": "策略专家"}]})

    assert saved.status_code == 200
    assert saved.get_json()["lineup"][0]["agent_name"] == "策略专家"
