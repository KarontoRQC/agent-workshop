# Agent Workshop

智能体工作坊原型项目，采用 `React + Vite` 前端和 `Flask` 后端骨架。

当前主体验证方向是「智能体知识图谱」：用 Obsidian 风格的空间关系图谱承载行业节点、痛点、任务和推荐智能体组合，并为后续 Coze/Agent API 接入预留适配层。

## 目录

- `frontend/`: React + Vite + PixiJS 交互图谱前端。
- `backend/`: Flask API 骨架，保留 `/api/health` 和 `/api/echo` 示例接口。
- `data/`: 不含视觉样式的图谱 seed 数据和 SQL schema。
- `docs/`: 数据格式、表结构和 agent 接入说明。
- `scripts/`: 图谱数据导出脚本。

## 启动前端

```powershell
cd frontend
npm install
npm run dev
```

默认地址：`http://127.0.0.1:5173`。

## 启动后端

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python app.py
```

默认地址：`http://127.0.0.1:5000`。

## 图谱数据

图谱内容数据见 `data/knowledge_graph_seed.json`，它只保留节点、边、智能体和映射关系，不包含坐标、颜色、尺寸等前端样式字段。

详细格式见 `docs/knowledge-graph-database-format.md`。
