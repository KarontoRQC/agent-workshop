import hashlib

from app import create_app
from datetime import datetime, timedelta, timezone
from services.agent_catalog_store import InMemoryAgentCatalogStore
from services.recommendation_snapshot_store import (
    InMemoryRecommendationSnapshotStore,
    RecommendationSnapshotStoreError,
)


class UnavailableRecommendationSnapshotStore(InMemoryRecommendationSnapshotStore):
    def get_snapshot(self, recommendation_id):
        raise RecommendationSnapshotStoreError("database unavailable")


class RawUnavailableRecommendationSnapshotStore(InMemoryRecommendationSnapshotStore):
    def get_snapshot(self, recommendation_id):
        raise RuntimeError("raw database secret")


class UnavailableLineupSaveStore(InMemoryRecommendationSnapshotStore):
    def update_saved_lineup(self, recommendation_id, saved_lineup, score=None):
        raise RecommendationSnapshotStoreError("database unavailable")


def _client_with_store(store, catalog_store=None):
    app = create_app(
        agent_catalog_store=catalog_store or InMemoryAgentCatalogStore(),
        snapshot_store=store,
    )
    app.config["TESTING"] = True
    return app.test_client()


def test_get_recommendation_snapshot_returns_snapshot():
    store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    snapshot = store.create_snapshot("need agents")
    store.merge_agent("rec_test", {"agent_index": 0, "agent_name": "Planner"})
    snapshot = store.get_snapshot("rec_test")
    client = _client_with_store(store)

    response = client.get("/api/recommendations/rec_test")

    assert response.status_code == 200
    assert response.get_json() == snapshot


def test_get_recommendation_snapshot_rewrites_legacy_avatar_url_to_static_url():
    store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    store.create_snapshot("need agents")
    store.merge_agent(
        "rec_test",
        {
            "agent_id": "agent-001",
            "agent_index": 0,
            "agent_name": "战略专家",
            "avatar_url": "/api/agents/agent-001/avatar",
        },
    )
    catalog_store = InMemoryAgentCatalogStore(
        agents=[{"id": "agent-001", "name": "战略专家", "has_avatar": True}],
        avatars={"agent-001": {"content": b"static-png", "mime_type": "image/png"}},
    )
    client = _client_with_store(store, catalog_store)
    avatar_digest = hashlib.sha256(b"static-png").hexdigest()[:12]

    response = client.get("/api/recommendations/rec_test")

    assert response.status_code == 200
    assert response.get_json()["agents"][0]["avatar_url"] == f"/agent-avatars/agent-001-{avatar_digest}.png"


def test_get_recommendation_snapshot_returns_404_for_missing_id():
    store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    client = _client_with_store(store)

    response = client.get("/api/recommendations/missing")

    assert response.status_code == 404
    assert response.get_json() == {"error": "recommendation snapshot not found"}


def test_get_recommendation_snapshot_returns_404_after_three_days():
    store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    store.create_snapshot("need agents")
    store._snapshots["rec_test"]["created_at"] = (datetime.now(timezone.utc) - timedelta(days=3, seconds=1)).isoformat()
    client = _client_with_store(store)

    response = client.get("/api/recommendations/rec_test")

    assert response.status_code == 404
    assert response.get_json() == {"error": "recommendation snapshot not found"}


def test_get_recommendation_snapshot_returns_503_when_store_unavailable():
    client = _client_with_store(UnavailableRecommendationSnapshotStore())

    response = client.get("/api/recommendations/rec_test")

    assert response.status_code == 503
    assert response.get_json() == {"error": "recommendation snapshot store unavailable"}


def test_get_recommendation_snapshot_returns_503_without_raw_error_detail():
    client = _client_with_store(RawUnavailableRecommendationSnapshotStore())

    response = client.get("/api/recommendations/rec_test")
    body = response.get_data(as_text=True)

    assert response.status_code == 503
    assert response.get_json() == {"error": "recommendation snapshot store unavailable"}
    assert "raw database secret" not in body


def test_append_agent_to_recommendation_snapshot_persists_manual_agent():
    snapshot_store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    snapshot_store.create_snapshot("need agents")
    snapshot_store.merge_agent("rec_test", {"agent_index": 0, "agent_name": "AI 推荐官"})
    catalog_store = InMemoryAgentCatalogStore(
        agents=[
            {
                "id": "agent-030",
                "name": "用户画像大师",
                "function": "管理",
                "type": "智能体",
                "launch_url": "https://chatgpt.com/g/g-profile",
                "description": "分析用户特征与购买动机。",
                "tags": ["画像识别", "销售沟通"],
                "has_avatar": True,
            }
        ],
        avatars={"agent-030": {"content": b"png-data", "mime_type": "image/png"}},
    )
    client = _client_with_store(snapshot_store, catalog_store)
    avatar_digest = hashlib.sha256(b"png-data").hexdigest()[:12]

    response = client.post("/api/recommendations/rec_test/agents", json={"agent_id": "agent-030"})

    assert response.status_code == 200
    body = response.get_json()
    assert body["agents"] == [
        {"agent_index": 0, "agent_name": "AI 推荐官"},
        {
            "agent_index": 1,
            "agent_id": "agent-030",
            "agent_name": "用户画像大师",
            "avatar_url": f"/agent-avatars/agent-030-{avatar_digest}.png",
            "description": "分析用户特征与购买动机。",
            "endpoint": "https://chatgpt.com/g/g-profile",
            "function": "管理",
            "id": "agent-030",
            "launch_url": "https://chatgpt.com/g/g-profile",
            "link": "https://chatgpt.com/g/g-profile",
            "name": "用户画像大师",
            "rank": 2,
            "reason": "分析用户特征与购买动机。",
            "source": "manual",
            "stage": "管理",
            "streamStatus": "completed",
            "tags": ["画像识别", "销售沟通"],
            "type": "智能体",
            "url": "https://chatgpt.com/g/g-profile",
        },
    ]
    assert "detail_url" not in body["agents"][1]


