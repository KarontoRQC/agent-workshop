from datetime import datetime, timezone
import re

import pytest

from services.recommendation_snapshot_store import (
    InMemoryRecommendationSnapshotStore,
    PostgresRecommendationSnapshotStore,
    RecommendationSnapshotStoreError,
    new_recommendation_id,
)


def test_new_recommendation_id_uses_rec_prefix_and_16_hex_chars():
    recommendation_id = new_recommendation_id()

    assert re.fullmatch(r"rec_[0-9a-f]{16}", recommendation_id)


def test_create_snapshot_starts_streaming():
    store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")

    snapshot = store.create_snapshot("plan baijiu sales conversion")

    assert snapshot["id"] == "rec_test"
    assert snapshot["status"] == "streaming"
    assert snapshot["message"] == "plan baijiu sales conversion"
    assert snapshot["agents"] == []


def test_create_snapshot_uses_empty_api_fields():
    store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")

    snapshot = store.create_snapshot("message")

    assert snapshot["summary"] == ""
    assert snapshot["entry_title"] == ""
    assert snapshot["saved_lineup"] == []
    assert snapshot["saved_lineup_score"] == {}
    assert snapshot["saved_lineup_updated_at"] == ""
    assert snapshot["conversation_ids"] == {}
    assert snapshot["error"] == ""


def test_merge_agent_delta_keeps_current_agent_snapshot():
    store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    store.create_snapshot("message")

    store.merge_agent("rec_test", {"agent_index": 0, "rank": 1, "agent_name": "Sales Master"})
    store.merge_agent("rec_test", {"agent_index": 0, "stage": "closing", "reason": "handle objection"})

    snapshot = store.get_snapshot("rec_test")
    assert snapshot["agents"] == [
        {
            "agent_index": 0,
            "rank": 1,
            "agent_name": "Sales Master",
            "stage": "closing",
            "reason": "handle objection",
        }
    ]


def test_replace_agents_update_summary_and_complete_snapshot():
    store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    store.create_snapshot("message")
    agents = [
        {"agent_index": 0, "agent_name": "Sales Master"},
        {"agent_index": 1, "agent_name": "Customer Expert"},
    ]

    store.replace_agents("rec_test", agents)
    store.update_entry_title("rec_test", "白酒招商英雄殿堂")
    store.update_summary("rec_test", "Handle objections first, then promote repurchase.")
    snapshot = store.complete_snapshot("rec_test")

    assert snapshot["status"] == "completed"
    assert snapshot["entry_title"] == "白酒招商英雄殿堂"
    assert snapshot["summary"] == "Handle objections first, then promote repurchase."
    assert snapshot["agents"] == agents


def test_update_saved_lineup_persists_agent_slots_and_score():
    store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    store.create_snapshot("message")
    lineup = [
        {"agent_id": "agent-001", "agent_name": "策略专家", "slot_index": 0},
        None,
        {"agent_id": "agent-003", "agent_name": "成交教练", "slot_index": 2},
    ]
    score = {"total": 82, "grade": "S"}

    snapshot = store.update_saved_lineup("rec_test", lineup, score)

    assert snapshot["saved_lineup"] == lineup
    assert snapshot["saved_lineup_score"] == score
    assert snapshot["saved_lineup_updated_at"]


def test_get_snapshot_returns_none_when_missing():
    store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")

    assert store.get_snapshot("missing") is None


def test_postgres_store_exposes_planned_api_methods():
    expected_methods = [
        "ensure_schema",
        "create_snapshot",
        "get_snapshot",
        "merge_agent",
        "replace_agents",
        "update_summary",
        "update_entry_title",
        "update_saved_lineup",
        "update_graph_path",
        "update_conversation_ids",
        "complete_snapshot",
        "fail_snapshot",
        "complete",
        "fail",
    ]

    for method_name in expected_methods:
        assert callable(getattr(PostgresRecommendationSnapshotStore, method_name))


def test_recommendation_snapshot_store_error_can_be_imported():
    assert issubclass(RecommendationSnapshotStoreError, Exception)


def test_in_memory_update_summary_none_normalizes_to_empty_string():
    store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    store.create_snapshot("message")

    snapshot = store.update_summary("rec_test", None)

    assert snapshot["summary"] == ""


def test_in_memory_update_entry_title_none_normalizes_to_empty_string():
    store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    store.create_snapshot("message")

    snapshot = store.update_entry_title("rec_test", None)

    assert snapshot["entry_title"] == ""


