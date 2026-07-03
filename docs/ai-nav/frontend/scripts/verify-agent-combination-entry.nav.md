# verify-agent-combination-entry.mjs

> `frontend/scripts/verify-agent-combination-entry.mjs` · JavaScript · ~65 行

## 用途

通过源码断言验证智能体组合入口页存在、首页不写入推荐 ID、启动 helper 使用可分享入口 URL，并确保 Hero Hall 与 Workflow Dock 用新标签打开组合入口。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `entryPath` | const | ~4 | 指向组合入口页组件。 |
| `appPath` | const | ~5 | 指向首页应用入口。 |
| `catalogPath` | const | ~6 | 指向智能体启动目录 helper。 |
| `heroHallPath` | const | ~7 | 指向 Hero Hall 组件。 |
| `workflowDockPath` | const | ~8 | 指向工作流 Dock 组件。 |

## 依赖

内部依赖:
- `frontend/src/features/heroHall/AgentCombinationEntryPage.tsx` — 被验证的组合入口页。
- `frontend/src/App.tsx` — 被验证的 URL 解析和页面分支。
- `frontend/src/lib/agentLaunchCatalog.ts` — 被验证的启动入口生成。
- `frontend/src/features/heroHall/AgentHeroHall.tsx` — 被验证的打开入口。
- `frontend/src/features/workflow/WorkflowDock.tsx` — 被验证的打开入口。

外部依赖(仅列包名):
- `node:assert/strict`
- `node:fs`

## 修改指南

- **修改组合入口参数名**: 同步更新本脚本里的 URL 和正则断言。
- **修改打开方式**: 保持组合入口新标签打开，不要回退到多智能体 launcher。

## 依赖图

```text
verify-agent-combination-entry.mjs
← 引入: App.tsx, agentLaunchCatalog.ts, AgentHeroHall.tsx, WorkflowDock.tsx, AgentCombinationEntryPage.tsx
→ 被引用: 手动 Node 验证
```
