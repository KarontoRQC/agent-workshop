# React + Flask Starter

这个工作区包含两个独立项目：

- `frontend`: React + Vite 前端项目
- `backend`: Flask API 后端项目

## 启动后端

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python app.py
```

后端默认地址是 `http://127.0.0.1:5000`。

## 启动前端

```powershell
cd frontend
npm install
npm run dev
```

前端默认地址是 `http://127.0.0.1:5173`。

Vite 已配置 `/api` 代理，会把前端请求转发到 Flask 后端。
