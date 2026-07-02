# main.tsx

> `frontend/src/main.tsx` · TypeScript React · 约 9 行

## 用途

React 应用挂载入口，将 `App` 渲染到 `#root`，并加载根级样式。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `createRoot(...).render` | 调用 | ~6 | 启动前端应用。 |

## 依赖

内部依赖:
- `frontend/src/App.tsx` — 主应用组件。
- `frontend/src/index.css` — 全局 reset。

外部依赖(仅列包名,不做解释):
- `react`
- `react-dom`

## 修改指南

- **改根挂载逻辑**: 保持 `StrictMode` 包裹，除非明确要排查副作用双执行。

## 依赖图

```text
main.tsx
← 引入: App.tsx, index.css
→ 被引用: Vite 入口
```

