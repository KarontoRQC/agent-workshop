# coze_client.py

> `backend/services/coze_client.py` · Python · 约 500 行

## 用途

封装 Coze 和 LongCat 的流式请求。Coze 分支直接调用官方聊天接口；LongCat 分支读取 prompt、维护轻量会话历史，并把上游 delta 适配成类 Coze SSE 帧。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `CozeConfigurationError` | exception | ~12 | 配置缺失或供应商不支持。 |
| `CozeConnectionError` | exception | ~16 | 网络请求连接失败。 |
| `CozeUpstreamError` | exception | ~20 | 上游返回错误状态或非 SSE。 |
| `CozeClient` | class | ~27 | 对外提供 `stream_single_turn_chat`。 |
| `LongCatStreamAdapter` | class | ~185 | 将 LongCat 上游流适配为 Coze 风格事件。 |
| `parse_json_object` | function | ~478 | 安全解析 JSON 对象。 |
| `json_dumps` | function | ~499 | 统一 JSON 输出编码。 |

## 依赖

内部依赖:
- `backend/config.py` — 提供供应商、prompt 和超时设置。
- `backend/prompts/*.txt` — LongCat 分支读取系统 prompt。

外部依赖(仅列包名,不做解释):
- `requests`

## 修改指南

- **新增供应商**: 在 `CozeClient.stream_single_turn_chat` 中新增 provider 分支，并保持异常类型不变。
- **改 LongCat 历史**: 检查 `_LONGCAT_HISTORY_LIMIT` 和 `_append_longcat_history`，避免无限增长。
- **改请求 payload**: 同步检查 `coze_workflow.py` 传入的 `system_context` 和 `auto_save_history`。

## 依赖图

```text
coze_client.py
← 引入: config
→ 被引用: routes/coze.py, services/coze_workflow.py
```
