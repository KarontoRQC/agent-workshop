# config.py

> `backend/config.py` · Python · 约 172 行

## 用途

集中读取后端环境变量，定义 Coze/LongCat、TTS、prompt 路径、CORS origin 和默认智能体名称加载逻辑。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `CozeSettings` | dataclass | ~57 | 保存对话供应商、bot、prompt、超时和候选智能体配置。 |
| `TtsSettings` | dataclass | ~79 | 保存 Edge TTS 和 Piper TTS 配置。 |
| `get_frontend_origins` | function | ~30 | 生成 Flask-CORS origin 白名单。 |
| `get_coze_settings` | function | ~96 | 从环境变量组装对话工作流配置。 |
| `get_tts_settings` | function | ~139 | 从环境变量组装 TTS 配置。 |

## 依赖

内部依赖:
- `data/source_agents_full.json` — 默认读取 `智能体名称` 作为推荐候选。
- `backend/prompts/*.txt` — 默认 prompt 路径。

外部依赖(仅列包名,不做解释):
- `python-dotenv`

## 修改指南

- **新增环境变量**: 同步更新 `backend/.env.example`，不要把真实 `.env` 内容写进文档。
- **改默认供应商**: 检查 `_get_chat_provider`，确保 LongCat 和 Coze 的回退逻辑仍清晰。
- **改智能体目录字段**: 同步检查 `_read_agent_names` 和 `data/source_agents_full.json`。

## 依赖图

```text
config.py
← 引入: backend/.env, backend/.env.local, data/source_agents_full.json, backend/prompts
→ 被引用: app.py, services.coze_client, services.tts_service
```
