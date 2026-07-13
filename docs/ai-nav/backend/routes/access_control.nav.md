# access_control.py

> `backend/routes/access_control.py` · Python · 约 69 行

## 用途

集中执行 Flask 路由的签名 API 会话、CSRF header 和推荐编号编辑权限校验，并为测试环境提供显式可控的安全绕过。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `get_active_security_settings` | function | ~23 | 读取应用安全配置，并只在测试环境补测试密钥。 |
| `require_api_session` | function | ~32 | 校验 HttpOnly 会话 Cookie 与 CSRF header，映射 401/403/503。 |
| `require_recommendation_edit_access` | function | ~54 | 在 API 会话基础上校验推荐编号专属编辑令牌。 |

## 依赖

内部依赖:
- `backend/config.py` — 提供 `ApiSecuritySettings`。
- `backend/services/api_access.py` — 提供签名和验证纯函数。

外部依赖(仅列包名,不做解释):
- `flask`

## 修改指南

- **保护新写接口**: 普通聊天/TTS 调用 `require_api_session`；推荐内容写入调用 `require_recommendation_edit_access`。
- **改错误状态**: 同步更新 `docs/coze-chat-stream-api.md` 和安全集成测试，禁止返回 token 或内部异常。

## 依赖图

```text
access_control.py
← 引入: config.py, services/api_access.py
→ 被引用: routes/coze.py, routes/tts.py, routes/recommendations.py, routes/combination_agents.py, routes/system.py
```
