"""Agent catalog persistence stores."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import html
import json
import mimetypes
from pathlib import Path
import re
from typing import Any

try:
    import psycopg
    from psycopg.rows import dict_row
    from psycopg.types.json import Jsonb
except ImportError:  # pragma: no cover - exercised only when psycopg is absent.
    psycopg = None
    dict_row = None
    Jsonb = None


Agent = dict[str, Any]
Avatar = dict[str, Any]

AGENT_COLUMNS = (
    "id",
    "name",
    "function_label",
    "type_label",
    "launch_url",
    "description",
    "knowledge_json",
    "tags_json",
    "sort_order",
    "gpt_id",
    "source_json",
    "created_at",
    "updated_at",
    "has_avatar",
)
GPT_ID_PATTERN = re.compile(r"g-[a-z0-9]+", re.IGNORECASE)
RASTER_AVATAR_EXTENSIONS = {".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp"}


class AgentCatalogStoreError(RuntimeError):
    """Raised when the agent catalog store is unavailable."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _first_text(*values: Any) -> str:
    for value in values:
        if value is None:
            continue

        text = str(value).strip()
        if text:
            return text

    return ""


def _extract_gpt_id(value: Any) -> str:
    match = GPT_ID_PATTERN.search(_first_text(value))
    return match.group(0).lower() if match else ""


def _safe_static_name(value: Any) -> str:
    safe_name = re.sub(r"[^a-zA-Z0-9_-]+", "-", _first_text(value)).strip("-")
    return safe_name or "agent"


def _avatar_static_extension(avatar: Avatar) -> str:
    filename_suffix = Path(_first_text(avatar.get("filename"))).suffix.lower()

    if filename_suffix and re.match(r"^\.[a-z0-9]+$", filename_suffix):
        return ".jpg" if filename_suffix == ".jpe" else filename_suffix

    mime_type = _first_text(avatar.get("mime_type")).split(";", 1)[0]
    guessed_suffix = mimetypes.guess_extension(mime_type) or ""

    return ".jpg" if guessed_suffix == ".jpe" else guessed_suffix


def _avatar_static_filename(agent_id: str, avatar: Avatar) -> str:
    digest = _first_text(avatar.get("sha256"))
    digest_part = digest[:12] if digest else hashlib.sha256(avatar.get("content") or b"").hexdigest()[:12]
    return f"{_safe_static_name(agent_id)}-{digest_part}{_avatar_static_extension(avatar)}"


def _join_public_url(base_url: str, filename: str) -> str:
    return f"{base_url.rstrip('/')}/{filename.lstrip('/')}" if base_url else filename


def _split_knowledge(value: Any) -> list[str]:
    return [item.strip() for item in _first_text(value).split(",") if item.strip()]


def _normalize_seed_agent(row: dict[str, Any], index: int) -> Agent:
    name = _first_text(row.get("智能体名称"))
    function_label = _first_text(row.get("功能"))
    type_label = _first_text(row.get("类型"))
    launch_url = _first_text(row.get("智能体链接"))
    description = _first_text(row.get("智能体介绍"), f"{name} 是当前智能体库中的可调用能力。")
    tags = [tag for tag in (function_label, type_label) if tag]

    return {
        "id": f"agent-{index + 1:03d}",
        "name": name,
        "function": function_label,
        "type": type_label,
        "launch_url": launch_url,
        "description": description,
        "knowledge": _split_knowledge(row.get("知识库")),
        "tags": tags,
        "sort_order": index,
        "gpt_id": _extract_gpt_id(launch_url),
        "source": deepcopy(row),
    }


def _public_agent(agent: Agent) -> Agent:
    return deepcopy(agent)


