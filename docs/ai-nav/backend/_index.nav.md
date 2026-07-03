# backend/

> `backend/` · 约 23 个后端源文件和 prompt 配置
> **功能文档**: `docs/coze-chat-stream-api.md`

## 职责

后端提供 Flask API、CORS、LongCat/Coze 流式对话编排、智能体目录/头像数据库读取和 TTS 合成。`routes/` 保持 HTTP 边界，`services/` 保持供应商适配、目录存储和业务编排，`prompts/` 定义模型输出标签协议。

## 文件列表

| 文件 | 用途 | 关键导出 |
|------|------|----------|
| `app.py` | 创建 Flask 应用并注册智能体目录、Coze、TTS、健康检查和推荐快照 API Blueprint。 | `create_app`, `app`, `create_recommendation_snapshot_store`, `create_agent_catalog_store` |
| `config.py` | 读取环境变量、默认 prompt 路径、LongCat/Coze/TTS 设置、默认智能体名称和目录种子路径。 | `CozeSettings`, `TtsSettings`, `get_coze_settings`, `get_tts_settings`, `get_source_agents_path`, `get_agent_avatar_dir` |
| `AGENTS.md` | 后端目录级 Codex 工作规则，覆盖 Flask、SSE、TTS、数据库和测试约束。 | 后端规则入口 |
| `requirements.txt` | 后端运行依赖。 | Flask、Flask-CORS、requests、python-dotenv、psycopg、pytest |
| `.env.example` | 可提交的后端环境变量示例。 | 配置模板 |

## 子模块

- `routes/` — Flask Blueprint 和 HTTP/SSE 请求解析。
- `services/` — LongCat/Coze 供应商适配、工作流编排、XML/SSE 转换、智能体目录/头像资产入库、推荐快照持久化和 TTS。
- `prompts/` — 后端调用模型时使用的输出协议提示词。
- `tests/` — 后端路由、推荐快照和智能体目录相关 pytest 测试。

## 开发模式

- **添加后端 API**: 先在 `routes/` 新建或扩展 Blueprint，再把非 HTTP 逻辑放进 `services/`。
- **修改对话流协议**: 按 `prompts/` → `services/coze_stream_transformer.py` → `services/coze_workflow.py` → `docs/coze-chat-stream-api.md` 顺序检查。
- **修改环境配置**: 更新 `config.py` 和 `.env.example`，不要提交本地 `.env`。
