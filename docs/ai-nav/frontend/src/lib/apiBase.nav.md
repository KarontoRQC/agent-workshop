# apiBase.ts

> `frontend/src/lib/apiBase.ts` · TypeScript · 约 29 行

## 用途

集中解析前端 API base URL。生产默认同源 `/api`，显式裸域名会补 `/api`，避免 HTTPS 页面生成 HTTP Mixed Content。

## 导出

| 名称 | 类型 | 作用 |
|------|------|------|
| `resolveApiBaseUrl` | function | 规范 Vite 环境中的 API 地址。 |
| `API_BASE_URL` | const | 当前运行时统一 API base。 |

## 修改指南

- 修改 URL 规则时同步检查 `vite.config.ts`、`frontend/.env`、`apiSession.ts` 和 Mixed Content 生产审计。
