from flask import Blueprint, Response, current_app, jsonify, url_for


agents_bp = Blueprint("agents", __name__)


@agents_bp.get("/agents")
def list_agents():
    try:
        agents = current_app.config["AGENT_CATALOG_STORE"].list_agents()
    except Exception:
        current_app.logger.exception("Agent catalog store unavailable")
        return jsonify({"error": "agent catalog store unavailable"}), 503

    response = jsonify({"agents": [_agent_response(agent) for agent in agents]})
    response.headers["Cache-Control"] = "public, max-age=300, stale-while-revalidate=60"
    return response


@agents_bp.get("/agents/<agent_id>/avatar")
def get_agent_avatar(agent_id):
    try:
        avatar = current_app.config["AGENT_CATALOG_STORE"].get_avatar(agent_id)
    except Exception:
        current_app.logger.exception("Agent catalog store unavailable")
        return jsonify({"error": "agent catalog store unavailable"}), 503

    if avatar is None:
        return jsonify({"error": "agent avatar not found"}), 404

    response = Response(avatar.get("content") or b"", mimetype=avatar.get("mime_type") or "application/octet-stream")
    response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return response


def _agent_response(agent):
    agent_id = str(agent.get("id") or "").strip()
    has_avatar = bool(agent.get("has_avatar"))

    return {
        "id": agent_id,
        "name": str(agent.get("name") or ""),
        "function": str(agent.get("function") or ""),
        "type": str(agent.get("type") or ""),
        "launch_url": str(agent.get("launch_url") or ""),
        "avatar_url": get_agent_avatar_url(agent_id, has_avatar),
        "description": str(agent.get("description") or ""),
        "tags": agent.get("tags") if isinstance(agent.get("tags"), list) else [],
        "knowledge": agent.get("knowledge") if isinstance(agent.get("knowledge"), list) else [],
        "has_avatar": has_avatar,
    }


def get_agent_avatar_url(agent_id, has_avatar):
    if not agent_id or not has_avatar:
        return ""

    store = current_app.config["AGENT_CATALOG_STORE"]
    get_static_avatar_url = getattr(store, "get_static_avatar_url", None)

    if callable(get_static_avatar_url):
        static_url = get_static_avatar_url(agent_id)
        if static_url:
            return static_url

    return url_for("agents.get_agent_avatar", agent_id=agent_id)
