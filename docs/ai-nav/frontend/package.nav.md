# package.json

> `frontend/package.json` · JSON · 约 26 行

## 用途

定义前端 Vite/React/TypeScript 原型的依赖和运行脚本。

## 脚本

| 名称 | 命令 | 用途 |
|------|------|------|
| `dev` | `vite --host 0.0.0.0` | 启动开发服务器。 |
| `build` | `tsc -b && vite build` | 先做 TypeScript 构建检查，再打包。 |
| `preview` | `vite preview --host 0.0.0.0` | 预览构建产物。 |

## 依赖

外部依赖(仅列包名,不做解释):
- `react`
- `react-dom`
- `three`
- `lucide-react`
- `vite`
- `typescript`
- `playwright`

## 修改指南

- **新增依赖**: 同步更新 `frontend/package-lock.json`，并在最终说明中写明原因。
- **新增脚本**: 同步根级 `AGENTS.md` 的命令区。
