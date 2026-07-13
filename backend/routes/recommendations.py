from copy import deepcopy
import re

from flask import Blueprint, current_app, jsonify, request

from routes.agents import get_agent_avatar_url
from routes.access_control import require_recommendation_edit_access

recommendations_bp = Blueprint("recommendations", __name__)
LEGACY_AVATAR_URL_PATTERN = re.compile(r"/api/agents/([^/]+)/avatar(?:$|[?#])")
MAX_SAVED_LINEUP_SIZE = 5
SAVED_LINEUP_AGENT_FIELDS = (
    "activeField",
    "agent_id",
    "agent_index",
    "agent_key",
    "agentKey",
    "agent_name",
    "avatar",
    "avatarUrl",
    "avatar_url",
    "description",
    "endpoint",
    "function",
    "id",
    "jump_url",
    "launch_url",
    "lineup",
    "lineup_id",
    "lineupId",
    "link",
    "name",
    "rank",
    "reason",
    "score",
    "source",
    "stage",
    "streamStatus",
    "tags",
    "type",
    "url",
)


@recommendations_bp.get("/recommendations/<recommendation_id>")
def get_recommendation_snapshot(recommendation_id):
    try:
        snapshot = current_app.config["RECOMMENDATION_SNAPSHOT_STORE"].get_snapshot(recommendation_id)
    except Exception:
        current_app.logger.exception("Recommendation snapshot store unavailable")
        return jsonify({"error": "recommendation snapshot store unavailable"}), 503

    if snapshot is None:
        return jsonify({"error": "recommendation snapshot not found"}), 404

    return jsonify(_snapshot_with_static_avatar_urls(snapshot))


@recommendations_bp.post("/recommendations/<recommendation_id>/agents")
def append_agent_to_recommendation_snapshot(recommendation_id):
    access_error = require_recommendation_edit_access(recommendation_id)

    if access_error is not None:
        return access_error

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
        return jsonify(_snapshot_with_static_avatar_urls(snapshot))

    next_agent = _snapshot_agent_from_catalog(agent, agents)
    updated_snapshot = snapshot_store.replace_agents(recommendation_id, [*agents, next_agent])

    if updated_snapshot is None:
        return jsonify({"error": "recommendation snapshot not found"}), 404

    return jsonify(_snapshot_with_static_avatar_urls(updated_snapshot))


@recommendations_bp.put("/recommendations/<recommendation_id>/lineup")
def save_recommendation_lineup(recommendation_id):
    access_error = require_recommendation_edit_access(recommendation_id)

    if access_error is not None:
        return access_error

    data = request.get_json(silent=True) or {}
    raw_lineup = data.get("lineup")

    try:
        lineup = _normalize_saved_lineup_payload(raw_lineup)
        score = data.get("score") if isinstance(data.get("score"), dict) else {}
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    try:
        snapshot_store = current_app.config["RECOMMENDATION_SNAPSHOT_STORE"]
        updated_snapshot = snapshot_store.update_saved_lineup(recommendation_id, lineup, score)
    except Exception:
        current_app.logger.exception("Recommendation snapshot store unavailable")
        return jsonify({"error": "recommendation snapshot store unavailable"}), 503

    if updated_snapshot is None:
        return jsonify({"error": "recommendation snapshot not found"}), 404

    return jsonify(_snapshot_with_static_avatar_urls(updated_snapshot))


def _snapshot_with_static_avatar_urls(snapshot):
    next_snapshot = deepcopy(snapshot)
    agents = next_snapshot.get("agents")
    saved_lineup = next_snapshot.get("saved_lineup")

    if not isinstance(agents, list) and not isinstance(saved_lineup, list):
        return next_snapshot

    catalog_agents = _catalog_agents_by_lookup_key()

    for agent_list in (agents, saved_lineup):
        if not isinstance(agent_list, list):
            continue

        for agent in agent_list:
            if not isinstance(agent, dict):
                continue

            catalog_agent = _find_catalog_agent_for_snapshot_agent(agent, catalog_agents)
            if not catalog_agent:
                continue

            static_avatar_url = get_agent_avatar_url(str(catalog_agent.get("id") or ""), bool(catalog_agent.get("has_avatar")))
            if static_avatar_url:
                agent["avatar_url"] = static_avatar_url

    return next_snapshot


