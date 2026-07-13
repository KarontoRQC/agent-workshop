# apiSession.ts

> `frontend/src/lib/apiSession.ts` · TypeScript · 约 135 行

## 用途

懒创建 `/api/session`，把 CSRF token 缓存在当前标签页，并为聊天、TTS 与推荐写请求统一附加 Cookie、CSRF header 和可选推荐编辑令牌。

## 导出

| 名称 | 类型 | 作用 |
|------|------|------|
| `ApiSessionError` | class | 表示会话签发或刷新失败。 |
| `fetchApiMutation` | async function | 执行受保护请求，401 时清缓存并重试一次。 |
| `ensureApiSession` | async function | 复用未过期会话或合并并发签发请求。 |
| `clearApiSessionCache` | function | 清除当前标签页会话缓存。 |

## 依赖

内部依赖:
- `apiBase.ts` — 提供统一 API 地址。
- `recommendationEditAccess.ts` — 按推荐编号读取编辑令牌。

## 修改指南

- **改 header 名称**: 同步 `services/api_access.py`、`routes/access_control.py`、Node 审计 helper 和接口文档。
- **改缓存位置**: API 会话只放 `sessionStorage`，推荐编辑令牌与分享 URL 的边界不得改变。
