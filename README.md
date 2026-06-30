# Agent Workshop

Agent Workshop 现在的主线是 JARVIS 语音粒子交互项目：一个面向 AI 对话、语音控制、Agent 工作流和知识图谱路径展示的现场演示原型。

早期黑金色知识图谱前端已经归档为本地历史包，不再作为仓库主线维护：

- Archive: `D:\项目1\archives\agent-workshop-black-gold-knowledge-graph-2935abf-20260630.zip`
- Source commit: `2935abfbb22c922c675badc88c1153457d92cb42`

## Project Shape

- `frontend/`: JARVIS voice particle app, built with React, Vite, TypeScript, and Three.js.
- `backend/`: Flask API for Coze/LongCat agent workflow streaming and local TTS.
- `data/source_agents_full.json`: source catalog for recommended agent cards and launch links.
- `docs/`: backend stream/API integration notes.

## Run Frontend

```powershell
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5188
```

Open:

```text
http://127.0.0.1:5188/
```

## Run Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python app.py
```

Default backend URL:

```text
http://127.0.0.1:5000
```

Health check:

```text
GET http://127.0.0.1:5000/api/health
```

## Runtime Notes

- Frontend dev mode proxies `/api` to the configured backend target.
- `/api/tts/speech` can use local TTS when available; the frontend keeps a browser speech fallback for failures.
- `/api/coze/chat/stream` streams route planning, recommendation, workflow, and graph-control events to the JARVIS UI.
- The main collaboration branch is `main`; feature branches should be merged back into `main` and removed after verification.
