# Recommendation Snapshot Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist AI-generated recommended agent combinations behind a shareable `recommendation_id`, and let shared pages poll a snapshot while generation is still in progress.

**Architecture:** Add a small Postgres-backed snapshot store in the Flask backend, wrap the existing SSE stream to update that store without rewriting the Coze workflow parser, expose a read-only snapshot API, and let the React app hydrate/poll recommendations from `?recommendation_id=...`. The Hero Hall lower hero pool remains local catalog data; only the upper recommended team uses streamed or snapshot recommendation data.

**Tech Stack:** Flask, psycopg 3, Postgres 16 via Docker Compose, pytest, React, TypeScript, Vite, existing Node verification scripts.

---

## File Structure

Create:

- `docker-compose.yml` - local Postgres service for development.
- `backend/services/recommendation_snapshot_store.py` - store protocol, Postgres store, in-memory test store, event merge helpers, schema creation.
- `backend/services/recommendation_snapshot_stream.py` - wraps existing formatted SSE frames, injects `recommendation_id`, and updates snapshots from events.
- `backend/routes/recommendations.py` - `GET /api/recommendations/<id>` route.
- `backend/tests/test_recommendation_snapshot_store.py` - unit tests for merge/store behavior.
- `backend/tests/test_recommendation_snapshot_stream.py` - unit tests for SSE wrapping and state transitions.
- `backend/tests/test_recommendations_route.py` - Flask route tests with fake store.
- `frontend/src/lib/recommendationSnapshotClient.ts` - fetch snapshot by ID.
- `frontend/src/features/workflow/recommendationSnapshotModel.ts` - pure helpers for URL parsing, poll decision, snapshot-to-agent mapping.
- `frontend/scripts/verify-recommendation-snapshot-model.mjs` - Node/TypeScript verification script for front-end pure helpers.

Modify:

- `backend/requirements.txt` - add `psycopg[binary]` and `pytest`.
- `backend/config.py` - add `get_database_url()`.
- `backend/.env.example` - document `DATABASE_URL`.
- `backend/app.py` - register recommendations blueprint and attach store factory/config.
- `backend/routes/coze.py` - create snapshot before streaming; wrap stream with persistence.
- `docs/coze-chat-stream-api.md` - document `recommendation_id` and `GET /api/recommendations/<id>`.
- `docs/ai-nav/backend/_index.nav.md`, `docs/ai-nav/backend/routes/_index.nav.md`, `docs/ai-nav/backend/services/_index.nav.md` - update backend navigation.
- `docs/ai-nav/frontend/src/lib/_index.nav.md`, `docs/ai-nav/frontend/src/features/workflow/_index.nav.md` - update frontend navigation.
- `frontend/src/types.ts` - add `RecommendationSnapshot` and `recommendation_id` event field.
- `frontend/src/lib/agentStreamClient.ts` - type `recommendation_id`; no behavior changes beyond exposing the field through `onEvent`.
- `frontend/src/App.tsx` - hold current snapshot ID, hydrate from URL, poll streaming snapshots, and open Hero Hall from snapshot data.

Do not modify:

- `data/source_agents_full.json` - remains the local hero pool and launch catalog source.
- `frontend/src/features/heroHall/HeroTeamCarousel.tsx` lower-pool behavior - upper cards continue to receive real recommended agents.
- Existing untracked `TODO.md`.

---

### Task 1: Backend Dependencies And Local Postgres Config

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/config.py`
- Modify: `backend/.env.example`
- Create: `docker-compose.yml`

- [ ] **Step 1: Add dependency lines after the existing runtime requirements**

Edit `backend/requirements.txt` so it contains these additional lines:

```text
psycopg[binary]>=3.2,<4
pytest>=8,<9
```

- [ ] **Step 2: Add database URL helper to `backend/config.py`**

Add this function near the other config helpers:

```python
def get_database_url():
    return os.getenv(
        "DATABASE_URL",
        "postgresql://agent_workshop:agent_workshop@127.0.0.1:54329/agent_workshop",
    ).strip()
```

- [ ] **Step 3: Add `.env.example` database guidance**

Append this line to `backend/.env.example`:

```text
DATABASE_URL=postgresql://agent_workshop:agent_workshop@127.0.0.1:54329/agent_workshop
```

- [ ] **Step 4: Add local Postgres compose file**

Create `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: agent_workshop
      POSTGRES_USER: agent_workshop
      POSTGRES_PASSWORD: agent_workshop
    ports:
      - "54329:5432"
    volumes:
      - agent_workshop_pgdata:/var/lib/postgresql/data

volumes:
  agent_workshop_pgdata:
```

- [ ] **Step 5: Verify dependency file syntax**

Run:

```powershell
cd backend
python -m pip install -r requirements.txt
```

Expected: dependencies install successfully. If `python` points to the wrong interpreter, use `.\.venv\Scripts\python -m pip install -r requirements.txt` after creating the backend venv.

---

### Task 2: Snapshot Store Core With Tests

**Files:**
- Create: `backend/services/recommendation_snapshot_store.py`
- Create: `backend/tests/test_recommendation_snapshot_store.py`

- [ ] **Step 1: Write failing tests for create, merge, complete, and missing snapshot**

Create `backend/tests/test_recommendation_snapshot_store.py`:

```python
from services.recommendation_snapshot_store import InMemoryRecommendationSnapshotStore


