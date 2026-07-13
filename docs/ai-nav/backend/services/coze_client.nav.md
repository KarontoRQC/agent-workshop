# coze_client.py

> `backend/services/coze_client.py` · Python · 约 616 行

## 用途

封装 Coze 和 LongCat 的流式请求。LongCat 分支默认关闭模型推理、保护服务端生成参数、限制兼容历史长度，对响应头前的临时网络错误执行有限重试，以独立静默超时防止上游长期阻塞，并记录上游响应头、首帧和首个正式内容耗时。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `CozeConfigurationError` | exception | ~12 | 配置缺失或供应商不支持。 |
| `CozeConnectionError` | exception | ~16 | 网络请求连接失败。 |
| `CozeUpstreamError` | exception | ~20 | 上游返回错误状态或非 SSE。 |
| `CozeClient` | class | ~38 | 对外提供配置预检和 `stream_single_turn_chat`。 |
| `LongCatStreamAdapter` | class | ~220 | 将 LongCat 上游流适配为 Coze 风格事件并记录首字耗时。 |
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
- **改 LongCat 历史**: 检查消息数、单条字符数和总字符预算；统一工作流必须继续使用显式状态而非进程内历史。
- **改请求 payload**: 同步检查 `LONGCAT_SERVER_CONTROLLED_PARAMETERS`、`config.py`、`.env.example` 和接口文档。
- **改流读取**: 保持小块 SSE 读取和首帧/首内容日志，不要记录消息正文或密钥。
- **改超时/重试**: 只允许响应头前的 `Timeout`/`ConnectionError` 重试；HTTP 错误和已经开始消费的流不得重放，避免重复回答。

## 依赖图

```text
coze_client.py
← 引入: config
→ 被引用: routes/coze.py, services/coze_workflow.py
```
