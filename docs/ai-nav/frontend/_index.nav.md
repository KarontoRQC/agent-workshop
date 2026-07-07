# frontend/

> `frontend/` · Vite/React/TypeScript 前端原型
> **功能文档**: `frontend/AGENTS.md`

## 职责

前端承载 JARVIS 语音粒子体验、机甲 HUD、知识路径、推荐智能体、Agent Hero Hall、TTS 播放和后端 SSE 消费。根目录包含构建配置、运行说明、设计记录和环境代理配置。

## 文件列表

| 文件 | 用途 | 关键导出 |
|------|------|----------|
| `package.json` | 前端依赖和 npm scripts。 | `dev`, `build`, `preview` |
| `vite.config.ts` | Vite React 插件和 `/api`、`/api/tts` 代理。 | `defineConfig` |
| `AGENTS.md` | 前端长期视觉和交互决策。 | 设计约束 |
| `README.md` | 前端运行、语音和模型端点说明。 | 运行说明 |
| `index.html` | Vite 应用 HTML 宿主，声明首页默认浏览器标题与 favicon。 | `root` |

## 子模块

- `src/` — React/TypeScript 源码和样式。
- `scripts/` — 面向推荐快照和 Hero Hall 交互约束的 Node 验证脚本。
- `assets/` — 页面背景和视觉素材，不为二进制资产单独生成导航。

## 开发模式

- **改可见体验**: 先读 `frontend/AGENTS.md`，再读对应 `src/` 模块导航。
- **改代理或环境变量**: 修改 `vite.config.ts` 后同步检查 `frontend/README.md` 和根级 `README.md`。
- **改依赖**: 修改 `package.json` 后才允许更新 `package-lock.json`。
