# test_coze_snapshot_stream.py

> `backend/tests/test_coze_snapshot_stream.py` · Python · ~115 行

## 用途

验证 `/api/coze/chat/stream` 在流式对话中创建推荐快照、注入 `recommendation_id`、规范并转发参与者身份，并在 store 或上游异常时返回安全错误。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `UnavailableStore` | class | ~10 | 模拟快照 store 的受控不可用异常。 |
| `RawUnavailableStore` | class | ~15 | 模拟快照 store 抛出原始异常。 |
| `test_stream_chat_creates_snapshot_and_injects_recommendation_id` | test | ~19 | 验证聊天流创建快照并把推荐 ID 注入 SSE。 |
| `test_stream_chat_forwards_allowlisted_participant_identity` | test | ~44 | 验证厂长白名单身份传给工作流。 |
| `test_stream_chat_downgrades_unknown_participant_identity_to_guest` | test | ~65 | 验证未知身份降级为普通用户。 |
| `test_stream_chat_local_config_fallback_creates_snapshot_and_injects_recommendation_id` | test | ~44 | 验证本地配置兜底流也创建快照。 |
| `test_stream_chat_returns_503_when_snapshot_store_unavailable` | test | ~65 | 验证 store 不可用返回 503。 |
| `test_stream_chat_returns_503_when_snapshot_store_raises_raw_error` | test | ~80 | 验证原始异常细节不会泄漏给客户端。 |
| `test_stream_chat_stream_error_fails_snapshot_without_leaking_detail` | test | ~94 | 验证流中异常会标记快照失败并隐藏原始细节。 |
| `test_create_app_uses_lazy_default_snapshot_store` | test | ~112 | 验证默认快照 store 延迟初始化。 |

## 依赖

内部依赖:
- `backend/app.py` — 创建带测试 store 的 Flask app。
- `backend/routes/coze.py` — 被 monkeypatch 的流式工作流入口。
- `backend/services/coze_stream_transformer.py` — 构造 SSE 测试帧。
- `backend/services/recommendation_snapshot_store.py` — 提供内存 store 和错误类型。

外部依赖(仅列包名):
- `pytest`

## 修改指南

- **修改聊天流快照注入**: 同步更新 `recommendation_id` 和快照状态断言。
- **修改错误处理**: 保持“不泄漏原始异常信息”的断言。
- **修改身份传参**: 保持白名单值透传、未知值降级的断言。

## 依赖图

```text
test_coze_snapshot_stream.py
← 引入: app, routes/coze, services/coze_stream_transformer, services/recommendation_snapshot_store
→ 被引用: pytest
```
