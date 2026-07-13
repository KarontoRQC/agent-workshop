# agent-workshop-jarvis

> 项目根目录 · JARVIS 语音粒子、知识路径和智能体推荐演示原型

## 概述

仓库主线是一个现场演示型 Agent Workshop。前端提供机甲 HUD、语音控制、粒子反应堆、知识图谱路径展示、智能体推荐、Hero Hall 和 URL 参与者人格入口；后端提供 Flask SSE 接口、LongCat/Coze 适配、白名单人格上下文、XML 标签流式解析和 TTS。

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
| `docs/test-reports/agent-production-extreme-test-20260710.md` | 修复前生产极限测试基线与原始缺陷证据。 |
| `docs/test-reports/agent-production-remediation-20260711.md` | 本轮修复内容、生产回归结果、回滚点与剩余验证边界。 |

模块级功能文档由各模块 `_index.nav.md` 头部「功能文档」行引用，按需进入。

## 重要约束

- 智能体路径规划态的中央菱形、路径层和场景粒子层必须每帧锁定为正面 `0deg`，X/Y/Z 三轴均不得旋转；只保留固定几何内部的粒子流和发光，退出路径态后才恢复首页旋转。
- 改前端视觉和交互前先读 `frontend/AGENTS.md`，不要把其设计决策搬空或删掉。
- 改 SSE 标签、字段或结束信号时，同步检查后端解析器、前端流式客户端和 `docs/coze-chat-stream-api.md`。
- 不要把本地 `.env` 或 token 写入导航文档。
- 对话和 TTS 必须经过签名 API 会话与 CSRF 校验；推荐/组合写接口还必须持有与推荐编号绑定的编辑 token，分享链接本身只读。
- `identity=changzhang` 只能改变称呼与互动人格，禁止用于认证、授权、数据范围或管理权限判断。
- 首页不得恢复已删除的顶部总控状态条和底部动力/目镜状态条；机甲硬件边框、中央粒子和核心交互继续保留。
- 生产头像静态目录固定为 `/opt/20260715qr/agent/agent-avatars`，Nginx 与后端容器共同使用该稳定路径；禁止在前端原子发布时移动或嵌套复制头像目录。
- `.agents/` 默认是本地 Codex 技能/工具目录；除非明确要求，否则不要作为业务代码提交。
- 改前端代码后至少跑 `cd frontend && npm run build`；改后端接口后启动 Flask 并检查 `/api/health`。
- 不要为 `outputs/`、验证截图、音频和头像二进制生成源码导航。
