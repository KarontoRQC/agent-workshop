# test_tts_route.py

> `backend/tests/test_tts_route.py` · Python · 约 23 行

## 用途

验证 TTS 路由把配置错误和合成错误映射为稳定通用响应，不向客户端泄漏 voice token 或上游响应正文。

## 关键测试

| 名称 | 作用 |
|------|------|
| `test_tts_route_does_not_expose_internal_error_details` | 覆盖 503/502 状态及原始异常脱敏。 |

## 修改指南

- 修改 `routes/tts.py` 的错误映射时同步更新本文件和生产面审计。
