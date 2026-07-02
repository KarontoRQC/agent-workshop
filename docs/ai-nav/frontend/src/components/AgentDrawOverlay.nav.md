# AgentDrawOverlay.tsx

> `frontend/src/components/AgentDrawOverlay.tsx` · TypeScript React · 约 259 行

## 用途

展示推荐智能体抽卡/开奖浮层，根据推荐结果生成可打开的富化卡片，并在未完成时显示 pending 卡。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `AgentDrawOverlay` | default component | 文件内 | 渲染抽卡浮层、卡片和打开入口。 |

## 依赖

内部依赖:
- `frontend/src/lib/agentLaunchCatalog.ts` — 富化智能体和启动目标。
- `frontend/src/types.ts` — 推荐智能体类型。

外部依赖(仅列包名,不做解释):
- `react`
- `lucide-react`

## 修改指南

- **改开奖节奏**: 检查 `MIN_VISIBLE_MS`、`EXIT_MS` 和定时器清理。
- **改卡片字段**: 同步检查 `agentLaunchCatalog.ts` 的富化字段。

## 依赖图

```text
AgentDrawOverlay.tsx
← 引入: agentLaunchCatalog, types
→ 被引用: App.tsx
```

