from flask import Blueprint, current_app, jsonify, request, url_for

recommendations_bp = Blueprint("recommendations", __name__)


@recommendations_bp.get("/recommendations/<recommendation_id>")
def get_recommendation_snapshot(recommendation_id):
    try:
        snapshot = current_app.config["RECOMMENDATION_SNAPSHOT_STORE"].get_snapshot(recommendation_id)
    except Exception:
        current_app.logger.exception("Recommendation snapshot store unavailable")
        return jsonify({"error": "recommendation snapshot store unavailable"}), 503

    if snapshot is None:
        return jsonify({"error": "recommendation snapshot not found"}), 404

    return jsonify(snapshot)


@recommendations_bp.post("/recommendations/<recommendation_id>/agents")
def append_agent_to_recommendation_snapshot(recommendation_id):
    data = request.get_json(silent=True) or {}
    agent_id = str(data.get("agent_id") or data.get("id") or "").strip()

    if not agent_id:
        return jsonify({"error": "agent_id is required"}), 400

    try:
        snapshot_store = current_app.config["RECOMMENDATION_SNAPSHOT_STORE"]
        catalog_store = current_app.config["AGENT_CATALOG_STORE"]
        snapshot = snapshot_store.get_snapshot(recommendation_id)
    except Exception:
        current_app.logger.exception("Recommendation snapshot store unavailable")
        return jsonify({"error": "recommendation snapshot store unavailable"}), 503

    if snapshot is None:
        return jsonify({"error": "recommendation snapshot not found"}), 404

    try:
        agent = catalog_store.get_agent(agent_id)
    except Exception:
        current_app.logger.exception("Agent catalog store unavailable")
        return jsonify({"error": "agent catalog store unavailable"}), 503

    if agent is None:
        return jsonify({"error": "agent not found"}), 404

    agents = list(snapshot.get("agents") or [])
    if _contains_agent(agents, agent_id):
        return jsonify(snapshot)

    next_agent = _snapshot_agent_from_catalog(agent, agents)
    updated_snapshot = snapshot_store.replace_agents(recommendation_id, [*agents, next_agent])

    if updated_snapshot is None:
        return jsonify({"error": "recommendation snapshot not found"}), 404

    return jsonify(updated_snapshot)


def _contains_agent(agents, agent_id):
    for agent in agents:
        if not isinstance(agent, dict):
            continue

        for key in ("agent_id", "id", "agent_key", "agentKey"):
            if str(agent.get(key) or "").strip() == agent_id:
                return True

    return False


def _snapshot_agent_from_catalog(agent, existing_agents):
    agent_id = str(agent.get("id") or "").strip()
    launch_url = str(agent.get("launch_url") or "").strip()
    name = str(agent.get("name") or "").strip()
    function_label = str(agent.get("function") or "").strip()
    type_label = str(agent.get("type") or "").strip()
    description = str(agent.get("description") or "").strip()
    next_index = _next_agent_index(existing_agents)
    next_rank = len(existing_agents) + 1
    avatar_url = str(agent.get("avatar_url") or "").strip()

    if not avatar_url and agent_id and agent.get("has_avatar"):
        avatar_url = url_for("agents.get_agent_avatar", agent_id=agent_id)
    return {
        "agent_index": next_index,
        "agent_id": agent_id,
        "agent_name": name,
        "avatar_url": avatar_url,
        "description": description,
        "endpoint": launch_url,
        "function": function_label,
        "id": agent_id,
        "launch_url": launch_url,
        "link": launch_url,
        "name": name,
        "rank": next_rank,
        "reason": description,
        "source": "manual",
        "stage": function_label or type_label or "手动添加",
        "streamStatus": "completed",
        "tags": agent.get("tags") if isinstance(agent.get("tags"), list) else [],
        "type": type_label,
        "url": launch_url,
    }


def _next_agent_index(agents):
    indexes = [agent.get("agent_index") for agent in agents if isinstance(agent, dict)]
    numeric_indexes = [index for index in indexes if isinstance(index, int)]

    if not numeric_indexes:
        return 0

    return max(numeric_indexes) + 1