def test_create_snapshot_starts_streaming():
    store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")

    snapshot = store.create_snapshot("帮我规划白酒销售转化")

    assert snapshot["id"] == "rec_test"
    assert snapshot["status"] == "streaming"
    assert snapshot["message"] == "帮我规划白酒销售转化"
    assert snapshot["agents"] == []


def test_merge_agent_delta_keeps_current_agent_snapshot():
    store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    store.create_snapshot("message")

    store.merge_agent("rec_test", {"agent_index": 0, "rank": 1, "agent_name": "销售之神"})
    store.merge_agent("rec_test", {"agent_index": 0, "stage": "成交促单", "reason": "处理异议"})

    snapshot = store.get_snapshot("rec_test")

    assert snapshot["agents"] == [
        {
            "agent_index": 0,
            "rank": 1,
            "agent_name": "销售之神",
            "stage": "成交促单",
            "reason": "处理异议",
        }
    ]


def test_replace_agents_and_complete_snapshot():
    store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    store.create_snapshot("message")

    store.replace_agents("rec_test", [{"agent_index": 0, "agent_name": "销售之神"}])
    store.update_summary("rec_test", "组合总结")
    store.complete_snapshot("rec_test")

    snapshot = store.get_snapshot("rec_test")

    assert snapshot["status"] == "completed"
    assert snapshot["summary"] == "组合总结"
    assert snapshot["agents"] == [{"agent_index": 0, "agent_name": "销售之神"}]


def test_get_missing_snapshot_returns_none():
    store = InMemoryRecommendationSnapshotStore()

    assert store.get_snapshot("missing") is None
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```powershell
cd backend
python -m pytest tests/test_recommendation_snapshot_store.py -q
```

Expected: FAIL with `ModuleNotFoundError: No module named 'services.recommendation_snapshot_store'`.

- [ ] **Step 3: Implement minimal store**

Create `backend/services/recommendation_snapshot_store.py` with:

