"""Recommendation snapshot persistence stores."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta, timezone
import secrets
from typing import Any, Callable

try:
    import psycopg
    from psycopg.rows import dict_row
    from psycopg.types.json import Jsonb
except ImportError:  # pragma: no cover - exercised only when psycopg is absent.
    psycopg = None
    dict_row = None
    Jsonb = None


Snapshot = dict[str, Any]


class RecommendationSnapshotStoreError(RuntimeError):
    """Raised when the recommendation snapshot store is unavailable."""


SNAPSHOT_COLUMNS = (
    "id",
    "status",
    "message",
    "agents_json",
    "summary",
    "graph_path_json",
    "conversation_ids_json",
    "error",
    "created_at",
    "updated_at",
)
SNAPSHOT_TTL = timedelta(days=3)


def new_recommendation_id() -> str:
    return f"rec_{secrets.token_hex(8)}"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _expires_before() -> datetime:
    return _now() - SNAPSHOT_TTL


def _format_datetime(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value)
        except ValueError:
            return None
    else:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)

    return parsed.astimezone(timezone.utc)


def _is_expired(snapshot: Snapshot) -> bool:
    created_at = _parse_datetime(snapshot.get("created_at"))
    return created_at is not None and created_at < _expires_before()


def _normalize_summary(summary: str | None) -> str:
    return summary or ""


def _normalize_conversation_ids(conversation_ids: Any) -> dict[str, Any]:
    return conversation_ids or {}


def _normalize_error(error: str | None) -> str:
    return error or ""


def _public_snapshot(snapshot: Snapshot) -> Snapshot:
    return deepcopy(snapshot)


class InMemoryRecommendationSnapshotStore:
    def __init__(self, id_factory: Callable[[], str] = new_recommendation_id):
        self._id_factory = id_factory
        self._snapshots: dict[str, Snapshot] = {}

    def create_snapshot(self, message: str) -> Snapshot:
        now = _now_iso()
        recommendation_id = self._id_factory()
        snapshot = {
            "id": recommendation_id,
            "status": "streaming",
            "message": message,
            "agents": [],
            "summary": "",
            "graph_path": None,
            "conversation_ids": {},
            "error": "",
            "created_at": now,
            "updated_at": now,
        }
        self._snapshots[recommendation_id] = snapshot
        return _public_snapshot(snapshot)

    def get_snapshot(self, recommendation_id: str) -> Snapshot | None:
        snapshot = self._get_active_snapshot(recommendation_id)
        if snapshot is None:
            return None
        return _public_snapshot(snapshot)

    def merge_agent(self, recommendation_id: str, agent_delta: dict[str, Any]) -> Snapshot | None:
        snapshot = self._get_active_snapshot(recommendation_id)
        if snapshot is None:
            return None

        agent_index = agent_delta.get("agent_index")
        agents = snapshot["agents"]
        for agent in agents:
            if agent.get("agent_index") == agent_index:
                agent.update(agent_delta)
                break
        else:
            agents.append(dict(agent_delta))

        self._touch(snapshot)
        return _public_snapshot(snapshot)

    def replace_agents(self, recommendation_id: str, agents: list[dict[str, Any]]) -> Snapshot | None:
        snapshot = self._get_active_snapshot(recommendation_id)
        if snapshot is None:
            return None
        snapshot["agents"] = deepcopy(agents)
        self._touch(snapshot)
        return _public_snapshot(snapshot)

    def update_summary(self, recommendation_id: str, summary: str | None) -> Snapshot | None:
        return self._update_field(recommendation_id, "summary", _normalize_summary(summary))

    def update_graph_path(self, recommendation_id: str, graph_path: Any) -> Snapshot | None:
        return self._update_field(recommendation_id, "graph_path", graph_path)

    def update_conversation_ids(self, recommendation_id: str, conversation_ids: Any) -> Snapshot | None:
        return self._update_field(recommendation_id, "conversation_ids", _normalize_conversation_ids(conversation_ids))

    def complete_snapshot(self, recommendation_id: str) -> Snapshot | None:
        return self._update_status(recommendation_id, "completed", "")

    def fail_snapshot(self, recommendation_id: str, error: str) -> Snapshot | None:
        return self._update_status(recommendation_id, "failed", _normalize_error(error))

    def _update_field(self, recommendation_id: str, field: str, value: Any) -> Snapshot | None:
        snapshot = self._get_active_snapshot(recommendation_id)
        if snapshot is None:
            return None
        snapshot[field] = deepcopy(value)
        self._touch(snapshot)
        return _public_snapshot(snapshot)

    def _update_status(self, recommendation_id: str, status: str, error: str) -> Snapshot | None:
        snapshot = self._get_active_snapshot(recommendation_id)
        if snapshot is None:
            return None
        snapshot["status"] = status
        snapshot["error"] = error
        self._touch(snapshot)
        return _public_snapshot(snapshot)

    def _touch(self, snapshot: Snapshot) -> None:
        snapshot["updated_at"] = _now_iso()

    def _get_active_snapshot(self, recommendation_id: str) -> Snapshot | None:
        snapshot = self._snapshots.get(recommendation_id)
        if snapshot is None:
            return None

        if _is_expired(snapshot):
            self._snapshots.pop(recommendation_id, None)
            return None

        return snapshot


class PostgresRecommendationSnapshotStore:
    def __init__(
        self,
        dsn: str | None = None,
        connection: Any | None = None,
        table_name: str = "recommendation_snapshots",
        id_factory: Callable[[], str] = new_recommendation_id,
    ):
        if connection is None and dsn is None:
            raise RecommendationSnapshotStoreError("dsn or connection is required")
        if not table_name.replace("_", "").isalnum():
            raise ValueError("table_name must contain only letters, numbers, and underscores")
        self._dsn = dsn
        self._connection = connection
        self._table_name = table_name
        self._id_factory = id_factory

    def ensure_schema(self) -> None:
        self._execute_write(
            f"""
            CREATE TABLE IF NOT EXISTS {self._table_name} (
                id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                message TEXT NOT NULL,
                agents_json JSONB NOT NULL DEFAULT '[]'::jsonb,
                summary TEXT NOT NULL DEFAULT '',
                graph_path_json JSONB,
                conversation_ids_json JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                error TEXT NOT NULL DEFAULT '',
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL
            )
            """,
            (),
        )
        self.delete_expired_snapshots()

    def create_snapshot(self, message: str) -> Snapshot:
        self.delete_expired_snapshots()
        now = _now()
        recommendation_id = self._id_factory()
        return self._execute_write_returning(
            f"""
            INSERT INTO {self._table_name}
                (id, status, message, agents_json, summary, graph_path_json,
                 conversation_ids_json, error, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING {", ".join(SNAPSHOT_COLUMNS)}
            """,
            (
                recommendation_id,
                "streaming",
                message,
                self._jsonb([]),
                "",
                None,
                self._jsonb({}),
                "",
                now,
                now,
            ),
        )

    def get_snapshot(self, recommendation_id: str) -> Snapshot | None:
        self.delete_expired_snapshots()
        return self._execute_read_returning(
            f"SELECT {', '.join(SNAPSHOT_COLUMNS)} FROM {self._table_name} WHERE id = %s AND created_at >= %s",
            (recommendation_id, _expires_before()),
        )

    def delete_expired_snapshots(self) -> None:
        self._execute_write(
            f"DELETE FROM {self._table_name} WHERE created_at < %s",
            (_expires_before(),),
        )

    def merge_agent(self, recommendation_id: str, agent_delta: dict[str, Any]) -> Snapshot | None:
        snapshot = self.get_snapshot(recommendation_id)
        if snapshot is None:
            return None

        agent_index = agent_delta.get("agent_index")
        agents = snapshot["agents"]
        for agent in agents:
            if agent.get("agent_index") == agent_index:
                agent.update(agent_delta)
                break
        else:
            agents.append(dict(agent_delta))

        return self.replace_agents(recommendation_id, agents)

    def replace_agents(self, recommendation_id: str, agents: list[dict[str, Any]]) -> Snapshot | None:
        return self._update_json_field(recommendation_id, "agents_json", agents)

    def update_summary(self, recommendation_id: str, summary: str | None) -> Snapshot | None:
        return self._update_field(recommendation_id, "summary", _normalize_summary(summary))

    def update_graph_path(self, recommendation_id: str, graph_path: Any) -> Snapshot | None:
        return self._update_json_field(recommendation_id, "graph_path_json", graph_path)

    def update_conversation_ids(self, recommendation_id: str, conversation_ids: Any) -> Snapshot | None:
        return self._update_json_field(
            recommendation_id,
            "conversation_ids_json",
            _normalize_conversation_ids(conversation_ids),
        )

    def complete_snapshot(self, recommendation_id: str) -> Snapshot | None:
        return self._update_status(recommendation_id, "completed", "")

    def fail_snapshot(self, recommendation_id: str, error: str) -> Snapshot | None:
        return self._update_status(recommendation_id, "failed", _normalize_error(error))

    def complete(self, recommendation_id: str) -> Snapshot | None:
        return self.complete_snapshot(recommendation_id)

    def fail(self, recommendation_id: str, error: str) -> Snapshot | None:
        return self.fail_snapshot(recommendation_id, error)

    def _update_field(self, recommendation_id: str, column: str, value: Any) -> Snapshot | None:
        return self._execute_write_returning_optional(
            f"""
            UPDATE {self._table_name}
            SET {column} = %s, updated_at = %s
            WHERE id = %s AND created_at >= %s
            RETURNING {", ".join(SNAPSHOT_COLUMNS)}
            """,
            (value, _now(), recommendation_id, _expires_before()),
        )

    def _update_json_field(self, recommendation_id: str, column: str, value: Any) -> Snapshot | None:
        return self._update_field(recommendation_id, column, self._jsonb(value))

    def _update_status(self, recommendation_id: str, status: str, error: str) -> Snapshot | None:
        return self._execute_write_returning_optional(
            f"""
            UPDATE {self._table_name}
            SET status = %s, error = %s, updated_at = %s
            WHERE id = %s AND created_at >= %s
            RETURNING {", ".join(SNAPSHOT_COLUMNS)}
            """,
            (status, error, _now(), recommendation_id, _expires_before()),
        )

    def _connect(self):
        if self._connection is not None:
            return _ExistingConnection(self._connection)
        if psycopg is None:
            raise RecommendationSnapshotStoreError("psycopg is required for PostgresRecommendationSnapshotStore")
        return psycopg.connect(self._dsn)

    def _cursor(self, connection: Any):
        if dict_row is None:
            return connection.cursor()
        return connection.cursor(row_factory=dict_row)

    def _execute_write(self, query: str, params: tuple[Any, ...]) -> None:
        with self._connect() as connection:
            try:
                with self._cursor(connection) as cursor:
                    cursor.execute(query, params)
                connection.commit()
            except Exception:
                connection.rollback()
                raise

    def _execute_write_returning(self, query: str, params: tuple[Any, ...]) -> Snapshot:
        snapshot = self._execute_write_returning_optional(query, params)
        if snapshot is None:
            raise RuntimeError("expected snapshot row")
        return snapshot

    def _execute_write_returning_optional(self, query: str, params: tuple[Any, ...]) -> Snapshot | None:
        with self._connect() as connection:
            try:
                with self._cursor(connection) as cursor:
                    cursor.execute(query, params)
                    row = cursor.fetchone()
                connection.commit()
            except Exception:
                connection.rollback()
                raise
        if row is None:
            return None
        return self._row_to_snapshot(row)

    def _execute_read_returning(self, query: str, params: tuple[Any, ...]) -> Snapshot | None:
        with self._connect() as connection:
            with self._cursor(connection) as cursor:
                cursor.execute(query, params)
                row = cursor.fetchone()
        if row is None:
            return None
        return self._row_to_snapshot(row)

    def _row_to_snapshot(self, row: Any) -> Snapshot:
        if not isinstance(row, dict):
            row = dict(zip(SNAPSHOT_COLUMNS, row))
        return {
            "id": row["id"],
            "status": row["status"],
            "message": row["message"],
            "agents": deepcopy(row["agents_json"] or []),
            "summary": row["summary"] or "",
            "graph_path": deepcopy(row["graph_path_json"]),
            "conversation_ids": deepcopy(row["conversation_ids_json"] or {}),
            "error": row["error"] or "",
            "created_at": _format_datetime(row["created_at"]),
            "updated_at": _format_datetime(row["updated_at"]),
        }

    def _jsonb(self, value: Any) -> Any:
        if Jsonb is None:
            return value
        return Jsonb(value)


class _ExistingConnection:
    def __init__(self, connection: Any):
        self._connection = connection

    def __enter__(self) -> Any:
        return self._connection

    def __exit__(self, exc_type: Any, exc: Any, traceback: Any) -> None:
        return None
