# 推荐智能体快照持久化设计

## 背景

当前 Hero Hall 上方推荐组合来自 `/api/coze/chat/stream` 的流式返回，页面打开后依赖前端内存态展示推荐智能体。这样会导致两个问题：

1. 用户刷新或复制链接给其他人后，推荐组合无法稳定复现。
2. “打开推荐”需要基于当前推荐组合查真实入口，但推荐组合本身没有后端可查询的持久标识。

目标是在 AI 对话生成推荐组合时同步保存一次推荐快照，并生成一个可共享的唯一 ID。其他用户通过这个 ID 可以查询到同一套推荐组合；如果推荐仍在生成中，页面可以轮询获取最新快照。

## 推荐方案

采用“快照 + 生成中轮询更新”。

对话开始时后端创建 `recommendation_id`，并在 SSE 早期事件中返回给前端。推荐流生成过程中，后端把知识路径、推荐智能体数组、总结、状态和会话 ID 持续 upsert 到数据库。前端保存这个 ID，并在分享链接里携带它。其他人打开链接后，通过 `GET /api/recommendations/<recommendation_id>` 获取快照；若状态是 `streaming`，每 2 秒轮询一次，直到 `completed` 或 `failed`。

暂不做独立实时订阅 SSE，也不做账号权限、编辑权限或历史列表。这些可以在快照查询稳定后再扩展。

## 数据模型

新增一张表：`recommendation_snapshots`。

字段：

- `id`：字符串主键，推荐使用 UUID hex 或短 UUID，作为分享和查询 ID。
- `status`：字符串，取值 `streaming`、`completed`、`failed`。
- `message`：用户原始问题。
- `agents_json`：推荐智能体数组，保存流式 merge 后的当前快照。
- `summary`：推荐总结文本。
- `graph_path_json`：知识路径快照，保存 `graph.path.resolved` 的结构化对象。
- `conversation_ids_json`：上游会话 ID 快照。
- `error`：失败信息，只有 `failed` 时写入。
- `created_at`：创建时间。
- `updated_at`：更新时间。

数据库使用 Postgres。开发环境通过本地 Docker 启动 Postgres，后端通过 `DATABASE_URL` 连接。后端不把真实 token 写入文档或日志。

## 后端接口

### `POST /api/coze/chat/stream`

请求体兼容现有字段。

新增行为：

- 请求开始时创建 `recommendation_id` 和 `streaming` 快照。
- `workflow.started` 事件中返回 `recommendation_id`。
- 收到 `graph.path.resolved` 时保存 `graph_path_json`。
- 收到 `recommended_agents.delta`、`recommended_agent.completed`、`recommended_agents.completed` 时保存最新 `agents_json`。
- 收到推荐 `SUMMARY` 或 `workflow.stage.completed` 时保存 `summary`。
- 正常结束时把状态更新为 `completed`。
- 出错时把状态更新为 `failed`，并保存 `error`。

### `GET /api/recommendations/<recommendation_id>`

返回当前快照：

```json
{
  "id": "rec_abc123",
  "status": "streaming",
  "message": "帮我规划白酒销售转化的推荐智能体组合",
  "agents": [
    {
      "agent_index": 0,
      "rank": 1,
      "agent_name": "销售之神",
      "stage": "成交促单与异议处理",
      "reason": "提供杀手级成交模型和实战案例。",
      "lineup": "conversion"
    }
  ],
  "summary": "",
  "graph_path": {
    "route": "白酒行业定位-目标客群画像"
  },
  "conversation_ids": {
    "route_planner": "7483480124491380000"
  },
  "created_at": "2026-07-02T10:00:00Z",
  "updated_at": "2026-07-02T10:00:08Z"
}
```

错误行为：

- ID 不存在返回 `404` 和 `{ "error": "recommendation snapshot not found" }`。
- 数据库不可用返回 `503` 和明确错误，不伪造推荐数据。

## 后端结构

新增文件：

- `backend/services/recommendation_snapshot_store.py`：封装数据库连接、建表、create/get/update 快照。
- `backend/routes/recommendations.py`：提供 `GET /api/recommendations/<id>`。

修改文件：

- `backend/app.py`：注册 recommendations blueprint。
- `backend/config.py`：读取 `DATABASE_URL`，提供默认本地开发连接示例。
- `backend/.env.example`：增加 `DATABASE_URL` 示例。
- `backend/routes/coze.py`：在创建流式响应前创建快照，并把快照 store 注入工作流包装层。
- `backend/services/coze_workflow.py`：尽量不侵入核心解析逻辑；优先在外层包装 SSE 事件并根据事件更新快照。
- `docs/coze-chat-stream-api.md`：补充 `recommendation_id` 和快照查询接口。

## 前端结构

新增文件：

- `frontend/src/lib/recommendationSnapshotClient.ts`：封装 `GET /api/recommendations/<id>`。

修改文件：

- `frontend/src/lib/agentStreamClient.ts`：识别 SSE 中的 `recommendation_id`。
- `frontend/src/types.ts`：增加推荐快照类型。
- `frontend/src/App.tsx`：保存当前 `recommendation_id`，读取 URL query 中的 `recommendation_id`，在分享快照状态为 `streaming` 时轮询。
- `frontend/src/features/heroHall/AgentHeroHall.tsx`：保留红框英雄池本地目录来源；上方推荐组合优先使用快照或流式推荐数据。
- `frontend/src/features/heroHall/HeroTeamCarousel.tsx`：继续展示真实推荐字段。

分享链接采用 query 参数：

```text
/?recommendation_id=rec_abc123
```

前端轮询规则：

- 打开页面时如果 URL 有 `recommendation_id`，立即查询快照。
- 如果返回 `streaming`，每 2 秒查询一次。
- 如果返回 `completed` 或 `failed`，停止轮询。
- 如果返回 `404`，展示“推荐组合不存在或已失效”，不回退到假数据。

## 本地开发与 Docker

开发环境使用本地 Docker Postgres。建议增加 `docker-compose.yml`：

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

本地 `DATABASE_URL`：

```text
postgresql://agent_workshop:agent_workshop@127.0.0.1:54329/agent_workshop
```

如果 Docker daemon 未启动，后端单元测试仍应能使用内存 store 或 fake store 测业务逻辑；Postgres 集成测试只在 Docker 可用时运行。

## 测试标准

后端：

- 创建快照会生成唯一 ID，初始状态为 `streaming`。
- merge `recommended_agents.delta` 后，查询接口返回当前 agents。
- `recommended_agents.completed` 后，agents 按最终列表覆盖。
- `workflow.completed` 后状态为 `completed`。
- 出错时状态为 `failed` 并保存 error。
- `GET /api/recommendations/<id>` 对不存在 ID 返回 `404`。

前端：

- URL 带 `recommendation_id` 时会请求快照并渲染上方推荐组合。
- `streaming` 快照会继续轮询，`completed` 后停止。
- 红框英雄池仍使用本地目录，不被快照数据替换。
- “打开推荐”仍只根据推荐 `agent_name` 精确匹配本地目录入口。

验证命令：

```powershell
cd backend
.\.venv\Scripts\python -m pytest
.\.venv\Scripts\python app.py

cd frontend
npm run build
```

前端可见行为变更完成后，需要用浏览器预览桌面和移动端。

## 非目标

- 不做用户账号、访问权限和私密分享控制。
- 不做推荐组合编辑历史。
- 不做服务端向分享页推送实时 SSE。
- 不改红框英雄池的数据来源。
- 不把后端返回中不存在的 `endpoint`、`agent_key` 或 URL 猜出来。