def build_fallback_avatar(agent: Agent) -> Avatar:
    agent_id = _first_text(agent.get("id"), "agent")
    name = _first_text(agent.get("name"), agent_id)
    function_label = _first_text(agent.get("function"), agent.get("type"), "AGENT")
    initials = _avatar_initials(name)
    palette_index = int(hashlib.sha256(agent_id.encode("utf-8")).hexdigest()[:2], 16) % len(AVATAR_PALETTES)
    primary, secondary, accent = AVATAR_PALETTES[palette_index]
    safe_name = html.escape(name[:18])
    safe_function = html.escape(function_label[:16].upper())
    safe_initials = html.escape(initials)
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="{safe_name}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{primary}"/>
      <stop offset="0.58" stop-color="{secondary}"/>
      <stop offset="1" stop-color="#050b18"/>
    </linearGradient>
    <radialGradient id="core" cx="50%" cy="42%" r="54%">
      <stop offset="0" stop-color="{accent}" stop-opacity="0.95"/>
      <stop offset="0.45" stop-color="{accent}" stop-opacity="0.18"/>
      <stop offset="1" stop-color="{accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="72" fill="url(#bg)"/>
  <rect x="26" y="26" width="460" height="460" rx="52" fill="none" stroke="{accent}" stroke-opacity="0.72" stroke-width="4"/>
  <path d="M74 146h364M74 366h364M146 74v364M366 74v364" stroke="#ffffff" stroke-opacity="0.1" stroke-width="2"/>
  <circle cx="256" cy="246" r="158" fill="url(#core)"/>
  <circle cx="256" cy="246" r="104" fill="#061221" fill-opacity="0.56" stroke="{accent}" stroke-opacity="0.72" stroke-width="3"/>
  <text x="256" y="276" text-anchor="middle" fill="#fff2bd" font-family="Microsoft YaHei, Arial, sans-serif" font-size="92" font-weight="800">{safe_initials}</text>
  <text x="256" y="384" text-anchor="middle" fill="#d8f4ff" font-family="Microsoft YaHei, Arial, sans-serif" font-size="28" font-weight="700">{safe_name}</text>
  <text x="256" y="424" text-anchor="middle" fill="{accent}" font-family="Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="3">{safe_function}</text>
</svg>"""
    content = svg.encode("utf-8")

    return {
        "filename": f"{agent_id}-fallback.svg",
        "mime_type": "image/svg+xml",
        "content": content,
        "sha256": hashlib.sha256(content).hexdigest(),
        "size_bytes": len(content),
    }


def _avatar_initials(name: str) -> str:
    compact = "".join(ch for ch in name if ch.isalnum())
    return (compact[:2] or "AI").upper()


AVATAR_PALETTES = (
    ("#0a2a4f", "#123d72", "#78dcff"),
    ("#2a244d", "#4d3374", "#ffe298"),
    ("#0b3a35", "#14565b", "#89e2cd"),
    ("#3b2412", "#6f4218", "#ffd58c"),
    ("#171f3f", "#2e4475", "#9ee7ff"),
)


class InMemoryAgentCatalogStore:
    def __init__(
        self,
        agents: list[Agent] | None = None,
        avatars: dict[str, Avatar] | None = None,
        static_avatar_base_url: str = "/agent-avatars",
    ):
        self._agents = [_public_agent(agent) for agent in agents or []]
        self._avatars = deepcopy(avatars or {})
        self._static_avatar_base_url = static_avatar_base_url

    def ensure_schema(self) -> None:
        return None

    def list_agents(self) -> list[Agent]:
        return [_public_agent(agent) for agent in self._agents]

    def get_agent(self, agent_id: str) -> Agent | None:
        for agent in self._agents:
            if agent.get("id") == agent_id:
                return _public_agent(agent)
        return None

    def get_avatar(self, agent_id: str) -> Avatar | None:
        avatar = self._avatars.get(agent_id)
        return deepcopy(avatar) if avatar else None

    def get_static_avatar_url(self, agent_id: str) -> str:
        avatar = self._avatars.get(agent_id)
        if not avatar or not self._static_avatar_base_url:
            return ""

        normalized_avatar = deepcopy(avatar)
        if "sha256" not in normalized_avatar:
            normalized_avatar["sha256"] = hashlib.sha256(normalized_avatar.get("content") or b"").hexdigest()
        if "filename" not in normalized_avatar:
            normalized_avatar["filename"] = f"{agent_id}{_avatar_static_extension(normalized_avatar)}"

        return _join_public_url(self._static_avatar_base_url, _avatar_static_filename(agent_id, normalized_avatar))


class PostgresAgentCatalogStore:
    def __init__(
        self,
        dsn: str | None = None,
        source_agents_path: str | None = None,
        avatar_dir: str | None = None,
        static_avatar_dir: str | None = None,
        static_avatar_base_url: str = "/agent-avatars",
        connection: Any | None = None,
        agents_table: str = "agents",
        assets_table: str = "agent_assets",
    ):
        if connection is None and dsn is None:
            raise AgentCatalogStoreError("dsn or connection is required")
        for table_name in (agents_table, assets_table):
            if not table_name.replace("_", "").isalnum():
                raise ValueError("table_name must contain only letters, numbers, and underscores")

        self._dsn = dsn
        self._connection = connection
        self._source_agents_path = source_agents_path
        self._avatar_dir = avatar_dir
        self._static_avatar_dir = static_avatar_dir
        self._static_avatar_base_url = static_avatar_base_url.rstrip("/") if static_avatar_base_url else ""
        self._agents_table = agents_table
        self._assets_table = assets_table

    def ensure_schema(self) -> None:
        self._execute_write(
            f"""
            CREATE TABLE IF NOT EXISTS {self._agents_table} (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                function_label TEXT NOT NULL DEFAULT '',
                type_label TEXT NOT NULL DEFAULT '',
                launch_url TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                knowledge_json JSONB NOT NULL DEFAULT '[]'::jsonb,
                tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
                sort_order INTEGER NOT NULL DEFAULT 0,
                gpt_id TEXT NOT NULL DEFAULT '',
                source_json JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL
            )
            """,
            (),
        )
        self._execute_write(
            f"""
            CREATE TABLE IF NOT EXISTS {self._assets_table} (
                agent_id TEXT PRIMARY KEY REFERENCES {self._agents_table}(id) ON DELETE CASCADE,
                filename TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                content BYTEA NOT NULL,
                sha256 TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL
            )
            """,
            (),
        )
        self.seed_from_files()
        self.export_avatars_to_static_dir()

    def seed_from_files(self) -> None:
        for agent in self._load_seed_agents():
            self._upsert_agent(agent)
            avatar_file = self._find_avatar_file(agent.get("gpt_id"), agent.get("id"))
            if avatar_file:
                self._upsert_avatar(str(agent["id"]), avatar_file)
            elif self._should_write_fallback_avatar(str(agent["id"])):
                self._upsert_avatar_data(str(agent["id"]), build_fallback_avatar(agent))

    def list_agents(self) -> list[Agent]:
        return self._execute_read_all(
            f"""
            SELECT {", ".join(self._select_columns())}
            FROM {self._agents_table} a
            ORDER BY a.sort_order ASC, a.name ASC
            """,
            (),
        )

    def get_agent(self, agent_id: str) -> Agent | None:
        return self._execute_read_one(
            f"""
            SELECT {", ".join(self._select_columns())}
            FROM {self._agents_table} a
            WHERE a.id = %s
            """,
            (agent_id,),
        )

    def get_avatar(self, agent_id: str) -> Avatar | None:
        row = self._execute_raw_read_one(
            f"""
            SELECT agent_id, filename, mime_type, content, sha256, size_bytes
            FROM {self._assets_table}
            WHERE agent_id = %s
            """,
            (agent_id,),
        )
        return dict(row) if row else None

    def _should_write_fallback_avatar(self, agent_id: str) -> bool:
        existing_avatar = self.get_avatar(agent_id)
        if not existing_avatar:
            return True

        filename = _first_text(existing_avatar.get("filename")).lower()
        mime_type = _first_text(existing_avatar.get("mime_type")).lower()
        return filename.endswith(".svg") or mime_type == "image/svg+xml"

    def get_static_avatar_url(self, agent_id: str) -> str:
        avatar = self.get_avatar(agent_id)
        if not avatar or not self._static_avatar_base_url:
            return ""

        self._write_static_avatar(agent_id, avatar)
        return _join_public_url(self._static_avatar_base_url, _avatar_static_filename(agent_id, avatar))

    def export_avatars_to_static_dir(self) -> None:
        if not self._static_avatar_dir:
            return

        rows = self._execute_raw_read_all(
            f"""
            SELECT agent_id, filename, mime_type, content, sha256, size_bytes
            FROM {self._assets_table}
            ORDER BY agent_id ASC
            """,
            (),
        )

        for row in rows:
            avatar = dict(row)
            self._write_static_avatar(str(avatar.get("agent_id") or ""), avatar)

    def _load_seed_agents(self) -> list[Agent]:
        if not self._source_agents_path:
            return []

        try:
            with open(self._source_agents_path, "r", encoding="utf-8") as file:
                rows = json.load(file)
        except (OSError, json.JSONDecodeError):
            return []

        if not isinstance(rows, list):
            return []

        agents = []
        for index, row in enumerate(rows):
            if isinstance(row, dict) and _first_text(row.get("智能体名称")):
                agents.append(_normalize_seed_agent(row, index))

        return agents

    def _upsert_agent(self, agent: Agent) -> None:
        now = _now()
        self._execute_write(
            f"""
            INSERT INTO {self._agents_table}
                (id, name, function_label, type_label, launch_url, description,
                 knowledge_json, tags_json, sort_order, gpt_id, source_json, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                function_label = EXCLUDED.function_label,
                type_label = EXCLUDED.type_label,
                launch_url = EXCLUDED.launch_url,
                description = EXCLUDED.description,
                knowledge_json = EXCLUDED.knowledge_json,
                tags_json = EXCLUDED.tags_json,
                sort_order = EXCLUDED.sort_order,
                gpt_id = EXCLUDED.gpt_id,
                source_json = EXCLUDED.source_json,
                updated_at = EXCLUDED.updated_at
            """,
            (
                agent["id"],
                agent["name"],
                agent.get("function", ""),
                agent.get("type", ""),
                agent.get("launch_url", ""),
                agent.get("description", ""),
                self._jsonb(agent.get("knowledge", [])),
                self._jsonb(agent.get("tags", [])),
                agent.get("sort_order", 0),
                agent.get("gpt_id", ""),
                self._jsonb(agent.get("source", {})),
                now,
                now,
            ),
        )

    def _upsert_avatar(self, agent_id: str, avatar_file: Path) -> None:
        content = avatar_file.read_bytes()
        mime_type = mimetypes.guess_type(avatar_file.name)[0] or "application/octet-stream"
        self._upsert_avatar_data(
            agent_id,
            {
                "filename": avatar_file.name,
                "mime_type": mime_type,
                "content": content,
                "sha256": hashlib.sha256(content).hexdigest(),
                "size_bytes": len(content),
            },
        )

    def _upsert_avatar_data(self, agent_id: str, avatar: Avatar) -> None:
        now = _now()

        self._execute_write(
            f"""
            INSERT INTO {self._assets_table}
                (agent_id, filename, mime_type, content, sha256, size_bytes, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (agent_id) DO UPDATE SET
                filename = EXCLUDED.filename,
                mime_type = EXCLUDED.mime_type,
                content = EXCLUDED.content,
                sha256 = EXCLUDED.sha256,
                size_bytes = EXCLUDED.size_bytes,
                updated_at = EXCLUDED.updated_at
            WHERE {self._assets_table}.sha256 <> EXCLUDED.sha256
            """,
            (
                agent_id,
                avatar["filename"],
                avatar["mime_type"],
                avatar["content"],
                avatar["sha256"],
                avatar["size_bytes"],
                now,
                now,
            ),
        )

    def _write_static_avatar(self, agent_id: str, avatar: Avatar) -> Path | None:
        content = avatar.get("content") or b""
        if not agent_id or not content or not self._static_avatar_dir:
            return None

        avatar_root = Path(self._static_avatar_dir)
        avatar_root.mkdir(parents=True, exist_ok=True)
        target_path = avatar_root / _avatar_static_filename(agent_id, avatar)
        expected_sha = _first_text(avatar.get("sha256")) or hashlib.sha256(content).hexdigest()

        if target_path.exists():
            try:
                if hashlib.sha256(target_path.read_bytes()).hexdigest() == expected_sha:
                    return target_path
            except OSError:
                pass

        target_path.write_bytes(content)
        return target_path

    def _find_avatar_file(self, gpt_id: Any, agent_id: Any = "") -> Path | None:
        normalized_gpt_id = _first_text(gpt_id).lower()
        if not self._avatar_dir:
            return None

        avatar_root = Path(self._avatar_dir)
        if not avatar_root.exists():
            return None

        avatar_files = [
            avatar_file
            for avatar_file in sorted(avatar_root.iterdir())
            if avatar_file.is_file() and avatar_file.suffix.lower() in RASTER_AVATAR_EXTENSIONS
        ]

        if normalized_gpt_id:
            for avatar_file in avatar_files:
                if normalized_gpt_id in avatar_file.name.lower():
                    return avatar_file

        agent_number_match = re.search(r"(\d+)$", _first_text(agent_id))
        if agent_number_match:
            agent_number = int(agent_number_match.group(1))
            source_prefix = f"{agent_number:03d}_"
            static_prefix = f"agent-{agent_number:03d}-"
            for avatar_file in avatar_files:
                avatar_name = avatar_file.name.lower()
                if avatar_name.startswith(source_prefix) or avatar_name.startswith(static_prefix):
                    return avatar_file

        return None

    def _select_columns(self) -> tuple[str, ...]:
        return (
            "a.id",
            "a.name",
            "a.function_label",
            "a.type_label",
            "a.launch_url",
            "a.description",
            "a.knowledge_json",
            "a.tags_json",
            "a.sort_order",
            "a.gpt_id",
            "a.source_json",
            "a.created_at",
            "a.updated_at",
            f"EXISTS (SELECT 1 FROM {self._assets_table} aa WHERE aa.agent_id = a.id) AS has_avatar",
        )

    def _connect(self):
        if self._connection is not None:
            return _ExistingConnection(self._connection)
        if psycopg is None:
            raise AgentCatalogStoreError("psycopg is required for PostgresAgentCatalogStore")
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

    def _execute_read_all(self, query: str, params: tuple[Any, ...]) -> list[Agent]:
        with self._connect() as connection:
            with self._cursor(connection) as cursor:
                cursor.execute(query, params)
                rows = cursor.fetchall()
        return [self._row_to_agent(row) for row in rows]

    def _execute_read_one(self, query: str, params: tuple[Any, ...]) -> Agent | None:
        row = self._execute_raw_read_one(query, params)
        return self._row_to_agent(row) if row else None

    def _execute_raw_read_one(self, query: str, params: tuple[Any, ...]) -> Any | None:
        with self._connect() as connection:
            with self._cursor(connection) as cursor:
                cursor.execute(query, params)
                return cursor.fetchone()

    def _execute_raw_read_all(self, query: str, params: tuple[Any, ...]) -> list[Any]:
        with self._connect() as connection:
            with self._cursor(connection) as cursor:
                cursor.execute(query, params)
                return cursor.fetchall()

    def _row_to_agent(self, row: Any) -> Agent:
        if not isinstance(row, dict):
            row = dict(zip(AGENT_COLUMNS, row))
        return {
            "id": row["id"],
            "name": row["name"],
            "function": row["function_label"] or "",
            "type": row["type_label"] or "",
            "launch_url": row["launch_url"] or "",
            "description": row["description"] or "",
            "knowledge": deepcopy(row["knowledge_json"] or []),
            "tags": deepcopy(row["tags_json"] or []),
            "sort_order": row["sort_order"],
            "gpt_id": row["gpt_id"] or "",
            "source": deepcopy(row["source_json"] or {}),
            "has_avatar": bool(row["has_avatar"]),
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