```python
import json
import uuid
from copy import deepcopy
from datetime import datetime, timezone

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover - dependency is installed in normal backend envs
    psycopg = None
    dict_row = None


SNAPSHOT_STATUSES = {"streaming", "completed", "failed"}


class RecommendationSnapshotStoreError(RuntimeError):
    pass


class RecommendationSnapshotNotFound(KeyError):
    pass


def new_recommendation_id():
    return f"rec_{uuid.uuid4().hex[:16]}"


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class InMemoryRecommendationSnapshotStore:
    def __init__(self, id_factory=new_recommendation_id):
        self.id_factory = id_factory
        self.snapshots = {}

    def create_snapshot(self, message):
        snapshot_id = self.id_factory()
        now = utc_now_iso()
        snapshot = {
            "id": snapshot_id,
            "status": "streaming",
            "message": str(message or ""),
            "agents": [],
            "summary": "",
            "graph_path": None,
            "conversation_ids": {},
            "error": "",
            "created_at": now,
            "updated_at": now,
        }
        self.snapshots[snapshot_id] = snapshot
        return deepcopy(snapshot)

    def get_snapshot(self, snapshot_id):
        snapshot = self.snapshots.get(str(snapshot_id or ""))
        return deepcopy(snapshot) if snapshot else None

    def merge_agent(self, snapshot_id, agent):
        snapshot = self._require_snapshot(snapshot_id)
        agents = list(snapshot["agents"])
        agent_index = agent.get("agent_index")
        match_index = next(
            (index for index, current in enumerate(agents) if current.get("agent_index") == agent_index),
            None,
        )
        if match_index is None:
            agents.append({key: value for key, value in agent.items() if value is not None})
        else:
            agents[match_index] = {
                **agents[match_index],
                **{key: value for key, value in agent.items() if value is not None},
            }
        snapshot["agents"] = _sort_agents(agents)
        self._touch(snapshot)
        return deepcopy(snapshot)

    def replace_agents(self, snapshot_id, agents):
        snapshot = self._require_snapshot(snapshot_id)
        snapshot["agents"] = _sort_agents([_clean_dict(agent) for agent in agents if isinstance(agent, dict)])
        self._touch(snapshot)
        return deepcopy(snapshot)

    def update_summary(self, snapshot_id, summary):
        snapshot = self._require_snapshot(snapshot_id)
        snapshot["summary"] = str(summary or "").strip()
        self._touch(snapshot)
        return deepcopy(snapshot)

    def update_graph_path(self, snapshot_id, graph_path):
        snapshot = self._require_snapshot(snapshot_id)
        snapshot["graph_path"] = deepcopy(graph_path) if isinstance(graph_path, dict) else None
        self._touch(snapshot)
        return deepcopy(snapshot)

    def update_conversation_ids(self, snapshot_id, conversation_ids):
        snapshot = self._require_snapshot(snapshot_id)
        snapshot["conversation_ids"] = dict(conversation_ids or {})
        self._touch(snapshot)
        return deepcopy(snapshot)

    def complete_snapshot(self, snapshot_id):
        return self._set_status(snapshot_id, "completed")

    def fail_snapshot(self, snapshot_id, error):
        snapshot = self._set_status(snapshot_id, "failed")
        self.snapshots[snapshot_id]["error"] = str(error or "")
        return snapshot

    def _set_status(self, snapshot_id, status):
        if status not in SNAPSHOT_STATUSES:
            raise ValueError(f"Unsupported snapshot status: {status}")
        snapshot = self._require_snapshot(snapshot_id)
        snapshot["status"] = status
        self._touch(snapshot)
        return deepcopy(snapshot)

    def _require_snapshot(self, snapshot_id):
        snapshot = self.snapshots.get(str(snapshot_id or ""))
        if not snapshot:
            raise RecommendationSnapshotNotFound(snapshot_id)
        return snapshot

    def _touch(self, snapshot):
        snapshot["updated_at"] = utc_now_iso()


class PostgresRecommendationSnapshotStore:
    def __init__(self, database_url, id_factory=new_recommendation_id):
        if psycopg is None:
            raise RecommendationSnapshotStoreError("psycopg is not installed")
        self.database_url = str(database_url or "").strip()
        self.id_factory = id_factory
        if not self.database_url:
            raise RecommendationSnapshotStoreError("DATABASE_URL is not configured")

    def ensure_schema(self):
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS recommendation_snapshots (
                    id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    message TEXT NOT NULL DEFAULT '',
                    agents_json JSONB NOT NULL DEFAULT '[]'::jsonb,
                    summary TEXT NOT NULL DEFAULT '',
                    graph_path_json JSONB,
                    conversation_ids_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                    error TEXT NOT NULL DEFAULT '',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )

    def create_snapshot(self, message):
        self.ensure_schema()
        snapshot_id = self.id_factory()
        with self._connect() as conn:
            row = conn.execute(
                """
                INSERT INTO recommendation_snapshots (id, status, message)
                VALUES (%s, 'streaming', %s)
                RETURNING *
                """,
                (snapshot_id, str(message or "")),
            ).fetchone()
        return _row_to_snapshot(row)

    def get_snapshot(self, snapshot_id):
        self.ensure_schema()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM recommendation_snapshots WHERE id = %s",
                (str(snapshot_id or ""),),
            ).fetchone()
        return _row_to_snapshot(row) if row else None

    def merge_agent(self, snapshot_id, agent):
        snapshot = self.get_snapshot(snapshot_id)
        if not snapshot:
            raise RecommendationSnapshotNotFound(snapshot_id)
        memory = InMemoryRecommendationSnapshotStore(id_factory=lambda: snapshot_id)
        memory.snapshots[snapshot_id] = snapshot
        updated = memory.merge_agent(snapshot_id, agent)
        return self.replace_agents(snapshot_id, updated["agents"])

    def replace_agents(self, snapshot_id, agents):
        return self._update_json_field(snapshot_id, "agents_json", _sort_agents(agents))

    def update_summary(self, snapshot_id, summary):
        return self._update_text_field(snapshot_id, "summary", str(summary or "").strip())

    def update_graph_path(self, snapshot_id, graph_path):
        return self._update_json_field(snapshot_id, "graph_path_json", graph_path if isinstance(graph_path, dict) else None)

    def update_conversation_ids(self, snapshot_id, conversation_ids):
        return self._update_json_field(snapshot_id, "conversation_ids_json", dict(conversation_ids or {}))

    def complete_snapshot(self, snapshot_id):
        return self._update_text_field(snapshot_id, "status", "completed")

    def fail_snapshot(self, snapshot_id, error):
        self._update_text_field(snapshot_id, "error", str(error or ""))
        return self._update_text_field(snapshot_id, "status", "failed")

    def _update_text_field(self, snapshot_id, field, value):
        row = self._update_field(snapshot_id, field, value)
        return _row_to_snapshot(row)

    def _update_json_field(self, snapshot_id, field, value):
        row = self._update_field(snapshot_id, field, json.dumps(value, ensure_ascii=False))
        return _row_to_snapshot(row)

    def _update_field(self, snapshot_id, field, value):
        allowed = {"status", "summary", "error", "agents_json", "graph_path_json", "conversation_ids_json"}
        if field not in allowed:
            raise ValueError(f"Unsupported snapshot field: {field}")
        self.ensure_schema()
        with self._connect() as conn:
            row = conn.execute(
                f"""
                UPDATE recommendation_snapshots
                SET {field} = %s, updated_at = NOW()
                WHERE id = %s
                RETURNING *
                """,
                (value, str(snapshot_id or "")),
            ).fetchone()
        if not row:
            raise RecommendationSnapshotNotFound(snapshot_id)
        return row

    def _connect(self):
        return psycopg.connect(self.database_url, row_factory=dict_row)


def _clean_dict(value):
    return {key: item for key, item in value.items() if item is not None}


def _sort_agents(agents):
    return sorted(
        [_clean_dict(agent) for agent in agents if isinstance(agent, dict)],
        key=lambda agent: int(agent.get("agent_index") if str(agent.get("agent_index", "")).isdigit() else 9999),
    )


def _row_to_snapshot(row):
    if not row:
        return None
    return {
        "id": row["id"],
        "status": row["status"],
        "message": row["message"],
        "agents": row["agents_json"] or [],
        "summary": row["summary"] or "",
        "graph_path": row["graph_path_json"],
        "conversation_ids": row["conversation_ids_json"] or {},
        "error": row["error"] or "",
        "created_at": _format_datetime(row["created_at"]),
        "updated_at": _format_datetime(row["updated_at"]),
    }


def _format_datetime(value):
    if hasattr(value, "isoformat"):
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return str(value or "")
```

- [ ] **Step 4: Run tests to verify GREEN**

Run:

```powershell
cd backend
python -m pytest tests/test_recommendation_snapshot_store.py -q
```

Expected: PASS.

---

### Task 3: SSE Snapshot Wrapper With Tests

**Files:**
- Create: `backend/services/recommendation_snapshot_stream.py`
- Create: `backend/tests/test_recommendation_snapshot_stream.py`

- [ ] **Step 1: Write failing tests for SSE ID injection and updates**

