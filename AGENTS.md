# AGENTS.md

本文件为 Codex 在此仓库中工作时提供指导。必须使用中文回复和编写项目导航文档。

## 项目概述

这是一个 Agent Workshop JARVIS 演示原型：前端用 React、Vite、TypeScript 和 Three.js 呈现语音粒子、机甲 HUD、知识路径和智能体推荐，后端用 Flask 编排 LongCat/Coze 流式对话与 TTS。

## 快速参考

- **前端规则入口**: `frontend/AGENTS.md`
- **后端规则入口**: `backend/AGENTS.md`
- **前端源码**: `frontend/src/`
- **后端源码**: `backend/`
- **数据目录**: `data/`
- **AI 导航文档**: `docs/ai-nav/`
- **接口说明**: `docs/coze-chat-stream-api.md`
- **前端设计决策**: `frontend/AGENTS.md`
- **测试目录**: `backend/tests/`
- **配置文件**: `frontend/package.json`、`frontend/vite.config.ts`、`backend/config.py`、`backend/.env.example`

## 分层规则入口

- 修改 `frontend/` 下代码前，先读取 `frontend/AGENTS.md`；该文件承接前端视觉、交互、语音、Hero Hall 和构建验证规则。
- 修改 `backend/` 下代码前，先读取 `backend/AGENTS.md`；该文件承接 Flask 路由、SSE 协议、TTS、数据库和后端测试规则。
- 根级 `AGENTS.md` 只保留跨前后端的硬约束和导航入口；模块内细节放在对应目录的 `AGENTS.md` 与 `docs/ai-nav/`。

## 命令

```bash
cd frontend && npm run dev -- --host 127.0.0.1 --port 5188
cd frontend && npm run build
cd frontend && npm run preview -- --host 127.0.0.1
cd backend && python -m venv .venv
cd backend && .\.venv\Scripts\python -m pip install -r requirements.txt
cd backend && .\.venv\Scripts\python app.py
cd backend && .\.venv\Scripts\python -m pytest tests
```

## 验证标准

- 修改前端 TypeScript、React 组件、样式或 Vite 配置后，至少运行 `cd frontend && npm run build`。
- 修改后端路由、配置或服务后，至少启动 `cd backend && .\.venv\Scripts\python app.py` 并检查 `GET /api/health`。
- 修改 `/api/coze/chat/stream`、SSE 事件、prompt 标签或推荐智能体字段后，必须同步检查 `docs/coze-chat-stream-api.md`、`frontend/src/lib/agentStreamClient.ts` 和 `frontend/src/features/workflow/workflowModel.ts`。
- 修改 Three.js、Hero Hall、HUD、语音或布局视觉后，必须用浏览器实际预览；移动端和桌面至少各检查一次。
- 当前后端存在 `backend/tests/`；没有运行对应命令时，不能把“已检查文件”说成“测试通过”。

## 禁止事项

- 禁止把 `frontend/AGENTS.md` 中的设计决策删除、搬空或改写为根级长文档；视觉和交互改动前必须先读取该文件。
- 禁止在没有依赖变更时修改 `frontend/package-lock.json`；如确需更新依赖，必须同步说明触发原因。
- 禁止把 `backend/.env`、`backend/.env.local`、`frontend/.env.local` 或任何真实 token 写入文档、日志和提交内容。
- 禁止让前端在 `workflow.stage.completed` 后停止读取 Coze/LongCat 流；完整结束信号以 `workflow.completed` 或 `chat.completed` 为准。
- 禁止把 `frontend/src/features/heroHall/HeroTeamCarousel.tsx` 的轮播实现内联回 `AgentHeroHall.tsx` 或追加到全局 `App.css`。
- 禁止在 Agent Hero Hall 中用静态占位文案覆盖后端返回的推荐智能体名称、阶段、理由、头像或启动目标。

## 代码规范

- 前端公开类型优先维护在 `frontend/src/types.ts`，跨模块工作流状态优先维护在 `frontend/src/features/workflow/workflowModel.ts`。
- Hero Hall 相关模型、弹层和轮播分别维护在 `frontend/src/features/heroHall/heroHallModel.ts`、`AgentHeroHall.tsx`、`HeroTeamCarousel.tsx`。
- 后端接口只在 `backend/routes/` 定义 Blueprint，业务编排和解析逻辑放在 `backend/services/`。
- 后端 prompt XML 标签契约改动时，必须同步检查 `backend/services/coze_stream_transformer.py`、`backend/services/recommended_agents_stream.py` 和 `docs/coze-chat-stream-api.md`。

## 架构

前端是单页 JARVIS 控制台，`App.tsx` 汇聚语音、流式对话、知识路径、推荐智能体和 Hero Hall 状态。后端是 Flask API，`routes/` 负责 HTTP/SSE 边界，`services/` 负责供应商适配、XML 标签解析、推荐智能体流式字段和图谱路径解析。`data/source_agents_full.json` 是推荐智能体与头像/启动链接的源目录。

## 代码导航

修改代码前，先读对应目录的 `_index.nav.md`。每个 `_index.nav.md` 头部按需声明该模块的功能文档；正文是逐文件索引、用途、关键导出和修改指南。

跨前后端改动的阅读顺序：先读对应目录的 `AGENTS.md`，再读导航索引。

| 你要改的代码 | 入口(`_index.nav.md`) |
|---|---|
| `backend/` | `docs/ai-nav/backend/_index.nav.md` |
| `backend/routes/` | `docs/ai-nav/backend/routes/_index.nav.md` |
| `backend/services/` | `docs/ai-nav/backend/services/_index.nav.md` |
| `backend/prompts/` | `docs/ai-nav/backend/prompts/_index.nav.md` |
| `data/` | `docs/ai-nav/data/_index.nav.md` |
| `frontend/` | `docs/ai-nav/frontend/_index.nav.md` |
| `frontend/src/` | `docs/ai-nav/frontend/src/_index.nav.md` |
| `frontend/src/lib/` | `docs/ai-nav/frontend/src/lib/_index.nav.md` |
| `frontend/src/components/` | `docs/ai-nav/frontend/src/components/_index.nav.md` |
| `frontend/src/hooks/` | `docs/ai-nav/frontend/src/hooks/_index.nav.md` |
| `frontend/src/features/` | `docs/ai-nav/frontend/src/features/_index.nav.md` |
| **项目全局概览 + 全局架构参考** | `docs/ai-nav/_index.nav.md` |

> 修改代码后，如果改变了公开接口、SSE 事件、prompt 标签契约、前端状态结构或可见交互行为，同步更新对应目录的 `.nav.md` 与 `_index.nav.md`。

## 注意事项

- `docs/ai-nav/` 是导航索引，不替代源码、接口文档或设计决策原文。
- `.agents/` 默认视为本地 Codex 技能/工具目录；除非明确要求，否则不要作为业务代码提交。
- `frontend/src/App.css` 体量较大；新增 Hero Hall 或 Workflow 样式时优先使用各自 colocated CSS。
- `outputs/`、`frontend/outputs/`、`frontend/.codex-logs/` 和图片/音频产物默认只作验证证据，不作为源码导航对象。
