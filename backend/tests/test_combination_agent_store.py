from datetime import datetime, timezone
import re

import pytest

from services.combination_agent_store import (
    InMemoryCombinationAgentStore,
    PostgresCombinationAgentStore,
    CombinationAgentStoreError,
    new_combination_agent_id,
    normalize_combination_lineup,
)


def test_new_combination_agent_id_uses_combo_prefix_and_16_hex_chars():
    combination_agent_id = new_combination_agent_id()

    assert re.fullmatch(r"combo_[0-9a-f]{16}", combination_agent_id)


def test_normalize_combination_lineup_pads_to_five_slots_and_normalizes_fields():
    lineup = normalize_combination_lineup(
        [
            {
                "agent_id": "agent-001",
                "agent_name": "策略专家",
                "endpoint": "https://example.com/agent",
                "description": "制定组合策略",
            },
            None,
            {"name": "成交教练"},
        ]
    )

    assert len(lineup) == 5
    assert lineup[0]["id"] == "agent-001"
    assert lineup[0]["agent_name"] == "策略专家"
    assert lineup[0]["launch_url"] == "https://example.com/agent"
    assert lineup[0]["rank"] == 1
    assert lineup[0]["slot_index"] == 0
    assert lineup[1] is None
    assert lineup[2]["agent_name"] == "成交教练"
    assert lineup[2]["rank"] == 3


def test_normalize_combination_lineup_turns_duplicate_agents_into_empty_slots():
    lineup = normalize_combination_lineup(
        [
            {"agent_id": "agent-001", "agent_name": "Strategy Agent", "launch_url": "https://example.com/a"},
            {"agent_id": "agent-001", "agent_name": "Strategy Agent Copy", "launch_url": "https://example.com/a-copy"},
            {"agent_name": "Deal Coach"},
            {"agent_name": "Deal Coach", "launch_url": ""},
        ]
    )

    assert lineup[0]["agent_id"] == "agent-001"
    assert lineup[1] is None
    assert lineup[2]["agent_name"] == "Deal Coach"
    assert lineup[3] is None
    assert lineup[4] is None


def test_in_memory_upsert_for_recommendation_updates_same_combination_agent():
    store = InMemoryCombinationAgentStore(id_factory=lambda: "combo_test")

    first = store.upsert_for_recommendation(
        "rec_test",
        title="白酒招商英雄殿堂",
        lineup=[{"agent_id": "agent-001", "agent_name": "策略专家"}],
        score={"total": 84},
        source_snapshot={"id": "rec_test"},
    )
    second = store.upsert_for_recommendation(
        "rec_test",
        title="白酒成交英雄殿堂",
        lineup=[None, {"agent_id": "agent-002", "agent_name": "成交教练"}],
        score={"total": 91},
        source_snapshot={"id": "rec_test", "summary": "成交组合"},
    )

    assert first["id"] == "combo_test"
    assert second["id"] == "combo_test"
    assert second["title"] == "白酒成交英雄殿堂"
    assert second["lineup"][1]["agent_name"] == "成交教练"
    assert second["score"] == {"total": 91}
    assert store.get_by_recommendation("rec_test") == second
    assert store.get_combination("combo_test") == second


def test_postgres_store_exposes_planned_api_methods():
    expected_methods = [
        "ensure_schema",
        "upsert_for_recommendation",
        "get_combination",
        "get_by_recommendation",
    ]

    for method_name in expected_methods:
        assert callable(getattr(PostgresCombinationAgentStore, method_name))


def test_combination_agent_store_error_can_be_imported():
    assert issubclass(CombinationAgentStoreError, Exception)


def test_postgres_upsert_normalizes_payload_before_write():
    store = PostgresCombinationAgentStore(connection=object(), id_factory=lambda: "combo_test")
    captured_params = []
    store._jsonb = lambda value: value
    store._execute_write_returning = lambda query, params: captured_params.append(params) or {
        "id": "combo_test",
        "recommendation_id": "rec_test",
        "title": params[2],
        "lineup": params[3],
        "score": params[4],
        "source_snapshot": params[5],
        "status": "saved",
        "created_at": "now",
        "updated_at": "now",
    }

    store.upsert_for_recommendation(
        "rec_test",
        title="  ",
        lineup="bad-lineup",
        score="bad-score",
        source_snapshot="bad-snapshot",
    )

    assert captured_params[0][2] == "智能体组合"
    assert captured_params[0][3] == []
    assert captured_params[0][4] == {}
    assert captured_params[0][5] == {}


def test_postgres_row_to_combination_agent_formats_datetime_fields_as_iso_strings():
    store = PostgresCombinationAgentStore(connection=object())
    created_at = datetime(2026, 7, 7, 10, 30, 45, tzinfo=timezone.utc)
    updated_at = datetime(2026, 7, 7, 10, 31, 45, tzinfo=timezone.utc)

    combination_agent = store._row_to_combination_agent(
        {
            "id": "combo_test",
            "recommendation_id": "rec_test",
            "title": "白酒成交英雄殿堂",
            "lineup_json": [{"agent_id": "agent-001", "agent_name": "策略专家"}],
            "score_json": {"total": 88},
            "source_snapshot_json": {"id": "rec_test"},
            "status": "saved",
            "created_at": created_at,
            "updated_at": updated_at,
        }
    )

    assert combination_agent["lineup"] == [{"agent_id": "agent-001", "agent_name": "策略专家"}]
    assert combination_agent["score"] == {"total": 88}
    assert combination_agent["source_snapshot"] == {"id": "rec_test"}
    assert combination_agent["created_at"] == created_at.isoformat()
    assert combination_agent["updated_at"] == updated_at.isoformat()


def test_postgres_write_rolls_back_existing_connection_on_error():
    connection = FailingConnection()
    store = PostgresCombinationAgentStore(connection=connection)

    with pytest.raises(RuntimeError, match="write failed"):
        store._execute_write("UPDATE combination_agents SET status = %s", ("failed",))

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
