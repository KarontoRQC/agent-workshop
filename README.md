# Agent Workshop

Agent Workshop 现在的主线是 JARVIS 语音粒子交互项目：一个面向 AI 对话、语音控制、Agent 工作流和知识图谱路径展示的现场演示原型。

早期黑金色知识图谱前端已经归档为本地历史包，不再作为仓库主线维护：

- Archive: `D:\项目1\archives\agent-workshop-black-gold-knowledge-graph-2935abf-20260630.zip`
- Source commit: `2935abfbb22c922c675badc88c1153457d92cb42`

## Project Shape

- `frontend/`: JARVIS voice particle app, built with React, Vite, TypeScript, and Three.js.
- `backend/`: Flask API for Coze/LongCat agent workflow streaming and Edge TTS speech synthesis.
- `data/source_agents_full.json`: source catalog for recommended agent cards and launch links.
- `docs/`: backend stream/API integration notes.

## Docker Local Test

```powershell
docker compose up --build
```

Open:

```text
http://127.0.0.1:5188/?skipIntro=1
```

This starts three local services:

- `frontend`: Vite app on `127.0.0.1:5188`, with `/api` proxied to the Docker backend.
- `backend`: Flask API on `127.0.0.1:5000`, connected to Docker Postgres.
- `postgres`: local snapshot database on host port `54329`.

The backend image does not bake local secrets. At runtime Docker Compose reads optional `backend/.env` and `backend/.env.local`, while overriding `DATABASE_URL` to the Docker Postgres service. To test real AI streaming, put `LONGCAT_API_KEY` or `COZE_API_TOKEN` in `backend/.env.local`; otherwise the API uses the local configuration fallback while recommendation snapshot IDs and database reads still work.

非测试环境还必须配置至少 32 字节的 `APP_SIGNING_SECRET`。后端用它签发短期 API 会话和推荐编号专属的编辑令牌；该值不得放进前端环境变量、构建产物或日志。

Agent avatar images are exported from Postgres to the shared `agent_avatar_static` volume. The backend writes files under `AGENT_STATIC_AVATAR_DIR`, and the frontend/nginx side serves them from `AGENT_STATIC_AVATAR_BASE_URL` such as `/agent-avatars/...`. On the production server, both the backend bind mount and nginx alias use the stable directory `/opt/20260715qr/agent/agent-avatars`; frontend release directories must never own, move, or recursively copy this avatar directory during atomic deployments.

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

厂长现场入口仍使用同一页面，只增加白名单身份参数：

```text
本地：http://127.0.0.1:5188/?identity=changzhang
线上：https://agent.xtznai.com/?identity=changzhang
```

无参数或未知值按普通用户处理。该参数只改变称呼与互动人格，不是登录或权限凭证。

## Run Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python app.py
```

后端测试依赖与生产运行依赖分离：

```powershell
.\.venv\Scripts\python -m pip install -r requirements-dev.txt
.\.venv\Scripts\python -m pytest tests
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

- Frontend dev mode proxies `/api` to `https://agent.xtznai.com` by default, while production builds use same-origin `/api`; override `API_PROXY_BASE_URL` or `TTS_PROXY_TARGET` for local backend testing.
- `/api/tts/speech` always uses Edge TTS with the Chinese female voice `zh-CN-XiaoxiaoNeural`; the committed frontend default does not auto-fallback to browser speech.
- `/api/coze/chat/stream` streams route planning, recommendation, workflow, and graph-control events to the JARVIS UI.
- 聊天、TTS 和推荐写操作会由前端自动先调用 `/api/session`，再携带 HttpOnly 签名会话与 CSRF header；分享出来的 Hero Hall URL 默认只读，编辑令牌不会进入 URL。
- `/api/agents` returns static `avatar_url` values for nginx/static serving; the old `/api/agents/<id>/avatar` endpoint remains as a fallback.
- 生产默认关闭 `/api/echo`，聊天消息上限为 8,000 字符；LongCat 默认 4 秒静默超时、不重试，并启用 20 秒短路器。
- The main collaboration branch is `main`; feature branches should be merged back into `main` and removed after verification.
