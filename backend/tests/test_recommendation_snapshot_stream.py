import json

import pytest

from services.coze_stream_transformer import content_event, format_sse_event
from services.recommendation_snapshot_store import InMemoryRecommendationSnapshotStore
from services.recommendation_snapshot_stream import (
    parse_sse_event,
    persist_recommendation_snapshot_stream,
)


def _read_events(stream):
    events = []
    for frame in stream:
        data_line = next(line for line in frame.splitlines() if line.startswith("data:"))
        events.append(json.loads(data_line.replace("data:", "", 1).strip()))
    return events


def test_parse_sse_event_returns_none_for_non_object_data():
    assert parse_sse_event("event: done\ndata: [DONE]\n\n") is None
    assert parse_sse_event("event: ping\n\n") is None


def test_workflow_started_injects_recommendation_id():
    store = InMemoryRecommendationSnapshotStore()
    snapshot = store.create_snapshot("need agents")

    events = _read_events(
        persist_recommendation_snapshot_stream(
            [format_sse_event(content_event("workflow.started", {"conversation_ids": {"chat_id": "c1"}}))],
            store,
            snapshot["id"],
        )
    )

    assert events == [
        {
            "event": "workflow.started",
            "conversation_ids": {"chat_id": "c1"},
            "recommendation_id": snapshot["id"],
        }
    ]
    assert store.get_snapshot(snapshot["id"])["conversation_ids"] == {"chat_id": "c1"}


def test_recommendation_id_is_emitted_before_upstream_events_when_workflow_started_is_missing():
    store = InMemoryRecommendationSnapshotStore()
    snapshot = store.create_snapshot("need agents")

    events = _read_events(
        persist_recommendation_snapshot_stream(
            [
                format_sse_event(
                    content_event(
                        "recommended_agents.delta",
                        {"agent": {"agent_index": 0, "name": "Planner"}},
                    )
                )
            ],
            store,
            snapshot["id"],
        )
    )

    assert events[0] == {
        "event": "workflow.started",
        "recommendation_id": snapshot["id"],
    }
    assert events[1] == {
        "event": "recommended_agents.delta",
        "agent": {"agent_index": 0, "name": "Planner"},
    }


def test_recommended_agents_delta_merges_agents_and_completion_marks_snapshot_completed():
    store = InMemoryRecommendationSnapshotStore()
    snapshot = store.create_snapshot("need agents")
    frames = [
        format_sse_event(
            content_event(
                "recommended_agents.delta",
                {"agent": {"agent_index": 0, "name": "Planner"}},
            )
        ),
        format_sse_event(
            content_event(
                "recommended_agents.delta",
                {"agent": {"agent_index": 0, "reason": "Matches workflow"}},
            )
        ),
        format_sse_event(content_event("workflow.completed", {})),
    ]

    _read_events(persist_recommendation_snapshot_stream(frames, store, snapshot["id"]))

    saved = store.get_snapshot(snapshot["id"])
    assert saved["agents"] == [
        {"agent_index": 0, "name": "Planner", "reason": "Matches workflow"}
    ]
    assert saved["status"] == "completed"


def test_recommended_agent_completed_merges_agent_with_completed_stream_status():
    store = InMemoryRecommendationSnapshotStore()
    snapshot = store.create_snapshot("need agents")

    _read_events(
        persist_recommendation_snapshot_stream(
            [
                format_sse_event(
                    content_event(
                        "recommended_agent.completed",
                        {"agent": {"agent_index": 1, "name": "Closer"}},
                    )
                )
            ],
            store,
            snapshot["id"],
        )
    )

    assert store.get_snapshot(snapshot["id"])["agents"] == [
        {"agent_index": 1, "name": "Closer", "streamStatus": "completed"}
    ]


def test_recommended_agents_completed_replaces_snapshot_agents():
    store = InMemoryRecommendationSnapshotStore()
    snapshot = store.create_snapshot("need agents")
    replacement_agents = [
        {"agent_index": 2, "name": "Researcher"},
        {"agent_index": 3, "name": "Writer"},
    ]
    frames = [
        format_sse_event(
            content_event(
                "recommended_agents.delta",
                {"agent": {"agent_index": 0, "name": "Stale"}},
            )
        ),
        format_sse_event(
            content_event(
                "recommended_agents.completed",
                {"agents": replacement_agents},
            )
        ),
    ]

    _read_events(persist_recommendation_snapshot_stream(frames, store, snapshot["id"]))

    assert store.get_snapshot(snapshot["id"])["agents"] == replacement_agents


