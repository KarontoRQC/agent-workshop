# backend/AGENTS.md

本文件为 Codex 修改 `backend/` 下代码时提供目录级指导。根级 `AGENTS.md` 仍然适用；后端内的接口、流式协议、配置和测试规则以本文件为准。

## 快速参考

- **应用入口**: `backend/app.py`
- **配置入口**: `backend/config.py`
- **路由目录**: `backend/routes/`
- **业务服务目录**: `backend/services/`
- **Prompt 目录**: `backend/prompts/`
- **测试目录**: `backend/tests/`
- **导航入口**: `docs/ai-nav/backend/_index.nav.md`
- **接口契约**: `docs/coze-chat-stream-api.md`

## 命令

```bash
cd backend && .\.venv\Scripts\python -m pip install -r requirements.txt
cd backend && .\.venv\Scripts\python app.py
cd backend && .\.venv\Scripts\python -m pytest tests
```

## 验证标准

- 修改 `routes/`、`services/`、`config.py` 或 `app.py` 后，至少运行相关 `pytest` 测试；新增接口优先补 `backend/tests/` 中的路由或服务测试。
- 修改 Flask 启动、CORS、数据库连接或环境变量读取后，启动 `cd backend && .\.venv\Scripts\python app.py` 并检查 `GET /api/health`。
- 修改 `/api/coze/chat/stream`、SSE 事件、prompt 标签、推荐智能体字段或快照流后，必须同步检查 `docs/coze-chat-stream-api.md`、`frontend/src/lib/agentStreamClient.ts` 和 `frontend/src/features/workflow/workflowModel.ts`。
- 修改智能体目录、头像路径或推荐快照存储后，检查 `data/source_agents_full.json`、`services/agent_catalog_store.py`、`services/recommendation_snapshot_store.py` 和对应测试。

## 禁止事项

- 禁止把真实 token、数据库密码或本机私有配置写入 `backend/.env.example`、文档、日志或测试快照。
- 禁止提交 `backend/.env`、`backend/.env.local`、`__pycache__/`、`.pytest_cache/` 或本地数据库产物。
- 禁止把 HTTP 请求解析、SSE 边界或 Blueprint 注册以外的业务编排写进 `routes/`；业务逻辑必须放进 `services/`。
- 禁止在未同步前端客户端和接口文档的情况下更改 SSE 事件名、结束信号、字段名或 prompt XML 标签。
- 禁止绕过 `config.py` 直接在业务代码中读取同一类环境变量；新增环境变量必须集中在 `config.py` 并同步 `.env.example`。

## 代码规范

- 路由只负责参数校验、HTTP/SSE 响应边界和错误状态；供应商适配、XML 解析、目录存储和快照持久化放在 `services/`。
- 新增 Blueprint 时在 `backend/app.py` 注册，并同步更新 `docs/ai-nav/backend/routes/_index.nav.md`。
- 新增后端服务时优先创建可单测的纯函数或类，并在 `backend/tests/` 覆盖正常路径和关键失败路径。
- Prompt 标签契约变更时，按 `prompts/` → `services/coze_stream_transformer.py` → `services/recommended_agents_stream.py` → 接口文档 → 前端客户端的顺序检查。

## 架构导航

| 你要改的代码 | 先读 |
|---|---|
| `backend/routes/` | `docs/ai-nav/backend/routes/_index.nav.md` |
| `backend/services/` | `docs/ai-nav/backend/services/_index.nav.md` |
| `backend/prompts/` | `docs/ai-nav/backend/prompts/_index.nav.md` |
| `backend/tests/` | `backend/tests/` 中现有同类测试 |
| 后端整体结构 | `docs/ai-nav/backend/_index.nav.md` |

## 注意事项

- `app.py` 使用 `LazyStore` 延迟初始化数据库相关 store；改动启动路径时避免把数据库连接提前到应用导入阶段。
- `config.py` 会读取 `backend/.env` 并用 `backend/.env.local` 覆盖本机配置；示例文件只放安全默认值和占位说明。
- 后端默认面向本地 Flask、Vite 代理和 Docker Compose 三种运行方式；改端口、host 或代理前同步检查根级 `README.md` 和前端 `vite.config.ts`。
