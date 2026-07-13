# agent_catalog_store.py

> `backend/services/agent_catalog_store.py` · Python · 约 488 行

## 用途

维护智能体目录和头像资产的存储层。启动时从 `data/source_agents_full.json` 和头像目录做种子导入，把目录字段写入 `agents` 表，把头像图片 bytes 写入 `agent_assets` 表；头像可按 GPT ID、原始 `001_` 文件名或压缩后的 `agent-001-` 文件名匹配；缺少源头像时保留已有位图，只有无头像或旧 SVG 兜底时才生成确定性的 SVG 兜底头像入库，并把数据库头像导出到 nginx/静态目录。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `AgentCatalogStoreError` | class | ~46 | 目录存储不可用时抛出的错误。 |
| `build_fallback_avatar` | function | ~102 | 为缺源头像的目录项生成 SVG 头像资产。 |
| `InMemoryAgentCatalogStore` | class | ~182 | 测试用内存目录和头像资产存储。 |
| `PostgresAgentCatalogStore` | class | ~204 | Postgres 目录/头像建表、种子导入、静态头像导出和查询实现。 |
| `AGENT_COLUMNS` | const | ~27 | 数据库目录查询字段列表。 |

## 依赖

内部依赖:
- `data/source_agents_full.json` — 种子目录来源。
- `frontend/src/assets/agent-avatars/` — Docker 镜像内的头像种子目录。

外部依赖(仅列包名, 不做解释):
- `psycopg`

## 修改指南

- **改种子字段名**: 同步 `data/source_agents_full.nav.md`、`backend/config.py` 和 `routes/agents.py` 的响应字段。
- **改头像匹配规则**: 检查 GPT ID、`001_` 原始文件名和 `agent-001-` 压缩静态文件名提取，并同步 Docker/服务器里的 `AGENT_AVATAR_DIR`，避免本地能跑但运行环境缺头像。
- **改静态头像目录**: 同步 `backend/config.py`、`backend/.env.example`、`docker-compose.yml` 和 nginx 静态资源挂载；生产环境使用不随前端版本目录切换的 `/opt/20260715qr/agent/agent-avatars`，禁止把头像目录复制进前端 staging 形成嵌套；`avatar_url` 应继续返回可直接被 `<img>` 加载的静态地址。
- **改兜底头像**: 修改 `build_fallback_avatar` 后跑 `backend/tests/test_agents_route.py`，并确认 `agent_assets` 行数仍等于 `agents` 行数。
- **改公开字段**: 同步 `GET /api/agents`、`AgentCatalogItem` 和前端富化逻辑。

## 依赖图

```text
agent_catalog_store.py
→ 读取: data/source_agents_full.json, frontend/src/assets/agent-avatars, agent_assets
→ 写入: AGENT_STATIC_AVATAR_DIR
→ 被引用: app.py, routes/agents.py, routes/recommendations.py
```