def test_workflow_error_marks_snapshot_failed_with_error_message():
    store = InMemoryRecommendationSnapshotStore()
    snapshot = store.create_snapshot("need agents")

    _read_events(
        persist_recommendation_snapshot_stream(
            [format_sse_event(content_event("workflow.error", {"error": "coze timeout"}))],
            store,
            snapshot["id"],
        )
    )

    saved = store.get_snapshot(snapshot["id"])
    assert saved["status"] == "failed"
    assert saved["error"] == "coze timeout"


def test_graph_path_resolved_saves_graph_path_fields():
    store = InMemoryRecommendationSnapshotStore()
    snapshot = store.create_snapshot("need agents")
    graph_payload = {
        "route": "sales",
        "root_id": "root",
        "nodes": [{"id": "root"}],
        "edges": [{"from": "root", "to": "agent"}],
        "ignored": "not persisted",
    }

    _read_events(
        persist_recommendation_snapshot_stream(
            [format_sse_event(content_event("graph.path.resolved", graph_payload))],
            store,
            snapshot["id"],
        )
    )

    assert store.get_snapshot(snapshot["id"])["graph_path"] == {
        "route": "sales",
        "root_id": "root",
        "nodes": [{"id": "root"}],
        "edges": [{"from": "root", "to": "agent"}],
    }


def test_summary_content_delta_accumulates_and_updates_summary():
    store = InMemoryRecommendationSnapshotStore()
    snapshot = store.create_snapshot("need agents")
    frames = [
        format_sse_event(
            content_event(
                "content.delta",
                {
                    "stage": "agent_recommendation",
                    "type": "SUMMARY",
                    "content": "First ",
                },
            )
        ),
        format_sse_event(
            content_event(
                "content.delta",
                {
                    "stage": "agent_recommendation",
                    "type": "SUMMARY",
                    "content": "second",
                },
            )
        ),
    ]

    _read_events(persist_recommendation_snapshot_stream(frames, store, snapshot["id"]))

    assert store.get_snapshot(snapshot["id"])["summary"] == "First second"


def test_workflow_stage_completed_updates_agent_recommendation_summary():
    store = InMemoryRecommendationSnapshotStore()
    snapshot = store.create_snapshot("need agents")

    _read_events(
        persist_recommendation_snapshot_stream(
            [
                format_sse_event(
                    content_event(
                        "workflow.stage.completed",
                        {
                            "stage": "agent_recommendation",
                            "summary": "Use the research and writer agents.",
                        },
                    )
                )
            ],
            store,
            snapshot["id"],
        )
    )

    assert store.get_snapshot(snapshot["id"])["summary"] == "Use the research and writer agents."


def test_unparseable_frame_is_yielded_unchanged():
    store = InMemoryRecommendationSnapshotStore()
    snapshot = store.create_snapshot("need agents")
    frame = "event: message\ndata: not-json\n\n"

    events = list(persist_recommendation_snapshot_stream([frame], store, snapshot["id"]))

    assert parse_sse_event(events[0]) == {
        "event": "workflow.started",
        "recommendation_id": snapshot["id"],
    }
    assert events[1] == frame


def test_stream_exception_fails_snapshot_and_reraises_original_exception():
    store = InMemoryRecommendationSnapshotStore()
    snapshot = store.create_snapshot("need agents")
    error = RuntimeError("upstream broke")

    def broken_stream():
        yield format_sse_event(content_event("workflow.started", {}))
        raise error

    with pytest.raises(RuntimeError) as raised:
        list(persist_recommendation_snapshot_stream(broken_stream(), store, snapshot["id"]))

    saved = store.get_snapshot(snapshot["id"])
    assert raised.value is error
    assert saved["status"] == "failed"
    assert saved["error"] == "Backend stream failed"