Create `backend/tests/test_recommendation_snapshot_stream.py`:

```python
import json

from services.coze_stream_transformer import content_event, format_sse_event
from services.recommendation_snapshot_store import InMemoryRecommendationSnapshotStore
from services.recommendation_snapshot_stream import persist_recommendation_snapshot_stream


def _read_events(stream):
    events = []
    for frame in stream:
        data_line = next(line for line in frame.splitlines() if line.startswith("data:"))
        events.append(json.loads(data_line.replace("data:", "", 1).strip()))
    return events


def test_injects_recommendation_id_into_workflow_started_event():
    store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    store.create_snapshot("message")
    upstream = [format_sse_event(content_event("workflow.started", {"conversation_ids": {}}))]

    events = _read_events(persist_recommendation_snapshot_stream(upstream, store, "rec_test"))

    assert events[0]["event"] == "workflow.started"
    assert events[0]["recommendation_id"] == "rec_test"


def test_persists_recommendation_agent_delta_and_completion():
    store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    store.create_snapshot("message")
    upstream = [
        format_sse_event(
            content_event(
                "recommended_agents.delta",
                {
                    "stage": "agent_recommendation",
                    "agent": {"agent_index": 0, "rank": 1, "agent_name": "销售之神"},
                },
            )
        ),
        format_sse_event(
            content_event(
                "recommended_agents.delta",
                {
                    "stage": "agent_recommendation",
                    "agent": {"agent_index": 0, "stage": "成交促单", "reason": "处理异议"},
                },
            )
        ),
        format_sse_event(content_event("workflow.completed", {"status": "completed"})),
    ]

    list(persist_recommendation_snapshot_stream(upstream, store, "rec_test"))
    snapshot = store.get_snapshot("rec_test")

    assert snapshot["status"] == "completed"
    assert snapshot["agents"][0]["agent_name"] == "销售之神"
    assert snapshot["agents"][0]["stage"] == "成交促单"
    assert snapshot["agents"][0]["reason"] == "处理异议"


def test_failed_workflow_marks_snapshot_failed():
    store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    store.create_snapshot("message")
    upstream = [format_sse_event(content_event("workflow.error", {"error": "boom"}))]

    list(persist_recommendation_snapshot_stream(upstream, store, "rec_test"))
    snapshot = store.get_snapshot("rec_test")

    assert snapshot["status"] == "failed"
    assert snapshot["error"] == "boom"
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```powershell
cd backend
python -m pytest tests/test_recommendation_snapshot_stream.py -q
```

Expected: FAIL with `ModuleNotFoundError: No module named 'services.recommendation_snapshot_stream'`.

- [ ] **Step 3: Implement SSE wrapper**

Create `backend/services/recommendation_snapshot_stream.py`:

```python
import json

from services.coze_stream_transformer import format_sse_event


def persist_recommendation_snapshot_stream(stream, store, snapshot_id):
    summary_parts = []

    try:
        for frame in stream:
            event = parse_sse_event(frame)

            if event:
                event = {**event, "recommendation_id": snapshot_id} if event.get("event") == "workflow.started" else event
                _persist_event(store, snapshot_id, event, summary_parts)
                yield format_sse_event(event)
            else:
                yield frame
    except Exception as exc:
        store.fail_snapshot(snapshot_id, str(exc))
        raise


def parse_sse_event(frame):
    data = "\n".join(
        line.replace("data:", "", 1).strip()
        for line in str(frame or "").splitlines()
        if line.startswith("data:")
    )

    if not data:
        return None

    try:
        parsed = json.loads(data)
    except json.JSONDecodeError:
        return None

    return parsed if isinstance(parsed, dict) else None


def _persist_event(store, snapshot_id, event, summary_parts):
    event_name = event.get("event")

    if event.get("conversation_ids"):
        store.update_conversation_ids(snapshot_id, event.get("conversation_ids"))

    if event_name == "graph.path.resolved":
        store.update_graph_path(snapshot_id, _graph_path_from_event(event))
        return

    if event_name == "recommended_agents.delta" and isinstance(event.get("agent"), dict):
        store.merge_agent(snapshot_id, event["agent"])
        return

    if event_name == "recommended_agent.completed" and isinstance(event.get("agent"), dict):
        store.merge_agent(snapshot_id, {**event["agent"], "streamStatus": "completed"})
        return

    if event_name == "recommended_agents.completed" and isinstance(event.get("agents"), list):
        store.replace_agents(snapshot_id, event["agents"])
        return

    if event_name == "content.delta" and event.get("stage") == "agent_recommendation" and event.get("type") == "SUMMARY":
        summary_parts.append(str(event.get("content") or ""))
        store.update_summary(snapshot_id, "".join(summary_parts).strip())
        return

    if event_name == "workflow.stage.completed" and event.get("stage") == "agent_recommendation":
        if event.get("summary"):
            store.update_summary(snapshot_id, event.get("summary"))
        return

    if event_name == "workflow.error":
        store.fail_snapshot(snapshot_id, event.get("error") or event.get("detail") or "workflow error")
        return

    if event_name == "workflow.completed":
        store.complete_snapshot(snapshot_id)


def _graph_path_from_event(event):
    return {
        key: value
        for key, value in event.items()
        if key in {"route", "root_id", "nodes", "edges"}
    }
