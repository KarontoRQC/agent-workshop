# verify-agent-combination-entry.mjs

> `frontend/scripts/verify-agent-combination-entry.mjs` · JavaScript · ~80 行

## 用途

通过源码断言验证智能体组合入口页及其拆分模块存在、读取快照 `entry_title` 作为动态标题、保留下方“更多智能体”目录区块、推荐区批量打开、组合阵容和 colocated CSS；同时验证顶部模块化分享入口和 Hero Hall 预授权契约。脚本会实际执行 `heroHallLaunchIntent.ts` 的正反例，确保普通问候不预开、简短业务规划会预开，并验证真实推荐编号只进入独立组合入口。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `entryPath` | const | ~4 | 指向组合入口页组件。 |
| `entrySectionsPath` | const | ~5 | 指向组合入口页展示组件模块。 |
| `entryModelPath` | const | ~6 | 指向组合入口页派生逻辑模块。 |
| `entryStylePath` | const | ~7 | 指向组合入口页样式文件。 |
| `sharePath` | const | ~8 | 指向殿堂分享组件。 |
| `shareStylePath` | const | ~9 | 指向殿堂分享样式。 |
| `appPath` | const | ~8 | 指向首页应用入口。 |
| `catalogPath` | const | ~9 | 指向智能体启动目录 helper。 |
| `workflowDockPath` | const | ~11 | 指向工作流 Dock 组件。 |

## 依赖

内部依赖:
- `frontend/src/features/heroHall/AgentCombinationEntryPage.tsx` — 被验证的组合入口页编排组件。
- `frontend/src/features/heroHall/AgentCombinationEntrySections.tsx` — 被验证的组合入口页展示组件。
- `frontend/src/features/heroHall/agentCombinationEntryModel.ts` — 被验证的组合入口页派生逻辑。
- `frontend/src/features/heroHall/AgentCombinationEntryPage.css` — 被验证的组合入口页 colocated 样式。
- `frontend/src/features/heroHall/AgentCombinationShare.tsx` — 被验证的二维码、复制和下载分享组件。
- `frontend/src/features/heroHall/AgentCombinationShare.css` — 被验证的分享弹层响应式样式。
- `frontend/src/features/heroHall/heroHallLaunchIntent.ts` — 被执行验证的业务规划意图纯函数。
- `frontend/src/features/heroHall/heroHallLaunchReservation.ts` — 被验证的 pending 页面生命周期入口。
- `frontend/src/App.tsx` — 被验证的 URL 解析和页面分支。
- `frontend/src/lib/agentLaunchCatalog.ts` — 被验证的启动入口生成。
- `frontend/src/features/workflow/WorkflowDock.tsx` — 被验证的打开入口。

外部依赖(仅列包名):
- `node:assert/strict`
- `node:fs`
- `typescript`

## 修改指南

- **修改组合入口参数名**: 同步更新本脚本里的 URL 和正则断言。
- **继续拆分组合入口页**: 保持本脚本读取 page、sections、model、CSS 的组合断言，不要让验证脚本重新要求所有文案回到主 TSX。
- **修改打开方式**: 保持组合入口新标签/新页面打开，不要覆盖原首页，也不要重新走旧 Hero Hall 弹层或预开 `about:blank`；组合入口页推荐区的一键按钮可以复用多智能体 launcher，但只允许打开当前推荐智能体。
- **修改分享方式**: 同步更新分享组件、分享 CSS 和规范入口 URL 断言，保留复制链接与可下载 PNG 二维码。

## 依赖图

```text
verify-agent-combination-entry.mjs
← 引入: App.tsx, agentLaunchCatalog.ts, WorkflowDock.tsx, AgentCombinationEntryPage.tsx, AgentCombinationEntrySections.tsx, agentCombinationEntryModel.ts, AgentCombinationEntryPage.css, AgentCombinationShare.tsx, AgentCombinationShare.css
→ 被引用: 手动 Node 验证
```
