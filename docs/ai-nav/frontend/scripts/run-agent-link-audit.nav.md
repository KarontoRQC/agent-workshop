# run-agent-link-audit.mjs

> `frontend/scripts/run-agent-link-audit.mjs` · Agent 启动链接生产审计

## 用途

读取生产 Agent 目录，列出缺失与重复启动链接，并以受限并发逐一发送 HEAD 请求验证全部唯一外链。输出包含状态码、最终 URL、耗时和对应 Agent 名称。

## 运行

```powershell
$env:AGENT_LINK_AUDIT_OUTPUT='outputs/agent-link-audit.json'
node scripts/run-agent-link-audit.mjs https://agent.xtznai.com
```