```

- [ ] **Step 4: Run tests to verify GREEN**

Run:

```powershell
cd backend
python -m pytest tests/test_recommendation_snapshot_stream.py tests/test_recommendation_snapshot_store.py -q
```

Expected: PASS.

---

### Task 4: Snapshot Read API With Flask Tests

**Files:**
- Create: `backend/routes/recommendations.py`
- Create: `backend/tests/test_recommendations_route.py`
- Modify: `backend/app.py`

- [ ] **Step 1: Write failing route tests**

Create `backend/tests/test_recommendations_route.py`:

```python
from app import create_app
from services.recommendation_snapshot_store import InMemoryRecommendationSnapshotStore


def test_get_recommendation_snapshot_returns_snapshot():
    store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    store.create_snapshot("message")
    store.replace_agents("rec_test", [{"agent_index": 0, "agent_name": "销售之神"}])
    app = create_app(snapshot_store=store)

    response = app.test_client().get("/api/recommendations/rec_test")

    assert response.status_code == 200
    assert response.get_json()["id"] == "rec_test"
    assert response.get_json()["agents"][0]["agent_name"] == "销售之神"


def test_get_missing_recommendation_snapshot_returns_404():
    app = create_app(snapshot_store=InMemoryRecommendationSnapshotStore())

    response = app.test_client().get("/api/recommendations/missing")

    assert response.status_code == 404
    assert response.get_json() == {"error": "recommendation snapshot not found"}
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```powershell
cd backend
python -m pytest tests/test_recommendations_route.py -q
```

Expected: FAIL because `create_app()` does not accept `snapshot_store` or the recommendations route is not registered.

- [ ] **Step 3: Implement recommendations route**

Create `backend/routes/recommendations.py`:

```python
from flask import Blueprint, current_app, jsonify

from services.recommendation_snapshot_store import RecommendationSnapshotStoreError


recommendations_bp = Blueprint("recommendations", __name__)


@recommendations_bp.get("/recommendations/<recommendation_id>")
def get_recommendation_snapshot(recommendation_id):
    try:
        snapshot = current_app.config["RECOMMENDATION_SNAPSHOT_STORE"].get_snapshot(recommendation_id)
    except RecommendationSnapshotStoreError as exc:
        return jsonify({"error": "recommendation snapshot store unavailable", "detail": str(exc)}), 503

    if not snapshot:
        return jsonify({"error": "recommendation snapshot not found"}), 404

    return jsonify(snapshot)
```

- [ ] **Step 4: Register route and store in `backend/app.py`**

Replace `create_app()` with this shape:

```python
from config import get_database_url, get_frontend_origins
from routes.recommendations import recommendations_bp
from services.recommendation_snapshot_store import PostgresRecommendationSnapshotStore


def create_app(snapshot_store=None):
    app = Flask(__name__)

    CORS(app, resources={r"/api/*": {"origins": get_frontend_origins()}})
    app.config["RECOMMENDATION_SNAPSHOT_STORE"] = snapshot_store or PostgresRecommendationSnapshotStore(get_database_url())
    app.register_blueprint(system_bp, url_prefix="/api")
    app.register_blueprint(coze_bp, url_prefix="/api/coze")
    app.register_blueprint(recommendations_bp, url_prefix="/api")
    app.register_blueprint(tts_bp, url_prefix="/api/tts")

    return app
```

- [ ] **Step 5: Run tests to verify GREEN**

Run:

```powershell
cd backend
python -m pytest tests/test_recommendations_route.py tests/test_recommendation_snapshot_store.py -q
```

Expected: PASS.

---

### Task 5: Persist Chat Stream Snapshots

**Files:**
- Modify: `backend/routes/coze.py`
- Create: `backend/tests/test_coze_snapshot_stream.py`

- [ ] **Step 1: Write failing test for chat stream returning recommendation ID**

Create `backend/tests/test_coze_snapshot_stream.py`:

```python
from flask import Flask

from routes.coze import _attach_recommendation_snapshot
from services.coze_stream_transformer import content_event, format_sse_event
from services.recommendation_snapshot_store import InMemoryRecommendationSnapshotStore


def test_attach_recommendation_snapshot_creates_snapshot_and_injects_id():
    app = Flask(__name__)
    store = InMemoryRecommendationSnapshotStore(id_factory=lambda: "rec_test")
    app.config["RECOMMENDATION_SNAPSHOT_STORE"] = store
    upstream = [format_sse_event(content_event("workflow.started", {"conversation_ids": {}}))]

    with app.app_context():
        frames = list(_attach_recommendation_snapshot(upstream, "message"))

    assert "recommendation_id" in frames[0]
    assert "rec_test" in frames[0]
    assert store.get_snapshot("rec_test")["message"] == "message"
```

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
cd backend
python -m pytest tests/test_coze_snapshot_stream.py -q
```

Expected: FAIL because `_attach_recommendation_snapshot` does not exist.

- [ ] **Step 3: Add stream attachment helper in `backend/routes/coze.py`**

Add imports:

```python
from services.recommendation_snapshot_store import RecommendationSnapshotStoreError
from services.recommendation_snapshot_stream import persist_recommendation_snapshot_stream
```

Add helper near `_sse_response`:

```python
def _attach_recommendation_snapshot(stream, message):
    store = current_app.config["RECOMMENDATION_SNAPSHOT_STORE"]
    snapshot = store.create_snapshot(message)
    return persist_recommendation_snapshot_stream(stream, store, snapshot["id"])
```

Change the final return in `stream_chat()` from:

```python
return _sse_response(_guard_stream_errors(stream))
```

to:

```python
try:
    stream = _attach_recommendation_snapshot(stream, message)
