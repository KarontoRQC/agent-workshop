# backend/tests/

> `backend/tests/` · 5 个 pytest 测试文件

## 职责

后端测试目录覆盖智能体目录接口、推荐快照存储、推荐快照流式持久化、Coze 流接入快照以及推荐快照路由。测试主要使用 Flask `test_client` 和内存 store，避免依赖真实数据库或外部模型服务。

## 文件列表

| 文件 | 用途 | 关键导出 |
|------|------|----------|
| `test_agents_route.py` | 验证 `/api/agents`、头像读取和未暴露详情接口。 | `test_get_agents_returns_launch_url_and_avatar_url`, `test_get_agent_avatar_returns_database_image_bytes` |
| `test_coze_snapshot_stream.py` | 验证聊天流创建推荐快照、注入推荐 ID 和错误收敛。 | `test_stream_chat_creates_snapshot_and_injects_recommendation_id` |
| `test_recommendation_snapshot_store.py` | 验证内存/Postgres 推荐快照 store 的字段归一化和错误回滚。 | `test_new_recommendation_id_uses_rec_prefix_and_16_hex_chars` |
| `test_recommendation_snapshot_stream.py` | 验证 SSE 帧解析、快照持久化和流异常处理。 | `test_workflow_started_injects_recommendation_id` |
| `test_recommendations_route.py` | 验证推荐快照查询和手动追加智能体接口。 | `test_get_recommendation_snapshot_returns_snapshot`, `test_append_agent_to_recommendation_snapshot_persists_manual_agent` |

## 开发模式

- **新增后端接口**: 优先增加同类 route 测试，并用内存 store 隔离数据库。
- **修改快照字段**: 同步更新 store、stream 和 route 三类测试断言。
- **修改错误响应**: 检查测试是否覆盖“不泄漏原始异常详情”。