def test_append_agent_to_recommendation_snapshot_is_idempotent():
    snapshot_store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    snapshot_store.create_snapshot("need agents")
    catalog_store = InMemoryAgentCatalogStore(
        agents=[{"id": "agent-030", "name": "用户画像大师", "launch_url": "https://chatgpt.com/g/g-profile"}]
    )
    client = _client_with_store(snapshot_store, catalog_store)

    first_response = client.post("/api/recommendations/rec_test/agents", json={"agent_id": "agent-030"})
    second_response = client.post("/api/recommendations/rec_test/agents", json={"agent_id": "agent-030"})

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert [agent["agent_id"] for agent in second_response.get_json()["agents"]] == ["agent-030"]


def test_append_agent_to_recommendation_snapshot_returns_404_for_missing_agent():
    snapshot_store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    snapshot_store.create_snapshot("need agents")
    client = _client_with_store(snapshot_store, InMemoryAgentCatalogStore())

    response = client.post("/api/recommendations/rec_test/agents", json={"agent_id": "missing"})

    assert response.status_code == 404
    assert response.get_json() == {"error": "agent not found"}


def test_append_agent_to_recommendation_snapshot_returns_404_after_three_days():
    snapshot_store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    snapshot_store.create_snapshot("need agents")
    snapshot_store._snapshots["rec_test"]["created_at"] = (
        datetime.now(timezone.utc) - timedelta(days=3, seconds=1)
    ).isoformat()
    catalog_store = InMemoryAgentCatalogStore(
        agents=[{"id": "agent-030", "name": "用户画像大师", "launch_url": "https://chatgpt.com/g/g-profile"}]
    )
    client = _client_with_store(snapshot_store, catalog_store)

    response = client.post("/api/recommendations/rec_test/agents", json={"agent_id": "agent-030"})

    assert response.status_code == 404
    assert response.get_json() == {"error": "recommendation snapshot not found"}


def test_append_agent_to_recommendation_snapshot_keeps_agent_without_launch_url_unopenable():
    snapshot_store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    snapshot_store.create_snapshot("need agents")
    catalog_store = InMemoryAgentCatalogStore(
        agents=[{"id": "agent-project", "name": "行业尽调", "launch_url": "", "type": "项目", "has_avatar": False}]
    )
    client = _client_with_store(snapshot_store, catalog_store)

    response = client.post("/api/recommendations/rec_test/agents", json={"agent_id": "agent-project"})

    assert response.status_code == 200
    agent = response.get_json()["agents"][0]
    assert agent["agent_name"] == "行业尽调"
    assert agent["launch_url"] == ""
    assert agent["endpoint"] == ""
    assert agent["url"] == ""
    assert "detail_url" not in agent


def test_save_recommendation_lineup_persists_adjusted_agents():
    snapshot_store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    snapshot_store.create_snapshot("need agents")
    catalog_store = InMemoryAgentCatalogStore(
        agents=[{"id": "agent-030", "name": "用户画像大师", "launch_url": "https://chatgpt.com/g/g-profile", "has_avatar": True}],
        avatars={"agent-030": {"content": b"png-data", "mime_type": "image/png"}},
    )
    client = _client_with_store(snapshot_store, catalog_store)
    avatar_digest = hashlib.sha256(b"png-data").hexdigest()[:12]

    response = client.put(
        "/api/recommendations/rec_test/lineup",
        json={
            "lineup": [
                {
                    "agent_id": "agent-030",
                    "agent_name": "用户画像大师",
                    "avatar_url": "/api/agents/agent-030/avatar",
                    "launch_url": "https://chatgpt.com/g/g-profile",
                    "reason": "识别客户画像。",
                    "stage": "管理",
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
    assert body["saved_lineup"][0] == {
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
        "stage": "管理",
        "streamStatus": "completed",
        "tags": ["画像识别"],
        "url": "https://chatgpt.com/g/g-profile",
    }
    assert body["saved_lineup"][1] is None
    assert body["saved_lineup"][2]["agent_name"] == "成交教练"
    assert body["saved_lineup"][2]["rank"] == 3
    assert len(body["saved_lineup"]) == 5
    assert body["saved_lineup_score"] == {"total": 86, "grade": "S"}
    assert body["saved_lineup_updated_at"]


def test_save_recommendation_lineup_requires_lineup_list():
    snapshot_store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    snapshot_store.create_snapshot("need agents")
    client = _client_with_store(snapshot_store)

    response = client.put("/api/recommendations/rec_test/lineup", json={})

    assert response.status_code == 400
    assert response.get_json() == {"error": "lineup is required"}


def test_save_recommendation_lineup_returns_404_after_three_days():
    snapshot_store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    snapshot_store.create_snapshot("need agents")
    snapshot_store._snapshots["rec_test"]["created_at"] = (
        datetime.now(timezone.utc) - timedelta(days=3, seconds=1)
    ).isoformat()
    client = _client_with_store(snapshot_store)

    response = client.put("/api/recommendations/rec_test/lineup", json={"lineup": [{"agent_name": "成交教练"}]})

    assert response.status_code == 404
    assert response.get_json() == {"error": "recommendation snapshot not found"}


def test_save_recommendation_lineup_returns_503_when_store_unavailable():
    client = _client_with_store(UnavailableLineupSaveStore())

    response = client.put("/api/recommendations/rec_test/lineup", json={"lineup": [{"agent_name": "成交教练"}]})

    assert response.status_code == 503
    assert response.get_json() == {"error": "recommendation snapshot store unavailable"}
