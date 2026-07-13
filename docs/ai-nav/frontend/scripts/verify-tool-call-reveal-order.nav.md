# verify-tool-call-reveal-order.mjs

> `frontend/scripts/verify-tool-call-reveal-order.mjs` · JavaScript · 约 32 行

## 用途

验证左侧 Agent Console 已展示对应工具调用标记后，首页才允许替换右侧知识路径或推荐智能体面板；新一轮必须保留旧面板，推荐流式半成品不能覆盖 pinned 快照。同时阻止 stream completion、推荐 snapshot 和 lineup fallback 绕过知识路径讲解顺序，并约束 Hero Hall 只在推荐卡正式解锁时跳转。

## 修改指南

- 修改工具调用事件、工作流状态或右侧面板显隐条件时同步更新本脚本。
