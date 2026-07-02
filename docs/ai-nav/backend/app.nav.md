# app.py

> `backend/app.py` · Python · 约 20 行

## 用途

创建 Flask 应用，启用 `/api/*` CORS，并挂载系统、Coze 流式对话和 TTS 三组路由。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `create_app` | function | ~12 | 构造 Flask app 并注册 `system_bp`、`coze_bp`、`tts_bp`。 |
| `app` | module var | ~20 | WSGI/本地运行入口。 |

## 依赖

内部依赖:
- `backend/config.py` — 提供 CORS origin 列表。
- `backend/routes/coze.py` — 提供 `/api/coze`。
- `backend/routes/system.py` — 提供 `/api/health` 和 echo。
- `backend/routes/tts.py` — 提供 `/api/tts`。

外部依赖(仅列包名,不做解释):
- `flask`
- `flask_cors`

## 修改指南

- **新增全局路由组**: 新建 Blueprint 后只在 `create_app` 中注册，保持 URL prefix 明确。
- **调整本地启动端口**: 修改 `FLASK_HOST`、`FLASK_PORT`、`FLASK_DEBUG` 默认读取逻辑时同步 README。

## 依赖图

```text
app.py
← 引入: config, routes.coze, routes.system, routes.tts
→ 被引用: 本地 Flask 启动和部署入口
```

