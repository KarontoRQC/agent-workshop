"""Combination agent persistence stores."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
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


CombinationAgent = dict[str, Any]

COMBINATION_AGENT_COLUMNS = (
    "id",
    "recommendation_id",
    "title",
    "lineup_json",
    "score_json",
    "source_snapshot_json",
    "status",
    "created_at",
    "updated_at",
)
MAX_COMBINATION_LINEUP_SIZE = 5
COMBINATION_AGENT_LINEUP_FIELDS = (
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


class CombinationAgentStoreError(RuntimeError):
    """Raised when the combination agent store is unavailable."""


def new_combination_agent_id() -> str:
    return f"combo_{secrets.token_hex(8)}"


def normalize_combination_lineup(raw_lineup: Any) -> list[Any]:
    if not isinstance(raw_lineup, list):
        raise ValueError("lineup is required")

    if len(raw_lineup) > MAX_COMBINATION_LINEUP_SIZE:
        raise ValueError(f"lineup must contain at most {MAX_COMBINATION_LINEUP_SIZE} agents")

    lineup: list[Any] = []
    seen_identity_keys: set[str] = set()

    for slot_index in range(MAX_COMBINATION_LINEUP_SIZE):
        raw_agent = raw_lineup[slot_index] if slot_index < len(raw_lineup) else None

        if raw_agent is None:
            lineup.append(None)
            continue

        if not isinstance(raw_agent, dict):
            raise ValueError("lineup agents must be objects or null")

        agent = normalize_combination_lineup_agent(raw_agent, slot_index)
        if not _lineup_agent_has_identity(agent):
            raise ValueError("lineup agents must include an id or name")

        identity_keys = _lineup_agent_identity_keys(agent)
        if any(key in seen_identity_keys for key in identity_keys):
            lineup.append(None)
            continue

        seen_identity_keys.update(identity_keys)
        lineup.append(agent)

    return lineup


def normalize_combination_score(score: Any) -> dict[str, Any]:
    return deepcopy(score) if isinstance(score, dict) else {}


def normalize_combination_title(title: Any) -> str:
    return str(title or "").strip() or "智能体组合"


def normalize_combination_source_snapshot(source_snapshot: Any) -> dict[str, Any]:
    return deepcopy(source_snapshot) if isinstance(source_snapshot, dict) else {}


def normalize_combination_lineup_agent(raw_agent: dict[str, Any], slot_index: int) -> dict[str, Any]:
    agent: dict[str, Any] = {}

    for field in COMBINATION_AGENT_LINEUP_FIELDS:
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


def _lineup_agent_has_identity(agent: dict[str, Any]) -> bool:
    return any(str(agent.get(key) or "").strip() for key in ("id", "agent_id", "agent_key", "agentKey", "name", "agent_name"))


def _lineup_agent_identity_keys(agent: dict[str, Any]) -> set[str]:
    identity_fields = (
        "id",
        "agent_id",
        "agent_key",
        "agentKey",
        "launch_url",
        "endpoint",
        "url",
        "link",
        "name",
        "agent_name",
    )

    return {str(agent.get(field) or "").strip().lower() for field in identity_fields if str(agent.get(field) or "").strip()}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().isoformat()


def _format_datetime(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _public_combination_agent(combination_agent: CombinationAgent) -> CombinationAgent:
    return deepcopy(combination_agent)


class InMemoryCombinationAgentStore:
    def __init__(self, id_factory: Callable[[], str] = new_combination_agent_id):
        self._id_factory = id_factory
        self._items_by_id: dict[str, CombinationAgent] = {}
        self._ids_by_recommendation: dict[str, str] = {}

    def ensure_schema(self) -> None:
        return None

    def upsert_for_recommendation(
        self,
        recommendation_id: str,
        *,
        title: Any,
        lineup: Any,
        score: Any = None,
        source_snapshot: Any = None,
    ) -> CombinationAgent:
        now = _now_iso()
        existing_id = self._ids_by_recommendation.get(recommendation_id)

        if existing_id and existing_id in self._items_by_id:
            combination_agent = self._items_by_id[existing_id]
            combination_agent["title"] = normalize_combination_title(title)
            combination_agent["lineup"] = deepcopy(_coerce_lineup(lineup))
            combination_agent["score"] = normalize_combination_score(score)
            combination_agent["source_snapshot"] = normalize_combination_source_snapshot(source_snapshot)
            combination_agent["status"] = "saved"
            combination_agent["updated_at"] = now
            return _public_combination_agent(combination_agent)

        combination_id = self._id_factory()
        combination_agent = {
            "id": combination_id,
            "recommendation_id": recommendation_id,
            "title": normalize_combination_title(title),
            "lineup": deepcopy(_coerce_lineup(lineup)),
            "score": normalize_combination_score(score),
            "source_snapshot": normalize_combination_source_snapshot(source_snapshot),
            "status": "saved",
            "created_at": now,
            "updated_at": now,
        }
        self._items_by_id[combination_id] = combination_agent
        self._ids_by_recommendation[recommendation_id] = combination_id
        return _public_combination_agent(combination_agent)

    def get_combination(self, combination_id: str) -> CombinationAgent | None:
        combination_agent = self._items_by_id.get(combination_id)
        return _public_combination_agent(combination_agent) if combination_agent else None

    def get_by_recommendation(self, recommendation_id: str) -> CombinationAgent | None:
        combination_id = self._ids_by_recommendation.get(recommendation_id)
        if not combination_id:
            return None
        return self.get_combination(combination_id)


class PostgresCombinationAgentStore:
    def __init__(
        self,
        dsn: str | None = None,
        connection: Any | None = None,
        table_name: str = "combination_agents",
        id_factory: Callable[[], str] = new_combination_agent_id,
    ):
        if connection is None and dsn is None:
            raise CombinationAgentStoreError("dsn or connection is required")
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
                recommendation_id TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL DEFAULT '',
                lineup_json JSONB NOT NULL DEFAULT '[]'::jsonb,
                score_json JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                source_snapshot_json JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                status TEXT NOT NULL DEFAULT 'saved',
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL
            )
            """,
            (),
        )

    def upsert_for_recommendation(
        self,
        recommendation_id: str,
        *,
        title: Any,
        lineup: Any,
        score: Any = None,
        source_snapshot: Any = None,
    ) -> CombinationAgent:
        now = _now()
        return self._execute_write_returning(
            f"""
            INSERT INTO {self._table_name}
                (id, recommendation_id, title, lineup_json, score_json, source_snapshot_json, status, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (recommendation_id) DO UPDATE SET
                title = EXCLUDED.title,
                lineup_json = EXCLUDED.lineup_json,
                score_json = EXCLUDED.score_json,
                source_snapshot_json = EXCLUDED.source_snapshot_json,
                status = EXCLUDED.status,
                updated_at = EXCLUDED.updated_at
            RETURNING {", ".join(COMBINATION_AGENT_COLUMNS)}
            """,
            (
                self._id_factory(),
                recommendation_id,
                normalize_combination_title(title),
                self._jsonb(_coerce_lineup(lineup)),
                self._jsonb(normalize_combination_score(score)),
                self._jsonb(normalize_combination_source_snapshot(source_snapshot)),
                "saved",
                now,
                now,
            ),
        )

    def get_combination(self, combination_id: str) -> CombinationAgent | None:
        return self._execute_read_returning(
            f"SELECT {', '.join(COMBINATION_AGENT_COLUMNS)} FROM {self._table_name} WHERE id = %s",
            (combination_id,),
        )

    def get_by_recommendation(self, recommendation_id: str) -> CombinationAgent | None:
        return self._execute_read_returning(
            f"SELECT {', '.join(COMBINATION_AGENT_COLUMNS)} FROM {self._table_name} WHERE recommendation_id = %s",
            (recommendation_id,),
        )

    def _connect(self):
        if self._connection is not None:
            return _ExistingConnection(self._connection)
        if psycopg is None:
            raise CombinationAgentStoreError("psycopg is required for PostgresCombinationAgentStore")
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

    def _execute_write_returning(self, query: str, params: tuple[Any, ...]) -> CombinationAgent:
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
            raise RuntimeError("expected combination agent row")
        return self._row_to_combination_agent(row)

    def _execute_read_returning(self, query: str, params: tuple[Any, ...]) -> CombinationAgent | None:
        with self._connect() as connection:
            with self._cursor(connection) as cursor:
                cursor.execute(query, params)
                row = cursor.fetchone()
        if row is None:
            return None
        return self._row_to_combination_agent(row)

    def _row_to_combination_agent(self, row: Any) -> CombinationAgent:
        if not isinstance(row, dict):
            row = dict(zip(COMBINATION_AGENT_COLUMNS, row))
        return {
            "id": row["id"],
            "recommendation_id": row["recommendation_id"],
            "title": row["title"] or "",
            "lineup": deepcopy(row["lineup_json"] or []),
            "score": deepcopy(row["score_json"] or {}),
            "source_snapshot": deepcopy(row["source_snapshot_json"] or {}),
            "status": row["status"] or "saved",
            "created_at": _format_datetime(row["created_at"]),
            "updated_at": _format_datetime(row["updated_at"]),
        }

    def _jsonb(self, value: Any) -> Any:
        if Jsonb is None:
            return value
        return Jsonb(value)


def _coerce_lineup(lineup: Any) -> list[Any]:
    return deepcopy(lineup) if isinstance(lineup, list) else []


class _ExistingConnection:
    def __init__(self, connection: Any):
        self._connection = connection

    def __enter__(self) -> Any:
        return self._connection

    def __exit__(self, exc_type: Any, exc: Any, traceback: Any) -> None:
        return None
