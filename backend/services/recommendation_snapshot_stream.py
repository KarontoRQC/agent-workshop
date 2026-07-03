"""Persist recommendation snapshot updates while forwarding formatted SSE frames."""

from __future__ import annotations

import json
from typing import Any, Iterable, Iterator

from services.coze_stream_transformer import format_sse_event


def parse_sse_event(frame: str) -> dict[str, Any] | None:
    data_lines = []

    for line in frame.splitlines():
        if line.startswith("data:"):
            data_lines.append(line.removeprefix("data:").lstrip())

    if not data_lines:
        return None

    try:
        payload = json.loads("\n".join(data_lines))
    except json.JSONDecodeError:
        return None

    return payload if isinstance(payload, dict) else None


def persist_recommendation_snapshot_stream(
    stream: Iterable[str],
    store: Any,
    snapshot_id: str,
) -> Iterator[str]:
    summary = ""
    started_emitted = False

    try:
        for frame in stream:
            event = parse_sse_event(frame)

            if not started_emitted:
                started_emitted = True

                if event is None or event.get("event") != "workflow.started":
                    started_event = {"event": "workflow.started", "recommendation_id": snapshot_id}
                    _persist_event(started_event, store, snapshot_id, summary)
                    yield format_sse_event(started_event)

            if event is None:
                yield frame
                continue

            if event.get("event") == "workflow.started":
                event = {**event, "recommendation_id": snapshot_id}

            _persist_event(event, store, snapshot_id, summary)
            if _is_summary_delta(event):
                summary += event.get("content", "")

            yield format_sse_event(event)
    except Exception:
        store.fail_snapshot(snapshot_id, "Backend stream failed")
        raise


def _persist_event(event: dict[str, Any], store: Any, snapshot_id: str, summary: str) -> None:
    event_name = event.get("event")

    if "conversation_ids" in event:
        store.update_conversation_ids(snapshot_id, event.get("conversation_ids"))

    if event_name == "graph.path.resolved":
        store.update_graph_path(
            snapshot_id,
            {
                "route": event.get("route"),
                "root_id": event.get("root_id"),
                "nodes": event.get("nodes"),
                "edges": event.get("edges"),
            },
        )
        return

    if event_name == "recommended_agents.delta":
        agent = event.get("agent")
        if isinstance(agent, dict):
            store.merge_agent(snapshot_id, agent)
        return

    if event_name == "recommended_agent.completed":
        agent = event.get("agent")
        if isinstance(agent, dict):
            store.merge_agent(snapshot_id, {**agent, "streamStatus": "completed"})
        return

    if event_name == "recommended_agents.completed":
        agents = event.get("agents")
        if isinstance(agents, list):
            store.replace_agents(snapshot_id, agents)
        return

    if _is_summary_delta(event):
        store.update_summary(snapshot_id, summary + event.get("content", ""))
        return

    if event_name == "workflow.stage.completed":
        if event.get("stage") == "agent_recommendation" and event.get("summary"):
            store.update_summary(snapshot_id, event.get("summary"))
        return

    if event_name == "workflow.error":
        store.fail_snapshot(snapshot_id, _event_error(event))
        return

    if event_name == "workflow.completed":
        store.complete_snapshot(snapshot_id)


def _is_summary_delta(event: dict[str, Any]) -> bool:
    return (
        event.get("event") == "content.delta"
        and event.get("stage") == "agent_recommendation"
        and event.get("type") == "SUMMARY"
        and isinstance(event.get("content"), str)
    )


def _event_error(event: dict[str, Any]) -> str:
    error = event.get("error")
    if isinstance(error, str):
        return error
    if error:
        return str(error)
    message = event.get("message")
    return message if isinstance(message, str) else ""
