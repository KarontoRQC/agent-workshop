# vite.config.ts

> `frontend/vite.config.ts` · TypeScript · 约 34 行

## 用途

配置 Vite React 插件和开发代理。开发模式下 `/api/tts` 可单独走 `TTS_PROXY_TARGET`，其余 `/api` 走 `API_PROXY_BASE_URL` 或 Vite 环境变量。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `resolveProxyApi` | function | ~6 | 从完整 URL 中拆出代理 prefix 和 target。 |
| `default` | Vite config | ~13 | 返回 React 插件和 dev server proxy。 |

## 依赖

外部依赖(仅列包名,不做解释):
- `vite`
- `@vitejs/plugin-react`

## 修改指南

- **改 API 代理**: 同步检查 `frontend/src/lib/agentStreamClient.ts` 的运行时 base URL。
- **改 TTS 代理**: 保持 `/api/tts` 优先级高于通用 `/api`。

## 依赖图

```text
vite.config.ts
→ 被引用: Vite dev server
```
