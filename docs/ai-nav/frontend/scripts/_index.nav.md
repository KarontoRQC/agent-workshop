# frontend/scripts/

> `frontend/scripts/` · 21 个性能、Agent 主线和前端契约验证脚本

## 职责

前端脚本目录存放性能基准、真实 Agent API/UI 回归和关键交互约束的 Node 断言脚本。它们通过 Playwright、读取源码、转译局部 TypeScript 模块或匹配 CSS 规则验证课堂主线、粒子预算、推荐快照入口、Hero Hall 命中层级、推荐卡片展示字段和快照模型行为。

## 文件列表

| 文件 | 用途 | 关键导出 |
|------|------|----------|
| `api-session.mjs` | 为 Node 回归脚本维护生产签名会话、cookie、CSRF 与推荐编辑 token。 | `createApiSessionClient` |
| `measure-particle-performance.mjs` | 在 CPU 限速下测桌面/移动待机与图谱 FPS、长任务、像素比和分帧档位。 | Node/Playwright 基准脚本 |
| `run-agent-link-audit.mjs` | 检查 Agent 启动链接缺失、重复和全部唯一外链可达性。 | Node 外链审计脚本 |
| `run-agent-api-regression.mjs` | 真实请求 Agent SSE，验证问候、同会话多业务路径/推荐切换、长上下文保护和安全边界。 | Node API 回归脚本 |
| `run-classroom-agent-e2e.mjs` | 通过 Playwright 验证连续发送、暂停恢复、多个推荐场景、Hero Hall 预授权页按推荐编号落地及移动端结果布局。 | Node/Playwright E2E 脚本 |
| `run-production-surface-audit.mjs` | 审计生产 HTTPS、构建资源、Agent/头像、TTS、CORS、SSE 并发身份和推荐/组合保存回读。 | Node 生产面审计脚本 |
| `run-production-ui-audit.mjs` | 审计生产开场首帧、响应式、WebGL、图谱标签稳定/菱形慢转、Hero Hall、分享与模态框可访问性。 | Node/Playwright UI 审计脚本 |
| `verify-agent-combination-entry.mjs` | 验证智能体组合入口、推荐 ID 传递和打开方式。 | Node 断言脚本 |
| `verify-center-graph-route-source.mjs` | 验证中心图谱只消费知识路径，不混入推荐智能体。 | Node 断言脚本 |
| `verify-classroom-interaction.mjs` | 验证课堂单轮语音、禁止自动复听、打字暂停和控制台文案契约。 | Node 断言脚本 |
| `verify-graph-speech-stability.mjs` | 验证语音播报期间图谱空间稳定。 | Node 断言脚本 |
| `verify-hero-hall-after-speech-runtime.mjs` | 通过 Playwright 验证英雄殿堂 pending 页面只能在推荐总结语音结束后跳转到真实组合页。 | Node/Playwright E2E 脚本 |
| `verify-hero-pool-hit-test.mjs` | 验证 Hero Hall 英雄池 CSS 命中层和滚动裁剪规则。 | Node 断言脚本 |
| `verify-hero-team-presentation.mjs` | 验证推荐战队展示优先使用流式字段。 | Node 断言脚本 |
| `verify-motion-tempo.mjs` | 锁定虹光亮度/节奏、思考点、七柱字幕双倍速波形、语音波形和机甲能量缝的动画契约。 | Node 断言脚本 |
| `verify-motion-runtime.mjs` | 等待动画时间轴启动后连续采样普通/低动态虹光角速度，并验证思考点与七柱字幕双倍速错峰。 | Node/Playwright 运行时脚本 |
| `verify-particle-graph-containment.mjs` | 验证路径层硬锁、菱形平面慢转、深度不变、相机范围和标签缓存。 | Node 断言脚本 |
| `verify-participant-identity.mjs` | 验证 URL 身份白名单、请求字段和 App 接线路径。 | Node 断言脚本 |
| `verify-performance-guardrails.mjs` | 验证粒子切片、局部上传、自适应质量和隐藏页节流。 | Node 断言脚本 |
| `verify-recommendation-snapshot-model.mjs` | 验证推荐快照 URL 解析、轮询判断和模型转换。 | Node 断言脚本 |
| `verify-tool-call-reveal-order.mjs` | 验证工具调用提示先于右侧图谱/推荐面板显现。 | Node 断言脚本 |

## 开发模式

- **修改推荐入口 URL**: 更新 `verify-agent-combination-entry.mjs` 和 `verify-recommendation-snapshot-model.mjs`。
- **修改课堂语音/暂停**: 更新 `verify-classroom-interaction.mjs` 中的时延、自动复听和取消链路断言。
- **修改 Hero Hall 布局层级**: 更新 `verify-hero-pool-hit-test.mjs` 的 CSS 断言。
- **修改 Hero Hall 跳转门控**: 更新 `verify-hero-hall-after-speech-runtime.mjs` 的 pending 页面和推荐总结语音断言。
- **修改推荐卡片字段优先级**: 更新 `verify-hero-team-presentation.mjs`。
- **修改参与者身份**: 更新 `verify-participant-identity.mjs`，并同步后端身份测试与接口文档。
- **修改生产 API 安全协议**: 同步更新 `api-session.mjs`、API 回归、生产面审计和接口文档。
