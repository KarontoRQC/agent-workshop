# api-session.mjs

> `frontend/scripts/api-session.mjs` · Node.js · 约 44 行

## 用途

为 Node 生产审计创建签名 API 会话，解析 `Set-Cookie` 与 CSRF token，并为后续请求附加可选推荐编辑令牌。

## 导出

| 名称 | 类型 | 作用 |
|------|------|------|
| `createNodeApiSession` | async function | 调用 `/api/session` 并返回 Cookie/CSRF。 |
| `nodeApiHeaders` | function | 生成受保护请求 headers。 |
| `fetchWithNodeApiSession` | function | 用会话执行 Node fetch。 |

## 修改指南

- 后端会话 Cookie、CSRF 或编辑 header 契约变化时，先更新本 helper，再运行所有生产 API/UI 审计。
