# test_agents_route.py

> `backend/tests/test_agents_route.py` · Python · ~95 行

## 用途

验证智能体目录路由返回可启动链接、头像 URL、数据库头像字节，以及缺失头像和未暴露详情接口的行为。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `_client_with_catalog_store` | helper | ~5 | 用内存智能体目录和推荐快照 store 创建 Flask 测试客户端。 |
| `test_get_agents_returns_launch_url_and_avatar_url` | test | ~11 | 验证 `/api/agents` 返回公开目录字段且不暴露 `detail_url`。 |
| `test_get_agent_avatar_returns_database_image_bytes` | test | ~49 | 验证头像接口返回数据库中的图片字节和缓存头。 |
| `test_get_agent_avatar_returns_404_when_missing` | test | ~63 | 验证缺失头像返回 404。 |
| `test_get_agent_detail_route_is_not_exposed` | test | ~72 | 验证单个智能体详情路由未暴露。 |
| `test_build_fallback_avatar_returns_svg_bytes_for_agents_without_source_image` | test | ~90 | 验证无源头像时生成 SVG 兜底头像。 |

## 依赖

内部依赖:
- `backend/app.py` — 创建 Flask app。
- `backend/services/agent_catalog_store.py` — 提供内存目录 store 和兜底头像生成。
- `backend/services/recommendation_snapshot_store.py` — 提供内存推荐快照 store。

外部依赖(仅列包名):
- `pytest`

## 修改指南

- **修改智能体目录响应字段**: 更新 `/api/agents` 断言，并同步检查 `frontend/src/lib/agentCatalogClient.ts`。
- **修改头像接口**: 更新头像字节、mime type 或缓存头断言。

## 依赖图

```text
test_agents_route.py
← 引入: app, services/agent_catalog_store, services/recommendation_snapshot_store
→ 被引用: pytest
```