except RecommendationSnapshotStoreError as exc:
    return jsonify({"error": "recommendation snapshot store unavailable", "detail": str(exc)}), 503

return _sse_response(_guard_stream_errors(stream))
```

- [ ] **Step 4: Run tests to verify GREEN**

Run:

```powershell
cd backend
python -m pytest tests/test_coze_snapshot_stream.py tests/test_recommendation_snapshot_stream.py tests/test_recommendations_route.py -q
```

Expected: PASS.

---

### Task 6: Frontend Snapshot Types And Pure Model

**Files:**
- Modify: `frontend/src/types.ts`
- Create: `frontend/src/features/workflow/recommendationSnapshotModel.ts`
- Create: `frontend/scripts/verify-recommendation-snapshot-model.mjs`

- [ ] **Step 1: Write failing Node verification script**

Create `frontend/scripts/verify-recommendation-snapshot-model.mjs`:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const sourcePath = path.resolve('src/features/workflow/recommendationSnapshotModel.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(output.outputText).toString('base64')}`;
const {
  getRecommendationIdFromUrl,
  shouldPollRecommendationSnapshot,
  snapshotToRecommendedAgents,
} = await import(moduleUrl);

assert.equal(
  getRecommendationIdFromUrl('http://127.0.0.1:5188/?recommendation_id=rec_abc123'),
  'rec_abc123',
);
assert.equal(getRecommendationIdFromUrl('http://127.0.0.1:5188/'), '');
assert.equal(shouldPollRecommendationSnapshot({ status: 'streaming' }), true);
assert.equal(shouldPollRecommendationSnapshot({ status: 'completed' }), false);

const agents = snapshotToRecommendedAgents({
  id: 'rec_abc123',
  status: 'completed',
  message: 'message',
  agents: [{ agent_index: 0, agent_name: '销售之神', stage: '成交促单' }],
  summary: '',
  graph_path: null,
  conversation_ids: {},
  created_at: '',
  updated_at: '',
});

assert.deepEqual(agents, [{ agent_index: 0, agent_name: '销售之神', stage: '成交促单', streamStatus: 'completed' }]);

console.log('Recommendation snapshot model verified.');
```

- [ ] **Step 2: Run script to verify RED**

Run:

```powershell
cd frontend
node scripts/verify-recommendation-snapshot-model.mjs
```

Expected: FAIL with missing `recommendationSnapshotModel.ts`.

- [ ] **Step 3: Add snapshot types to `frontend/src/types.ts`**

Add:

```ts
export type RecommendationSnapshotStatus = 'streaming' | 'completed' | 'failed';

export type RecommendationSnapshot = {
  agents: RecommendedAgent[];
  conversation_ids: Record<string, string>;
  created_at: string;
  error?: string;
  graph_path: AgentGraphPath | null;
  id: string;
  message: string;
  status: RecommendationSnapshotStatus;
  summary: string;
  updated_at: string;
};
```

Add to `RecommendedAgent` only if needed by build:

```ts
streamStatus?: 'streaming' | 'completed';
```

This already exists, so do not duplicate it.

- [ ] **Step 4: Create pure model helper**

Create `frontend/src/features/workflow/recommendationSnapshotModel.ts`:

```ts
import type { RecommendationSnapshot, RecommendedAgent } from '../../types';

export function getRecommendationIdFromUrl(url: string) {
  try {
    return new URL(url).searchParams.get('recommendation_id')?.trim() || '';
  } catch {
    return '';
  }
}

export function shouldPollRecommendationSnapshot(snapshot: Pick<RecommendationSnapshot, 'status'> | null) {
  return snapshot?.status === 'streaming';
}

export function snapshotToRecommendedAgents(snapshot: RecommendationSnapshot | null): RecommendedAgent[] {
  if (!snapshot) {
    return [];
  }

  const streamStatus = snapshot.status === 'completed' ? 'completed' : 'streaming';

  return snapshot.agents.map((agent) => ({
    ...agent,
    streamStatus,
  }));
}
```

- [ ] **Step 5: Run script to verify GREEN**

Run:

```powershell
cd frontend
node scripts/verify-recommendation-snapshot-model.mjs
```

Expected: PASS.

---

### Task 7: Frontend Snapshot Client

**Files:**
- Create: `frontend/src/lib/recommendationSnapshotClient.ts`
- Modify: `frontend/src/lib/agentStreamClient.ts`

- [ ] **Step 1: Add `recommendation_id` to stream event type**

In `frontend/src/lib/agentStreamClient.ts`, add this field to `AgentStreamEvent`:

```ts
recommendation_id?: string;
```

Do not add a new handler yet; `onEvent` already receives the raw event.

- [ ] **Step 2: Create snapshot client**

Create `frontend/src/lib/recommendationSnapshotClient.ts`:

```ts
import type { RecommendationSnapshot } from '../types';
import { API_BASE_URL } from './agentStreamClient';

export class RecommendationSnapshotError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'RecommendationSnapshotError';
    this.status = status;
  }
}

