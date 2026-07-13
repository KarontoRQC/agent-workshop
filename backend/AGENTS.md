# backend/AGENTS.md

本文件为 Codex 修改 `backend/` 下代码时提供目录级指导。根级 `AGENTS.md` 仍然适用；后端内的接口、流式协议、配置和测试规则以本文件为准。

## 快速参考

- **应用入口**: `backend/app.py`
- **配置入口**: `backend/config.py`
- **路由目录**: `backend/routes/`
- **业务服务目录**: `backend/services/`
- **Prompt 目录**: `backend/prompts/`
- **测试目录**: `backend/tests/`
- **导航入口**: `docs/ai-nav/backend/_index.nav.md`
- **接口契约**: `docs/coze-chat-stream-api.md`

## 命令

```bash
cd backend && .\.venv\Scripts\python -m pip install -r requirements.txt
cd backend && .\.venv\Scripts\python -m pip install -r requirements-dev.txt
cd backend && .\.venv\Scripts\python app.py
cd backend && .\.venv\Scripts\python -m pytest tests
```

## 验证标准

- 修改 `routes/`、`services/`、`config.py` 或 `app.py` 后，至少运行相关 `pytest` 测试；新增接口优先补 `backend/tests/` 中的路由或服务测试。
- 修改 Flask 启动、CORS、数据库连接或环境变量读取后，启动 `cd backend && .\.venv\Scripts\python app.py` 并检查 `GET /api/health`。
- 修改 `/api/coze/chat/stream`、SSE 事件、prompt 标签、推荐智能体字段或快照流后，必须同步检查 `docs/coze-chat-stream-api.md`、`frontend/src/lib/agentStreamClient.ts` 和 `frontend/src/features/workflow/workflowModel.ts`。
- 修改智能体目录、头像路径或推荐快照存储后，检查 `data/source_agents_full.json`、`services/agent_catalog_store.py`、`services/recommendation_snapshot_store.py` 和对应测试。

## 禁止事项

- 禁止把真实 token、数据库密码或本机私有配置写入 `backend/.env.example`、文档、日志或测试快照。
- 禁止提交 `backend/.env`、`backend/.env.local`、`__pycache__/`、`.pytest_cache/` 或本地数据库产物。
- 禁止把 HTTP 请求解析、SSE 边界或 Blueprint 注册以外的业务编排写进 `routes/`；业务逻辑必须放进 `services/`。
- 禁止在未同步前端客户端和接口文档的情况下更改 SSE 事件名、结束信号、字段名或 prompt XML 标签。
- 禁止绕过 `config.py` 直接在业务代码中读取同一类环境变量；新增环境变量必须集中在 `config.py` 并同步 `.env.example`。
- 禁止让聊天、TTS 或推荐写路由绕过 `routes/access_control.py`；推荐 ID 不是写权限，编辑必须同时校验 API 会话和推荐编辑令牌。
- 禁止向客户端返回数据库、代理、密钥名、供应商响应体或原始异常详情；公开错误使用稳定通用文案，原始异常只写服务端日志。

## 代码规范

- 路由只负责参数校验、HTTP/SSE 响应边界和错误状态；供应商适配、XML 解析、目录存储和快照持久化放在 `services/`。
- 新增 Blueprint 时在 `backend/app.py` 注册，并同步更新 `docs/ai-nav/backend/routes/_index.nav.md`。
- 新增后端服务时优先创建可单测的纯函数或类，并在 `backend/tests/` 覆盖正常路径和关键失败路径。
- Prompt 标签契约变更时，按 `prompts/` → `services/coze_stream_transformer.py` → `services/recommended_agents_stream.py` → 接口文档 → 前端客户端的顺序检查。

## 架构导航

