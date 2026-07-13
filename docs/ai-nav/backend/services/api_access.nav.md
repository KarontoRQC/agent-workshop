# api_access.py

> `backend/services/api_access.py` · Python · 约 120 行

## 用途

提供无数据库状态的 HMAC API 会话、CSRF token 和推荐编号编辑令牌签发/验证。Cookie 与 token 均使用 URL-safe Base64 编码的 SHA-256 HMAC。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `IssuedApiSession` | dataclass | ~21 | 承载 Cookie、CSRF token 和过期时间。 |
| `issue_api_session` | function | ~31 | 生成有有效期的签名会话。 |
| `validate_api_session` | function | ~46 | 校验签名、版本、过期时间和 CSRF token。 |
| `create_recommendation_edit_token` | function | ~82 | 为推荐编号生成作用域固定的编辑令牌。 |
| `validate_recommendation_edit_token` | function | ~92 | 常量时间比较推荐编辑令牌。 |

## 依赖

外部依赖: 仅 Python 标准库。

## 修改指南

- **改会话格式**: 同步调整 `SESSION_VERSION` 和 `test_api_access.py` 的过期/伪造断言。
- **改签名密钥要求**: 同步 `config.py`、`.env.example`、部署环境和接口文档；不得降低 32 字节下限。

## 依赖图

```text
api_access.py
← 引入: Python 标准库
→ 被引用: routes/access_control.py, routes/system.py, routes/coze.py
```