export async function fetchRecommendationSnapshot(recommendationId: string, signal?: AbortSignal): Promise<RecommendationSnapshot> {
  const id = recommendationId.trim();

  if (!id) {
    throw new RecommendationSnapshotError('recommendation_id is required', 400);
  }

  const response = await fetch(`${API_BASE_URL}/recommendations/${encodeURIComponent(id)}`, { signal });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new RecommendationSnapshotError(
      typeof payload?.error === 'string' ? payload.error : `Recommendation snapshot request failed: ${response.status}`,
      response.status,
    );
  }

  return payload as RecommendationSnapshot;
}
```

- [ ] **Step 3: Run frontend build as type check**

Run:

```powershell
cd frontend
npm run build
```

Expected: PASS.

---

### Task 8: App URL Hydration And Polling

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add imports**

Add:

```ts
import { fetchRecommendationSnapshot } from './lib/recommendationSnapshotClient';
import {
  getRecommendationIdFromUrl,
  shouldPollRecommendationSnapshot,
  snapshotToRecommendedAgents,
} from './features/workflow/recommendationSnapshotModel';
import type { RecommendationSnapshot } from './types';
```

- [ ] **Step 2: Add state near existing Hero Hall state**

Add:

```ts
const [currentRecommendationId, setCurrentRecommendationId] = useState(() => getRecommendationIdFromUrl(window.location.href));
const [sharedRecommendationSnapshot, setSharedRecommendationSnapshot] = useState<RecommendationSnapshot | null>(null);
const [sharedRecommendationError, setSharedRecommendationError] = useState('');
```

- [ ] **Step 3: Capture recommendation ID from stream events**

Inside the existing `streamAgentChat` handlers, in `onEvent(event)` or equivalent raw event handler, add:

```ts
if (typeof event.recommendation_id === 'string' && event.recommendation_id.trim()) {
  const nextRecommendationId = event.recommendation_id.trim();
  setCurrentRecommendationId(nextRecommendationId);
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('recommendation_id', nextRecommendationId);
  window.history.replaceState(null, '', nextUrl);
}
```

If `onEvent` does not currently exist in that call, add it without changing existing handlers.

- [ ] **Step 4: Add snapshot polling effect**

Add this effect after derived `recommendedAgents` state is available:

```ts
useEffect(() => {
  if (!currentRecommendationId) {
    return;
  }

  const controller = new AbortController();
  let timeoutId: number | null = null;

  const loadSnapshot = async () => {
    try {
      const snapshot = await fetchRecommendationSnapshot(currentRecommendationId, controller.signal);
      setSharedRecommendationSnapshot(snapshot);
      setSharedRecommendationError('');

      if (shouldPollRecommendationSnapshot(snapshot)) {
        timeoutId = window.setTimeout(loadSnapshot, 2000);
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }

      setSharedRecommendationError(error instanceof Error ? error.message : '推荐组合读取失败');
    }
  };

  void loadSnapshot();

  return () => {
    controller.abort();
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  };
}, [currentRecommendationId]);
```

- [ ] **Step 5: Merge snapshot agents into displayed recommendation source**

Change the derived recommendation source from:

```ts
const recommendedAgents =
  latestDisplayableRecommendedAgents.length > 0 ? latestDisplayableRecommendedAgents : pinnedRecommendedAgents;
```

to:

```ts
const snapshotRecommendedAgents = snapshotToRecommendedAgents(sharedRecommendationSnapshot);
const recommendedAgents =
  latestDisplayableRecommendedAgents.length > 0
    ? latestDisplayableRecommendedAgents
    : snapshotRecommendedAgents.length > 0
      ? snapshotRecommendedAgents
      : pinnedRecommendedAgents;
```

This preserves live stream data when the current user is generating a new response, while allowing shared URLs to hydrate from snapshots.

- [ ] **Step 6: Surface missing snapshot errors without fake fallback**

If the app has an existing error display suitable for agent workflow errors, append `sharedRecommendationError` there. If not, add a compact message in the existing agent panel state, not inside Hero Hall cards:

```ts
const snapshotStatusText = sharedRecommendationError ? `推荐组合读取失败：${sharedRecommendationError}` : '';
```

Use the existing message/readout pattern in `App.tsx`; do not add a new floating card.

- [ ] **Step 7: Run front-end verification**

Run:

```powershell
cd frontend
node scripts/verify-recommendation-snapshot-model.mjs
npm run build
```

Expected: both PASS.

---

### Task 9: Backend Docs, Navigation, And API Contract

**Files:**
- Modify: `docs/coze-chat-stream-api.md`
- Modify: `docs/ai-nav/backend/_index.nav.md`
- Modify: `docs/ai-nav/backend/routes/_index.nav.md`
- Modify: `docs/ai-nav/backend/services/_index.nav.md`
- Modify: `docs/ai-nav/frontend/src/lib/_index.nav.md`
- Modify: `docs/ai-nav/frontend/src/features/workflow/_index.nav.md`

- [ ] **Step 1: Update API docs**

Add to `docs/coze-chat-stream-api.md`:

````markdown
### 推荐快照 ID

`POST /api/coze/chat/stream` 会在 `workflow.started` 事件中返回 `recommendation_id`。前端可以把该 ID 写入 URL query，用于分享本次推荐组合。

```text
event: workflow.started
data: {"event":"workflow.started","recommendation_id":"rec_abc123","conversation_ids":{}}
```

### 查询推荐快照

```text
GET /api/recommendations/rec_abc123
```

返回当前快照。`status=streaming` 时前端每 2 秒轮询；`completed` 或 `failed` 后停止。该接口只返回推荐组合快照，不替代本地英雄池目录。
````

- [ ] **Step 2: Update backend navigation**

Add `recommendations.py`, `recommendation_snapshot_store.py`, and `recommendation_snapshot_stream.py` to the relevant backend nav files. Mention that routes stay HTTP-only and services own persistence/event wrapping.

- [ ] **Step 3: Update frontend navigation**

Add `recommendationSnapshotClient.ts` under lib nav and `recommendationSnapshotModel.ts` under workflow nav. Mention URL hydration and polling helpers.

- [ ] **Step 4: Check docs formatting**

Run:

```powershell
git diff --check -- docs
```

Expected: no whitespace errors.

---

### Task 10: Postgres Integration And Runtime Verification

**Files:**
- No new source files unless fixing issues found by verification.

- [ ] **Step 1: Check Docker daemon**

Run:

```powershell
docker ps
```

Expected: Docker lists containers. If it fails with daemon unavailable, start Docker Desktop and rerun.

- [ ] **Step 2: Start local Postgres**

Run:

```powershell
docker compose up -d postgres
```

Expected: `agent-workshop-jarvis-postgres-1` or equivalent container is running.

- [ ] **Step 3: Install backend dependencies and run tests**

Run:

```powershell
cd backend
python -m pip install -r requirements.txt
python -m pytest -q
```

Expected: all backend tests pass.

- [ ] **Step 4: Start backend and check health**

Run:

```powershell
cd backend
$env:DATABASE_URL='postgresql://agent_workshop:agent_workshop@127.0.0.1:54329/agent_workshop'
python app.py
```

In a second terminal:

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:5000/api/health" -UseBasicParsing
```

