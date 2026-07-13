from copy import deepcopy
import re

from flask import Blueprint, current_app, jsonify, request

from routes.agents import get_agent_avatar_url
from routes.access_control import require_recommendation_edit_access
from services.combination_agent_store import (
    normalize_combination_lineup,
    normalize_combination_score,
    normalize_combination_title,
)


combination_agents_bp = Blueprint("combination_agents", __name__)
LEGACY_AVATAR_URL_PATTERN = re.compile(r"/api/agents/([^/]+)/avatar(?:$|[?#])")


@combination_agents_bp.get("/combination-agents/<combination_agent_id>")
def get_combination_agent(combination_agent_id):
    try:
        combination_agent = current_app.config["COMBINATION_AGENT_STORE"].get_combination(combination_agent_id)
    except Exception:
        current_app.logger.exception("Combination agent store unavailable")
        return jsonify({"error": "combination agent store unavailable"}), 503

    if combination_agent is None:
        return jsonify({"error": "combination agent not found"}), 404

    return jsonify(_combination_agent_with_static_avatar_urls(combination_agent))


@combination_agents_bp.get("/combination-agents/by-recommendation/<recommendation_id>")
def get_combination_agent_by_recommendation(recommendation_id):
    try:
        combination_agent = current_app.config["COMBINATION_AGENT_STORE"].get_by_recommendation(recommendation_id)
    except Exception:
        current_app.logger.exception("Combination agent store unavailable")
        return jsonify({"error": "combination agent store unavailable"}), 503

    if combination_agent is None:
        if request.args.get("optional", "").strip().lower() in {"1", "true", "yes"}:
            return jsonify(None)
        return jsonify({"error": "combination agent not found"}), 404

    return jsonify(_combination_agent_with_static_avatar_urls(combination_agent))


@combination_agents_bp.put("/combination-agents/by-recommendation/<recommendation_id>")
def save_combination_agent_for_recommendation(recommendation_id):
    access_error = require_recommendation_edit_access(recommendation_id)

    if access_error is not None:
        return access_error

    data = request.get_json(silent=True) or {}

    try:
        lineup = normalize_combination_lineup(data.get("lineup"))
        score = normalize_combination_score(data.get("score"))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    try:
        snapshot = current_app.config["RECOMMENDATION_SNAPSHOT_STORE"].get_snapshot(recommendation_id)
    except Exception:
        current_app.logger.exception("Recommendation snapshot store unavailable")
        return jsonify({"error": "recommendation snapshot store unavailable"}), 503

    if snapshot is None:
        return jsonify({"error": "recommendation snapshot not found"}), 404

    title = normalize_combination_title(data.get("title") or snapshot.get("entry_title"))
    source_snapshot = _combination_source_snapshot(snapshot)

    try:
        combination_agent = current_app.config["COMBINATION_AGENT_STORE"].upsert_for_recommendation(
            recommendation_id,
            title=title,
            lineup=lineup,
            score=score,
            source_snapshot=source_snapshot,
        )
    except Exception:
        current_app.logger.exception("Combination agent store unavailable")
        return jsonify({"error": "combination agent store unavailable"}), 503

    return jsonify(_combination_agent_with_static_avatar_urls(combination_agent))


def _combination_source_snapshot(snapshot):
    return {
        "agents": deepcopy(snapshot.get("agents") if isinstance(snapshot.get("agents"), list) else []),
        "entry_title": str(snapshot.get("entry_title") or ""),
        "graph_path": deepcopy(snapshot.get("graph_path")),
        "id": str(snapshot.get("id") or ""),
        "message": str(snapshot.get("message") or ""),
        "status": str(snapshot.get("status") or ""),
        "summary": str(snapshot.get("summary") or ""),
    }


def _combination_agent_with_static_avatar_urls(combination_agent):
    next_combination_agent = deepcopy(combination_agent)
    lineup = next_combination_agent.get("lineup")

    if not isinstance(lineup, list):
        return next_combination_agent

    try:
        lineup = normalize_combination_lineup(lineup)
    except ValueError:
        lineup = next_combination_agent.get("lineup")

    next_combination_agent["lineup"] = lineup
    catalog_agents = _catalog_agents_by_lookup_key()

    for agent in lineup:
        if not isinstance(agent, dict):
            continue

        catalog_agent = _find_catalog_agent_for_lineup_agent(agent, catalog_agents)
        if not catalog_agent:
            continue

        static_avatar_url = get_agent_avatar_url(str(catalog_agent.get("id") or ""), bool(catalog_agent.get("has_avatar")))
        if static_avatar_url:
            agent["avatar_url"] = static_avatar_url

    return next_combination_agent


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

        for value in _lineup_agent_lookup_values(agent):
            key = _normalize_lookup_key(value)
            if key and key not in lookup:
                lookup[key] = agent

    return lookup


def _find_catalog_agent_for_lineup_agent(agent, catalog_agents):
    for value in _lineup_agent_lookup_values(agent):
        key = _normalize_lookup_key(value)
        if key and key in catalog_agents:
            return catalog_agents[key]

    return None


def _lineup_agent_lookup_values(agent):
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
