from app import create_app
from services.agent_catalog_store import InMemoryAgentCatalogStore, build_fallback_avatar
from services.recommendation_snapshot_store import InMemoryRecommendationSnapshotStore


def _client_with_catalog_store(catalog_store):
    app = create_app(
        agent_catalog_store=catalog_store,
        snapshot_store=InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test"),
    )
    app.config["TESTING"] = True
    return app.test_client()


def test_get_agents_returns_launch_url_and_avatar_url():
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
    client = _client_with_catalog_store(catalog_store)

    response = client.get("/api/agents")

    assert response.status_code == 200
    body = response.get_json()

    assert body == {
        "agents": [
            {
                "id": "agent-030",
                "name": "用户画像大师",
                "function": "管理",
                "type": "智能体",
                "launch_url": "https://chatgpt.com/g/g-profile",
                "avatar_url": "/api/agents/agent-030/avatar",
                "description": "分析用户特征与购买动机。",
                "tags": ["画像识别", "销售沟通"],
                "knowledge": [],
                "has_avatar": True,
            }
        ]
    }
    assert "detail_url" not in body["agents"][0]


def test_get_agent_avatar_returns_database_image_bytes():
    catalog_store = InMemoryAgentCatalogStore(
        agents=[{"id": "agent-030", "name": "用户画像大师", "has_avatar": True}],
        avatars={"agent-030": {"content": b"png-data", "mime_type": "image/png"}},
    )
    client = _client_with_catalog_store(catalog_store)

    response = client.get("/api/agents/agent-030/avatar")

    assert response.status_code == 200
    assert response.data == b"png-data"
    assert response.headers["Content-Type"] == "image/png"
    assert "public" in response.headers["Cache-Control"]


def test_get_agent_avatar_returns_404_when_missing():
    catalog_store = InMemoryAgentCatalogStore(agents=[{"id": "agent-030", "name": "用户画像大师"}])
    client = _client_with_catalog_store(catalog_store)

    response = client.get("/api/agents/agent-030/avatar")

    assert response.status_code == 404
    assert response.get_json() == {"error": "agent avatar not found"}


def test_get_agent_detail_route_is_not_exposed():
    catalog_store = InMemoryAgentCatalogStore(
        agents=[
            {
                "id": "agent-030",
                "name": "用户画像大师",
                "launch_url": "https://chatgpt.com/g/g-profile",
                "has_avatar": True,
            }
        ]
    )
    client = _client_with_catalog_store(catalog_store)

    response = client.get("/api/agents/agent-030")

    assert response.status_code == 404


def test_build_fallback_avatar_returns_svg_bytes_for_agents_without_source_image():
    avatar = build_fallback_avatar({"id": "agent-project", "name": "Project Agent", "function": "Research"})

    assert avatar["filename"] == "agent-project-fallback.svg"
    assert avatar["mime_type"] == "image/svg+xml"
    assert avatar["size_bytes"] == len(avatar["content"])
    assert b"<svg" in avatar["content"]
    assert b"Project Agent" in avatar["content"]