Expected: health endpoint returns 200.

- [ ] **Step 5: Verify snapshot route through Flask**

Use the running app and a generated stream from the frontend, or run a direct GET for a known test ID after creating one through the stream. A missing ID should return 404:

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:5000/api/recommendations/missing" -UseBasicParsing
```

Expected: HTTP 404 with `recommendation snapshot not found`.

---

### Task 11: Frontend Runtime Verification

**Files:**
- No new source files unless fixing issues found by verification.

- [ ] **Step 1: Build frontend**

Run:

```powershell
cd frontend
npm run build
```

Expected: PASS.

- [ ] **Step 2: Start or reuse Vite**

If Vite is not running:

```powershell
cd frontend
npm run dev -- --host 127.0.0.1 --port 5188
```

If a Vite server is already running on 5188, reuse it.

- [ ] **Step 3: Generate one recommendation**

Open `http://127.0.0.1:5188`, send a prompt such as:

```text
帮我规划白酒销售转化的推荐智能体组合
```

Expected:

- URL gains `?recommendation_id=rec_...`.
- Hero Hall upper recommended team shows streamed recommendation fields.
- Lower hero pool still shows local catalog cards such as `战略参谋官` and `经营罗盘官`.

- [ ] **Step 4: Verify shared URL hydration**

Copy the URL with `recommendation_id`, open it in a new tab.

Expected:

- App fetches `GET /api/recommendations/<id>`.
- Hero Hall can render the upper recommended team from the snapshot.
- If snapshot is still `streaming`, the app polls every 2 seconds.
- Polling stops when snapshot reaches `completed` or `failed`.

- [ ] **Step 5: Verify desktop and mobile layouts**

Use browser viewport checks:

- Desktop: `1440x900`
- Mobile: `390x844`

Expected:

- No incoherent text overlap in upper cards.
- Lower hero pool remains local catalog data.
- “打开推荐” only opens matched launch targets from the local catalog; unmatched agents do not get fabricated links.

---

### Task 12: Final Checks And Commit

**Files:**
- All changed files.

- [ ] **Step 1: Run full checks**

Run:

```powershell
cd backend
python -m pytest -q

cd ..\frontend
node scripts/verify-hero-team-presentation.mjs
node scripts/verify-recommendation-snapshot-model.mjs
npm run build

cd ..
git diff --check
```

Expected: all commands pass.

- [ ] **Step 2: Review changed files**

Run:

```powershell
git status --short
git diff --stat
```

Expected: only files related to recommendation snapshot persistence, docs, tests, and the existing prior Hero Hall work are modified. Do not stage unrelated `TODO.md` unless the user explicitly asks.

- [ ] **Step 3: Commit implementation**

After the user approves staging, run:

```powershell
git add docker-compose.yml backend frontend docs
git commit -m "feat: persist recommendation snapshots"
```

Expected: commit succeeds. If previous uncommitted Hero Hall changes are still present and should be separate, split commits:

```powershell
git add frontend/src/features/heroHall frontend/src/lib/agentLaunchCatalog.ts docs/coze-chat-stream-api.md docs/ai-nav/frontend/src/features/heroHall
git commit -m "fix: use streamed hero recommendations"

git add docker-compose.yml backend frontend/src/lib/recommendationSnapshotClient.ts frontend/src/features/workflow/recommendationSnapshotModel.ts frontend/src/App.tsx frontend/src/types.ts docs
git commit -m "feat: persist recommendation snapshots"
```

---

## Self-Review

Spec coverage:

- Unique `recommendation_id`: covered by Tasks 2, 3, 5, 8.
- Snapshot persistence: covered by Tasks 2, 3, 5, 10.
- Query API: covered by Task 4.
- Frontend URL hydration and polling: covered by Tasks 6, 7, 8, 11.
- Red-box hero pool remains local: covered by Tasks 8, 11, and final checks.
- Docker local Postgres: covered by Tasks 1 and 10.
- Docs/nav updates: covered by Task 9.

Placeholder scan:

- No red-flag markers are required by this plan.

Type consistency:

- Backend snapshot field names use API response keys: `agents`, `graph_path`, `conversation_ids`.
- Database column names use `_json` suffix only internally.
- Frontend uses `RecommendationSnapshot` with `agents`, `graph_path`, and `conversation_ids`.
