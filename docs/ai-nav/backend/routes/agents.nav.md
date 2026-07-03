# agents.py

> `backend/routes/agents.py` · Python · 约 47 行

## 用途

定义数据库智能体目录的 HTTP 边界。前端通过这里读取完整智能体列表、真实 GPT 启动链接、知识库字段和头像 URL，头像二进制仍由后端从数据库资产表返回。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `agents_bp` | Blueprint | ~4 | 注册 `/api/agents` 相关接口。 |
| `list_agents` | function | ~8 | 返回 `GET /api/agents` 的目录 JSON。 |
| `get_agent_avatar` | function | ~19 | 返回 `GET /api/agents/<agent_id>/avatar` 的图片响应。 |

## 依赖

内部依赖:
- `app.py` — 注册蓝图并注入 `AGENT_CATALOG_STORE`。
- `backend/services/agent_catalog_store.py` — 提供目录和头像资产读取。

外部依赖(仅列包名, 不做解释):
- `flask`

## 修改指南

- **改目录响应字段**: 同步检查 `frontend/src/types.ts`、`frontend/src/lib/agentCatalogClient.ts` 和 `frontend/src/lib/agentLaunchCatalog.ts`。
- **改头像返回方式**: 保持 `avatar_url` 是可被 `<img>` 直接加载的 URL，不要把图片二进制塞进 `GET /api/agents`。
- **改打开入口**: 只使用真实 `launch_url`；源数据没有 GPT 链接时前端不显示“打开”。

## 依赖图

```text
agents.py
→ 依赖: services.agent_catalog_store
→ 被引用: app.py 注册为 /api/agents
```