def test_in_memory_update_entry_title_strips_whitespace():
    store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    store.create_snapshot("message")

    snapshot = store.update_entry_title("rec_test", " 白酒招商英雄殿堂\n")

    assert snapshot["entry_title"] == "白酒招商英雄殿堂"


def test_in_memory_update_conversation_ids_none_normalizes_to_empty_dict():
    store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    store.create_snapshot("message")

    snapshot = store.update_conversation_ids("rec_test", None)

    assert snapshot["conversation_ids"] == {}


def test_postgres_update_summary_none_normalizes_before_write():
    store = PostgresRecommendationSnapshotStore(connection=object())
    captured_params = []
    store._execute_write_returning_optional = lambda query, params: captured_params.append(params) or None

    store.update_summary("rec_test", None)

    assert captured_params[0][0] == ""


def test_postgres_update_entry_title_none_normalizes_before_write():
    store = PostgresRecommendationSnapshotStore(connection=object())
    captured_params = []
    store._execute_write_returning_optional = lambda query, params: captured_params.append(params) or None

    store.update_entry_title("rec_test", None)

    assert captured_params[0][0] == ""


def test_postgres_update_conversation_ids_none_normalizes_before_write():
    store = PostgresRecommendationSnapshotStore(connection=object())
    captured_params = []
    store._jsonb = lambda value: value
    store._execute_write_returning_optional = lambda query, params: captured_params.append(params) or None

    store.update_conversation_ids("rec_test", None)

    assert captured_params[0][0] == {}


def test_postgres_update_saved_lineup_normalizes_before_write():
    store = PostgresRecommendationSnapshotStore(connection=object())
    captured_params = []
    store._jsonb = lambda value: value
    store._execute_write_returning_optional = lambda query, params: captured_params.append(params) or None

    store.update_saved_lineup("rec_test", "bad-lineup", "bad-score")

    assert captured_params[0][0] == []
    assert captured_params[0][1] == {}


def test_postgres_row_to_snapshot_formats_datetime_fields_as_iso_strings():
    store = PostgresRecommendationSnapshotStore(connection=object())
    created_at = datetime(2026, 7, 2, 10, 30, 45, tzinfo=timezone.utc)
    updated_at = datetime(2026, 7, 2, 10, 31, 45, tzinfo=timezone.utc)

    snapshot = store._row_to_snapshot(
        {
            "id": "rec_test",
            "status": "streaming",
            "message": "message",
            "agents_json": [],
            "summary": "",
            "entry_title": "白酒招商英雄殿堂",
            "saved_lineup_json": [{"agent_id": "agent-001", "agent_name": "策略专家"}],
            "saved_lineup_score_json": {"total": 88},
            "saved_lineup_updated_at": updated_at,
            "graph_path_json": None,
            "conversation_ids_json": {},
            "error": "",
            "created_at": created_at,
            "updated_at": updated_at,
        }
    )

    assert snapshot["entry_title"] == "白酒招商英雄殿堂"
    assert snapshot["saved_lineup"] == [{"agent_id": "agent-001", "agent_name": "策略专家"}]
    assert snapshot["saved_lineup_score"] == {"total": 88}
    assert snapshot["saved_lineup_updated_at"] == updated_at.isoformat()
    assert snapshot["created_at"] == created_at.isoformat()
    assert snapshot["updated_at"] == updated_at.isoformat()


def test_postgres_write_rolls_back_existing_connection_on_error():
    connection = FailingConnection()
    store = PostgresRecommendationSnapshotStore(connection=connection)

    with pytest.raises(RuntimeError, match="write failed"):
        store._execute_write("UPDATE recommendation_snapshots SET status = %s", ("failed",))

    assert connection.rollback_called is True


def test_postgres_write_returning_rolls_back_existing_connection_on_error():
    connection = FailingConnection()
    store = PostgresRecommendationSnapshotStore(connection=connection)

    with pytest.raises(RuntimeError, match="write failed"):
        store._execute_write_returning_optional(
            "UPDATE recommendation_snapshots SET status = %s RETURNING id",
            ("failed",),
        )

    assert connection.rollback_called is True


class FailingCursor:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return None

    def execute(self, query, params):
        raise RuntimeError("write failed")


class FailingConnection:
    def __init__(self):
        self.rollback_called = False

    def cursor(self, *args, **kwargs):
        return FailingCursor()

    def commit(self):
        raise AssertionError("commit should not be called after cursor failure")

    def rollback(self):
        self.rollback_called = True
