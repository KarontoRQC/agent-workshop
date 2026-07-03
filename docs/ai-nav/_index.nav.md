# agent-workshop-jarvis

> 项目根目录 · JARVIS 语音粒子、知识路径和智能体推荐演示原型

## 概述

仓库主线是一个现场演示型 Agent Workshop。前端提供机甲 HUD、语音控制、粒子反应堆、知识图谱路径展示、智能体推荐和 Hero Hall 弹层；后端提供 Flask SSE 接口、LongCat/Coze 适配、XML 标签流式解析和 TTS。

## 技术栈

- 前端: React 19、TypeScript、Vite、Three.js、lucide-react
- 后端: Python、Flask、Flask-CORS、requests、python-dotenv
- 数据: JSON 智能体目录、后端 prompt 文本

## 包结构概览

| 包 | 路径 | 职责 |
|----|------|------|
| 后端 API | `backend/` | 注册 Flask 路由、读取环境配置、编排 LongCat/Coze 流和 TTS。 |
| 智能体数据 | `data/` | 提供推荐智能体原始目录、知识库字段、启动链接和头像匹配线索。 |
| 前端应用 | `frontend/` | 承载 Vite/React JARVIS 原型、可视化、语音、流式消费和 Hero Hall。 |
| 项目文档 | `docs/` | 存放接口说明和本 AI 导航镜像。 |

## 全局架构参考文档

跨模块的接口契约、运行方式和设计约束:

| 文档 | 用途 |
|---|---|
| `README.md` | 项目主线、目录职责、前后端启动方式和运行说明。 |
| `docs/coze-chat-stream-api.md` | `/api/coze/chat/stream` 请求、SSE 事件、字段和错误协议。 |
| `frontend/AGENTS.md` | 前端视觉、Hero Hall、语音和 JARVIS HUD 的长期设计决策。 |
| `backend/AGENTS.md` | 后端 Flask、SSE、TTS、数据库和测试的目录级工作规则。 |
| `frontend/README.md` | 前端原型运行、语音输出和模型端点说明。 |
| `frontend/design-qa.md` | 前端设计验证记录。 |

模块级功能文档由各模块 `_index.nav.md` 头部「功能文档」行引用，按需进入。

## 重要约束

- 改前端视觉和交互前先读 `frontend/AGENTS.md`，不要把其设计决策搬空或删掉。
- 改 SSE 标签、字段或结束信号时，同步检查后端解析器、前端流式客户端和 `docs/coze-chat-stream-api.md`。
- 不要把本地 `.env` 或 token 写入导航文档。
- `.agents/` 默认是本地 Codex 技能/工具目录；除非明确要求，否则不要作为业务代码提交。
- 改前端代码后至少跑 `cd frontend && npm run build`；改后端接口后启动 Flask 并检查 `/api/health`。
- 不要为 `outputs/`、验证截图、音频和头像二进制生成源码导航。
