FROM python:3.13-slim@sha256:eb43ff125d8d58d7449dcba7d336c23bcac412f526d861db493b9994d8010280

ENV PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FLASK_HOST=0.0.0.0 \
    FLASK_PORT=5000 \
    FLASK_DEBUG=0 \
    CHAT_PROVIDER=longcat \
    CHAT_CONFIG_FALLBACK=local \
    WORKFLOW_MODE=unified \
    COZE_CHAT_URL=https://api.coze.cn/v3/chat \
    COZE_ROUTE_PLANNER_BOT_ID=7655970825086074920 \
    COZE_RECOMMENDER_BOT_ID=7652585242385006626 \
    COZE_USER_ID=123456789 \
    LONGCAT_BASE_URL=https://api.longcat.chat/openai/v1 \
    LONGCAT_MODEL=LongCat-2.0 \
    LONGCAT_MAX_TOKENS=3000 \
    SOURCE_AGENTS_PATH=/app/data/source_agents_full.json \
    AGENT_AVATAR_DIR=/app/frontend/src/assets/agent-avatars \
    TTS_PROVIDER=browser

WORKDIR /app/backend

COPY backend/requirements.txt ./requirements.txt
RUN python -m pip install --upgrade pip && \
    python -m pip install -r requirements.txt

COPY backend/ /app/backend/
COPY data/ /app/data/
COPY frontend/src/assets/agent-avatars/ /app/frontend/src/assets/agent-avatars/

EXPOSE 5000

CMD ["python", "app.py"]