| 你要改的代码 | 先读 |
|---|---|
| `backend/routes/` | `docs/ai-nav/backend/routes/_index.nav.md` |
| `backend/services/` | `docs/ai-nav/backend/services/_index.nav.md` |
| `backend/prompts/` | `docs/ai-nav/backend/prompts/_index.nav.md` |
| `backend/tests/` | `backend/tests/` 中现有同类测试 |
| 后端整体结构 | `docs/ai-nav/backend/_index.nav.md` |

## 注意事项

- `app.py` 使用 `LazyStore` 延迟初始化数据库相关 store；改动启动路径时避免把数据库连接提前到应用导入阶段。
- `config.py` 会读取 `backend/.env` 并用 `backend/.env.local` 覆盖本机配置；示例文件只放安全默认值和占位说明。
- `requirements.txt` 只包含生产运行依赖；pytest 等测试工具放在 `requirements-dev.txt`，生产镜像不得安装测试框架。
- 后端默认面向本地 Flask、Vite 代理和 Docker Compose 三种运行方式；改端口、host 或代理前同步检查根级 `README.md` 和前端 `vite.config.ts`。
- 课堂统一工作流必须容忍模型偶发的一级 XML 错误闭合或孤立闭合标签：解析器应在下一个合法一级标签恢复，不得把原始标签泄漏为可见回复，也不得因此丢失后续推荐智能体。`THINKING_PROCESS` 与 `ACK` 均使用可跨 chunk 的短窗口流式脱敏；禁止向前端暴露 A/B/C 模式、当前状态为空或内部模式提示，也禁止把 `ACK` 恢复为等待标签闭合后一次性发送的整段缓冲。
- 上游正常结束但漏掉、截断或清洗为空的 `THINKING_PROCESS` / `ACK` 不能直接以空回复完成。统一工作流必须在路径或推荐开始前补齐缺失段，纯对话则在完成事件前补齐，并保持 `THINKING_PROCESS → ACK` 顺序；补充内容复用课堂兜底计划，禁止新建另一套固定机械话术。

## 近期课堂人格决策

- 2026-07-13: 正式回答 `ACK` 必须与 `THINKING_PROCESS` 一样真实流式输出；后端只允许为跨 token 敏感短语保留最短必要尾部窗口，其余内容立即发送 `content.delta`。禁止用前端模拟打字掩盖服务端整段缓冲，也不得因流式化削弱内部编排词脱敏。
- 2026-07-11: 千人大课默认采用灵活、幽默、能接梗的现场人格。普通无害话题必须先回答或先入戏，不得以“不属于任务”或“只能做业务规划”为由拒绝，也不得把闲聊强行拉回知识路径；业务承接 ACK 也必须有短笑点，禁止只播报“正在校准/正在处理”。独立人格只在关键事实或风险会影响结果时轻度纠偏，禁止为了维持人设持续抬杠；厂长把麦克风交给学员或新说话者自报身份后，当轮立即切换称呼。严肃求助和负面情绪优先准确回应，不强塞笑点；这些表达规则不得改变 XML 协议、权限边界或推荐字段。
- 2026-07-11: LongCat 超时或熔断后的本地课堂兜底也必须保持可展示质量。常见角色扮演应直接入戏，学员问题应直接给出具体回答和短笑点，禁止只返回“这个话题我接”一类空确认；业务降级仍须生成可用路径和白名单智能体。
- 2026-07-11: 统一模式多轮对话采用“显式业务状态 + 有界近期对话”。新前端发送 `history_mode=bounded_recent` 和最近 10 条消息；后端按每条 600 字、总计 3,200 字再次限长并作为只读不可信上下文注入，同时关闭 LongCat 隐式历史。旧客户端未声明 bounded 模式时必须继续尊重 `auto_save_history`；明确切换新业务时清空旧会话、旧业务状态和近期窗口。
- 2026-07-11: 有界近期对话不能只注入 LongCat。供应商超时、熔断或模型漏掉开场标签时，课堂兜底与 `_OpeningSectionGuard` 也必须读取同一份规范化窗口；用户追问“刚才/上一轮/还记得”时要准确承接最近用户事实，禁止退化成重复的通用接话。
