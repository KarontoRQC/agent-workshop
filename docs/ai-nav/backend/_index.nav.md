# backend/

> `backend/` · 约 31 个后端源文件、测试和 prompt 配置
> **功能文档**: `docs/coze-chat-stream-api.md`

## 职责

后端提供 Flask API、CORS、低延迟 LongCat/Coze 流式对话、显式多轮状态编排、白名单参与者人格、智能体目录/头像数据库读取、组合智能体持久化、头像静态导出和 TTS 合成。`routes/` 保持 HTTP 边界，`services/` 保持供应商适配、目录存储和业务编排，`prompts/` 定义模型输出标签协议。

## 文件列表

| 文件 | 用途 | 关键导出 |
|------|------|----------|
| `app.py` | 创建 Flask 应用并注册智能体目录、组合智能体、Coze、TTS、健康检查和推荐快照 API Blueprint。 | `create_app`, `app`, `create_recommendation_snapshot_store`, `create_combination_agent_store`, `create_agent_catalog_store` |
| `config.py` | 读取环境变量、签名 API 安全策略、LongCat thinking/超时/熔断、TTS、目录种子和静态头像路径。 | `ApiSecuritySettings`, `CozeSettings`, `TtsSettings`, `get_api_security_settings`, `get_coze_settings`, `get_tts_settings` |
| `AGENTS.md` | 后端目录级 Codex 工作规则，覆盖 Flask、SSE、TTS、数据库和测试约束。 | 后端规则入口 |
| `requirements.txt` | 后端生产运行依赖。 | Flask、Flask-CORS、requests、python-dotenv、psycopg、edge-tts |
| `requirements-dev.txt` | 后端开发和测试依赖，在运行依赖基础上增加 pytest。 | `-r requirements.txt`、pytest |
| `.env.example` | 可提交的后端环境变量示例。 | 配置模板 |

## 子模块

- `routes/` — Flask Blueprint 和 HTTP/SSE 请求解析。
- `services/` — LongCat/Coze 供应商适配、工作流编排、XML/SSE 转换、智能体目录/头像资产入库、推荐快照持久化、组合智能体持久化和 TTS。
- `prompts/` — 后端调用模型时使用的输出协议提示词。
- `tests/` — 后端路由、推荐快照和智能体目录相关 pytest 测试。

## 开发模式

- **添加后端 API**: 先在 `routes/` 新建或扩展 Blueprint，再把非 HTTP 逻辑放进 `services/`。
- **修改对话流协议**: 按 `prompts/` → `services/coze_stream_transformer.py` → `services/coze_workflow.py` → `docs/coze-chat-stream-api.md` 顺序检查。
- **修改环境配置**: 更新 `config.py` 和 `.env.example`，不要提交本地 `.env`。
