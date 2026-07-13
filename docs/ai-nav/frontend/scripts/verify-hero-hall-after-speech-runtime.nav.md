# verify-hero-hall-after-speech-runtime.mjs

> `frontend/scripts/verify-hero-hall-after-speech-runtime.mjs` · Node.js / Playwright · 约 130 行

## 用途

在真实浏览器中验证业务规划完成后的英雄殿堂跳转时序：先预留 pending 页面，推荐总结语音播报期间不得提前进入真实组合页，播报结束后才携带推荐编号完成跳转。

## 导出

该文件为可直接执行的 E2E 脚本，无模块导出。

## 依赖

外部依赖:
- `playwright`
- `node:assert/strict`
- `node:fs`
- `node:path`
- `node:process`

## 修改指南

- **改英雄殿堂跳转时序**: 同步检查 `App.tsx` 的 pending 页面预留、推荐总结语音收口和真实 URL 替换逻辑。
- **改推荐总结字幕标记**: 同步更新 `[data-segment="recommendation-summary"][data-speaking="true"]` 定位器。
- **改报告路径**: 保持支持 `HERO_HALL_SPEECH_OUTPUT`，默认产物继续写入 `outputs/`，不得提交运行报告。

## 依赖图

```text
verify-hero-hall-after-speech-runtime.mjs
├─ 驱动: 首页 Agent Console 与工作流字幕
├─ 观察: pending 英雄殿堂页面和真实组合页 URL
└─ 输出: Hero Hall 语音门控运行报告
```
