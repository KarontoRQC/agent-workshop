# app.py

> `backend/app.py` · Python · 约 105 行

## 用途

创建 Flask 应用，设置应用与供应商日志器的 `LOG_LEVEL`，启用 `/api/*` CORS，并挂载系统、智能体目录、组合智能体、推荐快照、Coze 流式对话和 TTS 路由。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `create_app` | function | ~23 | 构造 Flask app 并注册 `system_bp`、`agents_bp`、`combination_agents_bp`、`recommendations_bp`、`coze_bp`、`tts_bp`。 |
| `create_recommendation_snapshot_store` | function | ~43 | 用数据库 URL 创建推荐快照 store。 |
| `create_combination_agent_store` | function | ~47 | 用数据库 URL 创建组合智能体 store。 |
| `create_agent_catalog_store` | function | ~51 | 用数据库 URL、源目录、头像种子目录和静态导出配置创建 Postgres 智能体目录 store。 |
| `app` | module var | ~59 | WSGI/本地运行入口。 |

## 依赖

内部依赖:
- `backend/config.py` — 提供 CORS origin、数据库、智能体源目录和静态头像导出配置。
- `backend/routes/agents.py` — 提供 `/api/agents` 和头像兜底接口。
- `backend/routes/combination_agents.py` — 提供组合智能体保存和读取接口。
- `backend/routes/recommendations.py` — 提供推荐快照接口。
- `backend/routes/coze.py` — 提供 `/api/coze`。
- `backend/routes/system.py` — 提供 `/api/health` 和 echo。
- `backend/routes/tts.py` — 提供 `/api/tts`。

外部依赖(仅列包名,不做解释):
- `flask`
- `flask_cors`

## 修改指南

- **新增全局路由组**: 新建 Blueprint 后只在 `create_app` 中注册，保持 URL prefix 明确。
- **调整本地启动端口**: 修改 `FLASK_HOST`、`FLASK_PORT`、`FLASK_DEBUG` 默认读取逻辑时同步 README。
- **调整流式观测日志**: 通过 `LOG_LEVEL` 控制，生产默认保留 `INFO` 级首事件、首内容和总耗时日志。

## 依赖图

```text
app.py
← 引入: config, routes.agents, routes.combination_agents, routes.coze, routes.recommendations, routes.system, routes.tts
→ 被引用: 本地 Flask 启动和部署入口
```
