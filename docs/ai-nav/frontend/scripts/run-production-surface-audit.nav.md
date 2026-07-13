# run-production-surface-audit.mjs

> `frontend/scripts/run-production-surface-audit.mjs` · 生产接口与资源面审计

## 用途

对指定生产地址执行 HTTPS 首页、构建资源、健康检查、Echo、Agent 目录与全部头像、TTS、CORS、SSE 并发与身份白名单、推荐快照和组合智能体保存回读测试。每项检查独立记录，单项失败不会阻止后续检查执行。

## 运行

```powershell
$env:AUDIT_RECOMMENDATION_ID='本轮隔离测试生成的推荐编号'
$env:PRODUCTION_SURFACE_OUTPUT='outputs/production-surface-audit.json'
node scripts/run-production-surface-audit.mjs https://agent.xtznai.com
```

仅使用本轮测试生成的推荐编号做写入回读，禁止对未知或真实用户的推荐编号执行保存测试。
