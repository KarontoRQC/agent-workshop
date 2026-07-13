# test_coze_client.py

> `backend/tests/test_coze_client.py` · Python · 约 190 行

## 用途

验证 LongCat 请求参数的服务端控制、兼容历史预算，以及响应头前临时超时的有限重试和 HTTP 错误不重放。

## 关键覆盖

| 名称 | 类型 | 作用 |
|------|------|------|
| `test_longcat_payload_forces_low_latency_server_controls` | test | 验证模型、thinking、温度和输出上限不能被请求参数覆盖。 |
| `test_longcat_history_keeps_only_three_bounded_turns` | test | 验证历史最多三轮且总字符数受限。 |
| `test_longcat_stream_retries_header_timeout_once_then_connects` | test | 验证响应头前读超时只重试一次并使用 LongCat 独立静默超时。 |
| `test_longcat_stream_stops_after_bounded_transient_retries` | test | 验证连续临时超时在有限次数后转成连接错误。 |
| `test_longcat_stream_does_not_retry_http_errors` | test | 验证 HTTP 业务错误不重试并关闭响应。 |

## 修改指南

- 修改 LongCat payload、服务端保护参数、历史预算或响应头前重试策略时同步更新本文件测试。
