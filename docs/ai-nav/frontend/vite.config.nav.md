# vite.config.ts

> `frontend/vite.config.ts` · TypeScript · 约 40 行

## 用途

配置 Vite React 插件、分包和开发代理。开发模式下 `/api/tts` 可单独走 `TTS_PROXY_TARGET`，其余 `/api` 走 `API_PROXY_BASE_URL` 或 Vite 环境变量；`/agent-avatars` 直接代理到同一 API 源站根路径，确保本地英雄殿堂头像与生产 Nginx 行为一致。默认代理目标是 `https://agent.xtznai.com`，避免本地代理链路回落到明文 HTTP。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `resolveProxyApi` | function | ~7 | 从完整 URL 中拆出代理 prefix 和 target。 |
| `default` | Vite config | ~14 | 返回 React 插件和 dev server proxy。 |

## 依赖

外部依赖(仅列包名,不做解释):
- `vite`
- `@vitejs/plugin-react`

## 修改指南

- **改 API 代理**: 同步检查 `frontend/src/lib/agentStreamClient.ts` 的运行时 base URL。
- **改 TTS 代理**: 保持 `/api/tts` 优先级高于通用 `/api`。
- **改头像代理**: `/agent-avatars` 不得套用 `/api` prefix rewrite，静态头像始终位于源站根路径。
- **改分包**: Three.js 与 React vendor 保持独立 chunk；`ParticleField` 自身由 `App.tsx` 动态导入。

## 依赖图

```text
vite.config.ts
→ 被引用: Vite dev server
```
