# config.py

> `backend/config.py` · Python · 约 270 行

## 用途

集中读取后端环境变量，定义 Coze/LongCat、TTS、prompt 路径、CORS origin、智能体目录种子和静态头像导出配置。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `CozeSettings` | dataclass | ~108 | 保存对话供应商、bot、prompt、超时、LongCat 推理/温度/SSE 块大小、流静默超时/响应头前重试和候选智能体配置。 |
| `TtsSettings` | dataclass | ~79 | 保存 Edge TTS 执行命令、中文女声、速率、音量、音高和超时配置。 |
| `get_frontend_origins` | function | ~30 | 生成 Flask-CORS origin 白名单。 |
| `get_agent_avatar_dir` | function | ~54 | 读取头像种子目录。 |
| `get_agent_static_avatar_dir` | function | ~64 | 读取导出给 nginx/静态服务器的头像目录。 |
| `get_agent_static_avatar_base_url` | function | ~74 | 读取静态头像公开 URL 前缀。 |
| `get_coze_settings` | function | ~144 | 从环境变量组装对话工作流配置，并默认关闭 LongCat thinking。 |
| `get_tts_settings` | function | ~139 | 从环境变量组装 TTS 配置。 |

## 依赖

内部依赖:
- `data/source_agents_full.json` — 默认读取带有非空 `智能体链接` 的 `智能体名称` 作为推荐候选。
- `backend/prompts/*.txt` — 默认 prompt 路径。

外部依赖(仅列包名,不做解释):
- `python-dotenv`

## 修改指南

- **新增环境变量**: 同步更新 `backend/.env.example`，不要把真实 `.env` 内容写进文档。
- **改静态头像路径**: 同步 `agent_catalog_store.py`、`routes/agents.py`、`docker-compose.yml` 和接口文档。
- **改默认供应商**: 检查 `_get_chat_provider`，确保 LongCat 和 Coze 的回退逻辑仍清晰。
- **改 LongCat 延迟参数**: 同步检查 `coze_client.py` 对 `thinking`、`temperature`、`max_tokens`、流静默超时和响应头前有限重试的保护，并更新接口文档。
- **改智能体目录字段**: 同步检查 `_read_agent_names` 和 `data/source_agents_full.json`；缺少 `智能体链接` 的源表记录不应进入推荐器候选集合。

## 依赖图

```text
config.py
← 引入: backend/.env, backend/.env.local, data/source_agents_full.json, backend/prompts
→ 被引用: app.py, services.coze_client, services.tts_service
```
