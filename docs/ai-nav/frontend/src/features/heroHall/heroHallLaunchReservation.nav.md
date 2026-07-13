# heroHallLaunchReservation.ts

> `frontend/src/features/heroHall/heroHallLaunchReservation.ts` · TypeScript · 约 79 行

## 用途

对已由 `heroHallLaunchIntent.ts` 判定的业务发送动作预授权同域等待页，并在推荐成功、失败、暂停和下一轮发送时完成导航或清理，规避异步弹窗拦截与问候误开页。

## 导出

| 名称 | 类型 | 作用 |
|---|---|---|
| `shouldReserveHeroHallLaunch` | re-export | 复用纯意图模块，覆盖显式智能体词和简短业务规划。 |
| `reserveHeroHallLaunch` | function | 同步打开同域 pending 页面并返回 `WindowProxy`。 |
| `navigateHeroHallReservation` | function | 用真实推荐编号原地替换 pending 页面。 |
| `closeHeroHallReservation` | function | 在失败、暂停或废弃时关闭预授权页面。 |
| `isPendingHeroHallUrl` | function | 判断当前 URL 是否为 pending 入口。 |

## 修改指南

- 普通问候不得命中预授权；简短业务方案必须命中；同步运行 `verify-agent-combination-entry.mjs` 和 `run-classroom-agent-e2e.mjs`。
- pending URL 必须同域且不得携带编辑 token；真实入口只能由 `getAgentCombinationEntryUrl` 生成。

## 依赖

- `frontend/src/lib/agentLaunchCatalog.ts`
- `frontend/src/features/heroHall/heroHallLaunchIntent.ts`