def _catalog_agents_by_lookup_key():
    try:
        catalog_agents = current_app.config["AGENT_CATALOG_STORE"].list_agents()
    except Exception:
        current_app.logger.exception("Agent catalog store unavailable")
        return {}

    lookup = {}

    for agent in catalog_agents:
        if not isinstance(agent, dict):
            continue

        for value in _snapshot_agent_lookup_values(agent):
            key = _normalize_lookup_key(value)
            if key and key not in lookup:
                lookup[key] = agent

    return lookup


def _find_catalog_agent_for_snapshot_agent(agent, catalog_agents):
    for value in _snapshot_agent_lookup_values(agent):
        key = _normalize_lookup_key(value)
        if key and key in catalog_agents:
            return catalog_agents[key]

    return None


def _snapshot_agent_lookup_values(agent):
    legacy_avatar_id = _extract_legacy_avatar_agent_id(agent.get("avatar_url"))

    return [
        agent.get("id"),
        agent.get("agent_id"),
        agent.get("agent_key"),
        agent.get("agentKey"),
        agent.get("name"),
        agent.get("agent_name"),
        legacy_avatar_id,
    ]


def _extract_legacy_avatar_agent_id(value):
    match = LEGACY_AVATAR_URL_PATTERN.search(str(value or ""))

    return match.group(1) if match else ""


def _normalize_lookup_key(value):
    return str(value or "").strip().lower()


def _normalize_saved_lineup_payload(raw_lineup):
    if not isinstance(raw_lineup, list):
        raise ValueError("lineup is required")

    if len(raw_lineup) > MAX_SAVED_LINEUP_SIZE:
        raise ValueError(f"lineup must contain at most {MAX_SAVED_LINEUP_SIZE} agents")

    lineup = []

    for slot_index in range(MAX_SAVED_LINEUP_SIZE):
        raw_agent = raw_lineup[slot_index] if slot_index < len(raw_lineup) else None

        if raw_agent is None:
            lineup.append(None)
            continue

        if not isinstance(raw_agent, dict):
            raise ValueError("lineup agents must be objects or null")

        agent = _normalize_saved_lineup_agent(raw_agent, slot_index)
        if not _saved_lineup_agent_has_identity(agent):
            raise ValueError("lineup agents must include an id or name")

        lineup.append(agent)

    return lineup


def _normalize_saved_lineup_agent(raw_agent, slot_index):
    agent = {}

    for field in SAVED_LINEUP_AGENT_FIELDS:
        if field in raw_agent:
            agent[field] = deepcopy(raw_agent[field])

    name = str(agent.get("name") or agent.get("agent_name") or "").strip()
    agent_id = str(agent.get("agent_id") or agent.get("id") or agent.get("agent_key") or agent.get("agentKey") or "").strip()
    launch_url = str(agent.get("launch_url") or agent.get("endpoint") or agent.get("url") or agent.get("link") or "").strip()
    stage = str(agent.get("stage") or agent.get("function") or agent.get("type") or "").strip()
    reason = str(agent.get("reason") or agent.get("description") or "").strip()

    if name:
        agent["name"] = name
        agent["agent_name"] = name

    if agent_id:
        agent["id"] = agent_id
        agent["agent_id"] = agent_id

    if launch_url:
        agent["launch_url"] = launch_url
        agent["endpoint"] = launch_url
        agent["link"] = launch_url
        agent["url"] = launch_url

    if stage:
        agent["stage"] = stage

    if reason:
        agent["reason"] = reason

    agent["rank"] = slot_index + 1
    agent["slot_index"] = slot_index
    agent["streamStatus"] = str(agent.get("streamStatus") or "completed")

    if not isinstance(agent.get("tags"), list):
        agent["tags"] = []

    return agent


def _saved_lineup_agent_has_identity(agent):
    return any(str(agent.get(key) or "").strip() for key in ("id", "agent_id", "agent_key", "agentKey", "name", "agent_name"))


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
    avatar_url = ""

    if agent_id and agent.get("has_avatar"):
        avatar_url = get_agent_avatar_url(agent_id, True)

    if not avatar_url:
        avatar_url = str(agent.get("avatar_url") or "").strip()
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
