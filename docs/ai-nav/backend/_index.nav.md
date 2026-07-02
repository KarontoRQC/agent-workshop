# backend/

> `backend/` · 约 16 个后端源文件和 prompt 配置
> **功能文档**: `docs/coze-chat-stream-api.md`

## 职责

后端提供 Flask API、CORS、LongCat/Coze 流式对话编排和 TTS 合成。`routes/` 保持 HTTP 边界，`services/` 保持供应商适配和业务编排，`prompts/` 定义模型输出标签协议。

## 文件列表

| 文件 | 用途 | 关键导出 |
|------|------|----------|
| `app.py` | 创建 Flask 应用并注册三个 API Blueprint。 | `create_app`, `app` |
| `config.py` | 读取环境变量、默认 prompt 路径、LongCat/Coze/TTS 设置和默认智能体名称。 | `CozeSettings`, `TtsSettings`, `get_coze_settings`, `get_tts_settings` |
| `requirements.txt` | 后端运行依赖。 | Flask、Flask-CORS、requests、python-dotenv |
| `.env.example` | 可提交的后端环境变量示例。 | 配置模板 |

## 子模块

- `routes/` — Flask Blueprint 和 HTTP/SSE 请求解析。
- `services/` — LongCat/Coze 供应商适配、工作流编排、XML/SSE 转换和 TTS。
- `prompts/` — 后端调用模型时使用的输出协议提示词。

## 开发模式

- **添加后端 API**: 先在 `routes/` 新建或扩展 Blueprint，再把非 HTTP 逻辑放进 `services/`。
- **修改对话流协议**: 按 `prompts/` → `services/coze_stream_transformer.py` → `services/coze_workflow.py` → `docs/coze-chat-stream-api.md` 顺序检查。
- **修改环境配置**: 更新 `config.py` 和 `.env.example`，不要提交本地 `.env`。
