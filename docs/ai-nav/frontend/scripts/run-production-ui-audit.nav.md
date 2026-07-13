# run-production-ui-audit.mjs

> `frontend/scripts/run-production-ui-audit.mjs` · 生产 UI、响应式与可访问性审计

## 用途

使用真实 Chromium 检查首页开场首帧品牌可见与自动退场、厂长参数、六档视口、WebGL 画布、控制台彩蛋、路径标签稳定与中央菱形慢转、Hero Hall 图片和卡片、分享二维码、复制/下载、筛选、阵容重组与保存刷新恢复、移动端布局以及模态框焦点管理。阵容持久化用例会在结束时恢复原测试阵容，截图和 JSON 结果写入独立证据目录。

## 运行

```powershell
$env:UI_AUDIT_RECOMMENDATION_ID='本轮隔离测试生成的推荐编号'
$env:PRODUCTION_UI_OUTPUT='outputs/production-ui-audit.json'
$env:PRODUCTION_UI_EVIDENCE_DIR='outputs/production-ui-audit'
node scripts/run-production-ui-audit.mjs https://agent.xtznai.com
```

推荐编号必须来自本轮隔离测试，不要使用未知真实用户编号。
