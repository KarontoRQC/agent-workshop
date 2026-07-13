# heroHallLaunchIntent.ts

> `frontend/src/features/heroHall/heroHallLaunchIntent.ts` · TypeScript · 纯意图分类

## 用途

在用户发送手势内判断是否需要预授权英雄殿堂页面。显式智能体、阵容、知识路径请求直接命中；带业务上下文的方案、策略、怎么做等简短规划也命中；问候、天气等泛聊天不命中。

## 导出

| 名称 | 作用 |
|---|---|
| `shouldReserveHeroHallLaunch` | 返回当前消息是否应预授权同域 Hero Hall pending 页。 |

## 修改指南

- 修改词表后运行 `verify-agent-combination-entry.mjs` 的正反例和课堂 E2E。
- 不要用消息长度单独判定，否则会恢复普通聊天误开页的问题。

## 依赖

无。
