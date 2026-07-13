# run-classroom-agent-e2e.mjs

> `frontend/scripts/run-classroom-agent-e2e.mjs` · JavaScript · 约 330 行

## 用途

在真实浏览器中覆盖课堂主线：问候不得开新页、标签顺序、连续第二次发送、用户暂停与恢复、隐式业务规划预授权、同一页面连续执行多个路径/推荐场景、新推荐工具调用前继续展示上一轮推荐快照、每轮 Hero Hall pending 替换与关闭，以及移动端业务结果布局。

## 关键函数

| 名称 | 作用 |
|---|---|
| `captureErrors` | 收集页面、控制台和 API 网络错误，并区分用户暂停产生的预期取消。 |
| `switchToTextMode` | 切换到打字模式并等待输入框可用。 |
| `waitForCompleted` | 等待 Agent 离开 streaming 并读取交互状态。 |
| `sendMessage` | 填入消息、发送并确认流式状态启动。 |
| `readWorkflowSnapshot` | 读取当前知识路径和推荐智能体，检查跨场景是否更新。 |
| `runBusinessScenario` | 完整执行业务请求、知识/推荐展示顺序、旧推荐快照保留、Hero Hall 替换、关闭恢复和推荐唯一性断言。 |

## 修改指南

- 改消息状态机、Hero Hall 预授权或移动端 composer 时必须同步更新本脚本。
- 普通问候必须继续断言只保留一个页面，防止 `about:blank` 回归。
- Hero Hall 预授权页应轮询 URL 参数是否替换为真实推荐入口，再独立等待 DOM；不要用包含所有图片的 `load` 事件代替 URL 跳转判断。
