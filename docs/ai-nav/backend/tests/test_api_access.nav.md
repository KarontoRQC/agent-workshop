# test_api_access.py

> `backend/tests/test_api_access.py` · Python · 约 32 行

## 用途

验证 API 会话签发/过期、短密钥拒绝，以及推荐编辑令牌只能用于对应推荐编号。

## 关键测试

| 名称 | 作用 |
|------|------|
| `test_api_session_roundtrip_and_expiry` | 覆盖有效、错误 CSRF 和过期会话。 |
| `test_api_session_rejects_short_signing_secret` | 保证生产签名密钥至少 32 字节。 |
| `test_recommendation_edit_token_is_scoped_to_recommendation` | 防止编辑令牌跨推荐编号复用。 |

## 修改指南

- 改 `services/api_access.py` 的签名载荷、版本或有效期判断时同步更新本文件。
